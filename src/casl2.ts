"use strict";

import {
    Casl2, Diagnostic as Casl2Diagnostic, DiagnosticCategory, Casl2DiagnosticResult,
    TokenType, TokenInfo
} from "@maxfield/node-casl2-core";
import {
    instructionCompletionItems, grCompletionItems, indexGRCompletionItems,
    createLabelCompletionItems
} from "./completion";
import {
    Diagnostic, DiagnosticSeverity, CompletionItem, CompletionItemKind, Position,
    Location, Range, ReferenceContext, DocumentHighlight, DocumentHighlightKind,
    WorkspaceEdit, TextDocument, TextEdit, TextDocumentEdit, ResponseError,
    ErrorCodes, SymbolInformation, SymbolKind, Hover, SignatureHelp, SignatureInformation,
    ParameterInformation
} from "vscode-languageserver";
import { instructionMap, isAddressToken, AllReferences } from "@maxfield/node-casl2-core";
import { ArgumentType } from "@maxfield/node-casl2-comet2-core-common";

const casl2 = new Casl2();

let lastDiagnosticsResult: Casl2DiagnosticResult;

export function validateSource(lines: Array<string>): Array<Diagnostic> {
    documentUpdated = true;

    const diagnosticResult = casl2.analyze(lines);
    const { diagnostics } = diagnosticResult;

    lastDiagnosticsResult = diagnosticResult;

    return diagnostics.map(convertDiagnostic);
}

function convertDiagnostic(diagnostic: Casl2Diagnostic): Diagnostic {
    const { category, line, startIndex, endIndex, messageText } = diagnostic;

    const diag: Diagnostic = {
        severity: convertDiagnosticCategory(category),
        range: {
            start: {
                line: line,
                character: startIndex
            },
            end: {
                line: line,
                character: endIndex
            }
        },
        message: messageText
    };

    return diag;
}

function convertDiagnosticCategory(category: DiagnosticCategory): DiagnosticSeverity {
    switch (category) {
        case DiagnosticCategory.Error:
            return DiagnosticSeverity.Error;
        case DiagnosticCategory.Warning:
            return DiagnosticSeverity.Warning;
        case DiagnosticCategory.Message:
            return DiagnosticSeverity.Information;
    }

    throw new Error();
}

enum Completion {
    Instruction,
    GR,
    IndexGR,
    Labels,
    GRANDLabels,
    None
}

// 入力中の命令の引数の種類
let argumentType: ArgumentType;
// 何番目の引数を入力中か
let argIndex: number;
// 入力中の命令行の命令
let instruction: string;
// どの命令のオーバーロードが選択されているか
let overload = 0;
// どの補完を出すか
let completionItems = Completion.None;

let documentUpdated = true;
let positionChanged = true;
let currentPosition: Position = Position.create(-1, -1);
function setCurrentPosition(position: Position) {
    if (position.character != currentPosition.character || position.line != currentPosition.line) {
        currentPosition = position;
        positionChanged = true;
    } else {
        positionChanged = false;
    }
}

function shouldAnalyzeState() {
    return documentUpdated || positionChanged;
}

function analyzeState(position: Position): void {
    setCurrentPosition(position);

    if (!shouldAnalyzeState()) return;

    console.log("Analyzing  State");

    documentUpdated = false;

    if (!lastDiagnosticsResult) return;

    // カーソルのある行のトークン列を取得する
    const tokensInfo = lastDiagnosticsResult.tokensMap.get(position.line);
    if (!tokensInfo) throw new Error();
    if (!tokensInfo.success) return;

    const tokens = tokensInfo.tokens;
    const beforeCursorTokens = getTokensBeforePosition(tokens, position);

    function consume(...tokenTypes: Array<TokenType>): boolean {
        const count = tokenTypes.length;
        if (beforeCursorTokens.length < count) return false;

        const slice = beforeCursorTokens.slice(beforeCursorTokens.length - count);

        function isValid(t: TokenType, index: number) {
            const type = slice[index].type;
            if (t == TokenType.TADDRESS) return isAddressToken(type);
            else if (t == TokenType.TINSTRUCTION) return slice[index] == instToken;
            else return type == t;
        }

        const v = tokenTypes.map((t, index) => isValid(t, index));
        const valid =
            v.length == 0
                ? true
                : v.length == 1
                    ? v[0]
                    : v.reduce((a, b) => a && b);

        return valid;
    }

    // 命令の補完を出す条件
    // 1. カーソルが先頭の空白の右側である
    // 2. カーソルがラベルの右側である

    function space(tokens: Array<TokenInfo>, position: Position): boolean {
        if (beforeCursorTokens.length == 1) {
            return consume(TokenType.TSPACE);
        } else {
            return false;
        }
    }

    if (space(tokens, position) || consume(TokenType.TLABEL, TokenType.TSPACE)) {
        // 命令
        completionItems = Completion.Instruction;
    } else {
        completionItems = Completion.None;
    }

    function completeInstructionLine() {
        argIndex = -1;
    }

    // GRの補完を出す条件
    // 前提: 命令が入力されていて，その命令がとるオペランドがGRである
    const instructionToken = tokens.filter(x => x.type == TokenType.TINSTRUCTION);
    if (instructionToken.length == 0) {
        completeInstructionLine();
        return;
    }

    const instToken = instructionToken[0];
    const inst = instToken.value;
    const info = instructionMap.get(inst);
    if (info === undefined) throw new Error();

    function labelCompletionItems(): Array<CompletionItem> {
        const labels = getAllReferenceableLabels(position).map(x => x.value);
        return createLabelCompletionItems(labels);
    }

    function instSpace(): boolean {
        return consume(TokenType.TINSTRUCTION, TokenType.TSPACE);
    }

    function instSpaceTrailing(...tokenTypes: Array<TokenType>): boolean {
        return consume(TokenType.TINSTRUCTION, TokenType.TSPACE, ...tokenTypes);
    }

    argumentType = info.argumentType;
    instruction = info.instructionName;

    switch (info.argumentType) {
        case ArgumentType.none:
            // 何も補完しない
            overload = 0;
            break;

        case ArgumentType.label_START:
            // e.g. START|
            if (consume(TokenType.TINSTRUCTION)) {
                argIndex = 0;
                overload = 0;
            }
            // e.g. START |
            else if (instSpace()) {
                argIndex = 1;
                overload = 1;
                completionItems = Completion.Labels;
            }
            // e.g. START BEGIN|
            else if (instSpaceTrailing(TokenType.TADDRESS)) {
                completeInstructionLine();
            }
            break;

        case ArgumentType.decimal_DS:
            // 何も補完しない
            overload = 0;
            break;

        case ArgumentType.constants_DC:
            // e.g. DC |
            if (instSpace()) {
                argIndex = 0;
                overload = 0;
                completionItems = Completion.Labels;
            }
            // e.g. DC 1, |
            // DCは任意長のオペランドをもつので
            // カーソルの左側に命令があって，かつカーソルの直前のトークンが
            // TCOMMASPACEの時補完を出すことにしている
            if (beforeCursorTokens.indexOf(instToken) != -1) {
                if (beforeCursorTokens.length >= 1) {
                    const [l1] = beforeCursorTokens.slice(beforeCursorTokens.length - 1);
                    if (l1.type == TokenType.TCOMMASPACE) {
                        argIndex = 1;
                        overload = 0;
                        completionItems = Completion.Labels;
                    }
                }
            }
            break;


        case ArgumentType.adr_r2:
            // e.g. JUMP |
            if (instSpace()) {
                argIndex = 0;
                overload = 0;
                completionItems = Completion.Labels;
            }
            // e.g. JUMP L1, |
            else if (instSpaceTrailing(TokenType.TADDRESS, TokenType.TCOMMASPACE)) {
                argIndex = 1;
                overload = 1;
                completionItems = Completion.IndexGR;
            }
            // e.g. JUMP L1, GR1
            else if (instSpaceTrailing(TokenType.TADDRESS, TokenType.TCOMMASPACE, TokenType.TGR)) {
                completeInstructionLine();
            }
            break;


        case ArgumentType.r:
            // e.g. POP |
            if (instSpace()) {
                argIndex = 0;
                overload = 0;
                completionItems = Completion.GR;
            }
            // e.g. POP GR1
            else if (instSpaceTrailing(TokenType.TGR)) {
                completeInstructionLine();
            }
            break;


        case ArgumentType.r1_r2:
            // r1, r2パターンのみの命令は存在しないので
            // r1_r2_OR_r1_adr_r2で処理されるはず
            throw new Error();


        case ArgumentType.r1_adr_r2:
            // e.g. SLA |
            if (instSpace()) {
                argIndex = 0;
                overload = 0;
                completionItems = Completion.GR;
            }
            // e.g. SLA GR1, |
            else if (instSpaceTrailing(TokenType.TGR, TokenType.TCOMMASPACE)) {
                argIndex = 1;
                overload = 0;
                completionItems = Completion.Labels;
            }
            // e.g. SLA GR1, 1, |
            else if (instSpaceTrailing(TokenType.TGR, TokenType.TCOMMASPACE, TokenType.TADDRESS, TokenType.TCOMMASPACE)) {
                argIndex = 2;
                overload = 1;
                completionItems = Completion.IndexGR;
            }
            // e.g. SLA GR1, 1, GR2|
            else if (instSpaceTrailing(TokenType.TGR, TokenType.TCOMMASPACE, TokenType.TADDRESS, TokenType.TCOMMASPACE, TokenType.TGR)) {
                completeInstructionLine();
            }
            break;


        case ArgumentType.r1_r2_OR_r1_adr_r2:
            // e.g. ADDA |
            if (instSpace()) {
                argIndex = 0;
                overload = 0;
                completionItems = Completion.GR;
            }
            // e.g. ADDA GR1, |
            if (instSpaceTrailing(TokenType.TGR, TokenType.TCOMMASPACE)) {
                argIndex = 1;
                overload = 0;
                // ラベルが来る可能性もあるので，ラベルも補完候補に含める
                completionItems = Completion.GRANDLabels;
            }

            // e.g. ADDA GR1, GR2| (入力終わり)
            else if (instSpaceTrailing(TokenType.TGR, TokenType.TCOMMASPACE, TokenType.TGR)) {
                completeInstructionLine();
            }

            // e.g. ADDA GR1, 1|
            else if (instSpaceTrailing(TokenType.TGR, TokenType.TCOMMASPACE, TokenType.TADDRESS)) {
                argIndex = 1;
                overload = 1;
            }

            // e.g. ADDA GR1, 1, |
            else if (instSpaceTrailing(TokenType.TGR, TokenType.TCOMMASPACE, TokenType.TADDRESS, TokenType.TCOMMASPACE)) {
                argIndex = 2;
                overload = 2;
                completionItems = Completion.IndexGR;
            }

            // e.g. ADDA GR1, 1, GR1| (入力終わり)
            else if (instSpaceTrailing(TokenType.TGR, TokenType.TCOMMASPACE, TokenType.TADDRESS, TokenType.TCOMMASPACE, TokenType.TGR)) {
                completeInstructionLine();
            }
            break;
    }
}

export function completion(position: Position): Array<CompletionItem> {
    analyzeState(position);

    function labelCompletionItems(): Array<CompletionItem> {
        const labels = getAllReferenceableLabels(position).map(x => x.value);
        return createLabelCompletionItems(labels);
    }

    switch (completionItems) {
        case Completion.Instruction:
            return instructionCompletionItems;
        case Completion.GR:
            return grCompletionItems;
        case Completion.IndexGR:
            return indexGRCompletionItems;
        case Completion.Labels:
            return labelCompletionItems();
        case Completion.GRANDLabels:
            return grCompletionItems.concat(labelCompletionItems());
        case Completion.None:
            break;
    }

    return [];
}

function getTokensBeforePosition(tokens: Array<TokenInfo>, position: Position): Array<TokenInfo> {
    const filtered = tokens.filter(x => x.endIndex <= position.character);
    if (filtered.length == 0) {
        return [];
    }
    const last = filtered[filtered.length - 1];
    const accept = last.type == TokenType.TCOMMASPACE || last.type == TokenType.TSPACE || last.type == TokenType.TGR;

    if (!accept && !acceptLabel()) {
        filtered.pop();
    }
    return filtered;

    function acceptLabel(): boolean {
        if (isAddressToken(last.type)) {
            // GR名とマッチする限りはGRとして解釈する
            const regex = /\b(G|GR|GR\d)\b/;
            const match = last.value.match(regex) || undefined;
            return match === undefined;
        } else {
            return false;
        }
    }
}

export function gotoDefinition(uri: string, position: Position): Location | Array<Location> {
    const noDefinitions: Array<Location> = [];
    if (lastDiagnosticsResult === undefined) return noDefinitions;
    // カーソル位置にあるトークンを取得する
    const labelToken = getTokenOfTypeAtPosition(TokenType.TLABEL, position);
    if (labelToken === undefined) return noDefinitions;

    const labels = getAllReferenceableLabels(position);
    const token = labels.find(x => x.value == labelToken.value);

    if (token === undefined) return noDefinitions;

    const location = createLocationFromToken(uri, token);

    return location;
}

function getAllReferences(position: Position): AllReferences | undefined {
    const labelToken = getTokenOfTypeAtPosition(TokenType.TLABEL, position);
    if (labelToken === undefined) return undefined;

    const scope = getScopeFromPosition(position);
    const allReferences = lastDiagnosticsResult.labelMap.findAllReferences(labelToken.value, scope);

    return allReferences;
}

export function findAllReferences(uri: string, position: Position, context: ReferenceContext): Array<Location> {
    const noReferences: Array<Location> = [];
    const allReferences = getAllReferences(position);
    if (allReferences === undefined) return noReferences;

    const { declaration, references } = allReferences;

    const base = context.includeDeclaration && declaration ? [declaration] : [];
    return base.concat(references).map(x => createLocationFromToken(uri, x));
}

export function documentHighlight(uri: string, position: Position): Array<DocumentHighlight> {
    const noHighlights: Array<DocumentHighlight> = [];
    const allReferences = getAllReferences(position);
    if (allReferences === undefined) return noHighlights;

    const base = allReferences.declaration ? [createDocumentHighlightFromToken(allReferences.declaration, DocumentHighlightKind.Write)] : [];
    const rest = allReferences.references.map(x => createDocumentHighlightFromToken(x, DocumentHighlightKind.Read));

    return base.concat(rest);

    function createDocumentHighlightFromToken(token: TokenInfo, kind: DocumentHighlightKind): DocumentHighlight {
        return {
            range: createRangeFromTokenInfo(token),
            kind: kind
        };
    }
}

export function rename(uri: string, version: number, position: Position, newName: string): WorkspaceEdit {
    // ハイライトされているところは同一シンボルということなので
    // ハイライトされている部分をリネームすればよい
    const highlights = documentHighlight(uri, position);
    const edits = highlights.map(x => TextEdit.replace(x.range, newName));

    return {
        changes: [
            {
                textDocument: { uri: uri, version: version },
                edits: edits
            }
        ]
    };
}

// TODO: クライアント側の設定と同期させる
const enableLabelScope = true;

export function documentSymbol(uri: string): Array<SymbolInformation> {
    const { subroutineLabels, labels } = lastDiagnosticsResult.labelMap.getAllLabels();

    const a = subroutineLabels.map(x => convertTokenToSymbolInformation(x, SymbolKind.Function));
    const b = labels.map(x => {
        const containerName = enableLabelScope ? getSubroutineNameFromLine(x.line) : undefined;
        return convertTokenToSymbolInformation(x, SymbolKind.Field, containerName);
    });
    const information = a.concat(b);

    return information;

    // 行番号から親のサブルーチン名を取得する
    function getSubroutineNameFromLine(line: number): string | undefined {
        const scope = getScopeFromLine(line);
        const a = subroutineLabels.find(x => getScopeFromLine(x.line) == scope);
        return a && a.value;
    }

    function convertTokenToSymbolInformation(token: TokenInfo, kind: SymbolKind, containerName?: string) {
        return SymbolInformation.create(token.value, kind, createRangeFromTokenInfo(token), uri, containerName);
    }
}

export function hover(uri: string, position: Position): Hover {
    const noContents: Hover = { contents: [] };
    const instructionToken = getTokenOfTypeAtPosition(TokenType.TINSTRUCTION, position);
    if (instructionToken === undefined) return noContents;

    const instructionNode = lastDiagnosticsResult.instructions.find(x => x.lineNumber == position.line);

    if (instructionNode === undefined || instructionNode.originalTokens.instruction == instructionToken) {
        const instruction = instructionCompletionItems.find(x => x.label === instructionToken.value);
        if (instruction === undefined) return noContents;

        return { contents: [instruction.detail!, instruction.documentation!] };
    } else {
        return noContents;
    }
}

const noSignatureHelp = { signatures: [], activeParameter: 0, activeSignature: 0 };
export function signatureHelp(uri: string, position: Position): SignatureHelp {
    analyzeState(position);
    if (argIndex < 0) return noSignatureHelp;

    return {
        signatures: argumentTypeToString(),
        activeParameter: argIndex || 0,
        activeSignature: overload || 0
    };
}

function argumentTypeToString(): Array<SignatureInformation> {
    enum Argument {
        label,
        decimal,
        constant,
        adr,
        r,
        r1,
        r2,
        x,
        buf,
        len
    }

    const map = new Map<Argument, string>([
        [Argument.label, "label"],
        [Argument.decimal, "decimal"],
        [Argument.constant, "constant"],
        [Argument.adr, "adr"],
        [Argument.r, "r"],
        [Argument.r1, "r1"],
        [Argument.r2, "r2"],
        [Argument.x, "x"],
        [Argument.buf, "buf"],
        [Argument.len, "len"]
    ]);

    switch (argumentType) {
        case ArgumentType.none:
            return [];
        case ArgumentType.label_START:
            return [
                createSignatureInformation(),
                createSignatureInformation(Argument.label)
            ];
        case ArgumentType.decimal_DS:
            return [
                createSignatureInformation(Argument.decimal)
            ];
        case ArgumentType.constants_DC:
            return [
                {
                    label: instruction + " constant[, constant ...]",
                    parameters: [{ label: "constant" }, { label: ", constant ..." }]
                }
            ];
        case ArgumentType.adr_r2:
            return [
                createSignatureInformation(Argument.adr),
                createSignatureInformation(Argument.adr, Argument.x)
            ];
        case ArgumentType.r:
            return [
                createSignatureInformation(Argument.r)
            ];
        case ArgumentType.adr_adr:
            return [
                createSignatureInformation(Argument.buf, Argument.len)
            ];
        case ArgumentType.r1_r2:
            return [
                createSignatureInformation(Argument.r1, Argument.r2)
            ];
        case ArgumentType.r1_adr_r2:
            return [
                createSignatureInformation(Argument.r, Argument.adr),
                createSignatureInformation(Argument.r, Argument.adr, Argument.x)
            ];
        case ArgumentType.r1_r2_OR_r1_adr_r2:
            return [
                createSignatureInformation(Argument.r1, Argument.r2),
                createSignatureInformation(Argument.r1, Argument.adr),
                createSignatureInformation(Argument.r1, Argument.adr, Argument.x),
            ];
        default:
            return [];
    }

    function argumentToString(arg: Argument) {
        const r = map.get(arg);
        if (r === undefined) throw new Error();
        return r;
    }

    function createSignatureInformation(...args: Array<Argument>): SignatureInformation {
        const names = args.map(argumentToString);
        return {
            label: `${instruction} ${names.join(", ")}`,
            parameters: names.map(x => ParameterInformation.create(x))
        };
    }
}

function getTokenOfTypeAtPosition(type: TokenType, position: Position): TokenInfo | undefined {
    const tokens = getTokensAtPosition(position);
    if (tokens === undefined) return undefined;

    const filtered = tokens.filter(x => x.type == type);
    if (filtered.length == 0) return undefined;

    return filtered[filtered.length - 1];
}

function getTokensAtPosition(position: Position): Array<TokenInfo> | undefined {
    const lineTokens = lastDiagnosticsResult.tokensMap.get(position.line);
    if (lineTokens === undefined) return undefined;

    const tokens = lineTokens.tokens.filter(x => x.startIndex <= position.character && position.character <= x.endIndex);
    return tokens;
}

function createRangeFromTokenInfo(token: TokenInfo): Range {
    const { line, startIndex, endIndex } = token;
    return {
        start: {
            line: line,
            character: startIndex
        },
        end: {
            line: line,
            character: endIndex
        }
    };
}

function createLocationFromToken(uri: string, token: TokenInfo): Location {
    return {
        uri: uri,
        range: createRangeFromTokenInfo(token)
    };
}

function getScopeFromLine(line: number) {
    const scope = lastDiagnosticsResult.scopeMap.get(line);
    if (scope === undefined) throw new Error();
    return scope;
}

function getScopeFromPosition(position: Position) {
    return getScopeFromLine(position.line);
}

function getAllReferenceableLabels(position: Position): Array<TokenInfo> {
    const scope = getScopeFromPosition(position);
    if (scope !== undefined) {
        return lastDiagnosticsResult.labelMap.getAllReferenceableLabels(scope);
    } else {
        return [];
    }
}

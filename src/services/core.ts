"use strict";

import {
    Casl2, Casl2CompileOption, Diagnostic as Casl2Diagnostic, DiagnosticCategory, Casl2DiagnosticResult,
    TokenType, TokenInfo
} from "@maxfield/node-casl2-core";
import {
    instructionCompletionItems, grCompletionItems, indexGRCompletionItems,
    createLabelCompletionItems, Completion
} from "./completion";
import { Diagnostic, DiagnosticSeverity, Position, CompletionItem, Range, Location, TextDocument } from "vscode-languageserver";
import { instructionMap, isAddressToken, AllReferences } from "@maxfield/node-casl2-core";
import { ArgumentType } from "@maxfield/node-casl2-comet2-core-common";

import { hover as Hover } from "./hover";
import { documentHighlight as DocumentHighlight } from "./documentHighlight";
import { rename as Rename } from "./rename";
import { completion as doCompletion } from "./completion";
import { documentSymbol as DocumentSymbol } from "./documentSymbol";
import { signatureHelp as SignatureHelp } from "./signatureHelp";
import { gotoDefinition as GotoDefinition } from "./gotoDefinition";
import { findAllReferences as FindAllReferences } from "./findAllReferences";
import { documentFormatting as DocumentFormatting } from "./formatting";

export namespace LanguageServices {
    export const hover = Hover;
    export const documentHighlight = DocumentHighlight;
    export const rename = Rename;
    export const completion = doCompletion;
    export const documentSymbol = DocumentSymbol;
    export const signatureHelp = SignatureHelp;
    export const gotoDefinition = GotoDefinition;
    export const findAllReferences = FindAllReferences;
    export const documentFormatting = DocumentFormatting;
}

export function getCurrentOption(): Casl2CompileOption {
    return casl2.compileOption;
}
export function updateOption(option: Casl2CompileOption) {
    casl2.changeCompileOption(option);
}

const casl2 = new Casl2();

export let lastDiagnosticsResult: Casl2DiagnosticResult;

// テキストファイルを検証する
export function validateTextDocument(textDocument: TextDocument): void {
    // 行のリストにする
    const lines = textDocument.getText().split(/\r?\n/g);
    validateSource(lines);
}

export function getCurrenctDiagnostics(): Diagnostic[] {
    return lastDiagnosticsResult.diagnostics.map(convertDiagnostic);
}

export function validateSource(lines: string[]): void {
    documentUpdated = true;

    const diagnosticResult = casl2.analyze(lines);
    const { diagnostics } = diagnosticResult;

    lastDiagnosticsResult = diagnosticResult;
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

export function getCurrentState() {
    return {
        argumentType, argIndex, instruction, overload, completionItems
    };
}

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

export function analyzeState(position: Position): void {
    setCurrentPosition(position);

    if (!shouldAnalyzeState()) return;

    documentUpdated = false;

    if (!lastDiagnosticsResult) return;

    // カーソルのある行のトークン列を取得する
    const tokensInfo = lastDiagnosticsResult.tokensMap.get(position.line);
    if (!tokensInfo) throw new Error();
    if (!tokensInfo.success) return;

    const tokens = tokensInfo.tokens;
    const beforeCursorTokens = getTokensBeforePosition(tokens, position);

    function consume(...tokenTypes: TokenType[]): boolean {
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

    function leadingSpace(tokens: TokenInfo[], position: Position): boolean {
        const beforeTokens = getTokensBeforePositionIgnoring(tokens, position, TokenType.TSPACE);
        if (beforeTokens.length >= 1) {
            return beforeTokens[0].type == TokenType.TSPACE;
        } else {
            return false;
        }
    }

    function leadingLabelSpace(tokens: TokenInfo[], position: Position): boolean {
        if (tokens.length >= 1) {
            const slice = tokens.slice(1);
            return leadingSpace(slice, position);
        } else {
            return false;
        }
    }

    if (leadingSpace(tokens, position) || leadingLabelSpace(tokens, position)) {
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

    function labelCompletionItems(): CompletionItem[] {
        const labels = getAllReferenceableLabels(position).map(x => x.value);
        return createLabelCompletionItems(labels);
    }

    function instSpace(): boolean {
        return consume(TokenType.TINSTRUCTION, TokenType.TSPACE);
    }

    function instSpaceTrailing(...tokenTypes: TokenType[]): boolean {
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


        case ArgumentType.adr_adr:
            // e.g. IN |
            if (instSpace()) {
                argIndex = 0;
                overload = 0;
                completionItems = Completion.Labels;
            }
            // e.g. IN BUF, |
            else if (instSpaceTrailing(TokenType.TADDRESS, TokenType.TCOMMASPACE)) {
                argIndex = 1;
                overload = 0;
                completionItems = Completion.Labels;
            }
            // e.g. IN BUF, LEN|
            else if (instSpaceTrailing(TokenType.TADDRESS, TokenType.TCOMMASPACE, TokenType.TADDRESS)) {
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

function getTokensBeforePositionIgnoring(tokens: TokenInfo[], position: Position, ...notIgnoringTypes: TokenType[]): TokenInfo[] {
    const filtered = tokens.filter(x => x.startIndex < position.character);
    if (filtered.length == 0) {
        return [];
    }
    const last = filtered[filtered.length - 1];
    const acceptLast = notIgnoringTypes.some((x) => last.type == x);

    if (!acceptLast) {
        filtered.pop();
    }

    return filtered;
}

/**
 * カーソルより前のトークンの配列(ただし，末尾のトークンがCommaSpace, Space, GR, Label以外の場合そのトークンは除外)
 * を取得
 */
function getTokensBeforePosition(tokens: TokenInfo[], position: Position): TokenInfo[] {
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

export function getAllReferences(position: Position): AllReferences | undefined {
    const labelToken = getLabelFromPosition(position);
    if (labelToken === undefined) return undefined;

    const scope = getScopeFromPosition(position);
    const allReferences = lastDiagnosticsResult.labelMap.findAllReferences(labelToken.value, scope);

    return allReferences;
}

export function getLabelFromPosition(position: Position): TokenInfo | undefined {
    const labelToken = getTokenOfTypeAtPosition(TokenType.TLABEL, position)
        || getTokenOfTypeAtPosition(TokenType.TINSTRUCTION, position);
    if (labelToken === undefined) return undefined;
    const index = lastDiagnosticsResult.tokensMap.get(position.line)!.tokens.indexOf(labelToken);
    // ENDのように命令と同じ名前のラベルの場合があるので
    // 3番目以降のトークンならばラベルであるとしている
    // また行の先頭にある場合もラベルである
    const isLabel = index == 0 || index > 2;
    return isLabel ? labelToken : undefined;
}

export function getTokenOfTypeAtPosition(type: TokenType, position: Position): TokenInfo | undefined {
    const tokens = getTokensAtPosition(position);
    if (tokens === undefined) return undefined;

    const filtered = tokens.filter(x => x.type == type);
    if (filtered.length == 0) return undefined;

    return filtered[filtered.length - 1];
}

export function getTokensAtPosition(position: Position): TokenInfo[] | undefined {
    const lineTokens = lastDiagnosticsResult.tokensMap.get(position.line);
    if (lineTokens === undefined) return undefined;

    const tokens = lineTokens.tokens.filter(x => x.startIndex <= position.character && position.character <= x.endIndex);
    return tokens;
}

export function createRangeFromTokenInfo(token: TokenInfo): Range {
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

export function createLocationFromToken(uri: string, token: TokenInfo): Location {
    return {
        uri: uri,
        range: createRangeFromTokenInfo(token)
    };
}



export function getScopeFromLine(line: number): number {
    const { scopeMap, subroutinesInfo, instructions } = lastDiagnosticsResult;
    const scope = scopeMap.get(line);

    if (scope !== undefined) return scope;

    // もしscopeMapに登録されていない場合は前の行へと遡る
    const result = scopeBackwardSearch(line);
    if (result === undefined) {
        return 1;
    } else {
        const options = getCurrentOption();
        const [scope, line] = result;
        if (options.enableLabelScope) {
            // スコープの変更点(END命令)ならば
            // 1足したスコープを返す
            const subroutine = subroutinesInfo.find(x => x.endLine === line);
            return subroutine === undefined
                ? scope
                : scope + 1;
        } else {
            return scope;
        }
    }

    function scopeBackwardSearch(line: number): [number, number] | undefined {
        const l = line - 1;
        if (l < 0) return undefined;

        const scope = scopeMap.get(l);
        if (scope === undefined) {
            return scopeBackwardSearch(l);
        } else {
            return [scope, l];
        }
    }
}

function getScopeFromPosition(position: Position) {
    return getScopeFromLine(position.line);
}

export function getAllReferenceableLabels(position: Position): TokenInfo[] {
    const scope = getScopeFromPosition(position);
    if (scope !== undefined) {
        return lastDiagnosticsResult.labelMap.getAllReferenceableLabels(scope);
    } else {
        return [];
    }
}

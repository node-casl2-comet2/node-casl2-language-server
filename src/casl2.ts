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
    ErrorCodes, SymbolInformation, SymbolKind
} from "vscode-languageserver";
import { instructionMap, isAddressToken, AllReferences } from "@maxfield/node-casl2-core";
import { ArgumentType } from "@maxfield/node-casl2-comet2-core-common";

const casl2 = new Casl2();

let lastDiagnosticsResult: Casl2DiagnosticResult;

export function validateSource(lines: Array<string>): Array<Diagnostic> {
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

export function completion(position: Position): Array<CompletionItem> {
    console.log(position);
    if (!lastDiagnosticsResult) return [];

    // カーソルのある行のトークン列を取得する
    const tokens = lastDiagnosticsResult.tokensMap.get(position.line);

    // const { diagnostics } = lastDiagnosticsResult;

    // const diagnostic = diagnostics.find(x => x.line === position.line + 1);
    // if (!diagnostic) return [];

    if (tokens) {

        // 命令の補完を出す条件
        // 1. カーソルが先頭の空白の右側である
        // 2. カーソルがラベルの右側である
        // 3. カーソルが行の先頭である
        if (space(tokens, position) || label_space(tokens, position) || startOfLine(tokens)) {
            // 命令
            return instructionCompletionItems;
        }

        // GRの補完を出す条件
        // 前提: 命令が入力されていて，その命令がとるオペランドがGRである
        const instructionToken = tokens.filter(x => x.type == TokenType.TINSTRUCTION);
        if (instructionToken.length > 0) {
            const instToken = instructionToken[0];
            const inst = instToken.value;
            const info = instructionMap.get(inst);
            if (info === undefined) throw new Error();
            const beforeCursorTokens = getTokensBeforePosition(tokens, position.character);

            function labelCompletionItems(): Array<CompletionItem> {
                const labels = getAllReferenceableLabels(position).map(x => x.value);
                return createLabelCompletionItems(labels);
            }

            function instSpaceTrailing(...tokenTypes: Array<TokenType>): boolean {
                const count = 2 + tokenTypes.length;
                if (beforeCursorTokens.length >= count) {
                    const slice = beforeCursorTokens.slice(beforeCursorTokens.length - count);

                    function isValid(t: TokenType, index: number) {
                        const type = slice[2 + index].type;
                        if (t == TokenType.TADDRESS) {
                            return isAddressToken(type);
                        } else {
                            return type == t;
                        }
                    }

                    const v = tokenTypes.map((t, index) => isValid(t, index));
                    const valid =
                        v.length == 0
                            ? true
                            : v.length == 1
                                ? v[0]
                                : v.reduce((a, b) => a && b);

                    if (slice[0] == instToken && slice[1].type == TokenType.TSPACE && valid) {
                        return true;
                    }
                }

                return false;
            }

            function instSpace(): boolean {
                return instSpaceTrailing();
            }

            switch (info.argumentType) {
                case ArgumentType.none:
                    // 何も補完しない
                    break;

                case ArgumentType.label_START:
                    // e.g. START |
                    if (instSpace()) {
                        return labelCompletionItems();
                    }
                    break;

                case ArgumentType.decimal_DS:
                    // 何も補完しない
                    break;

                case ArgumentType.constants_DC:
                    // e.g. DC |
                    if (instSpace()) {
                        return labelCompletionItems();
                    }
                    // e.g. DC 1, |
                    // DCは任意長のオペランドをもつので
                    // カーソルの左側に命令があって，かつカーソルの直前のトークンが
                    // TCOMMASPACEの時補完を出すことにしている
                    if (beforeCursorTokens.indexOf(instToken) != -1) {
                        if (beforeCursorTokens.length >= 1) {
                            const [l1] = beforeCursorTokens.slice(beforeCursorTokens.length - 1);
                            if (l1.type == TokenType.TCOMMASPACE) {
                                return labelCompletionItems();
                            }
                        }
                    }
                    break;


                case ArgumentType.adr_r2:
                    // e.g. JUMP |
                    if (instSpace()) {
                        return labelCompletionItems();
                    }
                    // e.g. JUMP L1, |
                    if (instSpaceTrailing(TokenType.TADDRESS, TokenType.TCOMMASPACE)) {
                        return indexGRCompletionItems;
                    }
                    break;


                case ArgumentType.r:
                    // e.g. POP |
                    if (instSpace()) {
                        return grCompletionItems;
                    }
                    break;


                case ArgumentType.r1_r2:
                    // r1, r2パターンのみの命令は存在しないので
                    // r1_r2_OR_r1_adr_r2で処理されるはず
                    throw new Error();


                case ArgumentType.r1_adr_r2:
                    // e.g. SLA |
                    if (instSpace()) {
                        return grCompletionItems;
                    }
                    // e.g. SLA GR1, |
                    if (instSpaceTrailing(TokenType.TGR, TokenType.TCOMMASPACE)) {
                        return labelCompletionItems();
                    }
                    // e.g. SLA GR1, 1, |
                    if (instSpaceTrailing(TokenType.TGR, TokenType.TCOMMASPACE, TokenType.TADDRESS, TokenType.TCOMMASPACE)) {
                        return indexGRCompletionItems;
                    }
                    break;


                case ArgumentType.r1_r2_OR_r1_adr_r2:
                    // e.g. ADDA |
                    if (instSpace()) {
                        return grCompletionItems;
                    }
                    // e.g. ADDA GR1, |
                    if (instSpaceTrailing(TokenType.TGR, TokenType.TCOMMASPACE)) {
                        // ラベルが来る可能性もあるので，ラベルも補完候補に含める
                        const merge = grCompletionItems.concat(labelCompletionItems());
                        return merge;
                    }
                    // e.g. ADDA GR1, 1, |
                    if (instSpaceTrailing(TokenType.TGR, TokenType.TCOMMASPACE, TokenType.TADDRESS, TokenType.TCOMMASPACE)) {
                        return indexGRCompletionItems;
                    }
                    break;
            }
        }
    }

    return [];
}

function space(tokens: Array<TokenInfo>, position: Position): boolean {
    const filtered = getTokensBeforePosition(tokens, position.character);
    if (filtered.length == 1) {
        const [first] = filtered;
        return first.type == TokenType.TSPACE;
    }

    return false;
}

function startOfLine(tokens: Array<TokenInfo>) {
    if (tokens.length == 0) return true;
    if (tokens.length == 1) {
        return tokens[0].type == TokenType.TLABEL;
    } else {
        return false;
    }
}

function label_space(tokens: Array<TokenInfo>, position: Position): boolean {
    const t = getTokensBeforePosition(tokens, position.character);
    if (t.length >= 2) {
        const [l1, l2] = t.slice(t.length - 2);
        return l1.type == TokenType.TLABEL && l2.type == TokenType.TSPACE;
    }

    return false;
}

function getTokensBeforePosition(tokens: Array<TokenInfo>, cursorIndex: number) {
    const filtered = tokens.filter(x => x.endIndex <= cursorIndex);
    const last = filtered[filtered.length - 1];
    if (!(last.type == TokenType.TCOMMASPACE || last.type == TokenType.TSPACE)) {
        filtered.pop();
    }
    return filtered;
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

    const tokens = lineTokens.filter(x => x.startIndex <= position.character && position.character <= x.endIndex);
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

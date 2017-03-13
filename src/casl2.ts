"use strict";

import {
    Casl2, Diagnostic as Casl2Diagnostic, DiagnosticCategory, Casl2DiagnosticResult,
    TokenType, TokenInfo
} from "@maxfield/node-casl2-core";
import { Diagnostic, DiagnosticSeverity, CompletionItem, CompletionItemKind, Position } from "vscode-languageserver";
import { instructionCompletionItems, grCompletionItems, indexGRCompletionItems } from "./completion";
import { instructionMap, isAddressToken } from "@maxfield/node-casl2-core";
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
        if (space(tokens, position) || label_space(tokens) || startOfLine(tokens)) {
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
            const beforeCursorTokens = getTokensBeforeCursor(tokens, position.character);

            switch (info.argumentType) {
                case ArgumentType.adr_r2:
                    // e.g. JUMP L1, |
                    if (beforeCursorTokens.length >= 4) {
                        const [l1, l2, l3, l4] = beforeCursorTokens.slice(beforeCursorTokens.length - 4);
                        if (l1 == instToken && l2.type == TokenType.TSPACE && isAddressToken(l3.type) && l4.type == TokenType.TCOMMASPACE) {
                            return indexGRCompletionItems;
                        }
                    }
                    break;


                case ArgumentType.r:
                    // e.g. POP |
                    if (beforeCursorTokens.length >= 2) {
                        const [l1, l2] = beforeCursorTokens.slice(beforeCursorTokens.length - 2);
                        if (l1 == instToken && l2.type == TokenType.TSPACE) {
                            return grCompletionItems;
                        }
                    }
                    break;


                case ArgumentType.r1_r2:
                    // r1, r2パターンのみの命令は存在しないので
                    // r1_r2_OR_r1_adr_r2で処理されるはず
                    throw new Error();


                case ArgumentType.r1_adr_r2:
                    // e.g. SLA |
                    if (beforeCursorTokens.length >= 2) {
                        const [l1, l2] = beforeCursorTokens.slice(beforeCursorTokens.length - 2);
                        if (l1 == instToken && l2.type == TokenType.TSPACE) {
                            return grCompletionItems;
                        }
                    }
                    // e.g. SLA GR1, 1, |
                    if (beforeCursorTokens.length >= 6) {
                        const [l1, l2, l3, l4, l5, l6] = beforeCursorTokens.slice(beforeCursorTokens.length - 6);
                        if (l1 == instToken && l2.type == TokenType.TSPACE && l3.type == TokenType.TGR && l4.type == TokenType.TCOMMASPACE
                            && isAddressToken(l5.type) && l6.type == TokenType.TCOMMASPACE) {
                            return indexGRCompletionItems;
                        }
                    }
                    break;


                case ArgumentType.r1_r2_OR_r1_adr_r2:
                    // e.g. ADDA |
                    if (beforeCursorTokens.length >= 2) {
                        const [l1, l2] = beforeCursorTokens.slice(beforeCursorTokens.length - 2);
                        if (l1 == instToken && l2.type == TokenType.TSPACE) {
                            return grCompletionItems;
                        }
                    }
                    // e.g. ADDA GR1, |
                    if (beforeCursorTokens.length >= 4) {
                        const [l1, l2, l3, l4] = beforeCursorTokens.slice(beforeCursorTokens.length - 4);
                        if (l1 == instToken && l2.type == TokenType.TSPACE &&
                            l3.type == TokenType.TGR && l4.type == TokenType.TCOMMASPACE) {
                            // TODO: ラベルが来る可能性もあるので，ラベルも補完候補に含める
                            return grCompletionItems;
                        }
                    }
                    break;
            }
        }
    }

    return [];
}

function space(tokens: Array<TokenInfo>, position: Position): boolean {
    const filtered = getTokensBeforeCursor(tokens, position.character);
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

function label_space(tokens: Array<TokenInfo>): boolean {
    if (tokens.length >= 2) {
        const [first, second] = tokens;
        return first.type == TokenType.TLABEL && second.type == TokenType.TSPACE;
    }

    return false;
}

function getTokensBeforeCursor(tokens: Array<TokenInfo>, cursorIndex: number) {
    const filtered = tokens.filter(x => x.endIndex < cursorIndex);
    return filtered;
}
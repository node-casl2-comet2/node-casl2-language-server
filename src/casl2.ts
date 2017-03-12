"use strict";

import {
    Casl2, Diagnostic as Casl2Diagnostic, DiagnosticCategory, Casl2DiagnosticResult,
    TokenType, TokenInfo
} from "@maxfield/node-casl2-core";
import { Diagnostic, DiagnosticSeverity, CompletionItem, CompletionItemKind, Position } from "vscode-languageserver";
import { instructionCompletionItems } from "./completion";

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
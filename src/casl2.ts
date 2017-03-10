"use strict";

import { Casl2, Diagnostic as Casl2Diagnostic, DiagnosticCategory } from "@maxfield/node-casl2-core";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
const casl2 = new Casl2();

export function validateSource(lines: Array<string>): Array<Diagnostic> {
    const analysis = casl2.analyze(lines);
    const { diagnostics } = analysis;

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

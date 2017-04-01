"use strcit";


import {
    TextDocument, Diagnostic, IConnection,
    DiagnosticSeverity
} from "vscode-languageserver";
import { Linter, Fix } from "@maxfield/casl2-lint";

export function validateDocument(document: TextDocument, connection: IConnection): void {
    const { uri } = document;
    const diagnostics = diagnoseSource(document);
    connection.sendDiagnostics({ uri, diagnostics });
}

export function diagnoseSource(document: TextDocument): Diagnostic[] {
    const content = document.getText();
    const linter = new Linter();
    const result = linter.analyze(document.uri, content);
    const diagnostics = result.fixes.map(createDiagnosticFromFix);

    return diagnostics;
}

function createDiagnosticFromFix(fix: Fix): Diagnostic {
    const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Warning,
        message: fix.message,
        range: {
            start: fix.start,
            end: fix.end
        },
        source: "casl2-lint"
    };

    return diagnostic;
}

"use strict";

import {
    TextDocument, Diagnostic, IConnection,
    DiagnosticSeverity, Command, CodeActionParams, Range,
    TextEdit
} from "vscode-languageserver";
import { AutoFixMap, AutoFixEdit, AutoFix } from "./types";
import { Linter, Fix } from "@maxfield/casl2-lint";
import { FixAllProblemsRequestParams, FixAllProblemsRequestResponse } from "../ipc/types";
import { createTextEdit, computeKey } from "./linter";

export class LinterWoker {
    public readonly uri: string;
    public linterEnabled: boolean;

    private _text: string;
    private _documentVersion: number;
    private _autoFixMap: AutoFixMap;
    private _diagnostics: Diagnostic[];

    // 最後に診断したdocument version
    private _lastDiagnoseDocumentVersion: number;

    constructor(uri: string) {
        this.uri = uri;
    }

    public get autoFixMap() {
        return this._autoFixMap;
    }

    public get diagnostics() {
        return this._diagnostics;
    }

    public loadDocument(document: TextDocument) {
        this._text = document.getText();
        this._documentVersion = document.version;
    }

    public diagnoseSource(): void {
        // 診断済みならば何もしない
        if (this._lastDiagnoseDocumentVersion == this._documentVersion) return;

        // ファイル作成直後にそのファイルが存在しないという
        // エラーになるのを回避する
        if (this._text === "") return;

        const linter = new Linter();

        const result = linter.analyze(this.uri, this._text);
        const diagnostics: Diagnostic[] = [];

        // 古いものを削除するために必ず作りかえる
        this._autoFixMap = new Map();
        this._diagnostics = [];

        for (const fix of result.fixes) {
            const diagnostic = createDiagnosticFromFix(fix);
            this._diagnostics.push(diagnostic);
            this._autoFixMap.set(computeKey(diagnostic), createAutoFix(fix, this._documentVersion));
        }

        this._lastDiagnoseDocumentVersion = this._documentVersion;
    }

    public getAllAutoFixes(): AutoFix[] {
        return Array.from(this._autoFixMap.values());
    }
}

/**
 * Transform Fix object to Diagnostic
 * @param fix Fix object
 */
function createDiagnosticFromFix(fix: Fix): Diagnostic {
    const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Warning,
        message: fix.message,
        range: {
            start: fix.start,
            end: fix.end
        },
        code: fix.ruleName,
        source: "casl2-lint"
    };

    return diagnostic;
}

function createAutoFix(fix: Fix, documentVersion: number): AutoFix {
    const autoFix: AutoFix = {
        documentVersion: documentVersion,
        fix: fix,
        edit: createAutoFixEdit(fix)
    };

    return autoFix;
}

function createAutoFixEdit(fix: Fix): AutoFixEdit {
    const edit: AutoFixEdit = {
        range: {
            start: fix.replacementStartPosition,
            end: fix.replacementEndPosition
        },
        text: fix.replacementText
    };

    return edit;
};

"use strcit";


import {
    TextDocument, Diagnostic, IConnection,
    DiagnosticSeverity, Command, CodeActionParams, Range,
    TextEdit
} from "vscode-languageserver";
import { Linter, Fix } from "@maxfield/casl2-lint";
import { FixAllProblemsRequestParams, FixAllProblemsRequestResponse } from "../ipc/types";
import { AutoFixMap, AutoFixEdit, AutoFix } from "./types";
import { Commands } from "../constants";

// コード自動修正のマップ (URI -> AutoFixMap)
const codeFixActions: Map<string, AutoFixMap> = new Map();

let linterEnabled = true;
export function setEnabled(enabled: boolean) {
    linterEnabled = enabled;
}

/**
 * ファイルに関連するデータを破棄します
 * @param uri File URI
 */
export function dispose(uri: string): void {
    // 古いCodeActionsを破棄する
    codeFixActions.delete(uri);
}

export function diagnoseSource(document: TextDocument): Diagnostic[] {
    dispose(document.uri);

    if (!linterEnabled) return [];

    const content = document.getText();
    const linter = new Linter();

    // ファイル作成直後にそのファイルが存在しないという
    // エラーになるのを回避する
    if (content === "") return [];

    const result = linter.analyze(document.uri, content);
    const diagnostics: Diagnostic[] = [];

    for (const fix of result.fixes) {
        const diagnostic = createDiagnosticFromFix(fix);
        diagnostics.push(diagnostic);
        recordCodeAction(document, diagnostic, fix);
    }

    return diagnostics;
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

function recordCodeAction(document: TextDocument, diagnostic: Diagnostic, fix: Fix): void {
    let autoFixMap = codeFixActions.get(document.uri);
    if (!autoFixMap) {
        // なければ作る
        autoFixMap = new Map();
        codeFixActions.set(document.uri, autoFixMap);
    }

    autoFixMap.set(computeKey(diagnostic), createAutoFix(fix, document));
}

export function getAllAutoFixes(uri: string): AutoFix[] | undefined {
    const autoFixMap = codeFixActions.get(uri);
    if (!autoFixMap) return undefined;

    const allAutoFixes = Array.from(autoFixMap.values());
    return allAutoFixes;
}

export function fixAllProblems(params: FixAllProblemsRequestParams): FixAllProblemsRequestResponse {
    const allAutoFixes = getAllAutoFixes(params.textDocument.uri);
    if (allAutoFixes === undefined || allAutoFixes.length == 0) {
        const response = {
            documentVersion: -1,
            textEdits: []
        };

        return response;
    }

    const textEdits = allAutoFixes.map(createTextEdit);
    const response = {
        documentVersion: allAutoFixes[0].documentVersion,
        textEdits: textEdits
    };

    return response;
}

export function codeAction(params: CodeActionParams): Command[] {
    const { textDocument, context } = params;
    const { uri } = textDocument;
    const autoFixMap = codeFixActions.get(uri);
    if (!autoFixMap) return [];

    const autofixOfDiagnostic = getAutoFixOfDiagnostics(context.diagnostics, autoFixMap);
    if (autofixOfDiagnostic === undefined) return [];

    const commands: Command[] = [];
    const { documentVersion } = autofixOfDiagnostic;

    const args = [uri, documentVersion, [createTextEdit(autofixOfDiagnostic)]]
    commands.push(Command.create(
        `問題を修正: ${autofixOfDiagnostic.fix.message}`, Commands.ApplySingleFix, ...args
    ));

    const allAutoFixes = Array.from(autoFixMap.values());
    const sameRuleFixes = collectSameRuleAllFixes(autofixOfDiagnostic.fix.ruleName, allAutoFixes);
    if (sameRuleFixes.length >= 2) {
        const args = [uri, documentVersion, sameRuleFixes.map(createTextEdit)];
        commands.push(Command.create(
            `同じ種類の問題を修正: ${autofixOfDiagnostic.fix.message}`, Commands.ApplyAllSameRuleFixes, ...args
        ));
    }

    if (allAutoFixes.length >= 2) {
        const args = [uri, documentVersion, allAutoFixes.map(createTextEdit)]
        commands.push(Command.create(
            "すべての問題を修正", Commands.ApplyAllFixes, ...args
        ));
    }

    return commands;

    function getAutoFixOfDiagnostics(diagnostics: Diagnostic[], autoFixMap: AutoFixMap): AutoFix | undefined {
        // context.diagnosticsにはカーソル位置に出ている
        // Diagnosticsが入っている
        for (const diagnostic of diagnostics) {
            const autofix = autoFixMap.get(computeKey(diagnostic));
            if (autofix) {
                return autofix;
            }
        }

        return undefined;
    }

    function collectSameRuleAllFixes(ruleName: string, allAutoFixes: AutoFix[]) {
        const sameRuleFixes: AutoFix[] = [];
        for (const autofix of allAutoFixes) {
            if (autofix.fix.ruleName === ruleName) {
                sameRuleFixes.push(autofix);
            }
        }

        return sameRuleFixes;
    }
}

function createAutoFix(fix: Fix, document: TextDocument): AutoFix {
    const autoFix: AutoFix = {
        documentVersion: document.version,
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

export function createTextEdit(autofix: AutoFix): TextEdit {
    return TextEdit.replace(
        autofix.edit.range,
        autofix.edit.text
    );
}

function computeKey(diagnostic: Diagnostic): string {
    const { range, severity, code } = diagnostic;
    const start = `(${range.start.line}, ${range.start.character})`;
    const end = `(${range.end.line}, ${range.end.character})`;
    return `[${start}, ${end}] ${code}`;
}

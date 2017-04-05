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
import { LinterWoker } from "./linterWorker";

// コード自動修正のマップ (URI -> AutoFixMap)
// const codeFixActions: Map<string, AutoFixMap> = new Map();
// (URI -> LinterWorker)
const linterWokerMap: Map<string, LinterWoker> = new Map();

let linterEnabled = true;
export function setEnabled(enabled: boolean) {
    linterEnabled = enabled;
}
export function isEnabled(): boolean {
    return linterEnabled;
}

export function dispose(uri: string): void {
    linterWokerMap.delete(uri);
}

export function getWorker(uri: string): LinterWoker {
    const worker = linterWokerMap.get(uri);
    if (worker) {
        return worker;
    } else {
        // なければ作る
        const worker = new LinterWoker(uri);
        linterWokerMap.set(uri, worker);
        return worker;
    }
}

export function codeAction(params: CodeActionParams): Command[] {
    const { textDocument, context } = params;
    const { uri } = textDocument;

    const worker = linterWokerMap.get(uri);
    if (!worker) return [];

    const autofixOfDiagnostic = getAutoFixOfDiagnostics(context.diagnostics, worker.autoFixMap);
    if (autofixOfDiagnostic === undefined) return [];

    const commands: Command[] = [];
    const { documentVersion } = autofixOfDiagnostic;

    const args = [uri, documentVersion, [createTextEdit(autofixOfDiagnostic)]]
    commands.push(Command.create(
        `問題を修正: ${autofixOfDiagnostic.fix.message}`, Commands.ApplySingleFix, ...args
    ));

    const allAutoFixes = Array.from(worker.autoFixMap.values());
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

export function fixAllProblems(params: FixAllProblemsRequestParams): FixAllProblemsRequestResponse {
    const worker = getWorker(params.textDocument.uri);

    const allAutoFixes = worker.getAllAutoFixes();
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

export function createTextEdit(autofix: AutoFix): TextEdit {
    return TextEdit.replace(
        autofix.edit.range,
        autofix.edit.text
    );
}

export function computeKey(diagnostic: Diagnostic): string {
    const { range, severity, code } = diagnostic;
    const start = `(${range.start.line}, ${range.start.character})`;
    const end = `(${range.end.line}, ${range.end.character})`;
    return `[${start}, ${end}] ${code}`;
}

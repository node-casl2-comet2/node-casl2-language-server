"use strict";

import {
    DocumentFormattingParams, FormattingOptions, TextEdit
} from "vscode-languageserver";
import * as linter from "../linter/linter";

export function documentFormatting(params: DocumentFormattingParams): TextEdit[] {
    const { textDocument, options } = params;
    const { uri } = textDocument;

    const textEdits = getAllTextEditsToFix(uri);
    return textEdits;
}

function getAllTextEditsToFix(uri: string): TextEdit[] {
    const worker = linter.getWorker(uri);

    // linterが有効でなくても強制的に診断させる
    worker.diagnoseSource();

    return worker.getAllAutoFixes().map(linter.createTextEdit);
}

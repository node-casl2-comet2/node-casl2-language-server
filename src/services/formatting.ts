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
    const allAutoFixes = linter.getAllAutoFixes(uri);
    if (allAutoFixes === undefined) return [];

    const textEdits = allAutoFixes.map(linter.createTextEdit);
    return textEdits;
}

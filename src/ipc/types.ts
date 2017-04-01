"use strict";

import { TextDocumentIdentifier, TextEdit, RequestType } from "vscode-languageserver";

export interface FixAllProblemsRequestParams {
    textDocument: TextDocumentIdentifier;
}

export interface FixAllProblemsRequestResponse {
    documentVersion: number;
    textEdits: TextEdit[];
}

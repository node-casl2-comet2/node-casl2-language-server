"use strict";

import { documentHighlight } from "./documentHighlight";
import { Position, WorkspaceEdit, TextEdit } from "vscode-languageserver";

export function rename(uri: string, version: number, position: Position, newName: string): WorkspaceEdit {
    // ハイライトされているところは同一シンボルということなので
    // ハイライトされている部分をリネームすればよい
    const highlights = documentHighlight(uri, position);
    const edits = highlights.map(x => TextEdit.replace(x.range, newName));

    return {
        changes: [
            {
                textDocument: { uri: uri, version: version },
                edits: edits
            }
        ]
    };
}

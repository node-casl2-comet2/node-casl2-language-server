"use strict";

import { DocumentHighlight, DocumentHighlightKind, Position } from "vscode-languageserver";
import { createRangeFromTokenInfo, getAllReferences } from "./core";
import { TokenInfo } from "@maxfield/node-casl2-core";

export function documentHighlight(uri: string, position: Position): Array<DocumentHighlight> {
    const noHighlights: Array<DocumentHighlight> = [];
    const allReferences = getAllReferences(position);
    if (allReferences === undefined) return noHighlights;

    const base = allReferences.declaration ? [createDocumentHighlightFromToken(allReferences.declaration, DocumentHighlightKind.Write)] : [];
    const rest = allReferences.references.map(x => createDocumentHighlightFromToken(x, DocumentHighlightKind.Read));

    return base.concat(rest);

    function createDocumentHighlightFromToken(token: TokenInfo, kind: DocumentHighlightKind): DocumentHighlight {
        return {
            range: createRangeFromTokenInfo(token),
            kind: kind
        };
    }
}

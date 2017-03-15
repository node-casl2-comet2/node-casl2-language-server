"use strict";

import { Hover, Position } from "vscode-languageserver";
import { instructionCompletionItems } from "./completion";
import { TokenType } from "@maxfield/node-casl2-core";
import { lastDiagnosticsResult, getTokenOfTypeAtPosition } from "./core";

export function hover(uri: string, position: Position): Hover {
    const noContents: Hover = { contents: [] };
    const instructionToken = getTokenOfTypeAtPosition(TokenType.TINSTRUCTION, position);
    if (instructionToken === undefined) return noContents;

    const instructionNode = lastDiagnosticsResult.instructions.find(x => x.lineNumber == position.line);

    if (instructionNode === undefined || instructionNode.originalTokens.instruction == instructionToken) {
        const instruction = instructionCompletionItems.find(x => x.label === instructionToken.value);
        if (instruction === undefined) return noContents;

        return { contents: [instruction.detail!, instruction.documentation!] };
    } else {
        return noContents;
    }
}

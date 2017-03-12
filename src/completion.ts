"use strict";

import { CompletionItem, CompletionItemKind } from "vscode-languageserver";
import { instructionsInfo, InstructionInfo } from "@maxfield/node-casl2-comet2-core-common";
import * as _ from "lodash";

export const instructionCompletionItems: Array<CompletionItem> = create();

function create(): Array<CompletionItem> {
    const items = instructionsInfo.map(convertInstructionInfoToCompletionItem);
    // 重複を除く
    return _.uniqBy(items, x => x.label);
}

function convertInstructionInfoToCompletionItem(info: InstructionInfo): CompletionItem {
    return {
        label: info.instructionName,
        kind: CompletionItemKind.Function,
        detail: info.instructionName + "命令",
        documentation: info.documentation
    };
}

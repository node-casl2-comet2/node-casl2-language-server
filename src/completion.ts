"use strict";

import { CompletionItem, CompletionItemKind } from "vscode-languageserver";
import { instructionsInfo, InstructionInfo, grToString, GR, grsInfo, GRInfo, GRType } from "@maxfield/node-casl2-comet2-core-common";
import * as _ from "lodash";

export const instructionCompletionItems: Array<CompletionItem> = createInstructionCompletionItems();
export const grCompletionItems: Array<CompletionItem> = createGRCompletionItems(grsInfo);
export const indexGRCompletionItems: Array<CompletionItem> = createGRCompletionItems(grsInfo.filter(x => x.type & GRType.UsedAsIndexRegister));

function createInstructionCompletionItems(): Array<CompletionItem> {
    const items = instructionsInfo.map(convertInstructionInfoToCompletionItem);
    // 重複を除く
    return _.uniqBy(items, x => x.label);

    function convertInstructionInfoToCompletionItem(info: InstructionInfo): CompletionItem {
        return {
            label: info.instructionName,
            kind: CompletionItemKind.Function,
            detail: info.instructionName + "命令",
            documentation: info.documentation
        };
    }
}

function createGRCompletionItems(grsInfo: Array<GRInfo>): Array<CompletionItem> {
    return grsInfo.map(convertGRInfoToCompletionItem);

    function convertGRInfoToCompletionItem(info: GRInfo): CompletionItem {
        return {
            label: info.name,
            kind: CompletionItemKind.Property,
            documentation: info.documentation
        };
    }
}

export function createLabelCompletionItems(labels: Array<string>): Array<CompletionItem> {
    return labels.map(convertLabelToCompletionItem);

    function convertLabelToCompletionItem(label: string): CompletionItem {
        return {
            label: label,
            kind: CompletionItemKind.Reference
        };
    }
}

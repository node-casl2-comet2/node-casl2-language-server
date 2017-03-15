"use strict";

import { CompletionItem, CompletionItemKind, Position } from "vscode-languageserver";
import { instructionsInfo, InstructionInfo, grToString, GR, grsInfo, GRInfo, GRType } from "@maxfield/node-casl2-comet2-core-common";
import * as _ from "lodash";
import { analyzeState, getAllReferenceableLabels, getCurrentState } from "./core";

export const instructionCompletionItems: Array<CompletionItem> = createInstructionCompletionItems();
export const grCompletionItems: Array<CompletionItem> = createGRCompletionItems(grsInfo);
export const indexGRCompletionItems: Array<CompletionItem> = createGRCompletionItems(grsInfo.filter(x => x.type & GRType.UsedAsIndexRegister));

export enum Completion {
    Instruction,
    GR,
    IndexGR,
    Labels,
    GRANDLabels,
    None
}

export function completion(position: Position): Array<CompletionItem> {
    analyzeState(position);

    function labelCompletionItems(): Array<CompletionItem> {
        const labels = getAllReferenceableLabels(position).map(x => x.value);
        return createLabelCompletionItems(labels);
    }

    switch (getCurrentState().completionItems) {
        case Completion.Instruction:
            return instructionCompletionItems;
        case Completion.GR:
            return grCompletionItems;
        case Completion.IndexGR:
            return indexGRCompletionItems;
        case Completion.Labels:
            return labelCompletionItems();
        case Completion.GRANDLabels:
            return grCompletionItems.concat(labelCompletionItems());
        case Completion.None:
            break;
    }

    return [];
}

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
            kind: CompletionItemKind.Field
        };
    }
}

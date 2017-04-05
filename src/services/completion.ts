"use strict";

import { CompletionItem, CompletionItemKind, Position } from "vscode-languageserver";
import { instructionsInfo, InstructionInfo, grToString, GR, grsInfo, GRInfo, GRType } from "@maxfield/node-casl2-comet2-core-common";
import * as _ from "lodash";
import { analyzeState, getAllReferenceableLabels, getCurrentState } from "./core";

export const instructionCompletionItems: CompletionItem[] = createInstructionCompletionItems();
export const grCompletionItems: CompletionItem[] = createGRCompletionItems(grsInfo);
export const indexGRCompletionItems: CompletionItem[] = createGRCompletionItems(grsInfo.filter(x => x.type & GRType.UsedAsIndexRegister));

export enum Completion {
    Instruction,
    GR,
    IndexGR,
    Labels,
    GRANDLabels,
    None
}

export function completion(position: Position): CompletionItem[] {
    analyzeState(position);

    function labelCompletionItems(): CompletionItem[] {
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

function createInstructionCompletionItems(): CompletionItem[] {
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

function createGRCompletionItems(grsInfo: GRInfo[]): CompletionItem[] {
    return grsInfo.map(convertGRInfoToCompletionItem);

    function convertGRInfoToCompletionItem(info: GRInfo): CompletionItem {
        return {
            label: info.name,
            kind: CompletionItemKind.Property,
            documentation: info.documentation
        };
    }
}

export function createLabelCompletionItems(labels: string[]): CompletionItem[] {
    return labels.map(convertLabelToCompletionItem);

    function convertLabelToCompletionItem(label: string): CompletionItem {
        return {
            label: label,
            kind: CompletionItemKind.Field
        };
    }
}

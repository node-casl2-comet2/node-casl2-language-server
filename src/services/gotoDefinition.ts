"use strict";

import { Location, Position } from "vscode-languageserver";
import {
    lastDiagnosticsResult, getAllReferenceableLabels, getTokenOfTypeAtPosition,
    createLocationFromToken, getLabelFromPosition
} from "./core";
import { TokenType } from "@maxfield/node-casl2-core";

export function gotoDefinition(uri: string, position: Position): Location | Array<Location> {
    const noDefinitions: Array<Location> = [];
    if (lastDiagnosticsResult === undefined) return noDefinitions;
    // カーソル位置にあるトークンを取得する
    const labelToken = getLabelFromPosition(position);
    if (labelToken === undefined) return noDefinitions;

    const labels = getAllReferenceableLabels(position);
    const token = labels.find(x => x.value == labelToken.value);

    if (token === undefined) return noDefinitions;

    const location = createLocationFromToken(uri, token);

    return location;
}

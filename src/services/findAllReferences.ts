"use strict";

import { getAllReferences, createLocationFromToken } from "./core";
import { Position, Location, ReferenceContext } from "vscode-languageserver";

export function findAllReferences(uri: string, position: Position, context: ReferenceContext): Location[] {
    const noReferences: Location[] = [];
    const allReferences = getAllReferences(position);
    if (allReferences === undefined) return noReferences;

    const { declaration, references } = allReferences;

    const base = context.includeDeclaration && declaration ? [declaration] : [];
    return base.concat(references).map(x => createLocationFromToken(uri, x));
}

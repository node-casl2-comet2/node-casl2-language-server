"use strict";

import { Range } from "vscode-languageserver";
import { Fix } from "@maxfield/casl2-lint";

export type AutoFixMap = Map<string, AutoFix>;

export interface AutoFixEdit {
    range: Range;
    text: string;
}

export interface AutoFix {
    documentVersion: number;
    fix: Fix;
    edit: AutoFixEdit;
}

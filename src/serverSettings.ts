"use strict";

import { Casl2CompileOption } from "@maxfield/node-casl2-core";

// サーバー関連の設定部分のインターフェース
export interface Settings {
    casl2: Casl2Settings;
}

export interface Casl2Settings extends Casl2CompileOption {
    linter?: Casl2LintOptions;
}

export interface Casl2LintOptions {
    enabled: boolean;
}

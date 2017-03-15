"use strict";

import { SymbolInformation, SymbolKind } from "vscode-languageserver";
import { lastDiagnosticsResult, getScopeFromLine, createRangeFromTokenInfo } from "./core";
import { TokenInfo } from "@maxfield/node-casl2-core";

// TODO: クライアント側の設定と同期させる
const enableLabelScope = true;

export function documentSymbol(uri: string): Array<SymbolInformation> {
    const { subroutineLabels, labels } = lastDiagnosticsResult.labelMap.getAllLabels();

    const a = subroutineLabels.map(x => convertTokenToSymbolInformation(x, SymbolKind.Function));
    const b = labels.map(x => {
        const containerName = enableLabelScope ? getSubroutineNameFromLine(x.line) : undefined;
        return convertTokenToSymbolInformation(x, SymbolKind.Field, containerName);
    });
    const information = a.concat(b);

    return information;

    // 行番号から親のサブルーチン名を取得する
    function getSubroutineNameFromLine(line: number): string | undefined {
        const scope = getScopeFromLine(line);
        const a = subroutineLabels.find(x => getScopeFromLine(x.line) == scope);
        return a && a.value;
    }

    function convertTokenToSymbolInformation(token: TokenInfo, kind: SymbolKind, containerName?: string) {
        return SymbolInformation.create(token.value, kind, createRangeFromTokenInfo(token), uri, containerName);
    }
}
"use strict";

import { SymbolInformation, SymbolKind, Range, Position } from "vscode-languageserver";
import { lastDiagnosticsResult, getScopeFromLine, createRangeFromTokenInfo, getCurrentOption } from "./core";
import { TokenInfo } from "@maxfield/node-casl2-core";

export function documentSymbol(uri: string): SymbolInformation[] {
    const { subroutineLabels, labels } = lastDiagnosticsResult.labelMap.getAllLabels();

    // サブルーチンのシンボル情報を作る
    const subroutineSymbols = subroutineLabels
        .map(x => convertTokenToSymbolInformation(x, SymbolKind.Function, subroutineLabelTokenToRange(x)));
    // ラベルのシンボル情報を作る
    const labelSymbols = labels.map(x => {
        const containerName = getCurrentOption().enableLabelScope ? getSubroutineNameFromLine(x.line) : undefined;
        return convertTokenToSymbolInformation(x, SymbolKind.Field, createRangeFromTokenInfo(x), containerName);
    });
    const information = subroutineSymbols.concat(labelSymbols);

    return information;

    // 行番号から親のサブルーチン名を取得する
    function getSubroutineNameFromLine(line: number): string | undefined {
        const scope = getScopeFromLine(line);
        const a = subroutineLabels.find(x => getScopeFromLine(x.line) == scope);
        return a && a.value;
    }

    function convertTokenToSymbolInformation(token: TokenInfo, kind: SymbolKind, range: Range, containerName?: string) {
        return SymbolInformation.create(token.value, kind, range, uri, containerName);
    }
}

function subroutineLabelTokenToRange(token: TokenInfo): Range {
    const subroutinesInfo = lastDiagnosticsResult.subroutinesInfo;
    const info = subroutinesInfo.find(x => x.subroutine === token.value);
    if (info === undefined) throw new Error();

    return Range.create(Position.create(info.startLine, 0), Position.create(info.endLine, 0));
}

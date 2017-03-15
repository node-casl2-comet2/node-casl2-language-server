"use strict";

import { SymbolInformation, SymbolKind, Range, Position } from "vscode-languageserver";
import { lastDiagnosticsResult, getScopeFromLine, createRangeFromTokenInfo } from "./core";
import { TokenInfo } from "@maxfield/node-casl2-core";

// TODO: クライアント側の設定と同期させる
const enableLabelScope = true;

export function documentSymbol(uri: string): Array<SymbolInformation> {
    const { subroutineLabels, labels } = lastDiagnosticsResult.labelMap.getAllLabels();

    // サブルーチンのシンボル情報を作る
    const subroutineSymbols = subroutineLabels
        .map(x => convertTokenToSymbolInformation(x, SymbolKind.Function, subroutineLabelTokenToRange(x)));
    // ラベルのシンボル情報を作る
    const labelSymbols = labels.map(x => {
        const containerName = enableLabelScope ? getSubroutineNameFromLine(x.line) : undefined;
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
    const scopes = Array.from(lastDiagnosticsResult.scopeMap.values());
    const scope = getScopeFromLine(token.line);
    const start = scopes.indexOf(scope);
    const end = scopes.lastIndexOf(scope);

    return Range.create(Position.create(start, 0), Position.create(end, 0));
}

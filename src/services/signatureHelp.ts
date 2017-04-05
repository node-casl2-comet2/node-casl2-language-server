"use strict";

import { SignatureHelp, Position, SignatureInformation, ParameterInformation } from "vscode-languageserver";
import { analyzeState, getCurrentState } from "./core";
import { ArgumentType } from "@maxfield/node-casl2-comet2-core-common";

const noSignatureHelp = { signatures: [], activeParameter: 0, activeSignature: 0 };

export function signatureHelp(uri: string, position: Position): SignatureHelp {
    analyzeState(position);

    const state = getCurrentState();
    const { argIndex, overload } = state;
    if (argIndex < 0) return noSignatureHelp;

    return {
        signatures: argumentTypeToString(),
        activeParameter: argIndex || 0,
        activeSignature: overload || 0
    };
}


function argumentTypeToString(): SignatureInformation[] {
    const state = getCurrentState();
    const { argumentType, instruction } = state;
    switch (argumentType) {
        case ArgumentType.none:
            return [];
        case ArgumentType.label_START:
            return [
                createSignatureInformation(),
                createSignatureInformation(Argument.label)
            ];
        case ArgumentType.decimal_DS:
            return [
                createSignatureInformation(Argument.decimal)
            ];
        case ArgumentType.constants_DC:
            return [
                {
                    label: instruction + " constant[, constant ...]",
                    parameters: [{ label: "constant" }, { label: ", constant ..." }]
                }
            ];
        case ArgumentType.adr_r2:
            return [
                createSignatureInformation(Argument.adr),
                createSignatureInformation(Argument.adr, Argument.x)
            ];
        case ArgumentType.r:
            return [
                createSignatureInformation(Argument.r)
            ];
        case ArgumentType.adr_adr:
            return [
                createSignatureInformation(Argument.buf, Argument.len)
            ];
        case ArgumentType.r1_r2:
            return [
                createSignatureInformation(Argument.r1, Argument.r2)
            ];
        case ArgumentType.r1_adr_r2:
            return [
                createSignatureInformation(Argument.r, Argument.adr),
                createSignatureInformation(Argument.r, Argument.adr, Argument.x)
            ];
        case ArgumentType.r1_r2_OR_r1_adr_r2:
            return [
                createSignatureInformation(Argument.r1, Argument.r2),
                createSignatureInformation(Argument.r1, Argument.adr),
                createSignatureInformation(Argument.r1, Argument.adr, Argument.x),
            ];
        default:
            return [];
    }

    function argumentToString(arg: Argument) {
        const r = map.get(arg);
        if (r === undefined) throw new Error();
        return r;
    }

    function createSignatureInformation(...args: Argument[]): SignatureInformation {
        const names = args.map(argumentToString);
        return {
            label: `${instruction} ${names.join(", ")}`,
            parameters: names.map(x => ParameterInformation.create(x))
        };
    }
}

enum Argument {
    label,
    decimal,
    constant,
    adr,
    r,
    r1,
    r2,
    x,
    buf,
    len
}

const map = new Map<Argument, string>([
    [Argument.label, "label"],
    [Argument.decimal, "decimal"],
    [Argument.constant, "constant"],
    [Argument.adr, "adr"],
    [Argument.r, "r"],
    [Argument.r1, "r1"],
    [Argument.r2, "r2"],
    [Argument.x, "x"],
    [Argument.buf, "buf"],
    [Argument.len, "len"]
]);

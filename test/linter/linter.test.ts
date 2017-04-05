"use strict";

import * as assert from "assert";
import * as linter from "../../src/linter/linter";

suite("linter", () => {
    test("linter worker dispose", () => {
        const uri = "dummy-uri";
        const worker = linter.getWorker(uri);
        linter.disposeWorker(uri);
        const newWorker = linter.getWorker(uri);

        assert.notEqual(worker, newWorker);
    });
});

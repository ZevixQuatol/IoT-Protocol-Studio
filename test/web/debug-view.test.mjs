// Node 24: node test/web/debug-view.test.mjs
import assert from "node:assert/strict";
import { interpretBytes, readAnnotationFile } from "../../apps/web-ui/src/debugView.ts";

assert.equal(interpretBytes([0x26, 0x1a], true).unsigned, "6694");
assert.equal(interpretBytes([0x26, 0x1a], false).unsigned, "9754");
assert.equal(interpretBytes([0xff, 0x7f], true).signed, "32767");
assert.equal(interpretBytes([0x00, 0x80], true).signed, "-32768");
assert.equal(interpretBytes(Array(8).fill(255), true).unsigned, "18446744073709551615");
assert.equal(interpretBytes(Array(8).fill(255), true).signed, "-1");
assert.equal(interpretBytes([0, 0, 0x80, 0x3f], true).float, "1");
assert.equal(interpretBytes([0x26, 0x1a], true).float, "—");
assert.equal(interpretBytes([], true).unsigned, "—");
assert.equal(interpretBytes(Array(9).fill(0), true).unsigned, "—");
assert.equal(interpretBytes([0x26], true).binary, "0010 0110");

const file = {
  kind: "iotps-debug",
  version: 1,
  hex: "aa 41 42",
  annotations: [{ start: 0, end: 2, label: "Header", color: 2 }],
};
assert.equal(readAnnotationFile(JSON.stringify(file)).hex, "AA 41 42");
assert.equal(readAnnotationFile(JSON.stringify(file)).annotations[0].note, undefined);
file.annotations[0].note = "Device temperature";
assert.equal(readAnnotationFile(JSON.stringify(file)).annotations[0].note, "Device temperature");
for (const invalid of [
  { end: 3 },
  { start: -1 },
  { color: 10 },
  { label: " " },
  { note: 1 },
  { note: "a".repeat(1001) },
]) {
  assert.throws(() =>
    readAnnotationFile(
      JSON.stringify({ ...file, annotations: [{ ...file.annotations[0], ...invalid }] }),
    ),
  );
}
assert.throws(() => readAnnotationFile(JSON.stringify({ ...file, version: 2 })));
assert.throws(() => readAnnotationFile(JSON.stringify({ ...file, hex: "ZZ" })));
console.log("P05 byte interpretation and annotation compatibility checks passed");

import assert from "node:assert/strict";
import { readTrafficArchive } from "../apps/web-ui/src/trafficFile.ts";
import { correlateTraffic } from "../apps/web-ui/src/bridge.ts";

const archive = {
  format: "iotps-traffic-v1",
  session: "tcp-1",
  savedAt: "2026-09-26T00:00:00.000Z",
  dropped: 0,
  records: [
    {
      id: 1,
      time: 1000,
      direction: "RX",
      peer: 2,
      address: "127.0.0.1:9000",
      hex: "00 FF",
      size: 2,
      detail: "",
    },
  ],
};
assert.deepEqual(readTrafficArchive(JSON.stringify(archive)), archive);
assert.throws(() => readTrafficArchive("{"));
assert.throws(() =>
  readTrafficArchive(JSON.stringify({ ...archive, records: [{ ...archive.records[0], size: 3 }] })),
);
assert.throws(() =>
  readTrafficArchive(
    JSON.stringify({ ...archive, records: [{ ...archive.records[0], hex: "00 GG" }] }),
  ),
);
const parsed = {
  protocolPath: "protocols/wire.yaml",
  messageName: "data",
  status: "ok",
  checksum: "pass",
  error: "",
  fields: [{ name: "kind", displayName: "Kind", type: "uint8", value: "0", offset: 0, length: 1 }],
};
const frame = { ...archive.records[0], direction: "FRAME", parsed };
assert.deepEqual(
  readTrafficArchive(JSON.stringify({ ...archive, records: [frame] })).records[0].parsed,
  parsed,
);
assert.throws(() =>
  readTrafficArchive(
    JSON.stringify({
      ...archive,
      records: [{ ...frame, parsed: { ...parsed, fields: [{ ...parsed.fields[0], offset: 2 }] } }],
    }),
  ),
);
const emptyArray = {
  ...parsed.fields[0],
  name: "items",
  type: "array",
  value: "[]",
  offset: 2,
  length: 0,
};
assert.equal(
  readTrafficArchive(
    JSON.stringify({
      ...archive,
      records: [{ ...frame, parsed: { ...parsed, fields: [emptyArray] } }],
    }),
  ).records[0].parsed.fields[0].length,
  0,
);
assert.throws(() =>
  readTrafficArchive(
    JSON.stringify({
      ...archive,
      records: [{ ...frame, parsed: { ...parsed, fields: [{ ...emptyArray, length: -1 }] } }],
    }),
  ),
);
const shortened = { ...parsed.fields[0], truncated: true };
assert.equal(
  readTrafficArchive(
    JSON.stringify({
      ...archive,
      records: [{ ...frame, parsed: { ...parsed, fields: [shortened] } }],
    }),
  ).records[0].parsed.fields[0].truncated,
  true,
);
assert.throws(() =>
  readTrafficArchive(
    JSON.stringify({
      ...archive,
      records: [{ ...frame, parsed: { ...parsed, fields: [{ ...shortened, truncated: "true" }] } }],
    }),
  ),
);
console.log("traffic archive validation passed");
let correlationArgs;
globalThis.window = {
  iotpsCorrelate: async (...args) => {
    correlationArgs = args;
    return { ok: true, rows: [] };
  },
};
await correlateTraffic(
  {
    protocol: "protocols/wire.yaml",
    requestMessage: "data",
    responseMessage: "data",
    requestField: "kind",
    responseField: "kind",
    requestFlow: "TX",
    scope: "connection",
    timeout: 100,
  },
  [{ ...frame, parsed: { ...parsed, fields: [shortened] } }],
  1000,
);
assert.equal(correlationArgs.at(-1), "", "truncated preview never enters the native matching key");
delete globalThis.window;

import assert from "node:assert/strict";
import { readTrafficArchive } from "../apps/web-ui/src/trafficFile.ts";

const archive = {
  format: "iotps-traffic-v1",
  session: "tcp-1",
  savedAt: "2026-09-26T00:00:00.000Z",
  dropped: 0,
  records: [{ id: 1, time: 1000, direction: "RX", peer: 2,
    address: "127.0.0.1:9000", hex: "00 FF", size: 2, detail: "" }],
};
assert.deepEqual(readTrafficArchive(JSON.stringify(archive)), archive);
assert.throws(() => readTrafficArchive("{"));
assert.throws(() => readTrafficArchive(JSON.stringify({ ...archive,
  records: [{ ...archive.records[0], size: 3 }] })));
assert.throws(() => readTrafficArchive(JSON.stringify({ ...archive,
  records: [{ ...archive.records[0], hex: "00 GG" }] })));
const parsed = { protocolPath: "protocols/wire.yaml", messageName: "data", status: "ok",
  checksum: "pass", error: "", fields: [{ name: "kind", displayName: "Kind", type: "uint8",
    value: "0", offset: 0, length: 1 }] };
const frame = { ...archive.records[0], direction: "FRAME", parsed };
assert.deepEqual(readTrafficArchive(JSON.stringify({ ...archive, records: [frame] })).records[0].parsed, parsed);
assert.throws(() => readTrafficArchive(JSON.stringify({ ...archive,
  records: [{ ...frame, parsed: { ...parsed, fields: [{ ...parsed.fields[0], offset: 2 }] } }] })));
console.log("traffic archive validation passed");

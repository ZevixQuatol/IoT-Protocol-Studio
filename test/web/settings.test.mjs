import assert from "node:assert/strict";
import {
  diagnosticLevel,
  diagnosticTime,
  filterDiagnostics,
} from "../../apps/web-ui/src/diagnostics.ts";
import {
  defaultDisplay,
  readDisplay,
  readThemeMode,
  resolveTheme,
} from "../../apps/web-ui/src/displayPreferences.ts";

const time = new Date(2026, 9, 4, 14, 22, 11, 328).getTime();
const items = [
  {
    id: 1,
    time,
    page: "debug",
    context: "SensorLink",
    message: "temperature too short",
    problem: true,
    code: "field_short",
    path: "StatusReply.temperature",
  },
  {
    id: 2,
    time: time + 1,
    page: "tcp",
    context: "Sensor TCP",
    message: "timeout",
    problem: true,
    level: "warn",
  },
  {
    id: 3,
    time: time + 1,
    page: "tcp",
    context: "Sensor TCP",
    message: "connected",
    problem: false,
  },
  {
    id: 4,
    time: time + 1000,
    page: "debug",
    context: "SensorLink",
    message: "parsed",
    problem: false,
    level: "debug",
  },
];
const filter = { level: "all", source: "all", search: "" };
assert.deepEqual(
  filterDiagnostics(items, filter).map((item) => item.id),
  [4, 3, 2, 1],
);
assert.equal(diagnosticLevel(items[0]), "error");
assert.equal(diagnosticLevel(items[2]), "info");
assert.deepEqual(
  filterDiagnostics(items, {
    ...filter,
    source: "debug",
    level: "error",
    search: " STATUSREPLY.TEMPERATURE ",
  }).map((item) => item.id),
  [1],
);
assert.deepEqual(
  filterDiagnostics(items, { ...filter, level: "warn" }).map((item) => item.id),
  [2],
);
assert.equal(filterDiagnostics(items, { ...filter, search: "no match" }).length, 0);
assert.deepEqual(
  filterDiagnostics(items, {
    ...filter,
    start: "2026-10-04T14:22:11",
    end: "2026-10-04T14:22:11",
  }).map((item) => item.id),
  [3, 2, 1],
);
assert.equal(
  filterDiagnostics(items, { ...filter, start: "2026-10-04T14:22:12", end: "2026-10-04T14:22:11" })
    .length,
  0,
);
assert.equal(diagnosticTime(time, true), "2026-10-04 14:22:11.328");
assert.equal(diagnosticTime(time, false), "2026-10-04 14:22:11");
assert.deepEqual(
  items.map((item) => item.id),
  [1, 2, 3, 4],
);

const storage = new Map();
globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null };
globalThis.matchMedia = () => ({ matches: true });
assert.deepEqual(readDisplay(), defaultDisplay);
storage.set("iotps.display", "null");
assert.deepEqual(readDisplay(), defaultDisplay);
storage.set(
  "iotps.display",
  JSON.stringify({
    fontSize: 99,
    rowHeight: "bad",
    hexFont: "bad",
    lineNumbers: false,
    milliseconds: false,
  }),
);
assert.deepEqual(readDisplay(), { ...defaultDisplay, lineNumbers: false, milliseconds: false });
storage.set("iotps.theme", "dark");
assert.equal(readThemeMode(), "dark");
storage.set("iotps.theme-mode", "system");
assert.equal(resolveTheme(readThemeMode()), "dark");
globalThis.matchMedia = () => ({ matches: false });
assert.equal(resolveTheme(readThemeMode()), "light");
globalThis.localStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
};
assert.deepEqual(readDisplay(), defaultDisplay);
assert.equal(readThemeMode(), "light");
console.log(
  "P14 diagnostics filtering, time boundaries, legacy severity, preferences and system theme passed",
);

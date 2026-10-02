import assert from "node:assert/strict";
import { readRecentProjects, rememberProject, storeRecentProjects } from "../apps/web-ui/src/recentProjects.ts";
import { revealProject } from "../apps/web-ui/src/bridge.ts";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};
globalThis.window = {};
const key = "iotps.recentProjects";
const old = { name: "Legacy", rootPath: "D:/projects/legacy" };
storeRecentProjects([old]);
assert.deepEqual(readRecentProjects(), [old]);
for (const invalid of ["yesterday", null, -1, 1e20]) {
  storeRecentProjects([{ ...old, lastOpenedAt: invalid }]);
  assert.deepEqual(readRecentProjects(), [old]);
}
const before = Date.now();
const entries = rememberProject([old], { name: "Renamed", rootPath: "d:\\PROJECTS\\legacy\\" });
assert.equal(entries.length, 1);
assert.ok(entries[0].lastOpenedAt >= before && entries[0].lastOpenedAt <= Date.now());
storeRecentProjects(entries);
assert.deepEqual(readRecentProjects(), entries);
storage.set(key, "broken");
assert.deepEqual(readRecentProjects(), []);
await assert.rejects(revealProject(old.rootPath), /desktop app/);
window.iotpsWorkspaceReveal = async (path) => {
  assert.equal(path, old.rootPath);
  return { ok: true };
};
await revealProject(old.rootPath);
window.iotpsWorkspaceReveal = async () => ({ ok: false, error: "Directory missing" });
await assert.rejects(revealProject(old.rootPath), /Directory missing/);
console.log("Recent project timestamp migration and reveal bridge checks passed.");

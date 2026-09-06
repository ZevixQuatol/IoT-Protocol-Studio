// Run with playwright-cli run-code --filename test/web/project-management.js on the Vite preview.
// UI bridge contracts are mocked here; workspace_test.cpp checks the actual filesystem changes.
async function checkProjectManagement(page) {
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  await page.evaluate(() => localStorage.removeItem("iotps.recentProjects"));
  const historyChecks = await page.evaluate(async () => {
    const { rememberProject, readRecentProjects } = await import("/src/recentProjects.ts");
    let entries = [];
    for (let i = 0; i < 12; i++)
      entries = rememberProject(entries, { name: String(i), rootPath: `C:/projects/${i}` });
    const capped = entries.length === 10 && entries[0].name === "11" && entries[9].name === "2";
    entries = rememberProject(entries, { name: "Renamed", rootPath: "c:\\PROJECTS\\11\\" });
    const deduplicated =
      entries.length === 10 && entries[0].name === "Renamed" && entries[1].name === "10";
    localStorage.setItem("iotps.recentProjects", "broken JSON");
    const corrupted = readRecentProjects().length === 0;
    localStorage.setItem(
      "iotps.recentProjects",
      JSON.stringify([null, {}, { name: 2, rootPath: true }]),
    );
    const invalid = readRecentProjects().length === 0;
    localStorage.removeItem("iotps.recentProjects");
    return capped && deduplicated && corrupted && invalid;
  });
  check(
    historyChecks,
    "History cap, case-insensitive path deduplication and damaged storage recovery",
  );
  await page.addInitScript(() => {
    localStorage.setItem("iotps.locale", "zh-CN");
    let project = null;
    const result = () => ({ ok: true, source: "native-workspace", cancelled: false, project });
    window.projectCalls = [];
    window.iotpsWorkspaceCurrent = async () => result();
    window.iotpsWorkspaceOpen = async (path) => {
      window.projectCalls.push(["open", path]);
      if (window.failProjectOpen)
        return {
          ok: false,
          source: "native-workspace",
          error: { code: "project_directory_not_found", message: "missing", path },
        };
      project = {
        name: path ? "设备项目" : "Original",
        rootPath: path || "C:/projects/original",
        description: "",
        folders: ["protocols/A", "protocols/A/Nested"],
        protocols: [
          {
            name: "Other",
            path: "protocols/other.yaml",
            content: "other protocol",
            schema: { schemaVersion: "0.1", version: "1.0", defaultByteOrder: "big", messages: [] },
          },
          {
            name: "Sensor",
            path: "protocols/A/Nested/sensor.yaml",
            content: "saved protocol",
            schema: { schemaVersion: "0.1", version: "1.0", defaultByteOrder: "big", messages: [] },
          },
        ],
      };
      return result();
    };
    window.iotpsWorkspaceRename = async (name) => {
      window.projectCalls.push(["renameProject", name]);
      project.name = name;
      return result();
    };
    window.iotpsWorkspaceChangeFolder = async (action, path, name) => {
      window.projectCalls.push([action, path, name]);
      const destination = path.slice(0, path.lastIndexOf("/")) + "/" + name;
      const remap = (item) =>
        item === path || item.startsWith(path + "/") ? destination + item.slice(path.length) : item;
      project.folders = project.folders.map(remap);
      project.protocols = project.protocols.map((item) => ({ ...item, path: remap(item.path) }));
      return result();
    };
    window.iotpsWorkspaceClose = async () => {
      project = null;
      return result();
    };
  });
  await page.reload();
  const dialog = page.locator(".tree-dialog");
  const menu = async (name) => {
    await page.getByRole("button", { name: "项目操作", exact: true }).click();
    await page.getByRole("menuitem", { name, exact: true }).click();
  };
  await menu("打开项目");
  await page.locator(".project-title").waitFor();
  await page.getByRole("button", { name: "Sensor", exact: true }).click();
  await menu("重命名项目");
  check((await dialog.getByRole("textbox").inputValue()) === "Original", "Existing name prefilled");
  await dialog.getByRole("textbox").fill("设备项目");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  check(
    (await page.locator(".project-title").textContent()).includes("设备项目"),
    "Project title updated",
  );
  await page.getByRole("button", { name: "文件夹操作: A", exact: true }).click();
  await dialog.getByRole("button", { name: "重命名文件夹", exact: true }).click();
  await dialog.getByRole("textbox").fill("设备");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  check(
    (await page.evaluate(() => window.projectCalls.at(-1))).join("|") === "rename|protocols/A|设备",
    "Folder rename bridge request",
  );
  check(
    (await page.locator(".protocol-item[aria-current='page']").count()) === 1,
    "Selected protocol follows folder rename",
  );
  check(
    (await page.locator(".protocol-item[aria-current='page']").textContent()) === "Sensor",
    "Selected protocol is not reset to the first entry",
  );
  await menu("最近项目");
  check(
    (await dialog.locator(".recent-project").count()) === 1,
    "History deduplicated after edits",
  );
  check(
    (await dialog.locator(".recent-project").textContent()).includes("设备项目"),
    "Recent display name refreshed",
  );
  await page.evaluate(() => {
    window.failProjectOpen = true;
  });
  await dialog.locator(".recent-project > button:first-child").click();
  await dialog.getByRole("alert").waitFor();
  check(
    (await page.locator(".project-title").textContent()).includes("设备项目"),
    "Failed reopen keeps current project",
  );
  check(
    (await dialog.locator(".recent-project").count()) === 1,
    "Failed reopen keeps history entry",
  );
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  const editor = page.locator("textarea").first();
  await editor.fill("unsaved protocol");
  const callsBefore = await page.evaluate(() => window.projectCalls.length);
  await menu("最近项目");
  check(!(await dialog.isVisible()), "Unsaved edit blocks project switch");
  check((await editor.inputValue()) === "unsaved protocol", "Unsaved content retained");
  check(
    (await page.evaluate(() => window.projectCalls.length)) === callsBefore,
    "Blocked switch does not call host",
  );
  await page.reload();
  await menu("最近项目");
  check((await dialog.locator(".recent-project").count()) === 1, "Recent project survives reload");
  await dialog.locator(".recent-project > button:first-child").click();
  await dialog.waitFor({ state: "hidden" });
  check(
    (await page.evaluate(() => window.projectCalls.at(-1))).join("|") ===
      "open|C:/projects/original",
    "Recent path passed to host",
  );
  await menu("最近项目");
  await dialog.getByRole("button", { name: "移除最近记录: 设备项目", exact: true }).click();
  check((await dialog.locator(".recent-project").count()) === 0, "Remove recent entry");
  check(
    (await page.locator(".project-title").textContent()).includes("设备项目"),
    "Removing history keeps current project open",
  );
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await menu("关闭项目");
  await menu("打开项目");
  await menu("最近项目");
  await dialog.getByRole("button", { name: "清空最近记录", exact: true }).click();
  check((await dialog.locator(".recent-project").count()) === 0, "Clear history");
  await page.reload();
  await menu("最近项目");
  check((await dialog.locator(".recent-project").count()) === 0, "Cleared history stays empty");
  return "PASS: rename, protocol selection, recent persistence/deduplication/open/remove/clear, failed open and unsaved edit protection";
}

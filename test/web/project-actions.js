// UI contract with a mock bridge. Real file transactions are covered by workspace_test.cpp.
// npx --package @playwright/cli playwright-cli run-code --filename test/web/project-actions.js
async function checkProjectActions(page) {
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  await page.addInitScript(() => {
    localStorage.setItem("iotps.locale", "zh-CN");
    localStorage.setItem("iotps.theme", "light");
    localStorage.setItem(
      "iotps.recentProjects",
      JSON.stringify([
        { name: "设备项目", rootPath: "C:/qa/devices" },
        { name: "历史项目", rootPath: "C:/qa/history" },
      ]),
    );
    const fixture = (path) => ({
      name: path.endsWith("history") ? "历史项目" : "设备项目",
      rootPath: path,
      description: "",
      folders: ["protocols/设备"],
      protocols: ["温度", "状态"].map((name, i) => ({
        name,
        path: `protocols/设备/${i}.protocol.yaml`,
        content: "messages: {}",
        schema: { version: "1.0", protocolVersion: "1.0", defaultByteOrder: "big", messages: [] },
      })),
    });
    let project = fixture("C:/qa/devices");
    const result = () =>
      structuredClone({ ok: true, source: "native-workspace", cancelled: false, project });
    window.projectCalls = [];
    window.iotpsWorkspaceCurrent = async () => result();
    window.iotpsWorkspaceOpen = async (path) => {
      window.projectCalls.push(["open", path]);
      if (!path) throw new Error("Folder picker must not be used");
      project = fixture(path);
      return result();
    };
    window.iotpsWorkspaceClose = async () => {
      project = null;
      return result();
    };
    window.iotpsWorkspaceRename = async (name) => {
      project.name = name;
      return result();
    };
    window.iotpsWorkspaceProtocols = async (action, ...args) => {
      window.projectCalls.push([action, ...args]);
      if (window.rejectDelete && action === "delete")
        return {
          ok: false,
          source: "native-workspace",
          error: { code: "workspace_operation_failed", message: "File locked", path: args[0] },
        };
      if (action === "rename") project.protocols.find((p) => p.path === args[0]).name = args[1];
      else project.protocols = project.protocols.filter((p) => !args.includes(p.path));
      return result();
    };
  });
  await page.reload();
  await page.locator(".project-title").waitFor();
  const dialog = page.locator(".tree-dialog");
  const cancel = () => dialog.getByRole("button", { name: "取消", exact: true }).click();
  const openHistory = async () => {
    await page.getByRole("button", { name: "项目操作", exact: true }).click();
    check(
      (await page.getByRole("menuitem").count()) === 2,
      "Project entry has exactly two actions",
    );
    await page.getByRole("menuitem", { name: "打开项目", exact: true }).click();
  };
  await openHistory();
  check((await dialog.locator(".recent-project").count()) === 2, "History lists known projects");
  check(
    await dialog.getByRole("button", { name: "导入项目", exact: true }).isDisabled(),
    "Import has an explicit reserved entry",
  );
  await dialog.getByRole("button").filter({ hasText: "历史项目" }).first().click();
  await dialog.waitFor({ state: "hidden" });
  check(
    (await page.evaluate(() => window.projectCalls[0])).join("|") === "open|C:/qa/history",
    "History opens explicit path without picker",
  );
  await page.locator(".project-title").hover();
  await page.getByRole("button", { name: "重命名项目", exact: true }).click();
  await dialog.getByRole("textbox").fill("现场设备");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  check(
    (await page.evaluate(() => JSON.parse(localStorage.getItem("iotps.recentProjects"))))[0]
      .name === "现场设备",
    "Rename updates history",
  );
  await page.locator(".protocol-row").first().hover();
  await page.getByRole("button", { name: "重命名协议: 温度", exact: true }).click();
  await dialog.getByRole("textbox").fill("环境温度");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  check(
    (await page.locator(".protocol-item span").allTextContents()).includes("环境温度"),
    "Protocol name refreshed",
  );
  await page.locator(".folder-row").hover();
  await page.getByRole("button", { name: "创建协议: 设备", exact: true }).click();
  check(
    (await page.locator('input[name="relativePath"]').inputValue()) === "设备/",
    "Folder creation action prefills protocol path",
  );
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.locator(".project-title").hover();
  await page.getByRole("button", { name: "批量删除", exact: true }).click();
  await page.getByRole("checkbox", { name: "全选", exact: true }).check();
  await page.getByRole("button", { name: "删除所选", exact: true }).click();
  check(
    (await dialog.locator(".delete-targets li").count()) === 2,
    "Confirmation lists exact targets",
  );
  await cancel();
  check((await page.locator(".protocol-item").count()) === 2, "Cancel preserves protocols");
  await page.evaluate(() => (window.rejectDelete = true));
  await page.getByRole("button", { name: "删除所选", exact: true }).click();
  await dialog.getByRole("button", { name: "删除所选", exact: true }).click();
  await dialog.getByRole("alert").waitFor();
  check(
    (await page.locator(".protocol-item").count()) === 2,
    "Failure preserves tree and selection",
  );
  await page.evaluate(() => (window.rejectDelete = false));
  await dialog.getByRole("button", { name: "删除所选", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  check((await page.locator(".protocol-item").count()) === 0, "Batch removes selected protocols");
  check(
    (await page.locator(".batch-actions").count()) === 0,
    "Successful delete exits selection mode",
  );
  await page.locator(".project-title").hover();
  await page.getByRole("button", { name: "移除项目", exact: true }).click();
  check(
    (await dialog.textContent()).includes("磁盘文件将保留"),
    "Project removal explains disk retention",
  );
  await dialog.getByRole("button", { name: "移除项目", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await openHistory();
  check((await dialog.locator(".recent-project").count()) === 1, "Removed project leaves history");
  await dialog.getByRole("button").filter({ hasText: "设备项目" }).first().click();
  await dialog.waitFor({ state: "hidden" });
  await page.locator(".protocol-row").first().hover();
  await page.getByRole("button", { name: "删除协议: 温度", exact: true }).click();
  await dialog.getByRole("button", { name: "删除所选", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  check(
    (await page.locator(".protocol-item").count()) === 1,
    "Single deletion preserves other protocols",
  );
  check(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "No horizontal page overflow",
  );
  return "PASS: row actions, history open without picker, rename, nested create path, single/bulk delete, cancellation, failure, project removal";
}

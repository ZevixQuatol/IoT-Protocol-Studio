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
    window.createCalls = [];
    window.iotpsWorkspaceCreateProtocol = async (...args) => {
      window.createCalls.push(args);
      return {
        ok: false,
        source: "native-workspace",
        error: { code: "protocol_file_already_exists", message: "Already exists", path: args[0] },
      };
    };
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
  const more = async (name, action) => {
    await page.getByRole("button", { name: `更多操作: ${name}`, exact: true }).focus();
    await page.getByRole("button", { name: `更多操作: ${name}`, exact: true }).click();
    await dialog.getByRole("button", { name: action, exact: true }).click();
  };
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
  await more("历史项目", "重命名项目");
  await dialog.getByRole("textbox").fill("现场设备");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  check(
    (await page.evaluate(() => JSON.parse(localStorage.getItem("iotps.recentProjects"))))[0]
      .name === "现场设备",
    "Rename updates history",
  );
  await page.locator(".protocol-row").first().hover();
  await more("温度", "重命名协议");
  await dialog.getByRole("textbox").fill("环境温度");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  check(
    (await page.locator(".protocol-item span").allTextContents()).includes("环境温度"),
    "Protocol name refreshed",
  );
  await page.locator(".folder-row").hover();
  await more("设备", "创建协议");
  const createDialog = page.locator('form[role="dialog"]');
  check(
    (await createDialog
      .locator('[name="relativePath"], [name="displayName"], [name="version"]')
      .count()) === 0,
    "Create hides path, display name and version",
  );
  await createDialog.locator('[name="name"]').fill("../outside");
  await createDialog.getByRole("button", { name: "创建", exact: true }).click();
  check(
    (await page.evaluate(() => window.createCalls.length)) === 0,
    "Invalid filename never submits",
  );
  await createDialog.locator('[name="name"]').fill("新协议");
  await createDialog.locator('[name="byteOrder"]').selectOption("little");
  await createDialog.locator('[name="description"]').fill("说明");
  await createDialog.getByRole("button", { name: "创建", exact: true }).click();
  check(
    (await page.evaluate(() => window.createCalls.at(-1))).join("|") ===
      "设备/新协议.protocol.yaml|新协议|新协议|1.0|说明|little",
    "Path and display name derive from name and selected folder",
  );
  check(
    (await createDialog.locator('[name="name"]').inputValue()) === "新协议",
    "Create failure preserves input",
  );
  await createDialog.getByRole("button", { name: "取消", exact: true }).last().click();
  await more("现场设备", "创建协议");
  await createDialog.locator('[name="name"]').fill("根协议");
  await createDialog.getByRole("button", { name: "创建", exact: true }).click();
  check(
    (await page.evaluate(() => window.createCalls.at(-1)))[0] === "根协议.protocol.yaml",
    "Project creation resets parent to root",
  );
  await createDialog.getByRole("button", { name: "取消", exact: true }).last().click();
  await page.locator(".project-title").hover();
  check(
    (await page.getByRole("button", { name: "批量删除", exact: true }).count()) === 0,
    "No bulk delete entry",
  );
  check((await page.locator(".row-actions button").count()) === 4, "Only one more button per row");
  await more("环境温度", "删除协议");
  check(
    (await dialog.locator(".delete-targets li").count()) === 1,
    "Confirm only current protocol",
  );
  await cancel();
  check((await page.locator(".protocol-item").count()) === 2, "Cancel preserves protocols");
  await page.evaluate(() => (window.rejectDelete = true));
  await more("环境温度", "删除协议");
  await dialog.getByRole("button", { name: "删除协议", exact: true }).click();
  await dialog.getByRole("alert").waitFor();
  check((await page.locator(".protocol-item").count()) === 2, "Delete failure preserves protocols");
  await page.evaluate(() => (window.rejectDelete = false));
  await dialog.getByRole("button", { name: "删除协议", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  check(
    (await page.locator(".protocol-item").count()) === 1,
    "Delete removes only current protocol",
  );
  await page.locator(".project-title").hover();
  await more("现场设备", "移除项目");
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
  await more("温度", "删除协议");
  await dialog.getByRole("button", { name: "删除协议", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  check(
    (await page.locator(".protocol-item").count()) === 1,
    "Single deletion preserves other protocols",
  );
  check(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "No horizontal page overflow",
  );
  return "PASS: more dialogs, history open without picker, rename, nested create path, single delete, cancellation, failure, project removal";
}

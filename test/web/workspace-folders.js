// Headless UI contract check; disk safety and persistence are covered by workspace_test.cpp.
// npx --package @playwright/cli playwright-cli run-code --filename test/web/workspace-folders.js
async function checkWorkspaceFolders(page) {
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  await page.addInitScript(() => {
    localStorage.setItem("iotps.locale", "zh-CN");
    localStorage.setItem("iotps.theme", "light");
    let project = null;
    window.folderCalls = [];
    const result = () => ({ ok: true, source: "native-workspace", cancelled: false, project });
    window.iotpsWorkspaceCurrent = async () => result();
    window.iotpsWorkspaceCreate = async (name) => {
      project = { name, description: "", rootPath: "C:/test/" + name, protocols: [], folders: [] };
      return result();
    };
    window.iotpsWorkspaceClose = async () => {
      project = null;
      return result();
    };
    window.iotpsWorkspaceChangeFolder = async (action, path, parent, before) => {
      window.folderCalls.push([action, path, parent, before]);
      if (action === "delete" && project.folders.some((folder) => folder.startsWith(path + "/"))) {
        return {
          ok: false,
          source: "native-workspace",
          error: { code: "folder_not_empty", message: "not empty", path },
        };
      }
      if (action === "create") project.folders.push(path);
      if (action === "delete")
        project.folders = project.folders.filter((folder) => folder !== path);
      if (action === "move") {
        const destination = parent + "/" + path.split("/").at(-1);
        project.folders = project.folders
          .filter((folder) => folder !== path)
          .map((folder) =>
            folder.startsWith(path + "/") ? destination + folder.slice(path.length) : folder,
          );
        project.folders.splice(
          before ? project.folders.indexOf(before) : project.folders.length,
          0,
          destination,
        );
      }
      return result();
    };
  });
  await page.reload();
  const dialog = page.locator(".tree-dialog");
  const menu = async (name) => {
    if (name !== "新建项目") {
      await page.locator(".project-title").hover();
      await page.getByRole("button", { name, exact: true }).click();
      return;
    }
    await page.getByRole("button", { name: "项目操作", exact: true }).click();
    await page.getByRole("menuitem", { name, exact: true }).click();
  };
  const folderMenu = async (name, action) => {
    await page
      .locator(".folder-row")
      .filter({ has: page.locator(".folder-item", { hasText: name }) })
      .first()
      .hover();
    await page.getByRole("button", { name: `${action}: ${name}`, exact: true }).click();
  };
  const create = async (name) => {
    await dialog.getByRole("textbox").fill(name);
    await dialog.getByRole("button", { name: "创建", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
  };
  await menu("新建项目");
  await create("Folders");
  await page.locator(".project-title").waitFor();
  await menu("新建文件夹");
  await create("A");
  await menu("新建文件夹");
  await create("B");
  await folderMenu("A", "新建文件夹");
  await create("Nested");
  check((await page.locator(".folder-item").count()) === 3, "Empty and nested folders rendered");
  await folderMenu("A", "删除文件夹");
  await dialog.getByRole("button", { name: "删除文件夹", exact: true }).click();
  check(
    (await dialog.getByRole("alert").textContent()).includes("请清理后再删除"),
    "Nonempty folder error shown in dialog",
  );
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  const folder = (name) =>
    page.locator(".folder-item").filter({ has: page.getByText(name, { exact: true }) });
  await folder("B").dragTo(folder("A"), { targetPosition: { x: 55, y: 2 } });
  check(
    (await page.evaluate(() => window.folderCalls.at(-1))).join("|") ===
      "move|protocols/B|protocols|protocols/A",
    "Drop on top edge requests sibling order",
  );
  check(
    (await page.locator(".folder-item span").allTextContents()).join() === "B,A,Nested",
    "Sibling order displayed independently of children",
  );
  await folder("A").dragTo(folder("B"));
  check(
    (await page.evaluate(() => window.folderCalls.at(-1))).join("|") ===
      "move|protocols/A|protocols/B|",
    "Drop in center requests nested move",
  );
  await folder("A").dragTo(page.locator(".project-title"));
  check(
    (await page.evaluate(() => window.folderCalls.at(-1))).join("|") ===
      "move|protocols/B/A|protocols|",
    "Drop on project moves back to root",
  );
  await folderMenu("Nested", "移动文件夹");
  await dialog.getByRole("combobox").selectOption("protocols/B");
  await dialog.getByRole("button", { name: "移动文件夹", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await folderMenu("A", "删除文件夹");
  await dialog.getByRole("button", { name: "删除文件夹", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  check((await folder("A").count()) === 0, "Empty folder deletion updates tree");
  await menu("移除项目");
  check(
    (await dialog.textContent()).includes("磁盘文件将保留"),
    "Project removal explains retained files",
  );
  await dialog.getByRole("button", { name: "移除项目", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  check((await page.locator(".project-title").count()) === 0, "Removed project no longer shown");
  return "PASS: project creation/removal, empty/nested folders, delete refusal, sibling reorder, nested/root drag moves, accessible move dialog";
}

// UI contract regression. workspace_test and desktop smoke exercise actual template files.
// npx --package @playwright/cli playwright-cli run-code --filename test/web/message-studio.js
async function checkMessageStudio(page) {
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  await page.addInitScript(() => {
    localStorage.setItem("iotps.locale", "zh-CN");
    localStorage.setItem("iotps.theme", "light");
    const field = (name) => ({
      name,
      displayName: "",
      type: "uint16",
      offset: "0",
      length: "2",
      byteOrder: "little",
      byteOrderInherited: true,
      lengthOf: null,
    });
    const project = {
      name: "Template QA",
      rootPath: "C:/qa",
      folders: [],
      protocols: [
        {
          name: "Sensor",
          path: "protocols/sensor.yaml",
          content: "# Core YAML",
          schema: {
            version: "0.1",
            protocolVersion: "1.0",
            defaultByteOrder: "little",
            messages: [
              { name: "first", displayName: "首条消息", fields: [field("value")] },
              { name: "second", displayName: "第二条消息", fields: [field("other")] },
            ],
          },
        },
      ],
    };
    window.iotpsWorkspaceCurrent = async () =>
      structuredClone({ ok: true, source: "native-workspace", cancelled: false, project });
    window.iotpsMessageTemplates = async (action, path, message, name, ...pairs) => {
      if (window.rejectTemplate)
        return {
          ok: false,
          error: { code: "protocol_file_write_failed", message: "Simulated disk failure", path },
        };
      const key = "qa-templates:" + message;
      const items = JSON.parse(localStorage.getItem(key) || "[]");
      const index = items.findIndex((item) => item.name === name);
      if (action === "save" || action === "replace") {
        if (action === "save" && index !== -1)
          return {
            ok: false,
            error: { code: "message_template_conflict", message: "duplicate", path },
          };
        const item = {
          name,
          compatible: true,
          fields: Array.from({ length: pairs.length / 2 }, (_, i) => ({
            name: pairs[2 * i],
            value: pairs[2 * i + 1],
          })),
        };
        if (index === -1) items.push(item);
        else items[index] = item;
      }
      if (action === "delete") items.splice(index, 1);
      localStorage.setItem(key, JSON.stringify(items));
      return { ok: true, templates: action === "load" ? [items[index]] : items };
    };
    window.iotpsEncodeProtocolMessage = async (path, message, field, value) => ({
      ok: true,
      source: "native-core",
      normalizedHex: value === "4660" ? "34 12" : "01 00",
      ascii: "..",
      byteCount: 2,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.copiedHex = text;
        },
      },
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "打开 Sensor", exact: true }).click();
  await page.evaluate(() => {
    localStorage.removeItem("qa-templates:first");
    localStorage.removeItem("qa-templates:second");
  });
  await page.getByRole("tab", { name: /报文|Message/, exact: true }).click();
  const input = page.getByRole("textbox", { name: "字段值: value", exact: true });
  const name = page.getByRole("textbox", { name: "模板名称", exact: true });
  const templates = page.getByRole("combobox", { name: "报文模板", exact: true });
  const button = (label) => page.getByRole("button", { name: label, exact: true }).first();
  const dialog = page.locator(".message-template-dialog");
  const openNewTemplate = async () => {
    await button("模板操作").click();
    await page.getByRole("menuitem", { name: "另存为新模板", exact: true }).click();
  };
  const transfer = async (label) => {
    await button("报文操作").click();
    await button(label).click();
  };
  await input.fill("4660");
  await button("保存模板").click();
  await name.fill("测试模板");
  await dialog.getByRole("button", { name: "保存为新模板", exact: true }).click();
  await page.getByText("模板已保存到项目", { exact: true }).waitFor();
  await input.fill("1");
  await button("生成报文").click();
  await page.locator(".message-byte-row").waitFor();
  await input.fill("2");
  check(
    (await page.locator(".message-byte-row").count()) === 0,
    "Editing a value clears stale HEX",
  );
  await button("载入模板").click();
  await page.getByText("模板已加载", { exact: true }).waitFor();
  check((await input.inputValue()) === "4660", "Load restores exact field input");
  await openNewTemplate();
  await name.fill("测试模板");
  await dialog.getByRole("button", { name: "保存为新模板", exact: true }).click();
  await page.getByRole("heading", { name: "覆盖模板确认", exact: true }).waitFor();
  check(
    (await dialog.textContent()).includes("同名模板已存在"),
    "Duplicate names require explicit replacement",
  );
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await input.fill("1");
  await button("保存模板").click();
  await page.evaluate(() => {
    window.rejectTemplate = true;
  });
  await dialog.getByRole("button", { name: "覆盖模板", exact: true }).click();
  await dialog.getByRole("alert").waitFor();
  check((await input.inputValue()) === "1", "Save failure preserves draft values");
  await page.evaluate(() => {
    window.rejectTemplate = false;
  });
  await dialog.getByRole("button", { name: "覆盖模板", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.reload();
  await page.getByRole("button", { name: "打开 Sensor", exact: true }).click();
  await page.getByRole("tab", { name: /报文|Message/, exact: true }).click();
  await templates.selectOption("测试模板");
  await button("载入模板").click();
  await page.getByText("模板已加载", { exact: true }).waitFor();
  check((await input.inputValue()) === "1", "Updated template survives reopening");
  await page.getByRole("combobox", { name: "选择消息", exact: true }).selectOption("second");
  check((await templates.locator("option").count()) === 1, "Message scopes remain isolated");
  await page.getByRole("combobox", { name: "选择消息", exact: true }).selectOption("first");
  await templates.selectOption("测试模板");
  await input.fill("4660");
  await button("生成报文").click();
  await button("复制 HEX").click();
  await page.getByText("HEX 已复制", { exact: true }).waitFor();
  check((await page.evaluate(() => window.copiedHex)) === "34 12", "Copy uses the generated HEX");
  await transfer("送入通信");
  check(
    (await page.getByLabel("发送内容").inputValue()) === "34 12",
    "Generated HEX reaches TCP draft",
  );
  check(await button("发送").isDisabled(), "Draft handoff does not send without a connection");
  await button(/协议工作区|Schema/).click();
  await transfer("送入调试");
  check(
    (await page.locator("#debug-hex-input").inputValue()) === "34 12",
    "Debug receives generated HEX",
  );
  await page.locator("#debug-hex-input").fill("AA");
  await button(/协议工作区|Schema/).click();
  await page.evaluate(() => {
    window.confirm = () => false;
  });
  await transfer("送入调试");
  check(
    (await page.locator(".message-workbench").count()) === 1,
    "Cancelling Debug replacement stays in Message",
  );
  await page.evaluate(() => {
    window.confirm = () => true;
  });
  await button("送入调试").click();
  check(
    (await page.locator("#debug-hex-input").inputValue()) === "34 12",
    "Confirmed Debug replacement applies HEX",
  );
  await button(/协议工作区|Schema/).click();
  await page.getByRole("tab", { name: "代码", exact: true }).click();
  await page.locator(".yaml-code-editor textarea").fill("# Core YAML\n# dirty");
  await page.getByRole("tab", { name: /报文|Message/, exact: true }).click();
  check(
    (await button("载入模板").isDisabled()) &&
      (await button("生成报文").isDisabled()) &&
      (await button("复制 HEX").isDisabled()),
    "Dirty schema locks templates, encoding and output actions",
  );
  await page.getByRole("tab", { name: "代码", exact: true }).click();
  await page.locator(".yaml-code-editor textarea").fill("# Core YAML");
  await page.getByRole("tab", { name: /报文|Message/, exact: true }).click();
  await templates.selectOption("测试模板");
  await button("模板操作").click();
  await page.getByRole("menuitem", { name: "删除模板", exact: true }).click();
  await dialog.getByRole("button", { name: "删除模板", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  check((await templates.locator("option").count()) === 1, "Delete updates the list");
  return "PASS: templates create/load/replace/delete, reload, scope isolation, failure protection, dirty guard, stale result invalidation, copy and Debug transfer";
}

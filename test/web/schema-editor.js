// UI contract check with a mocked bridge; workspace_test and native smoke cover real persistence.
// npx --package @playwright/cli playwright-cli run-code --filename test/web/schema-editor.js
async function checkSchemaEditor(page) {
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  await page.addInitScript(() => {
    localStorage.setItem("iotps.locale", "zh-CN");
    localStorage.setItem("iotps.theme", "light");
    const protocol = {
      name: "Designer",
      path: "protocols/designer.protocol.yaml",
      content: "messages: {}",
      schema: { version: "1.0", protocolVersion: "1.0", defaultByteOrder: "big", messages: [] },
    };
    const project = {
      name: "Schema QA",
      description: "",
      rootPath: "C:/qa",
      folders: [],
      protocols: [protocol],
    };
    const result = () =>
      structuredClone({ ok: true, source: "native-workspace", cancelled: false, project });
    window.schemaCalls = [];
    window.iotpsWorkspaceCurrent = async () => result();
    window.iotpsWorkspaceEditSchema = async (path, action, messageName, fieldName, ...pairs) => {
      const properties = Object.fromEntries(
        Array.from({ length: pairs.length / 2 }, (_, i) => pairs.slice(i * 2, i * 2 + 2)),
      );
      window.schemaCalls.push({ path, action, messageName, fieldName, properties });
      if (window.schemaReject)
        return {
          ok: false,
          source: "native-workspace",
          error: { code: "protocol_schema_invalid", message: "Rejected edit", path: "fields" },
        };
      const list = protocol.schema.messages;
      const message = list.find((item) => item.name === messageName);
      const field = message?.fields.find((item) => item.name === fieldName);
      if (action === "addMessage") list.push({ ...properties, fields: [] });
      if (action === "updateMessage") Object.assign(message, properties);
      if (action === "deleteMessage") list.splice(list.indexOf(message), 1);
      if (action === "addField") message.fields.push({ ...properties });
      if (action === "updateField") Object.assign(field, properties);
      if (action === "deleteField") message.fields.splice(message.fields.indexOf(field), 1);
      if (action.startsWith("moveField")) {
        const from = message.fields.indexOf(field);
        message.fields.splice(from, 1);
        message.fields.splice(from + (action.endsWith("Up") ? -1 : 1), 0, field);
      }
      for (const item of list) {
        let offset = 0;
        for (const value of item.fields) {
          // These are bridge-shaped values, not a second schema parser.
          value.bits = [];
          value.enumValues = [];
          if (value === field || (action === "addField" && value === item.fields.at(-1))) {
            value.declaredOffset = properties.offset || null;
            value.declaredLength = properties.length || null;
            value.byteOrderInherited = !properties.endian;
            value.byteOrder = properties.endian || "big";
          }
          value.length = value.declaredLength || (value.type === "uint16" ? "2" : "1");
          value.offset = value.declaredOffset || String(offset);
          offset = Number(value.offset) + Number(value.length);
        }
      }
      protocol.content = "# saved by Core\n" + JSON.stringify(protocol.schema);
      return result();
    };
  });
  await page.reload();
  await page.getByRole("button", { name: "打开 Designer", exact: true }).click();
  await page.getByRole("tab", { name: "结构", exact: true }).click();
  const button = (name) => page.getByRole("button", { name, exact: true });
  const dialog = page.locator(".schema-edit-dialog");
  const input = (name) => dialog.locator(`[name="${name}"]`);
  const submit = async (name = "保存") => {
    await dialog.getByRole("button", { name, exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
  };
  const selectedField = page.locator(".field-node.selected .field-name strong");
  check(await button("新增字段").isDisabled(), "Field creation requires a selected message");
  await button("新增消息").click();
  await input("name").fill("packet");
  await input("displayName").fill("采集消息");
  await input("typeId").fill("18446744073709551615");
  await submit();
  check(
    (await page.locator(".message-node.selected strong").textContent()) === "采集消息",
    "New message stays selected",
  );
  await button("新增字段").click();
  await input("name").fill("value");
  await input("type").selectOption("uint16");
  await input("endian").selectOption("little");
  await submit();
  check((await selectedField.textContent()) === "value", "New field stays selected");
  await button("新增字段").click();
  await input("name").fill("payload");
  await input("type").selectOption("bytes");
  check(await input("length").evaluate((el) => el.required), "Bytes require explicit length");
  await input("length").fill("4");
  await submit();
  await button("编辑字段").click();
  check(
    (await input("offset").inputValue()) === "",
    "Computed offset must not become a fixed offset",
  );
  check((await input("length").inputValue()) === "4", "Declared length retained");
  await input("name").fill("body");
  await input("displayName").fill("数据内容");
  await submit();
  check((await selectedField.textContent()) === "数据内容", "Renamed field selection retained");
  await button("上移").click();
  await page.waitForFunction(
    () => document.querySelector(".field-node .field-name strong")?.textContent === "数据内容",
  );
  check(await button("上移").isDisabled(), "First field cannot move up");
  await button("下移").click();
  await page.waitForFunction(
    () => document.querySelector(".field-node .field-name strong")?.textContent === "value",
  );
  check(await button("下移").isDisabled(), "Last field cannot move down");
  await button("编辑字段").click();
  await input("type").selectOption("array");
  await input("elementType").selectOption("uint32");
  await input("count").fill("3");
  check((await input("length").count()) === 0, "Array length derives from element count");
  await submit();
  const arrayCall = await page.evaluate(() => window.schemaCalls.at(-1));
  check(
    arrayCall.properties.length === "" && arrayCall.properties.count === "3",
    "Array update clears scalar length",
  );
  await button("编辑字段").click();
  await input("type").selectOption("uint8");
  await input("lengthOf").selectOption("value");
  await submit();
  const scalarCall = await page.evaluate(() => window.schemaCalls.at(-1));
  check(
    scalarCall.properties.elementType === "" &&
      scalarCall.properties.count === "" &&
      scalarCall.properties.lengthOf === "value",
    "Scalar conversion clears array metadata",
  );
  await button("编辑字段").click();
  await input("name").fill("invalid-change");
  await page.evaluate(() => {
    window.schemaReject = true;
  });
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await dialog.getByRole("alert").waitFor();
  check((await input("name").inputValue()) === "invalid-change", "Rejected edit keeps user input");
  check((await selectedField.textContent()) === "数据内容", "Rejected edit keeps saved structure");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await page.evaluate(() => {
    window.schemaReject = false;
  });
  await button("删除字段").click();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  check((await page.locator(".field-node").count()) === 2, "Cancel deletion preserves fields");
  await button("删除字段").click();
  await submit("删除字段");
  check(
    (await page.locator(".field-node").count()) === 1,
    "Confirmed deletion refreshes structure",
  );
  await button("编辑消息").click();
  await input("name").fill("renamed");
  await submit();
  check(
    (await page.locator(".message-node.selected code").textContent()) === "renamed",
    "Message rename selection retained",
  );
  await page.getByRole("tab", { name: /报文|Message/, exact: true }).click();
  check(
    (await page.locator(".message-studio").textContent()).includes("value"),
    "Message Studio uses updated fields",
  );
  await page.getByRole("tab", { name: "代码", exact: true }).click();
  const code = page.locator(".yaml-code-editor textarea");
  const saved = await code.inputValue();
  check(saved.includes("renamed") && !saved.includes("body"), "Code view refreshes after edits");
  await code.fill(saved + "\n# unsaved");
  await page.getByRole("tab", { name: "结构", exact: true }).click();
  check(
    (await button("新增消息").isDisabled()) && (await button("编辑消息").isDisabled()),
    "Dirty YAML locks mutations",
  );
  await page.getByRole("tab", { name: "代码", exact: true }).click();
  await code.fill(saved);
  await page.getByRole("tab", { name: "结构", exact: true }).click();
  await button("删除消息").click();
  await submit("删除消息");
  check(
    (await page.locator(".message-node").count()) === 0,
    "Last message deletion returns empty state",
  );
  return "PASS: message/field CRUD, declared layout, array conversion, length target, order, failure/cancel preservation, selection, Code/Message synchronization and dirty guard";
}

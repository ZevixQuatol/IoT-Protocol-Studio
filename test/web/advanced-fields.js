// UI contract; Core persistence, runtime layout, bounds and CRC are covered by CTest.
async function checkAdvancedFields(page) {
  const check = (ok, message) => {
    if (!ok) throw new Error(message);
  };
  await page.addInitScript(() => {
    localStorage.setItem("iotps.locale", "zh-CN");
    const field = (name, type, extra = {}) => ({
      name,
      displayName: "",
      type,
      offset: "runtime",
      length: "1",
      declaredOffset: null,
      declaredLength: null,
      byteOrder: "big",
      byteOrderInherited: true,
      lengthOf: null,
      elementType: null,
      count: null,
      enumValues: [],
      bits: [],
      structRef: null,
      whenField: null,
      whenEquals: null,
      countFrom: null,
      maxCount: null,
      ...extra,
    });
    const project = {
      name: "Advanced QA",
      rootPath: "C:/qa",
      folders: [],
      protocols: [
        {
          name: "Demo",
          path: "protocols/demo.yaml",
          content: "# advanced schema",
          schema: {
            version: "0.1",
            protocolVersion: "1",
            defaultByteOrder: "big",
            messageTypeField: "",
            structures: [
              {
                name: "Item",
                displayName: "",
                typeId: null,
                checksumTarget: null,
                fields: [field("value", "uint8")],
              },
            ],
            messages: [
              {
                name: "frame",
                displayName: "",
                typeId: null,
                checksumTarget: null,
                fields: [
                  field("count", "uint8", { offset: "0" }),
                  field("enabled", "uint8", { offset: "1" }),
                  field("items", "array", {
                    length: null,
                    elementType: "struct",
                    structRef: "Item",
                    countFrom: "count",
                    maxCount: "3",
                  }),
                  field("optional", "uint8", { whenField: "enabled", whenEquals: "1" }),
                  field("flags", "uint8", {
                    bits: [
                      { name: "ready", displayName: "", offset: 0, width: 1 },
                      { name: "mode", displayName: "", offset: 1, width: 2 },
                    ],
                  }),
                ],
              },
            ],
          },
        },
      ],
    };
    const result = () =>
      structuredClone({ ok: true, source: "native-workspace", cancelled: false, project });
    window.iotpsWorkspaceCurrent = async () => result();
    window.iotpsWorkspaceEditSchema = async (_path, action, _message, _field, ...pairs) => {
      window.advancedEdit = {
        action,
        properties: Object.fromEntries(
          Array.from({ length: pairs.length / 2 }, (_, i) => pairs.slice(i * 2, i * 2 + 2)),
        ),
      };
      project.protocols[0].schema.messages[0].fields[2].maxCount =
        window.advancedEdit.properties.maxCount;
      return result();
    };
    window.iotpsEncodeProtocolMessage = async (_path, _message, ...pairs) => {
      window.advancedEncoded = Object.fromEntries(
        Array.from({ length: pairs.length / 2 }, (_, i) => pairs.slice(i * 2, i * 2 + 2)),
      );
      return {
        ok: true,
        source: "native-core",
        normalizedHex: "02 01 09 0A 07",
        ascii: ".....",
        byteCount: 5,
      };
    };
  });
  await page.reload();
  await page.getByRole("button", { name: "打开 Demo", exact: true }).click();
  await page.getByRole("tab", { name: "结构" }).click();
  check(
    (await page.getByRole("treeitem", { name: /Item/ }).count()) > 0,
    "Reusable structure is visible",
  );
  await page.locator('.field-node-item[aria-label="items: array"] button').click();
  await page.getByRole("button", { name: "编辑字段" }).click();
  const editor = page.locator(".schema-edit-dialog");
  check(
    (await editor.locator('[name="structRef"]').inputValue()) === "Item",
    "Structure reference loads",
  );
  check(
    (await editor.locator('[name="countFrom"]').inputValue()) === "count",
    "Dynamic count source loads",
  );
  await editor.locator('[name="maxCount"]').fill("4");
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  check(
    (await page.evaluate(() => window.advancedEdit.properties.maxCount)) === "4",
    "Visual edit saves maxCount",
  );
  await page.getByRole("tab", { name: /报文|Message/, exact: true }).click();
  await page.getByRole("textbox", { name: "字段值: count" }).fill("2");
  await page.getByRole("textbox", { name: "字段值: enabled" }).fill("1");
  check(
    (await page.getByRole("textbox", { name: "字段值: items[0].value" }).count()) === 1,
    "First nested item appears",
  );
  await page.getByRole("textbox", { name: "字段值: items[0].value" }).fill("9");
  await page.getByRole("textbox", { name: "字段值: items[1].value" }).fill("10");
  await page.getByRole("textbox", { name: "字段值: optional" }).fill("7");
  await page.locator('.message-bit-row input[type="checkbox"]').check();
  await page.getByRole("spinbutton", { name: "mode (bit 1–2)" }).fill("2");
  await page.getByRole("button", { name: "生成报文" }).click();
  const first = await page.evaluate(() => window.advancedEncoded);
  check(
    first["items[0].value"] === "9" &&
      first["items[1].value"] === "10" &&
      first.optional === "7" &&
      first.flags === "5",
    "Nested, conditional and bit values reach Core",
  );
  await page.getByRole("textbox", { name: "字段值: enabled" }).fill("0");
  check(
    (await page.getByRole("textbox", { name: "字段值: optional" }).count()) === 0,
    "Conditional field disappears",
  );
  await page.getByRole("button", { name: "生成报文" }).click();
  check(
    !("optional" in (await page.evaluate(() => window.advancedEncoded))),
    "Absent conditional field is omitted from encode request",
  );
  return "PASS: structure editing, dynamic nested inputs, conditional fields and bit controls";
}

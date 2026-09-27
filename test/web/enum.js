// UI contract; Core persistence and codec behavior are covered by CTest.
async function checkEnum(page) {
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  await page.addInitScript(() => {
    localStorage.setItem("iotps.locale", "zh-CN");
    const field = {
      name: "status", displayName: "Status", type: "uint8", offset: "0", length: "1",
      declaredOffset: null, declaredLength: null, byteOrder: "big", byteOrderInherited: true,
      lengthOf: null, elementType: null, count: null,
      enumValues: [{ name: "Off", value: "0" }, { name: "On", value: "1" }],
    };
    const project = {
      name: "Enum QA", rootPath: "C:/qa", folders: [],
      protocols: [{
        name: "Demo", path: "protocols/demo.yaml", content: "# enum schema",
        schema: { version: "0.1", protocolVersion: "1", defaultByteOrder: "big",
          messages: [{ name: "event", displayName: "Event", fields: [field] }] },
      }],
    };
    const result = () => structuredClone({ ok: true, source: "native-workspace", cancelled: false, project });
    window.iotpsWorkspaceCurrent = async () => result();
    window.iotpsWorkspaceEditSchema = async (_path, action, _message, _field, ...pairs) => {
      if (action !== "updateField") throw new Error(`Unexpected edit ${action}`);
      const properties = Object.fromEntries(Array.from({ length: pairs.length / 2 }, (_, i) => pairs.slice(i * 2, i * 2 + 2)));
      window.enumEdit = properties.enum;
      field.enumValues = properties.enum.split("\n").filter(Boolean).map((line) => {
        const [name, value] = line.split("="); return { name, value };
      });
      project.protocols[0].content = "# saved enum schema";
      return result();
    };
    window.iotpsEncodeProtocolMessage = async (_path, _message, _field, value) => {
      window.enumEncoded = value;
      return { ok: true, source: "native-core", normalizedHex: Number(value).toString(16).padStart(2, "0").toUpperCase(), ascii: ".", byteCount: 1 };
    };
    window.iotpsDebugDecode = async (_path, _message, hex) => ({ ok: true, fields: [{
      name: "status", displayName: "Status", type: "uint8", value: String(parseInt(hex, 16)),
      enumName: hex.toUpperCase() === "01" ? "On" : "", offset: 0, length: 1,
    }] });
  });
  await page.reload();
  await page.getByRole("tab", { name: "结构" }).click();
  await page.locator(".field-node").click();
  await page.getByRole("button", { name: "编辑字段" }).click();
  const editor = page.locator(".schema-edit-dialog");
  check((await editor.locator('[name="enum"]').inputValue()) === "Off=0\nOn=1", "Editor loads enum mapping");
  await editor.locator('[name="enum"]').fill("Off=0\nOn=1\nError=2");
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await editor.waitFor({ state: "hidden" });
  check((await page.evaluate(() => window.enumEdit)) === "Off=0\nOn=1\nError=2", "Editor sends mapping to Core");
  await page.getByRole("tab", { name: "Message", exact: true }).click();
  const select = page.getByRole("combobox", { name: "字段值: status" });
  await select.selectOption("1");
  await page.getByRole("button", { name: "生成报文" }).click();
  check((await page.evaluate(() => window.enumEncoded)) === "1", "Known label encodes numeric value");
  await select.selectOption("__custom__");
  await page.getByRole("textbox", { name: "字段值: status (原始数值)" }).fill("9");
  await page.getByRole("button", { name: "生成报文" }).click();
  check((await page.evaluate(() => window.enumEncoded)) === "9", "Unknown numeric value encodes unchanged");
  await page.getByRole("button", { name: "调试", exact: true }).click();
  await page.getByRole("textbox", { name: "原始 HEX" }).fill("01");
  await page.getByRole("button", { name: "解析", exact: true }).click();
  await page.getByRole("combobox", { name: "调试工具" }).selectOption("protocol");
  const tools = page.locator(".debug-tools");
  await tools.getByRole("combobox", { name: "协议" }).selectOption("protocols/demo.yaml");
  await tools.getByRole("combobox", { name: "消息" }).selectOption("event");
  await tools.getByRole("button", { name: "解析字段" }).click();
  check((await page.locator(".debug-field-list code").textContent()) === "On (1)", "Known decode shows label and raw value");
  await page.getByRole("textbox", { name: "原始 HEX" }).fill("09");
  await page.getByRole("button", { name: "解析", exact: true }).click();
  await tools.getByRole("button", { name: "解析字段" }).click();
  check((await page.locator(".debug-field-list code").textContent()) === "未知枚举值 (9)", "Unknown decode keeps raw value");
  await page.locator(".debug-field-list button").click();
  check((await page.locator("#debug-byte-0.debug-tool-highlight").count()) === 1, "Enum field links to byte position");
  return "PASS: enum edit, numeric selection, unknown value, debug label and byte positioning";
}

// npx --package @playwright/cli playwright-cli run-code --filename test/web/debug-tools.js
// UI contract tests use controlled Host responses; native algorithms are tested by CTest.
async function checkDebugTools(page) {
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => localStorage.setItem("iotps.locale", "zh-CN"));
  await page.reload();
  await page.getByRole("button", { name: "调试", exact: true }).click();
  const tools = page.locator(".debug-tools");
  const picker = tools.getByRole("combobox", { name: "调试工具", exact: true });
  const input = page.getByRole("textbox", { name: "原始 HEX", exact: true });
  await input.fill("AA 41 42");
  await page.getByRole("button", { name: "解析", exact: true }).click();
  await page.evaluate(() => {
    window.debugFileContent = JSON.stringify({
      kind: "iotps-debug",
      version: 1,
      hex: "01 02 03",
      annotations: [{ start: 0, end: 1, label: "字段", color: 2 }],
    });
    window.iotpsDebugFile = async (action, content) => {
      if (action === "save") window.exportedAnnotations = content;
      return { ok: true, cancelled: false, content: window.debugFileContent };
    };
    window.iotpsDebugTool = async (operation, ...args) => {
      window.lastDebugCall = [operation, ...args];
      if (operation === "find") return { ok: true, text: "2", hex: args[0], matches: [0, 2] };
      if (operation === "replace") return { ok: true, text: "1", hex: "FF", matches: [0] };
      return {
        ok: true,
        text: operation === "checksum" ? "4B37" : "65535",
        hex: "FF FF",
        matches: [],
      };
    };
  });
  await tools.getByRole("button", { name: "导入标注", exact: true }).click();
  await page.getByText("字段", { exact: true }).waitFor();
  check((await input.inputValue()) === "01 02 03", "Import restores original bytes");
  await tools.getByRole("button", { name: "导出标注", exact: true }).click();
  const exported = await page.evaluate(() => JSON.parse(window.exportedAnnotations));
  check(exported.hex === "01 02 03" && exported.annotations[0].end === 1, "Export round trip");
  for (const content of [
    "invalid",
    JSON.stringify({ ...exported, version: 2 }),
    JSON.stringify({ ...exported, annotations: [{ start: 0, end: 10, label: "bad", color: 0 }] }),
    JSON.stringify({ ...exported, annotations: [{ start: 0, end: 1, label: "bad", color: 11 }] }),
  ]) {
    await page.evaluate((value) => (window.debugFileContent = value), content);
    await tools.getByRole("button", { name: "导入标注", exact: true }).click();
    await tools.getByRole("alert").waitFor();
    check((await input.inputValue()) === "01 02 03", "Invalid import preserves bytes");
    check(
      (await page.getByText("字段", { exact: true }).count()) === 1,
      "Invalid import preserves annotations",
    );
  }
  await picker.selectOption("search");
  await tools.getByLabel("查找 HEX", { exact: true }).fill("01");
  await tools.getByRole("button", { name: "查找", exact: true }).click();
  await tools.getByRole("status").waitFor();
  check(
    (await page.locator("#debug-byte-0.debug-tool-highlight").count()) === 1,
    "Find highlights byte",
  );
  await tools.getByRole("button", { name: /下一处/ }).click();
  check((await page.locator("#debug-byte-2.debug-tool-highlight").count()) === 1, "Next match");
  await tools.getByLabel("替换为 HEX（留空删除）", { exact: true }).fill("FF");
  await tools.getByRole("button", { name: "全部替换", exact: true }).click();
  await page.locator(".debug-byte-table").waitFor({ state: "hidden" });
  check((await input.inputValue()) === "FF", "Replacement updates input and clears stale result");
  await page.getByRole("button", { name: "解析", exact: true }).click();
  check(
    (await page.locator(".debug-annotation-remove").count()) === 0,
    "Replacement clears annotations",
  );
  await picker.selectOption("convert");
  for (const format of ["bcd", "timestamp-s", "timestamp-ms"]) {
    await tools.getByRole("combobox", { name: "输入格式", exact: true }).selectOption(format);
    await tools.getByRole("textbox", { name: "转换输入", exact: true }).fill("2000-01-01T00:00:00Z");
    await tools.getByRole("button", { name: "转换", exact: true }).click();
    await tools.getByRole("textbox", { name: "转换结果", exact: true }).waitFor();
    check(
      (await page.evaluate(() => window.lastDebugCall))[2] === format,
      "Special format reaches Core",
    );
  }
  await tools.getByRole("combobox", { name: "输入格式", exact: true }).selectOption("hex");
  await tools.getByRole("textbox", { name: "转换输入", exact: true }).fill("FF FF");
  await tools.getByRole("combobox", { name: "输出格式", exact: true }).selectOption("uint16");
  await tools.getByRole("button", { name: "转换", exact: true }).click();
  await tools.getByRole("textbox", { name: "转换结果", exact: true }).waitFor();
  check(
    (await tools.getByRole("textbox", { name: "转换结果", exact: true }).inputValue()) === "65535",
    "Conversion displays Core result",
  );
  await tools.getByRole("button", { name: "应用到报文", exact: true }).click();
  check((await input.inputValue()) === "FF FF", "Apply conversion");
  await page.getByRole("button", { name: "解析", exact: true }).click();
  await picker.selectOption("checksum");
  await tools.getByLabel("开始偏移（含）", { exact: true }).fill("1");
  await tools.getByRole("button", { name: "计算", exact: true }).click();
  await page.locator(".debug-checksum-value").waitFor();
  const call = await page.evaluate(() => window.lastDebugCall);
  check(
    call.join("|") === "checksum|FF FF|CRC|1|1|16|8005|FFFF|1|1|0000",
    "CRC options and range reach Core",
  );
  await picker.selectOption("bits");
  await tools.getByRole("button", { name: "读取当前报文", exact: true }).click();
  await tools.getByRole("combobox", { name: "位运算类型", exact: true }).selectOption("SHL");
  await tools.getByLabel("HEX 掩码 / 十进制移位数", { exact: true }).fill("1");
  await tools.getByRole("button", { name: "运算", exact: true }).click();
  await tools.getByRole("textbox", { name: "运算结果", exact: true }).waitFor();
  check(
    (await page.evaluate(() => window.lastDebugCall)).join("|") === "bits|FF FF|SHL|1",
    "Bit operation reaches Core",
  );
  await picker.selectOption("protocol");
  check(
    await tools.getByRole("button", { name: "解析字段", exact: true }).isDisabled(),
    "No project blocks decode",
  );

  // Reload with an explicit Host workspace fixture; no browser-persisted project is created.
  await page.addInitScript(() => {
    window.iotpsWorkspaceCurrent = async () => ({
      ok: true,
      cancelled: false,
      source: "native-workspace",
      project: {
        name: "fixture",
        description: "",
        rootPath: "fixture",
        folders: ["protocols"],
        protocols: [
          {
            name: "demo",
            path: "protocols/demo.yaml",
            content: "fixture",
            schema: {
              version: "0.1",
              protocolVersion: "1",
              defaultByteOrder: "big",
              messages: [{ name: "reply", displayName: "响应", fields: [] }],
            },
          },
        ],
      },
    });
    window.iotpsDebugDecode = async () => ({
      ok: true,
      fields: [
        { name: "header", displayName: "帧头", type: "uint8", value: "1", offset: 0, length: 1 },
        { name: "value", displayName: "数值", type: "uint16", value: "515", offset: 1, length: 2 },
      ],
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "调试", exact: true }).click();
  await input.fill("01 02 03");
  await page.getByRole("button", { name: "解析", exact: true }).click();
  await picker.selectOption("protocol");
  await tools
    .getByRole("combobox", { name: "协议", exact: true })
    .selectOption("protocols/demo.yaml");
  await tools.getByRole("combobox", { name: "消息", exact: true }).selectOption("reply");
  await tools.getByRole("button", { name: "解析字段", exact: true }).click();
  await page.locator("#debug-field-value").click();
  check(
    (await page.locator(".debug-tool-highlight").count()) === 2,
    "Field highlights its full byte range",
  );
  await page.getByRole("button", { name: "定位字节 0", exact: true }).click();
  check(
    (await page.locator("#debug-field-header").getAttribute("aria-pressed")) === "true",
    "Byte selects owning field",
  );
  await page.locator("#debug-field-value").click();
  await page.getByRole("button", { name: "定位字节 0", exact: true }).click();
  check(
    (await page.locator("#debug-field-header").getAttribute("aria-pressed")) === "true",
    "Repeated click reselects byte owner",
  );
  await page.locator(".debug-input-panel").evaluate((el) => (el.scrollTop = el.scrollHeight));
  check(
    await tools.evaluate((el) => el.scrollWidth <= el.clientWidth),
    "Tool panel has no horizontal overflow",
  );
  await page.screenshot({ path: "output/playwright/debug-tools.png" });
  await input.fill("FF");
  check(
    (await page.locator(".debug-field-list").count()) === 0,
    "Changed input clears decoded fields",
  );
  return "PASS: annotation file round trip/validation, replace invalidation, conversion, checksum arguments, prerequisites, field-byte linking, panel layout";
}

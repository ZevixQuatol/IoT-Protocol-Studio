// Run against /test/project-preview.html?debug=1 in Chinese.
// The fixed-schema preview verifies UI behavior; CTest verifies native decoding/tools.
async function checkDebugTools(page) {
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  await page.getByRole("button", { name: "调试", exact: true }).click();
  const input = page.getByRole("textbox", { name: "原始 HEX", exact: true });
  await input.fill("01 00 44 33 22 11 00 00 AC 41 37 00 7F 85");
  await page.getByLabel("调试协议", { exact: true }).selectOption({ label: "SensorLink" });
  await page.getByLabel("调试消息", { exact: true }).selectOption("StatusReply");
  await page.getByRole("button", { name: "解析", exact: true }).click();
  await page.getByRole("button", { name: "temperature", exact: true }).click();
  check(
    (await page.getByRole("region", { name: "选中字节详情", exact: true }).innerText()).includes(
      "21.5",
    ),
    "Field value",
  );
  check((await page.locator(".debug-hex-select.selected").count()) === 4, "Concrete field span");
  await page.getByRole("button", { name: "调试工具", exact: true }).click();
  const dock = page.getByRole("complementary", { name: "工具面板", exact: true });
  for (const name of [
    "数值转换",
    "字节序转换",
    "BCD 工具",
    "时间戳转换",
    "位运算",
    "查找替换",
    "CRC / 校验",
    "标注文件",
  ]) {
    await dock.getByRole("button", { name, exact: true }).click();
    check(await dock.getByRole("heading", { name, exact: true }).isVisible(), `Tool ${name}`);
  }
  await dock.getByRole("button", { name: "导出标注", exact: true }).click();
  await dock.getByRole("button", { name: "导入标注", exact: true }).click();
  check(
    (await input.inputValue()) === "01 00 44 33 22 11 00 00 AC 41 37 00 7F 85",
    "File round trip",
  );
  await page.getByRole("button", { name: "关闭工具面板", exact: true }).click();
  await input.fill("01 00 44 33 22 11 00 00 AC 41 37 00 00 00");
  await page.getByRole("button", { name: "解析", exact: true }).click();
  const result = page.getByRole("region", { name: "解析结果", exact: true });
  check((await result.innerText()).includes("checksum_mismatch"), "Actual failure detail");
  check((await result.locator("tbody tr").count()) === 0, "No stale fields after failure");
  await result.getByRole("button", { name: "跳转 · 12", exact: true }).click();
  check(
    (await page.locator("#debug-byte-12").getAttribute("aria-pressed")) === "true",
    "Error offset jump",
  );
  return "PASS: protocol selection, field linking, tool navigation, file round trip, CRC failure, jump";
}

// Run against test/project-preview.html?debug with Playwright or the CUA Playwright facade.
export async function checkP06Tools(page) {
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  await page.getByRole("button", { name: "调试", exact: true }).click();
  const input = page.getByRole("textbox", { name: "原始 HEX", exact: true });
  await input.fill("31 32 33 34 35 36 37 38 39 37 4B");
  await page.getByRole("button", { name: "解析", exact: true }).click();
  const toggle = page.getByRole("button", { name: "调试工具", exact: true });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  const dock = page.getByRole("complementary", { name: "工具面板", exact: true });
  await dock.getByRole("button", { name: "数值转换", exact: true }).click();
  await dock.getByLabel("数据位宽", { exact: true }).selectOption("16");
  await dock.getByRole("textbox", { name: "转换输入", exact: true }).fill("26 1A");
  await dock
    .getByRole("button", { name: "复制 DEC（有符号）", exact: true })
    .waitFor({ state: "visible" });
  check((await dock.innerText()).includes("6694"), "Little-endian conversion");
  // A spaced conversion HEX result must never be rendered as a checksum BigInt.
  await dock.getByRole("button", { name: "CRC / 校验", exact: true }).click();
  await dock.getByLabel("结束偏移（含）", { exact: true }).fill("8");
  await dock.getByRole("button", { name: "计算", exact: true }).click();
  await dock.getByText("0x4B37", { exact: true }).waitFor({ state: "visible" });
  check(
    (await dock.innerText()).includes("与范围后校验字节一致"),
    "CRC byte order and following-byte comparison",
  );
  await dock.getByRole("button", { name: "大端 (BE)", exact: true }).click();
  check(
    (await dock.innerText()).includes("与范围后字节不一致"),
    "CRC byte-order change retains calculated result",
  );
  await dock.getByRole("button", { name: "查找替换", exact: true }).click();
  await dock.getByRole("textbox", { name: "查找内容", exact: true }).fill("37");
  await dock.getByRole("textbox", { name: "替换内容", exact: true }).fill("FF");
  await dock.getByRole("button", { name: "查找", exact: true }).click();
  check((await page.locator(".debug-match-table tbody tr").count()) === 2, "Complete-byte matches");
  await dock.getByRole("button", { name: "下一个", exact: true }).click();
  await dock.getByRole("button", { name: "替换", exact: true }).click();
  check(
    (await input.evaluate((element) => element.value)) === "31 32 33 34 35 36 37 38 39 FF 4B",
    "Replace only current match",
  );
  check(
    (await page.locator(".debug-hex-select").count()) === 0,
    "Changed bytes clear prior inspection",
  );
  await page.getByRole("button", { name: "解析", exact: true }).click();
  await dock.getByRole("button", { name: "查找", exact: true }).click();
  await dock.getByRole("button", { name: "全部替换", exact: true }).click();
  check(
    (await input.evaluate((element) => element.value)) === "31 32 33 34 35 36 FF 38 39 FF 4B",
    "Replace remaining matches",
  );
  return "PASS: P06 conversion, cross-tool result isolation, CRC range/order, current/all replacements and inspection invalidation";
}

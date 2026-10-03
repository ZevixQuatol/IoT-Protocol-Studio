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

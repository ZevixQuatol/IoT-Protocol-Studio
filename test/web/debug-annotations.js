// Run this UI contract check against /test/project-preview.html?debug=1 in Chinese.
// Native algorithms and file operations are covered separately by CTest.
async function checkDebugAnnotations(page) {
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  await page.getByRole("button", { name: "调试", exact: true }).click();
  const input = page.getByRole("textbox", { name: "原始 HEX", exact: true });
  await input.fill("AA 41 42 43 FF");
  await page.getByRole("button", { name: "解析", exact: true }).click();
  const table = page.locator(".debug-byte-table");
  const bytes = table.locator(".debug-hex-select");
  check((await table.locator("thead th").count()) === 18, "16 bytes plus offset and ASCII");
  check((await bytes.count()) === 5, "Only real bytes are selectable");
  await bytes.nth(4).click();
  await bytes.nth(2).click();
  const dialog = page.getByRole("dialog");
  check(
    (await dialog.getByLabel("起始偏移", { exact: true }).inputValue()) === "2",
    "Reverse start",
  );
  check((await dialog.getByLabel("结束偏移", { exact: true }).inputValue()) === "4", "Reverse end");
  check((await dialog.getByRole("button", { name: /^颜色 / }).count()) === 10, "Indexed palette");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  check(await dialog.getByRole("alert").isVisible(), "Blank name rejected");
  await dialog.getByLabel("名称", { exact: true }).fill("数据");
  await dialog.getByLabel("备注", { exact: true }).fill("Example note");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  const edit = page.getByRole("button", { name: "编辑标注: 数据", exact: true });
  await edit.waitFor();
  await page.getByRole("button", { name: "格式化", exact: true }).click();
  await page.getByRole("button", { name: "解析", exact: true }).click();
  check(await edit.isVisible(), "Formatting and reparse preserve annotations");
  await edit.click();
  check(
    (await dialog.getByLabel("备注", { exact: true }).inputValue()) === "Example note",
    "Note retained",
  );
  await dialog.getByLabel("结束偏移", { exact: true }).fill("99");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  check(await dialog.getByRole("alert").isVisible(), "Out-of-bounds edit rejected");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await edit.click();
  await dialog.getByRole("button", { name: "删除", exact: true }).click();
  check((await edit.count()) === 0, "Delete annotation");
  await input.fill("01");
  check((await bytes.count()) === 0, "Changed input clears stale byte view");
  return "PASS: HEX grid, reverse selection, palette, name/range validation, edit, cancel, delete, reset";
}

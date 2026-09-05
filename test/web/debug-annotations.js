// Run against the local Vite preview:
// npx --package @playwright/cli playwright-cli run-code --filename test/web/debug-annotations.js
async function checkDebugAnnotations(page) {
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  await page.evaluate(() => {
    localStorage.setItem("iotps.locale", "zh-CN");
    localStorage.removeItem("iotps.theme");
  });
  await page.reload();
  check((await page.locator('html[data-theme="light"]').count()) === 1, "Default light theme");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "暗色", exact: true }).click();
  await page.reload();
  check((await page.locator('html[data-theme="dark"]').count()) === 1, "Explicit theme persists");
  await page.getByRole("button", { name: "调试", exact: true }).click();
  await page.getByRole("textbox", { name: "原始 HEX", exact: true }).fill("AA 41 42 43 FF");
  await page.getByRole("button", { name: "解析", exact: true }).click();
  const table = page.locator(".debug-byte-table");
  await table.waitFor();
  check((await table.locator("thead th").count()) === 5, "Five columns");
  const cells = () => page.locator(".debug-byte-index button");
  check((await cells().allTextContents()).join() === "1,2,3,4,5", "One-based bytes");
  check(
    await table
      .locator("tbody tr")
      .evaluateAll((rows) => rows.every((row) => row.cells.length === 5)),
    "Unannotated rows have five cells",
  );
  check((await table.locator("thead button").count()) === 1, "Only one index toggle is visible");
  await table.getByRole("button", { name: "字节", exact: true }).click();
  check((await cells().allTextContents()).join() === "0,1,2,3,4", "Zero-based offsets");
  const dialog = page.locator(".debug-annotation-dialog");
  await cells().nth(0).click();
  await cells().nth(2).hover();
  check((await page.locator(".debug-byte-index.selected").count()) === 3, "Live range preview");
  check(!(await dialog.isVisible()), "First click does not open dialog");
  await cells().nth(2).click();
  await dialog.waitFor({ state: "visible" });
  check((await dialog.locator(".debug-color-swatch").count()) === 10, "Ten preset colors");
  check((await dialog.locator('input[type="color"]').count()) === 0, "No custom color input");
  await dialog.getByRole("textbox").fill("   ");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  check(await dialog.getByRole("alert").isVisible(), "Blank descriptions rejected");
  await dialog.getByRole("textbox").fill("帧头");
  await dialog.getByRole("button", { name: "颜色 3", exact: true }).click();
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  check(
    (await table.locator(".debug-description[rowspan]").first().getAttribute("rowspan")) === "3",
    "Merged description",
  );
  check(
    (await table
      .locator("tbody tr")
      .first()
      .evaluate((row) => getComputedStyle(row).backgroundColor)) === "rgba(102, 190, 202, 0.133)",
    "Dark palette",
  );
  const input = page.getByRole("textbox", { name: "原始 HEX", exact: true });
  const resultBefore = await table.innerHTML();
  await page.getByRole("button", { name: "格式化", exact: true }).click();
  await page.getByRole("button", { name: "取消格式化", exact: true }).click();
  check((await input.inputValue()) === "AA414243FF", "Unformatted input");
  check((await table.innerHTML()) === resultBefore, "Formatting preserves result and annotations");
  await input.fill("aa\n41 42\t43 ff");
  check(
    (await table.innerHTML()) === resultBefore,
    "Whitespace and case preserve result and annotations",
  );
  // Reverse selection and overlap: newest annotation wins, uncovered cells stay aligned.
  await cells().nth(4).click();
  await cells().nth(2).hover();
  check((await page.locator(".debug-byte-index.selected").count()) === 3, "Reverse preview");
  await cells().nth(2).click();
  await dialog.getByRole("textbox").fill("数据");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  check(
    (
      await table
        .locator(".debug-description[rowspan]")
        .evaluateAll((nodes) => nodes.map((node) => node.rowSpan))
    ).join() === "2,3",
    "Overlap produces valid spans",
  );
  const aligned = await table.evaluate((table) => {
    const rows = [...table.tBodies[0].rows];
    const starts = [...table.tHead.rows[0].cells].map((cell) => cell.getBoundingClientRect().left);
    return rows.every((row) =>
      [...row.cells]
        .slice(0, 4)
        .every((cell, i) => Math.abs(cell.getBoundingClientRect().left - starts[i]) < 1),
    );
  });
  check(aligned, "Data cells align with headers after spanning");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "亮色", exact: true }).click();
  await page.getByRole("button", { name: "调试", exact: true }).click();
  check(
    (await table
      .locator("tbody tr")
      .first()
      .evaluate((row) => getComputedStyle(row).backgroundColor)) === "rgba(30, 192, 215, 0.133)",
    "Theme maps existing annotation",
  );
  await cells().nth(0).click();
  await cells().nth(0).click();
  await dialog.waitFor({ state: "visible" });
  check((await dialog.locator("strong").textContent()).includes("0–0"), "Single-byte selection");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  check(
    (await table.locator(".debug-annotation-remove").count()) === 2,
    "Cancel preserves annotations",
  );
  await table.getByRole("button", { name: "移除标注: 数据" }).focus();
  await page.keyboard.press("Enter");
  check(
    (await table.locator(".debug-description[rowspan]").first().getAttribute("rowspan")) === "3",
    "Deleting overlap restores original annotation",
  );
  check(
    (await table.locator("tbody tr").last().locator("td").count()) === 5,
    "Unannotated trailing row remains aligned",
  );
  await cells().nth(1).focus();
  await page.keyboard.press("Enter");
  await cells().nth(3).focus();
  await page.keyboard.press("Enter");
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("textbox").fill("键盘");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  check(
    (await table.getByText("键盘", { exact: true }).count()) === 1,
    "Keyboard selection and save",
  );
  await cells().nth(0).click();
  await page.getByRole("textbox", { name: "原始 HEX", exact: true }).fill("01");
  await page.getByRole("button", { name: "解析", exact: true }).click();
  await table.waitFor();
  check(
    (await table.locator(".debug-annotation-remove").count()) === 0,
    "New input clears annotations",
  );
  check(
    (await page.locator(".debug-byte-index.selected").count()) === 0,
    "New result clears selection",
  );
  return "PASS: layout, indexing, range preview, reverse/single/keyboard selection, presets, themes, overlap, cancel, deletion, input reset";
}

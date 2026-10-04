// Browser UI contracts with fixture data; Core correlation is covered by CTest.
async function checkP11(page) {
  const check = (ok, message) => {
    if (!ok) throw new Error(message);
  };
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const selectView = (name) => page.getByRole("tab", { name, exact: true }).click();
  async function boot(theme = "dark", locale = "zh-CN") {
    await page.goto(
      `http://127.0.0.1:5181/test/analysis-preview.html?theme=${theme}&locale=${locale}`,
    );
    await page
      .getByRole("button", { name: locale === "zh-CN" ? "通信连接" : "Connections", exact: true })
      .click();
    await page
      .getByRole("button", { name: locale === "zh-CN" ? "导入" : "Import", exact: true })
      .click();
    await page
      .getByRole("tab", { name: locale === "zh-CN" ? /^关联(分析)?$/ : "Correlation", exact: true })
      .click();
    await page.locator(".p11-results tbody tr").first().waitFor();
  }
  await page.setViewportSize({ width: 1580, height: 1000 });
  await boot();
  const ui = page.locator(".p11-workbench");
  check(
    (await ui.locator(".p11-results tbody tr").count()) === 10,
    "all Core states are displayed",
  );
  check((await ui.locator(".p11-packet").count()) === 2, "request and response appear together");
  check(
    (await page.locator(".p12-detail:visible").count()) === 0,
    "history does not show a duplicate inspector",
  );
  await ui.getByRole("button", { name: "查看关联 #3", exact: true }).click();
  check((await ui.locator(".p11-detail-state").innerText()).includes("44 ms"), "selected latency");
  await ui.getByRole("button", { name: "下一条关联", exact: true }).click();
  check((await ui.locator(".p11-detail-state").innerText()).includes("超时"), "detail navigation");
  check(
    (await ui.getByRole("button", { name: /^定位响应记录/ }).count()) === 0,
    "timeout does not invent a response",
  );
  await ui.getByLabel("关联状态筛选", { exact: true }).selectOption("late");
  check((await ui.locator(".p11-results tbody tr").count()) === 1, "status filter");
  check(
    (await page.evaluate(() => window.analysisValidation.at(-1)[9])) === "16",
    "filters preserve all Core evidence",
  );
  await ui.getByRole("button", { name: "重置", exact: true }).click();
  await ui.getByLabel("搜索关联记录", { exact: true }).fill("0x0456");
  check((await ui.locator(".p11-results tbody tr").count()) === 2, "device search");
  await ui.getByRole("button", { name: "重置", exact: true }).click();
  await ui.getByLabel("关联开始时间", { exact: true }).fill("2026-10-04T14:35:21");
  check((await ui.locator(".p11-results tbody tr").count()) === 6, "inclusive time filter");
  await ui.getByRole("button", { name: "重置", exact: true }).click();
  await ui.getByRole("button", { name: "编辑规则", exact: true }).click();
  const editor = ui.getByRole("dialog");
  await editor.getByLabel("请求关联字段", { exact: true }).fill("invalid");
  await editor.getByRole("button", { name: "应用关联规则", exact: true }).click();
  await editor.getByRole("alert").waitFor();
  check(
    (await editor.getByLabel("请求关联字段", { exact: true }).inputValue()) === "invalid",
    "failed rule draft retained",
  );
  await editor.getByRole("button", { name: "取消", exact: true }).click();
  await ui.getByRole("button", { name: "编辑规则", exact: true }).click();
  await editor.getByLabel("关联超时（毫秒）", { exact: true }).fill("9999");
  await page.evaluate(() => {
    window.holdValidation = true;
  });
  await editor.getByRole("button", { name: "应用关联规则", exact: true }).click();
  await page.waitForFunction(() => !!window.releaseValidation);
  await editor.getByRole("button", { name: "取消", exact: true }).click();
  await page.evaluate(async () => {
    window.releaseValidation();
    window.holdValidation = false;
    await new Promise(requestAnimationFrame);
  });
  check(
    (await ui.locator(".p11-rule-summary").innerText()).includes("3,000 ms"),
    "cancel prevents stale rule application",
  );
  await ui.getByRole("button", { name: "查看关联 #3", exact: true }).click();
  await page.screenshot({ path: "out/qa/p11/correlation.png" });
  await selectView("时间线");
  await ui.locator(".p11-chart").waitFor();
  check((await ui.locator(".p11-link").count()) === 10, "timeline displays every correlation");
  await ui.getByRole("button", { name: "选择时间线关联 #8", exact: true }).click();
  check(
    (await ui.locator(".p11-detail-state").innerText()).includes("3119 ms"),
    "timeline selection updates detail",
  );
  await ui.getByRole("button", { name: "放大时间线", exact: true }).click();
  check(
    (await ui.locator(".p11-chart").getAttribute("width")) === "1840",
    "zoom expands time axis",
  );
  await ui.getByLabel("显示请求", { exact: true }).uncheck();
  check(
    (await ui.locator(".p11-link .p11-request-dot").count()) === 0,
    "request visibility toggle",
  );
  await ui.getByLabel("显示请求", { exact: true }).check();
  await ui.getByRole("button", { name: "缩小时间线", exact: true }).click();
  await page.screenshot({ path: "out/qa/p11/timeline.png" });
  await ui.getByRole("button", { name: "定位响应记录 #14", exact: true }).click();
  check(
    (await page.getByRole("tab", { name: "记录", exact: true }).getAttribute("aria-selected")) ===
      "true",
    "packet location switches to original records",
  );
  check(
    (await page.locator(".p12-detail").innerText()).includes("3119") === false,
    "original inspector shows packet data",
  );
  await selectView("关联");
  await ui.getByRole("button", { name: "编辑规则", exact: true }).click();
  await editor.getByRole("button", { name: "关闭关联", exact: true }).click();
  await selectView("时间线");
  check(
    (await ui.locator(".p11-events tbody tr").count()) === 16,
    "timeline retains records without a rule",
  );
  check(
    (await ui.locator(".p11-link").count()) === 16,
    "unassociated packets remain on the time axis",
  );
  await ui.getByLabel("搜索关联记录", { exact: true }).fill("0x0456");
  check((await ui.locator(".p11-events tbody tr").count()) === 2, "no-rule timeline search");
  await ui.getByRole("button", { name: "重置", exact: true }).click();
  check(
    !(await page.evaluate(() => window.analysisCalls.some((call) => call[1] === "send"))),
    "analysis sends no packets",
  );
  await boot("light", "en-US");
  await page.screenshot({ path: "out/qa/p11/correlation-light.png" });
  await selectView("Timeline");
  await page.screenshot({ path: "out/qa/p11/timeline-light.png" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "out/qa/p11/timeline-1280.png" });
  check(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    "1280 viewport has no page overflow",
  );
  await page.setViewportSize({ width: 900, height: 900 });
  await page.screenshot({ path: "out/qa/p11/timeline-900.png" });
  check(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    "compact viewport has no page overflow",
  );
  await page.setViewportSize({ width: 1580, height: 1000 });
  await page.goto("http://127.0.0.1:5181/test/analysis-preview.html");
  await page.getByRole("button", { name: "通信连接", exact: true }).click();
  await page.getByLabel("筛选记录", { exact: true }).fill("no-such-record");
  await page.getByRole("tab", { name: /^关联(分析)?$/, exact: true }).click();
  await ui.getByRole("button", { name: "编辑规则", exact: true }).click();
  await editor
    .getByLabel("关联协议", { exact: true })
    .selectOption("protocols/SensorLink/sensorlink.yaml");
  for (const [label, value] of [
    ["请求消息", "ReadStatus"],
    ["响应消息", "StatusReply"],
    ["请求关联字段", "sequence"],
    ["响应关联字段", "sequence"],
  ])
    await editor.getByLabel(label, { exact: true }).fill(value);
  await editor.getByRole("button", { name: "应用关联规则", exact: true }).click();
  await ui.locator(".p11-results tbody tr").first().waitFor();
  await page.screenshot({ path: "out/qa/p11/correlation-live.png" });
  await selectView("时间线");
  await page.screenshot({ path: "out/qa/p11/timeline-live.png" });
  await ui.getByRole("button", { name: "定位请求记录 #1", exact: true }).click();
  check(
    (await page
      .getByRole("tab", { name: "收发记录", exact: true })
      .getAttribute("aria-selected")) === "true",
    "live record location switches to traffic",
  );
  check(
    (await page.getByLabel("筛选记录", { exact: true }).inputValue()) === "",
    "record location clears hiding filters",
  );
  check(
    (await page.locator('.tcp-log tr[aria-selected="true"]').count()) === 1,
    "located record stays selected after clearing filters",
  );
  check(errors.length === 0, errors.join("\n"));
  return {
    passed: true,
    coverage:
      "all states, latency, paired packets, detail navigation, evidence-preserving status/device/time filters, invalid draft, async cancellation, timeline/zoom/visibility, original record location, no-rule timeline, no sends, themes/locales and 1280/900 layouts",
  };
}

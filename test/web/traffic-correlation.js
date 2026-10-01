// UI bridge contract; correlation_test.cpp and tcp_test.cpp execute the real Core.
// rtk proxy npx --package @playwright/cli playwright-cli run-code --filename test/web/traffic-correlation.js
async function checkCorrelation(page) {
  const check = (ok, text) => {
    if (!ok) throw new Error(text);
  };
  await page.addInitScript(() => {
    localStorage.setItem("iotps.locale", "en-US");
    localStorage.setItem("iotps.theme", "light");
    const frame = (id, time, flow, value, status = "ok") => ({
      id,
      time,
      direction: "FRAME",
      flow,
      peer: 1,
      address: "endpoint",
      hex: "01 02",
      size: 2,
      detail: `frame-${id}`,
      parsed: {
        protocolPath: "wire.yaml",
        messageName: flow === "TX" ? "ask" : "reply",
        status,
        checksum: "none",
        error: "",
        fields:
          status === "ok"
            ? [
                {
                  name: flow === "TX" ? "seq" : "ack",
                  type: "uint16",
                  displayName: "Sequence",
                  value,
                  offset: 0,
                  length: 2,
                },
                {
                  name: "noise",
                  type: "uint16",
                  displayName: "Noise",
                  value: "not-a-key",
                  offset: 0,
                  length: 2,
                },
              ]
            : [],
      },
    });
    const records = [
      {
        id: 1,
        time: 999,
        direction: "TX",
        peer: 1,
        address: "endpoint",
        hex: "01 02",
        size: 2,
        detail: "raw-chunk",
      },
      frame(2, 1000, "TX", "7"),
      frame(3, 1100, "RX", "7"),
      frame(4, 1101, "RX", "7"),
      frame(5, 1102, "RX", "8"),
      frame(6, 1200, "TX", "9"),
      frame(7, 1400, "TX", "10"),
      frame(8, 1501, "RX", "10"),
      frame(9, 1502, "RX", "11", "error"),
    ];
    window.correlationCalls = [];
    window.trafficCalls = [];
    window.iotpsTcp = async (session, action, ...args) => {
      window.trafficCalls.push([session, action, ...args]);
      if (action === "poll" || action === "export")
        return {
          ok: true,
          state: "closed",
          server: false,
          host: "",
          port: 0,
          error: "",
          sent: 0,
          received: 0,
          queued: 0,
          dropped: 3,
          retries: 0,
          cursor: 9,
          peers: [],
          records: action === "export" || args[0] === "0" ? structuredClone(records) : [],
        };
      return { ok: true };
    };
    window.iotpsCorrelate = async (...args) => {
      window.correlationCalls.push(args);
      if (args[3] === "invalid")
        return {
          ok: false,
          error: { code: "invalid_configuration", message: "Invalid correlation field" },
        };
      if (args[9] === "0") {
        if (window.holdValidation)
          return new Promise((resolve) => {
            window.releaseValidation = () => resolve({ ok: true, rows: [] });
          });
        return { ok: true, rows: [] };
      }
      const rows = [
        {
          request: 2,
          response: 3,
          state: "matched",
          elapsed: 100,
          reason: "Matching field and scope within timeout",
        },
        {
          request: 2,
          response: 4,
          state: "duplicate",
          elapsed: 101,
          reason: "Request already has a response",
        },
        {
          request: 0,
          response: 5,
          state: "unmatched",
          elapsed: 0,
          reason: "No matching request in retained records",
        },
        {
          request: 6,
          response: 0,
          state: Number(args[8]) < 1300 ? "pending" : "timeout",
          elapsed: 0,
          reason:
            Number(args[8]) < 1300 ? "Waiting for response" : "No unique response within timeout",
        },
        {
          request: 7,
          response: 8,
          state: "late",
          elapsed: 101,
          reason: "Response arrived after timeout",
        },
        {
          request: 0,
          response: 9,
          state: "skipped",
          elapsed: 0,
          reason: "Frame is invalid or correlation field is missing/truncated",
        },
      ];
      if (window.holdCorrelation)
        return new Promise((resolve) => {
          window.releaseCorrelation = () => resolve({ ok: true, rows });
        });
      return { ok: true, rows };
    };
    window.iotpsTrafficFile = async (action, content) => {
      if (action === "save") {
        window.savedCorrelation = JSON.parse(content);
        return { ok: true, cancelled: false, content: "" };
      }
      return {
        ok: true,
        cancelled: false,
        content: JSON.stringify(window.importCorrelation ?? window.savedCorrelation),
      };
    };
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 1800 });
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  const session = page.locator('[data-session="tcp-1"]');
  const panel = session.locator(".traffic-correlation");
  await panel.locator("summary").click();
  await panel.getByLabel("Correlation protocol", { exact: true }).selectOption("wire.yaml");
  for (const [label, value] of [
    ["Request message", "ask"],
    ["Response message", "reply"],
    ["Request correlation field", "seq"],
    ["Response correlation field", "ack"],
    ["Correlation timeout (ms)", "100"],
  ])
    await panel.getByLabel(label, { exact: true }).fill(value);
  await panel.getByRole("button", { name: "Apply correlation rule" }).click();
  await panel.locator('[data-correlation-state="matched"]').waitFor();
  check(
    (await panel.locator('[data-correlation-state="timeout"]').count()) === 1,
    "live timeout from Core",
  );
  for (const state of ["duplicate", "unmatched", "late", "skipped"])
    check(
      (await panel.locator(`[data-correlation-state="${state}"]`).count()) === 1,
      `renders ${state}`,
    );
  check(
    await panel
      .locator('[data-correlation-state="matched"]')
      .innerText()
      .then((text) => text.includes("100 ms")),
    "elapsed time",
  );
  check(
    await page.evaluate(() =>
      window.correlationCalls.some((args) => args[9] === "8" && !args.includes("not-a-key")),
    ),
    "only full frames and selected keys cross bridge",
  );
  await panel.getByRole("button", { name: "View response #3", exact: true }).click();
  await session.locator(".tcp-record-detail").getByText("frame-3", { exact: true }).waitFor();
  await session.getByLabel("Close details", { exact: true }).click();
  await session.getByLabel("Filter records", { exact: true }).fill("no-such-data");
  check(
    (await panel.locator("tbody tr").count()) === 6,
    "record filters do not remove correlation evidence",
  );
  await session.getByLabel("Filter records", { exact: true }).fill("");
  await panel.getByLabel("Correlation scope", { exact: true }).selectOption("session");
  await panel.getByLabel("Request direction", { exact: true }).selectOption("RX");
  await panel.getByRole("button", { name: "Apply correlation rule" }).click();
  await page.waitForFunction(() =>
    window.correlationCalls.some((args) => args[5] === "RX" && args[6] === "session"),
  );
  await session.getByRole("button", { name: "Save / export", exact: true }).click();
  check(
    await page.evaluate(
      () =>
        window.savedCorrelation.correlation.scope === "session" &&
        window.savedCorrelation.records[1].flow === "TX" &&
        window.savedCorrelation.records.length === 9,
    ),
    "rule and frame directions exported",
  );
  await page.evaluate(() => {
    window.importCorrelation = structuredClone(window.savedCorrelation);
    window.importCorrelation.savedAt = new Date(1250).toISOString();
  });
  await session.getByRole("button", { name: "Import", exact: true }).click();
  await panel.getByText("History analysis time", { exact: false }).waitFor();
  await panel.locator('[data-correlation-state="pending"]').waitFor();
  check(
    await page.evaluate(() => window.correlationCalls.at(-1)[8] === "1250"),
    "history uses saved time, not wall clock",
  );
  await page.evaluate(() => {
    window.importCorrelation.correlation.timeout = -1;
  });
  await session.getByRole("button", { name: "Import", exact: true }).click();
  await session
    .getByRole("alert")
    .filter({ hasText: "Invalid traffic correlation rule" })
    .waitFor();
  check(
    (await panel.locator('[data-correlation-state="pending"]').count()) === 1,
    "bad import preserves prior history",
  );
  await page.evaluate(() => {
    window.importCorrelation.correlation.timeout = 100;
    window.importCorrelation.records[1].parsed.fields[0].redacted = true;
  });
  await session.getByRole("button", { name: "Import", exact: true }).click();
  await page.waitForFunction(
    () =>
      window.correlationCalls.at(-1).includes("seq") && window.correlationCalls.at(-1)[21] === "",
  );
  check(
    await page.evaluate(
      () =>
        !window.trafficCalls.some((call) => ["send", "start", "udp", "serial"].includes(call[1])),
    ),
    "analysis/import sends no packets",
  );
  await panel.getByLabel("Request correlation field", { exact: true }).fill("invalid");
  await panel.getByRole("button", { name: "Apply correlation rule" }).click();
  await panel.getByRole("alert").filter({ hasText: "Invalid correlation field" }).waitFor();
  await panel.getByLabel("Request correlation field", { exact: true }).fill("seq");
  await panel.getByRole("button", { name: "Disable correlation" }).click();
  check((await panel.locator("tbody tr").count()) === 0, "disable clears result");
  await session.getByRole("button", { name: "Back to live", exact: true }).click();
  await page.evaluate(() => {
    window.holdCorrelation = true;
  });
  await panel.getByLabel("Correlation timeout (ms)", { exact: true }).fill("101");
  await panel.getByRole("button", { name: "Apply correlation rule" }).click();
  await page.waitForFunction(() => typeof window.releaseCorrelation === "function");
  await panel.getByRole("button", { name: "Disable correlation" }).click();
  await page.evaluate(() => {
    window.holdCorrelation = false;
    window.releaseCorrelation();
  });
  check((await panel.locator("tbody tr").count()) === 0, "obsolete analysis ignored after disable");
  await panel.getByLabel("Correlation protocol", { exact: true }).selectOption("wire.yaml");
  for (const [label, value] of [
    ["Request message", "ask"],
    ["Response message", "reply"],
    ["Request correlation field", "seq"],
    ["Response correlation field", "ack"],
  ])
    await panel.getByLabel(label, { exact: true }).fill(value);
  await panel.getByRole("button", { name: "Apply correlation rule" }).click();
  await page.evaluate(() => {
    window.holdValidation = true;
  });
  await panel.getByRole("button", { name: "Apply correlation rule" }).click();
  await page.waitForFunction(() => typeof window.releaseValidation === "function");
  await panel.getByRole("button", { name: "Disable correlation" }).click();
  await page.evaluate(() => {
    window.holdValidation = false;
    window.releaseValidation();
  });
  check(
    (await panel.locator("tbody tr").count()) === 0,
    "cancelled validation cannot reenable analysis",
  );
  await panel.getByLabel("Correlation protocol", { exact: true }).selectOption("wire.yaml");
  for (const [label, value] of [
    ["Request message", "ask"],
    ["Response message", "reply"],
    ["Request correlation field", "seq"],
    ["Response correlation field", "ack"],
  ])
    await panel.getByLabel(label, { exact: true }).fill(value);
  await panel.getByRole("button", { name: "Apply correlation rule" }).click();
  await panel.locator('[data-correlation-state="matched"]').waitFor();
  await session.screenshot({ path: "out/qa/traffic-correlation.png" });
  check(errors.length === 0, errors.join("\n"));
  return {
    passed: true,
    coverage:
      "Core bridge projection, result categories and elapsed, record links, filter independence, scope/direction, archive config and flow, fixed history time, bad import preservation, redacted keys, no sends and stale response cancellation",
  };
}

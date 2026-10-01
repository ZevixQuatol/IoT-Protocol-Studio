// UI scheduling and native bridge contract; capture_test.cpp executes the real PCAP parser.
// rtk proxy npx --package @playwright/cli playwright-cli run-code --filename test/web/traffic-replay.js
async function checkReplay(page) {
  const check = (ok, message) => {
    if (!ok) throw new Error(message);
  };
  await page.addInitScript(() => {
    localStorage.setItem("iotps.locale", "en-US");
    localStorage.setItem("iotps.theme", "light");
    const record = (id, time, direction, hex, flow) => ({
      id,
      time,
      direction,
      peer: 1,
      address: "saved-endpoint",
      hex,
      size: hex ? hex.split(" ").length : 0,
      detail: `packet-${id}`,
      ...(flow
        ? {
            flow,
            parsed: {
              protocolPath: "wire.yaml",
              messageName: flow === "TX" ? "ask" : "reply",
              status: "ok",
              checksum: "none",
              error: "",
              fields: [
                {
                  name: "key",
                  displayName: "Key",
                  type: "uint8",
                  value: "1",
                  offset: 0,
                  length: 1,
                },
              ],
            },
          }
        : {}),
    });
    window.replayArchive = {
      format: "iotps-traffic-v1",
      session: "saved",
      savedAt: new Date(3500).toISOString(),
      dropped: 0,
      records: [
        record(1, 1000, "TX", "01"),
        record(2, 1000, "FRAME", "01", "TX"),
        record(3, 1500, "RX", "03"),
        record(4, 1500, "FRAME", "03", "RX"),
        record(5, 2500, "TX", "02"),
        record(6, 2500, "FRAME", "02", "TX"),
        record(7, 3000, "SYS", ""),
      ],
      correlation: {
        protocol: "wire.yaml",
        requestMessage: "ask",
        responseMessage: "reply",
        requestField: "key",
        responseField: "key",
        requestFlow: "TX",
        scope: "connection",
        timeout: 600,
      },
    };
    window.replayCalls = [];
    window.replayOpen = true;
    window.replayQueued = 0;
    window.iotpsTcp = async (session, action, ...args) => {
      window.replayCalls.push([session, action, ...args]);
      if (action === "poll") {
        if (window.holdReplayPoll)
          await new Promise((resolve) => {
            (window.pendingReplayPolls ??= []).push(resolve);
            window.releaseReplayPoll = () =>
              window.pendingReplayPolls.splice(0).forEach((wake) => wake());
          });
        return {
          ok: true,
          state: window.replayOpen ? "open" : "closed",
          host: "127.0.0.1",
          port: 9000,
          server: false,
          error: "",
          sent: 0,
          received: 0,
          queued: window.replayQueued,
          dropped: 0,
          retries: 0,
          cursor: 0,
          peers: window.replayOpen ? [{ id: 7, address: "target:9000" }] : [],
          records: [],
        };
      }
      return { ok: true };
    };
    window.iotpsTrafficFile = async (action, content) => {
      if (action === "save") {
        window.replaySaved = JSON.parse(content);
        return { ok: true, cancelled: false, content: "" };
      }
      return { ok: true, cancelled: false, content: JSON.stringify(window.replayArchive) };
    };
    window.iotpsCorrelate = async (...args) => {
      const count = Number(args[9]);
      return {
        ok: true,
        rows:
          count >= 2
            ? [
                {
                  request: 2,
                  response: 4,
                  state: "matched",
                  reason: "Matching field and scope within timeout",
                  elapsed: 500,
                },
                ...(Number(args[8]) >= 3100
                  ? [
                      {
                        request: 6,
                        response: 0,
                        state: "timeout",
                        reason: "No unique response within timeout",
                        elapsed: 0,
                      },
                    ]
                  : []),
              ]
            : count
              ? [
                  {
                    request: 2,
                    response: 0,
                    state: "pending",
                    reason: "Waiting for response",
                    elapsed: 0,
                  },
                ]
              : [],
      };
    };
    window.iotpsPcapFile = async (session, ip) => {
      window.captureArgs = [session, ip];
      if (window.badCapture)
        return { ok: false, error: { code: "file_error", message: "Unsupported PCAPNG" } };
      return {
        ok: true,
        cancelled: false,
        content: JSON.stringify({ dropped: 2, time: 3000, records: window.replayArchive.records }),
      };
    };
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  const session = page.locator('[data-session="tcp-1"]');
  await session.getByRole("button", { name: "Import", exact: true }).click();
  const replay = session.locator(".traffic-replay");
  const timeline = session.locator(".traffic-timeline");
  await replay.waitFor();
  await timeline.locator("summary").click();
  await timeline.getByText("Matched · 500 ms", { exact: true }).first().waitFor();
  await timeline.getByText("Request timeout", { exact: true }).waitFor();
  await timeline.getByRole("button", { name: "View packet #4", exact: true }).click();
  await session.locator(".tcp-record-detail").getByText("packet-4", { exact: true }).waitFor();
  check(
    await session
      .locator(".tcp-record-detail")
      .innerText()
      .then((text) => text.includes("Key")),
    "timeline opens original bytes and decoded fields",
  );
  await replay.getByLabel("Replay speed", { exact: true }).selectOption("0.25");
  await replay.getByRole("button", { name: "Offline replay (no packets)", exact: true }).click();
  await page.waitForTimeout(150);
  await replay.getByRole("button", { name: "Pause replay", exact: true }).click();
  const count = await session.locator(".tcp-log tbody tr").count();
  await page.waitForTimeout(250);
  check(
    count === 2 && (await session.locator(".tcp-log tbody tr").count()) === count,
    "offline pause freezes prefix",
  );
  check(
    (await session.locator(".tcp-record-detail").count()) === 0,
    "replay hides selected future record",
  );
  await replay.getByLabel("Replay speed", { exact: true }).selectOption("16");
  await replay.getByRole("button", { name: "Resume replay", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector(".traffic-replay output").textContent.includes("done"),
  );
  check(
    (await session.locator(".tcp-log tbody tr").count()) === 7,
    "speed change completes offline order",
  );
  check(
    await page.evaluate(
      () =>
        !window.replayCalls.some((call) => ["send", "start", "udp", "serial"].includes(call[1])),
    ),
    "import, analysis and offline replay never send/connect",
  );
  await replay.getByRole("button", { name: "Stop replay", exact: true }).click();
  const sendButton = replay.getByRole("button", {
    name: "Start sending to selected connection",
    exact: true,
  });
  check(await sendButton.isDisabled(), "explicit target required");
  await replay.getByLabel("Replay target connection", { exact: true }).selectOption("7");
  await replay.getByLabel("Replay speed", { exact: true }).selectOption("1");
  await sendButton.click();
  await page.waitForFunction(
    () => window.replayCalls.filter((call) => call[1] === "send").length === 1,
  );
  await replay.getByRole("button", { name: "Pause replay", exact: true }).click();
  await page.waitForTimeout(300);
  check(
    (await page.evaluate(() => window.replayCalls.filter((call) => call[1] === "send").length)) ===
      1,
    "sending pause prevents more queuing",
  );
  await replay.getByLabel("Replay speed", { exact: true }).selectOption("16");
  await replay.getByRole("button", { name: "Resume replay", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector(".traffic-replay output").textContent.includes("done"),
  );
  check(
    await page.evaluate(
      () =>
        JSON.stringify(
          window.replayCalls.filter((call) => call[1] === "send").map((call) => call.slice(2)),
        ) === '[["7","01"],["7","02"]]',
    ),
    "explicit target, byte order, no duplicated FRAME sends",
  );
  await replay.getByRole("button", { name: "Stop replay", exact: true }).click();
  await replay.getByLabel("Replay speed", { exact: true }).selectOption("1");
  await sendButton.click();
  await page.waitForFunction(
    () => window.replayCalls.filter((call) => call[1] === "send").length === 3,
  );
  await page.evaluate(() => {
    window.replayOpen = false;
  });
  await page.waitForFunction(() =>
    document.querySelector(".traffic-replay output").textContent.includes("idle"),
  );
  await page.waitForTimeout(200);
  check(
    (await page.evaluate(() => window.replayCalls.filter((call) => call[1] === "send").length)) ===
      3,
    "disconnect cancels replay",
  );
  await page.evaluate(() => {
    window.replayOpen = true;
    window.replayQueued = 300000;
  });
  await page.waitForTimeout(300);
  await sendButton.click();
  await replay.getByRole("alert").filter({ hasText: "Send queue too large" }).waitFor();
  check(
    (await page.evaluate(() => window.replayCalls.filter((call) => call[1] === "send").length)) ===
      3,
    "queue pressure stops replay",
  );
  await page.evaluate(() => {
    window.replayQueued = 0;
    window.holdReplayPoll = true;
  });
  await sendButton.click();
  await page.waitForFunction(() => typeof window.releaseReplayPoll === "function");
  await replay.getByRole("button", { name: "Stop replay", exact: true }).click();
  await page.evaluate(() => {
    window.holdReplayPoll = false;
    window.releaseReplayPoll();
  });
  await page.waitForTimeout(150);
  check(
    (await page.evaluate(() => window.replayCalls.filter((call) => call[1] === "send").length)) ===
      3,
    "cancel during poll cannot enqueue later",
  );
  const capture = session.locator(".traffic-capture");
  await capture.locator("summary").click();
  await capture.getByLabel("Captured local IPv4", { exact: true }).fill("10.0.0.1");
  await page.evaluate(() => {
    window.badCapture = true;
  });
  await capture.getByRole("button", { name: "Choose PCAP (offline only)", exact: true }).click();
  await session.getByRole("alert").filter({ hasText: "Unsupported PCAPNG" }).waitFor();
  check(
    (await session.locator(".tcp-log tbody tr").count()) === 7,
    "failed PCAP preserves history",
  );
  await page.evaluate(() => {
    window.badCapture = false;
  });
  await capture.getByRole("button", { name: "Choose PCAP (offline only)", exact: true }).click();
  await page.waitForFunction(() => window.captureArgs?.[1] === "10.0.0.1");
  await session.getByRole("button", { name: "Save / export", exact: true }).click();
  check(
    await page.evaluate(
      () =>
        window.replaySaved.session === "PCAP" &&
        window.replaySaved.dropped === 2 &&
        window.replaySaved.records.length === 7,
    ),
    "PCAP history exports through existing archive",
  );
  check(
    (await replay.getByLabel("Replay target connection", { exact: true }).inputValue()) === "",
    "new source requires new explicit target",
  );
  await replay.getByLabel("Replay data", { exact: true }).selectOption("frame");
  await replay.getByLabel("Replay target connection", { exact: true }).selectOption("7");
  await replay.getByLabel("Replay speed", { exact: true }).selectOption("16");
  await sendButton.click();
  await page.waitForFunction(() =>
    document.querySelector(".traffic-replay output").textContent.includes("done"),
  );
  check(
    (await page.evaluate(() => window.replayCalls.filter((call) => call[1] === "send").length)) ===
      5,
    "complete frames replay without raw chunks",
  );
  await replay.getByLabel("Replay source direction", { exact: true }).selectOption("RX");
  await sendButton.click();
  await page.waitForFunction(() =>
    document.querySelector(".traffic-replay output").textContent.includes("done"),
  );
  check(
    (await page.evaluate(
      () => window.replayCalls.filter((call) => call[1] === "send").at(-1)[3],
    )) === "03",
    "explicit RX source replay",
  );
  await session.screenshot({ path: "out/qa/traffic-replay.png" });
  await page.evaluate(() => {
    window.replayArchive.records[0].time = Number.MAX_SAFE_INTEGER;
  });
  await session.getByRole("button", { name: "Import", exact: true }).click();
  await session.getByRole("alert").filter({ hasText: "Invalid traffic archive record" }).waitFor();
  check(
    (await session.locator(".tcp-log tbody tr").count()) === 7,
    "unrenderable date rejected and history preserved",
  );
  check(errors.length === 0, errors.join("\n"));
  return {
    passed: true,
    coverage:
      "timeline links/elapsed/timeout, offline ordering/speed/pause/no sends, explicit target/raw deduplication, send pause/disconnect/queue/cancel, PCAP failure preservation and archive export",
  };
}

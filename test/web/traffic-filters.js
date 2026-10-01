// Browser bridge contract for 6.1; endpoint_test.cpp checks Core device snapshots.
// rtk proxy npx --package @playwright/cli playwright-cli run-code --filename test/web/traffic-filters.js
async function checkTrafficFilters(page) {
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  await page.addInitScript(() => {
    localStorage.setItem("iotps.locale", "en-US");
    localStorage.setItem("iotps.theme", "light");
    const time = Date.parse("2026-10-01T10:00:00.000");
    const frame = (id, offset, address, peer, path, device, value, status = "ok") => ({
      id,
      time: time + offset,
      direction: "FRAME",
      peer,
      address,
      device,
      hex: "01 02",
      size: 2,
      detail: `frame-${id}`,
      parsed: {
        protocolPath: path,
        messageName: "data",
        status,
        checksum: "none",
        error: status === "ok" ? "" : "Decode failed",
        fields:
          status === "ok"
            ? [
                {
                  name: "deviceId",
                  displayName: "Device ID",
                  type: "uint16",
                  value,
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
        time,
        direction: "TX",
        peer: 1,
        address: "peer-A",
        device: "configured-A",
        hex: "01 02",
        size: 2,
        detail: "",
      },
      {
        id: 2,
        time: time + 100,
        direction: "RX",
        peer: 1,
        address: "peer-A",
        device: "configured-A",
        hex: "01 02",
        size: 2,
        detail: "",
      },
      frame(3, 100, "peer-A", 1, "a.yaml", "configured-A", "field-A"),
      frame(4, 200, "peer-B", 2, "b.yaml", "configured-B", "field-B"),
      frame(5, 300, "peer-A", 3, "a.yaml", "configured-B", "field-B"),
      frame(6, 400, "peer-A", 3, "a.yaml", "configured-C", "", "error"),
      {
        id: 7,
        time: time + 500,
        direction: "SYS",
        peer: 0,
        address: "peer-A",
        device: "",
        hex: "",
        size: 0,
        detail: "Stopped",
      },
    ];
    window.filterCalls = [];
    window.filterSessions = new Map();
    window.iotpsTcp = async (id, action, ...args) => {
      window.filterCalls.push([id, action, ...args]);
      if (action === "create" && !window.filterSessions.has(id))
        window.filterSessions.set(id, {
          ok: true,
          state: "closed",
          server: false,
          host: "",
          port: 0,
          device: "configured-A",
          error: "",
          sent: 0,
          received: 0,
          queued: 0,
          dropped: 0,
          retries: 0,
          protocolPath: "",
          messageName: "",
          cursor: id === "tcp-1" ? 7 : 0,
          peers: [],
          records: id === "tcp-1" ? records : [],
        });
      const state = window.filterSessions.get(id);
      if (action === "poll")
        return structuredClone({
          ...state,
          records: state.records.filter((record) => record.id > Number(args[0])),
        });
      if (action === "export") return structuredClone(state);
      if (action === "device") {
        state.device = args[0];
        state.records.push({
          id: ++state.cursor,
          time: time + 600,
          direction: "RX",
          peer: 1,
          address: "peer-A",
          device: state.device,
          hex: "03 04",
          size: 2,
          detail: "",
        });
      }
      return { ok: true };
    };
    window.iotpsTrafficFile = async (action, content) => {
      if (action === "save") {
        window.savedTraffic = JSON.parse(content);
        return { ok: true, cancelled: false, content: "" };
      }
      return {
        ok: true,
        cancelled: false,
        content: JSON.stringify(window.importTraffic ?? window.savedTraffic),
      };
    };
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  const first = page.locator('[data-session="tcp-1"]');
  const rows = first.locator(".tcp-log tbody tr");
  const count = async (expected) => {
    await page.waitForFunction(
      (expected) =>
        document.querySelector('[data-session="tcp-1"] .tcp-log tbody').children.length ===
        expected,
      expected,
    );
  };
  await count(7);
  await first.locator(".traffic-filters summary").filter({ hasText: "Structured filters" }).click();
  await first
    .getByLabel("Filter connection", { exact: true })
    .selectOption(JSON.stringify(["peer-A", 1]));
  await count(3);
  check(
    (await rows.locator(".tcp-dir-FRAME").count()) === 1,
    "connection identities distinguish reconnects at same address",
  );
  await first.getByRole("button", { name: "Reset structured filters" }).click();
  await first.getByLabel("Filter message type").selectOption(JSON.stringify(["a.yaml", "data"]));
  await count(3);
  await first.getByLabel("Direction", { exact: true }).selectOption("RX");
  await count(0);
  await first.getByLabel("Direction", { exact: true }).selectOption("all");
  await first.getByLabel("Device identifier field").selectOption("deviceId");
  await first.getByLabel("Filter device", { exact: true }).selectOption(JSON.stringify("field-B"));
  await count(1);
  check(
    (await rows.innerText()).includes("frame-5"),
    "device field and protocol message intersect",
  );
  await first.getByRole("button", { name: "Reset structured filters" }).click();
  await first
    .getByLabel("Filter device", { exact: true })
    .selectOption(JSON.stringify("configured-B"));
  await count(2);
  await first.getByRole("button", { name: "Reset structured filters" }).click();
  // Playwright's datetime-local fill helper rejects fractional seconds. Use the native value setter.
  const setTime = (label, value) =>
    first.getByLabel(label).evaluate((input, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  await setTime("Filter start time", "2026-10-01T10:00:00.100");
  await setTime("Filter end time", "2026-10-01T10:00:00.200");
  await count(3);
  await setTime("Filter end time", "2026-10-01T10:00:00.099");
  await first
    .getByRole("alert")
    .filter({ hasText: "Start time must not be after end time" })
    .waitFor();
  await count(0);
  await first.getByRole("button", { name: "Reset structured filters" }).click();
  await first.getByLabel("Filter message type").selectOption("unparsed");
  await count(3);
  await first.getByRole("button", { name: "Reset structured filters" }).click();
  await first.getByLabel("Device identifier field").selectOption("deviceId");
  await first.getByLabel("Filter records").fill("field-B");
  await count(2);
  await first.getByLabel("Filter records").fill("");
  await first.getByLabel("Current session device identifier").fill("new-device");
  await first.getByRole("button", { name: "Apply device identifier" }).click();
  await count(8);
  await first
    .getByLabel("Filter device", { exact: true })
    .selectOption(JSON.stringify("new-device"));
  await count(1);
  await first.getByRole("button", { name: "Save / export", exact: true }).click();
  check(
    await page.evaluate(
      () =>
        window.savedTraffic.records.length === 8 &&
        window.savedTraffic.records[0].device === "configured-A" &&
        window.savedTraffic.records[7].device === "new-device",
    ),
    "export includes all records and immutable device labels",
  );
  await first.getByRole("button", { name: "Import", exact: true }).click();
  await first.getByText("History (read only)", { exact: false }).waitFor();
  check(
    await first.getByRole("button", { name: "Apply device identifier" }).isDisabled(),
    "history configuration is read only",
  );
  await first.getByRole("button", { name: "Reset structured filters" }).click();
  await count(8);
  await page.evaluate(() => {
    window.importTraffic = structuredClone(window.savedTraffic);
    for (const record of window.importTraffic.records) delete record.device;
  });
  await first.getByRole("button", { name: "Import", exact: true }).click();
  await first.getByLabel("Filter device", { exact: true }).selectOption(JSON.stringify(""));
  await count(8);
  await page.evaluate(() => {
    window.importTraffic.records[0].device = { invalid: true };
  });
  await first.getByRole("button", { name: "Import", exact: true }).click();
  await first.getByRole("alert").filter({ hasText: "Invalid traffic archive record" }).waitFor();
  await count(8);
  check(
    await page.evaluate(
      () => !window.filterCalls.some((call) => call[1] === "send" || call[1] === "start"),
    ),
    "filter and import never send or connect",
  );
  await first.getByRole("button", { name: "Back to live", exact: true }).click();
  await first.getByRole("button", { name: "Reset structured filters" }).click();
  await first
    .getByLabel("Filter connection", { exact: true })
    .selectOption(JSON.stringify(["peer-A", 1]));
  await page.getByLabel("New communication session", { exact: true }).click();
  const second = page.locator('[data-session="tcp-2"]');
  await second
    .locator(".traffic-filters summary")
    .filter({ hasText: "Structured filters" })
    .click();
  check(
    (await second.getByLabel("Filter connection", { exact: true }).inputValue()) === "",
    "session filters independent",
  );
  await page.getByRole("tab", { name: "TCP 1", exact: true }).click();
  await count(4);
  check(
    (await first.getByLabel("Filter connection", { exact: true }).inputValue()) ===
      JSON.stringify(["peer-A", 1]),
    "session tab restores query",
  );
  await first.screenshot({ path: "out/qa/traffic-filters.png" });
  check(errors.length === 0, errors.join("\n"));
  return {
    passed: true,
    coverage:
      "connection identity, protocol/message keys, configured and parsed device IDs, inclusive millisecond time bounds, invalid ranges, combined filters, export/import compatibility, read-only history and session isolation",
  };
}

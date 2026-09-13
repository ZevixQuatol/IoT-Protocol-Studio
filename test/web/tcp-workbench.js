// UI contract test; tcp_test.cpp exercises real loopback sockets.
// npx --package @playwright/cli playwright-cli run-code --filename test/web/tcp-workbench.js
async function checkTcp(page) {
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  await page.addInitScript(() => {
    localStorage.setItem("iotps.locale", "zh-CN");
    localStorage.setItem("iotps.theme", "light");
    let records = [],
      next = 0;
    const state = {
      ok: true,
      state: "closed",
      server: false,
      host: "",
      port: 0,
      error: "",
      sent: 0,
      received: 0,
      queued: 0,
      dropped: 0,
      cursor: 0,
      peers: [],
      records: [],
    };
    window.tcpCalls = [];
    window.iotpsTcp = async (action, ...args) => {
      if (action === "poll")
        return structuredClone({
          ...state,
          cursor: next,
          records: records.filter((r) => r.id > Number(args[0])),
        });
      window.tcpCalls.push([action, ...args]);
      const record = (direction, hex, detail = "") =>
        records.push({
          id: ++next,
          time: Date.now(),
          direction,
          peer: Number(args[0]) || 1,
          address: "127.0.0.1:51001",
          hex,
          size: hex ? hex.split(" ").length : 0,
          detail,
        });
      if (action === "start") {
        Object.assign(state, {
          state: "open",
          server: args[0] === "server",
          host: args[1],
          port: Number(args[2]),
          peers: [
            { id: 1, address: "127.0.0.1:51001" },
            { id: 2, address: "127.0.0.1:51002" },
          ],
        });
        record("SYS", "", "Listening");
      }
      if (action === "send") {
        if (args[1] === "GG")
          return { ok: false, error: { code: "invalid_hex", message: "Invalid HEX" } };
        const hex = args[1].toUpperCase();
        record("TX", hex);
        record("RX", hex);
        state.sent += hex.split(" ").length;
        state.received += hex.split(" ").length;
      }
      if (action === "disconnect")
        state.peers = state.peers.filter((p) => String(p.id) !== args[0]);
      if (action === "clear") records = [];
      if (action === "stop") Object.assign(state, { state: "closed", peers: [] });
      return { ok: true };
    };
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.reload();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "通信连接", exact: true }).click();
  await page.getByLabel("TCP 模式").selectOption("server");
  check(
    (await page.getByLabel("IP", { exact: true }).inputValue()) === "0.0.0.0",
    "server default bind IP",
  );
  await page.getByRole("button", { name: "开始监听", exact: true }).click();
  await page.getByText("监听中", { exact: true }).waitFor();
  await page.locator(".tcp-peer").nth(1).waitFor();
  await page.getByLabel("发送目标").selectOption("2");
  await page.getByLabel("发送内容").fill("00 FF 80 0D 0A");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.locator(".tcp-dir-RX").waitFor();
  check(
    await page.evaluate(() => window.tcpCalls.some((c) => c.join("|") === "send|2|00 FF 80 0D 0A")),
    "selected peer payload",
  );
  await page.getByLabel("发送内容").fill("GG");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Invalid HEX" }).waitFor();
  await page.getByLabel("数据格式").selectOption("text");
  await page.getByLabel("发送内容").fill("中");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.waitForFunction(() => window.tcpCalls.some((c) => c.join("|") === "send|2|e4 b8 ad"));
  await page.getByLabel("记录方向").selectOption("RX");
  await page.getByLabel("筛选记录").fill("00 FF");
  await page.locator(".tcp-log tbody tr").first().waitFor();
  check((await page.locator(".tcp-log tbody tr").count()) === 1, "direction and HEX filter");
  await page.locator(".tcp-log tbody tr button").click();
  await page.getByRole("button", { name: "送入调试", exact: true }).click();
  check(
    (await page.locator("#debug-hex-input").inputValue()) === "00 FF 80 0D 0A",
    "record sent to debug",
  );
  await page.getByRole("button", { name: "通信连接", exact: true }).click();
  check((await page.locator(".tcp-log tbody tr").count()) === 1, "records survive navigation");
  await page.getByLabel("关闭详情").click();
  await page.getByLabel("筛选记录").fill("");
  await page.getByLabel("记录方向").selectOption("all");
  await page.getByLabel("更多操作: 127.0.0.1:51002", { exact: true }).click();
  check((await page.locator("dialog[open]").count()) === 1, "compact peer actions dialog");
  await page.getByRole("button", { name: "断开连接", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".tcp-peer").length === 1);
  await page.screenshot({ path: "out/qa/tcp-light.png" });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await page.screenshot({ path: "out/qa/tcp-dark.png" });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await page.evaluate(() => {
    window.confirm = () => true;
  });
  await page.getByLabel("清空记录", { exact: true }).click();
  await page.getByText("暂无收发记录", { exact: true }).waitFor();
  await page.getByRole("button", { name: "停止监听", exact: true }).click();
  await page.getByText("未连接", { exact: true }).waitFor();
  await page.getByLabel("TCP 模式").selectOption("client");
  check(
    (await page.getByLabel("IP", { exact: true }).inputValue()) === "127.0.0.1",
    "client default remote IP",
  );
  check(errors.length === 0, errors.join("\n"));
  return {
    passed: true,
    coverage:
      "server, peer selection, HEX/UTF-8, validation, RX filter, Debug handoff, navigation persistence, more dialog, clear, stop, client mode",
    screenshots: ["out/qa/tcp-light.png", "out/qa/tcp-dark.png"],
  };
}

// Native tcp_windows smoke covers actual HWNDs, socket traffic and adopted DOM events.
// npx --package @playwright/cli playwright-cli run-code --filename test/web/tcp-sessions.js
async function checkSessions(page) {
  const check = (value, reason) => {
    if (!value) throw new Error(reason);
  };
  await page.addInitScript(() => {
    localStorage.setItem("iotps.locale", "zh-CN");
    localStorage.setItem("iotps.theme", "light");
    const sessions = new Map();
    window.sessionCalls = [];
    window.iotpsTcp = async (id, action, ...args) => {
      window.sessionCalls.push([id, action, ...args]);
      if (action === "create") {
        if (!sessions.has(id))
          sessions.set(id, {
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
          });
        return { ok: true };
      }
      if (action === "destroy") {
        sessions.delete(id);
        return { ok: true };
      }
      const state = sessions.get(id);
      if (!state) return { ok: false, error: { code: "session_not_found", message: "Closed" } };
      if (action === "poll")
        return structuredClone({
          ...state,
          records: state.records.filter((record) => record.id > Number(args[0])),
        });
      if (action === "start")
        Object.assign(state, {
          state: "open",
          server: args[0] === "server",
          host: args[1],
          port: Number(args[2]),
          peers: [{ id: 1, address: "127.0.0.1:9000" }],
        });
      if (action === "stop") Object.assign(state, { state: "closed", peers: [] });
      if (action === "send") {
        state.sent += 2;
        state.records.push({
          id: ++state.cursor,
          time: Date.now(),
          direction: "TX",
          peer: 1,
          address: "127.0.0.1:9000",
          hex: args[1],
          size: 2,
          detail: "",
        });
      }
      if (action === "clear") state.records = [];
      return { ok: true };
    };
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.reload();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "通信连接", exact: true }).click();
  const first = page.locator('[data-session="tcp-1"]');
  await first.getByLabel("TCP 模式").selectOption("server");
  await first.getByRole("button", { name: "开始监听", exact: true }).click();
  await first.getByText("监听中", { exact: true }).waitFor();
  await first.getByLabel("发送内容").fill("AA BB");
  await first.getByRole("button", { name: "发送", exact: true }).click();
  await first.locator(".tcp-dir-TX").waitFor();
  await page.getByLabel("新建通信会话", { exact: true }).click();
  const second = page.locator('[data-session="tcp-2"]');
  check(
    (await second.getByLabel("TCP 模式").inputValue()) === "client",
    "new session is independent",
  );
  await second.getByLabel("发送内容").fill("12 34");
  await second.getByRole("button", { name: "连接", exact: true }).click();
  await second.getByText("已连接", { exact: true }).waitFor();
  await page.getByLabel("会话操作: TCP 2", { exact: true }).click();
  await page.getByLabel("会话名称").fill("客户端");
  await page.getByRole("button", { name: "重命名", exact: true }).click();
  await page.getByLabel("会话操作: 客户端", { exact: true }).click();
  const popupReady = page.waitForEvent("popup");
  await page.getByRole("button", { name: "在独立窗口打开", exact: true }).click();
  const popup = await popupReady;
  await popup.locator('[data-session="tcp-2"] textarea').waitFor();
  check((await popup.getByLabel("发送内容").inputValue()) === "12 34", "detached draft retained");
  await popup.getByRole("button", { name: "发送", exact: true }).click();
  await popup.locator(".tcp-dir-TX").waitFor();
  await page.getByRole("tab", { name: "TCP 1", exact: true }).click();
  check((await first.getByLabel("发送内容").inputValue()) === "AA BB", "server draft retained");
  check((await first.locator(".tcp-dir-TX").count()) === 1, "session logs isolated");
  await page.screenshot({ path: "out/qa/tcp-tabs.png" });
  await popup.screenshot({ path: "out/qa/tcp-window.png" });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await popup.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  await popup.screenshot({ path: "out/qa/tcp-window-dark.png" });
  await popup.getByRole("button", { name: "合并回标签页", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('[data-session="tcp-2"]')?.ownerDocument === document,
  );
  await page.getByRole("tab", { name: "客户端", exact: true }).click();
  check((await second.getByLabel("发送内容").inputValue()) === "12 34", "dock preserves draft");
  check((await second.locator(".tcp-dir-TX").count()) === 1, "dock preserves logs");
  await page.evaluate(() => {
    window.confirm = () => false;
  });
  await page.getByLabel("会话操作: 客户端", { exact: true }).click();
  await page.getByRole("button", { name: "关闭会话", exact: true }).click();
  check(
    (await page.getByRole("tab", { name: "客户端", exact: true }).count()) === 1,
    "cancel preserves session",
  );
  await page.evaluate(() => {
    window.confirm = () => true;
  });
  await page.getByRole("button", { name: "关闭会话", exact: true }).click();
  await page.getByRole("tab", { name: "客户端", exact: true }).waitFor({ state: "detached" });
  check(
    await first.getByText("监听中", { exact: true }).isVisible(),
    "closing client preserves server",
  );
  const calls = await page.evaluate(() =>
    window.sessionCalls.filter((call) => ["start", "send", "destroy"].includes(call[1])),
  );
  check(
    calls.some((c) => c.join("|") === "tcp-1|send|1|AA BB") &&
      calls.some((c) => c.join("|") === "tcp-2|send|1|12 34"),
    "native command IDs routed independently",
  );
  check(errors.length === 0, errors.join("\n"));
  return {
    passed: true,
    coverage:
      "simultaneous tabs, rename, popup send, draft/log isolation, theme sync, dock, close/cancel, remaining server",
  };
}

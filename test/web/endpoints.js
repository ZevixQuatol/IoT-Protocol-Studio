// UI bridge contract. endpoint_test.cpp performs real UDP socket checks.
// rtk proxy npx --package @playwright/cli playwright-cli run-code --filename test/web/endpoints.js
async function checkEndpoints(page) {
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  await page.addInitScript(() => {
    localStorage.setItem("iotps.locale", "zh-CN");
    const sessions = new Map();
    window.endpointCalls = [];
    window.iotpsTcp = async (id, action, ...args) => {
      window.endpointCalls.push([id, action, ...args]);
      if (action === "create" && !sessions.has(id))
        sessions.set(id, {
          ok: true,
          kind: "tcp",
          state: "closed",
          server: false,
          host: "",
          port: 0,
          error: "",
          sent: 0,
          received: 0,
          queued: 0,
          dropped: 0,
          retries: 0,
          protocolPath: "",
          messageName: "",
          cursor: 0,
          peers: [],
          records: [],
        });
      const state = sessions.get(id);
      if (action === "devices")
        return { ok: true, serialDevices: ["COM7", "COM8"], interfaces: ["0.0.0.0", "127.0.0.1"] };
      if (action === "serial" || action === "udp")
        Object.assign(state, {
          kind: action,
          state: "open",
          host: args[0],
          port: action === "udp" ? Number(args[1]) || 51001 : 0,
          multicastJoined: args[4] === "multicast",
          peers: [{ id: 1, address: action === "serial" ? args[0] : `${args[2]}:${args[3]}` }],
        });
      if (action === "poll")
        return structuredClone({
          ...state,
          records: state.records.filter((record) => record.id > Number(args[0])),
        });
      if (action === "export") return structuredClone(state);
      if (action === "membership") state.multicastJoined = args[0] === "join";
      if (action === "stop") Object.assign(state, { state: "closed", peers: [] });
      if (action === "send") {
        const hex = args[1],
          address = state.kind === "udp" ? "127.0.0.1:51099" : "COM7";
        for (const direction of ["TX", "RX", "FRAME"])
          state.records.push({
            id: ++state.cursor,
            time: Date.now(),
            direction,
            peer: direction === "TX" ? 1 : 0,
            address,
            hex,
            size: hex.split(" ").length,
            detail: direction === "FRAME" ? "Complete frame" : "",
          });
        state.sent += 4;
        state.received += 4;
      }
      return { ok: true };
    };
    window.iotpsTrafficFile = async (_action, content) => {
      window.endpointArchive = JSON.parse(content);
      return { ok: true, cancelled: false, content: "" };
    };
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.reload();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.getByRole("button", { name: "通信连接", exact: true }).click();
  await page.getByLabel("TCP 模式").selectOption("serial");
  await page.getByLabel("串口设备", { exact: true }).fill("COM0");
  await page.getByRole("button", { name: "连接", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "串口设备或波特率无效" }).waitFor();
  check(
    await page.evaluate(() => !window.endpointCalls.some((call) => call[1] === "serial")),
    "invalid device blocks native open",
  );
  await page.getByLabel("串口设备", { exact: true }).fill("COM7");
  await page.getByLabel("波特率", { exact: true }).fill("9600");
  await page.getByLabel("数据位", { exact: true }).selectOption("7");
  await page.getByLabel("校验位", { exact: true }).selectOption("even");
  await page.getByLabel("停止位", { exact: true }).selectOption("2");
  await page.getByLabel("流控", { exact: true }).selectOption("hardware");
  await page.getByRole("button", { name: "连接", exact: true }).click();
  await page.getByText("已连接", { exact: true }).waitFor();
  check(
    await page.evaluate(() =>
      window.endpointCalls.some(
        (call) =>
          JSON.stringify(call.slice(1)) ===
          JSON.stringify(["serial", "COM7", "9600", "7", "even", "2", "hardware"]),
      ),
    ),
    "all serial parameters forwarded",
  );
  await page.screenshot({ path: "out/qa/serial.png" });
  await page.getByLabel("发送内容").fill("00 FF 80 0D");
  await page.locator('[data-action="send"]').click();
  await page.waitForFunction(() => document.querySelectorAll(".tcp-log tbody tr").length === 3);
  await page.getByRole("button", { name: "保存 / 导出", exact: true }).click();
  check(
    await page.evaluate(() => window.endpointArchive.records.length === 3),
    "serial records exported through shared archive",
  );
  await page.getByRole("button", { name: "断开", exact: true }).click();
  await page.getByLabel("TCP 模式").selectOption("udp");
  await page.getByLabel("本地 IP", { exact: true }).fill("127.0.0.1");
  await page.getByLabel("本地端口", { exact: true }).fill("0");
  await page.getByLabel("UDP 模式").selectOption("broadcast");
  check(
    (await page.getByLabel("IP", { exact: true }).inputValue()) === "255.255.255.255",
    "broadcast default target",
  );
  await page.getByLabel("UDP 模式").selectOption("multicast");
  await page.getByLabel("组播网卡 IP").selectOption("127.0.0.1");
  await page.getByLabel("本地端口", { exact: true }).fill("9000");
  await page.getByRole("button", { name: "连接", exact: true }).click();
  await page.getByRole("button", { name: "退出组播", exact: true }).waitFor();
  check(
    !(await page.getByText("接收分帧", { exact: true }).isVisible()),
    "UDP hides stream framing",
  );
  check(
    await page.evaluate(() =>
      window.endpointCalls.some(
        (call) =>
          JSON.stringify(call.slice(1)) ===
          JSON.stringify([
            "udp",
            "127.0.0.1",
            "9000",
            "239.255.0.1",
            "9000",
            "multicast",
            "127.0.0.1",
          ]),
      ),
    ),
    "UDP endpoints and interface forwarded",
  );
  await page.getByRole("button", { name: "退出组播", exact: true }).click();
  await page.getByRole("button", { name: "加入组播", exact: true }).click();
  await page.getByRole("button", { name: "退出组播", exact: true }).waitFor();
  await page.locator('[data-action="send"]').click();
  await page.waitForFunction(() => document.querySelectorAll(".tcp-log tbody tr").length === 6);
  await page.getByLabel("记录方向").selectOption("RX");
  await page.getByText("127.0.0.1:51099", { exact: true }).waitFor();
  await page.screenshot({ path: "out/qa/udp-multicast.png" });
  await page.getByRole("button", { name: "保存 / 导出", exact: true }).click();
  check(
    await page.evaluate(() =>
      window.endpointArchive.records.some(
        (record) => record.direction === "RX" && record.address === "127.0.0.1:51099",
      ),
    ),
    "actual UDP sender preserved on export",
  );
  await page.getByRole("button", { name: "断开", exact: true }).click();
  check(errors.length === 0, errors.join("\n"));
  return {
    passed: true,
    coverage:
      "serial parameters, validation, shared send/export, UDP broadcast defaults, datagram framing bypass, multicast interface and join/leave, actual source records",
  };
}

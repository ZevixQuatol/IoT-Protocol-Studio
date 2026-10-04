// UI contract for 4.4–4.6; native codec and TCP socket behavior are covered by CTest.
// npx --package @playwright/cli playwright-cli run-code --filename test/web/variable-send.js
async function checkVariableSend(page) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.addInitScript(() => {
    localStorage.setItem("iotps.locale", "en-US");
    localStorage.setItem("iotps.theme", "light");
    window.activeEnv = "dev";
    window.tcpCalls = [];
    window.encodeCalls = [];
    window.iotpsEnvironments = async () => ({
      ok: true,
      config: {
        active: window.activeEnv,
        environments: [
          {
            name: "dev",
            variables: [
              {
                name: "host",
                type: "string",
                defaultValue: "127.0.0.1",
                required: true,
                sensitive: false,
              },
              {
                name: "port",
                type: "number",
                defaultValue: "9000",
                required: true,
                sensitive: false,
              },
              { name: "id", type: "string", defaultValue: "A", required: true, sensitive: false },
            ],
          },
          {
            name: "prod",
            variables: [
              {
                name: "host",
                type: "string",
                defaultValue: "127.0.0.2",
                required: true,
                sensitive: false,
              },
              {
                name: "port",
                type: "number",
                defaultValue: "9001",
                required: true,
                sensitive: false,
              },
              { name: "id", type: "string", defaultValue: "B", required: true, sensitive: false },
            ],
          },
        ],
      },
    });
    const field = {
      name: "value",
      displayName: "",
      type: "uint16",
      offset: "0",
      length: "2",
      byteOrder: "little",
      byteOrderInherited: true,
      lengthOf: null,
    };
    const project = {
      name: "QA",
      rootPath: "C:/qa",
      folders: [],
      protocols: [
        {
          name: "Wire",
          path: "protocols/wire.yaml",
          content: "# QA",
          schema: {
            version: "0.1",
            protocolVersion: "1.0",
            defaultByteOrder: "little",
            messages: [{ name: "data", displayName: "", fields: [field] }],
          },
        },
      ],
    };
    window.iotpsWorkspaceCurrent = async () => ({
      ok: true,
      source: "native-workspace",
      cancelled: false,
      project: structuredClone(project),
    });
    window.iotpsEncodeProtocolMessage = async (_path, _message, _field, value) => {
      if (window.delayEncode)
        await new Promise((resolve) => {
          window.releaseEncode = resolve;
        });
      window.encodeCalls.push(value);
      const number = Number(value);
      if (!Number.isInteger(number) || number < 0 || number > 65535)
        return {
          ok: false,
          source: "native-core",
          error: { code: "invalid", message: "Invalid value", path: "value" },
        };
      return {
        ok: true,
        source: "native-core",
        normalizedHex:
          `${(number & 255).toString(16).padStart(2, "0")} ${(number >> 8).toString(16).padStart(2, "0")}`.toUpperCase(),
        ascii: "..",
        byteCount: 2,
      };
    };
    window.tcpState = {
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
      retries: 0,
      protocolPath: "",
      messageName: "",
      cursor: 0,
      peers: [],
      records: [],
    };
    window.iotpsTcp = async (_session, action, ...args) => {
      if (action === "poll") return structuredClone(window.tcpState);
      window.tcpCalls.push([action, ...args]);
      if (action === "start")
        Object.assign(window.tcpState, {
          state: "open",
          host: args[1],
          port: Number(args[2]),
          peers: [{ id: 1, address: "peer" }],
        });
      if (action === "stop") Object.assign(window.tcpState, { state: "closed", peers: [] });
      return { ok: true };
    };
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.reload();
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page.getByLabel("IP", { exact: true }).fill("{{host}}");
  await page.getByLabel("Port", { exact: true }).fill("{{port}}");
  await page.getByRole("button", { name: "Check effective address" }).click();
  await page.getByText("127.0.0.1:9000").waitFor();
  await page.getByLabel("Port", { exact: true }).fill("{{missing}}");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("alert").getByText("Undefined variable: missing").waitFor();
  check(
    await page.evaluate(() => !window.tcpCalls.some((call) => call[0] === "start")),
    "undefined connection variable blocks start",
  );
  await page.getByLabel("Port", { exact: true }).fill("{{port}}");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByText("Connected", { exact: true }).waitFor();
  await page.getByLabel("Send target").selectOption("1");
  await page.getByLabel("Data format").selectOption("text");
  await page.getByLabel("Payload", { exact: true }).fill("{{id}}-{{sequence}}");
  await page.getByRole("button", { name: "Check effective value" }).click();
  await page.getByText("Effective value: A-1").waitFor();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForFunction(
    () => window.tcpCalls.filter((call) => call[0] === "send").length === 1,
  );
  await page.getByRole("button", { name: "Check effective value" }).click();
  await page.getByText("Effective value: A-2").waitFor();
  await page.evaluate(() => {
    window.activeEnv = "prod";
  });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  check(
    await page.evaluate(
      () => window.tcpCalls.filter((call) => call[0] === "send")[1][2] === "42 2d 32",
    ),
    "environment switch invalidates checked payload",
  );
  await page.getByLabel("Payload", { exact: true }).fill("{{missing}}");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("alert").getByText("Undefined variable: missing").waitFor();
  check(
    await page.evaluate(() => window.tcpCalls.filter((call) => call[0] === "send").length === 2),
    "undefined payload variable blocks send",
  );
  await page.getByLabel("Payload", { exact: true }).fill("{{sequence}}");
  await page.getByLabel("Send interval").fill("50");
  await page.getByLabel("Repeat count").fill("3");
  await page.getByRole("button", { name: "Timed / batch send" }).click();
  await page.waitForFunction(
    () => window.tcpCalls.filter((call) => call[0] === "send").length === 5,
  );
  check(
    JSON.stringify(
      await page.evaluate(() =>
        window.tcpCalls
          .filter((call) => call[0] === "send")
          .slice(2)
          .map((call) => call[2]),
      ),
    ) === JSON.stringify(["33", "34", "35"]),
    "sequence increments once per queued send",
  );
  await page.getByLabel("Batch payloads").fill("{{id}}-{{sequence}}\n{{timestamp}}");
  await page.getByLabel("Repeat count").fill("2");
  await page.getByRole("button", { name: "Timed / batch send" }).click();
  await page.waitForFunction(
    () => window.tcpCalls.filter((call) => call[0] === "send").length === 9,
  );
  check(
    (
      await page.evaluate(() =>
        window.tcpCalls
          .filter((call) => call[0] === "send")
          .slice(5)
          .map((call) => call[2]),
      )
    ).every((hex) => hex.length > 0),
    "each batch item gets resolved",
  );
  await page.getByLabel("Batch payloads").fill("");
  await page.getByLabel("Repeat count").fill("10");
  await page.getByLabel("Send interval").fill("200");
  await page.getByRole("button", { name: "Timed / batch send" }).click();
  await page.waitForFunction(
    () => window.tcpCalls.filter((call) => call[0] === "send").length >= 10,
  );
  await page.getByRole("button", { name: "Stop sending" }).click();
  const stoppedCount = await page.evaluate(
    () => window.tcpCalls.filter((call) => call[0] === "send").length,
  );
  await page.waitForTimeout(450);
  check(
    (await page.evaluate(() => window.tcpCalls.filter((call) => call[0] === "send").length)) ===
      stoppedCount,
    "stop cancels future sends",
  );
  await page.getByRole("button", { name: "Timed / batch send" }).click();
  await page.waitForFunction(
    (before) => window.tcpCalls.filter((call) => call[0] === "send").length > before,
    stoppedCount,
  );
  await page.evaluate(() => {
    window.tcpState.state = "faulted";
    window.tcpState.peers = [];
  });
  await page.getByRole("button", { name: "Timed / batch send" }).waitFor();
  const faultCount = await page.evaluate(
    () => window.tcpCalls.filter((call) => call[0] === "send").length,
  );
  await page.waitForTimeout(450);
  check(
    (await page.evaluate(() => window.tcpCalls.filter((call) => call[0] === "send").length)) ===
      faultCount,
    "faulted connection cancels future sends",
  );
  await page.evaluate(() => {
    window.tcpState.state = "open";
    window.tcpState.peers = [{ id: 1, address: "peer" }];
  });
  await page.getByText("Connected", { exact: true }).waitFor();
  await page.getByLabel("Payload", { exact: true }).fill("{{random}}");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const randomHex = await page.evaluate(
    () => window.tcpCalls.filter((call) => call[0] === "send").at(-1)[2],
  );
  check(
    Number.parseInt(
      String.fromCharCode(...randomHex.split(" ").map((part) => Number.parseInt(part, 16))),
      10,
    ) <= 65535,
    "random fits uint16",
  );
  const beforeMessageCount = await page.evaluate(
    () => window.tcpCalls.filter((call) => call[0] === "send").length,
  );
  await page.getByRole("button", { name: /协议工作区|Schema/, exact: true }).click();
  await page.getByRole("tab", { name: /报文|Message/, exact: true }).click();
  await page.getByRole("textbox", { name: "Field value: value", exact: true }).fill("{{sequence}}");
  await page.getByRole("button", { name: "Encode message" }).click();
  await page.locator(".message-preview-hex").waitFor();
  const previewSequence = await page.evaluate(() => window.encodeCalls.at(-1));
  await page.getByRole("button", { name: "Open in Connections" }).click();
  await page.getByLabel("Repeat count").fill("2");
  await page.getByRole("button", { name: "Timed / batch send" }).click();
  await page.waitForFunction(() => window.encodeCalls.length >= 3);
  const tail = await page.evaluate(() => window.encodeCalls.slice(-2));
  check(
    previewSequence === "1" && Number(tail[0]) === beforeMessageCount + 1,
    "message preview is a sample and does not consume session sequence",
  );
  check(Number(tail[1]) === Number(tail[0]) + 1, "structured message re-encodes each send");
  const beforeDelayed = await page.evaluate(
    () => window.tcpCalls.filter((call) => call[0] === "send").length,
  );
  await page.evaluate(() => {
    window.delayEncode = true;
  });
  await page.getByRole("button", { name: "Timed / batch send" }).click();
  await page.waitForFunction(() => Boolean(window.releaseEncode));
  await page.getByRole("button", { name: "Stop sending" }).click();
  await page.evaluate(() => {
    window.delayEncode = false;
    window.releaseEncode();
  });
  await page.waitForTimeout(100);
  check(
    (await page.evaluate(() => window.tcpCalls.filter((call) => call[0] === "send").length)) ===
      beforeDelayed,
    "stop during encoding prevents later queue insertion",
  );
  await page.evaluate(() => {
    window.tcpState.queued = 300 * 1024;
  });
  await page.getByRole("button", { name: "Timed / batch send" }).click();
  await page.getByRole("alert").filter({ hasText: "Send queue too large" }).waitFor();
  check(
    (await page.evaluate(() => window.tcpCalls.filter((call) => call[0] === "send").length)) ===
      beforeDelayed,
    "queue bound blocks further enqueue",
  );
  await page.evaluate(() => {
    window.tcpState.queued = 0;
    window.releaseEncode = null;
    window.delayEncode = true;
    window.confirm = () => true;
  });
  await page.getByRole("button", { name: "Timed / batch send" }).click();
  await page.waitForFunction(() => Boolean(window.releaseEncode));
  await page.getByRole("button", { name: "Session actions: TCP 1" }).click();
  await page.getByRole("button", { name: "Close session", exact: true }).click();
  await page.getByRole("tab", { name: "TCP 1", exact: true }).waitFor({ state: "detached" });
  await page.evaluate(() => {
    window.delayEncode = false;
    window.releaseEncode();
  });
  await page.waitForTimeout(100);
  check(
    (await page.evaluate(() => window.tcpCalls.filter((call) => call[0] === "send").length)) ===
      beforeDelayed,
    "session close cancels pending encoding",
  );
  check(errors.length === 0, errors.join("\n"));
  return {
    passed: true,
    coverage:
      "connection and payload variables, environment switch, random/sequence/timestamp, batch, timer stop, queue bound, close during encoding, structured message re-encode",
  };
}

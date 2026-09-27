// npx --package @playwright/cli playwright-cli run-code --filename test/web/environments.js
async function checkEnvironments(page) {
  await page.evaluate(() => localStorage.removeItem("qa.environments"));
  await page.addInitScript(() => {
    localStorage.setItem("iotps.locale", "en-US");
    window.iotpsWorkspaceCurrent = async () => ({
      ok: true,
      source: "native-workspace",
      cancelled: false,
      project: {
        name: "Fixture",
        rootPath: "C:/qa/environments",
        description: "",
        folders: [],
        protocols: [],
      },
    });
    window.iotpsEnvironments = async (...args) => {
      if (args[0] === "save") {
        let index = 3;
        const config = { active: args[1], environments: [] };
        for (let i = 0; i < Number(args[2]); i++) {
          const name = args[index++];
          const count = Number(args[index++]);
          const variables = [];
          for (let j = 0; j < count; j++) {
            variables.push({
              name: args[index++],
              type: args[index++],
              defaultValue: args[index++],
              required: args[index++] === "true",
              sensitive: args[index++] === "true",
            });
          }
          config.environments.push({ name, variables });
        }
        localStorage.setItem("qa.environments", JSON.stringify(config));
      }
      return {
        ok: true,
        config: JSON.parse(
          localStorage.getItem("qa.environments") || '{"active":"","environments":[]}',
        ),
      };
    };
    const tcp = { state: "closed", host: "", port: 0 };
    window.qaDiagnostic = "";
    window.qaExport = "";
    window.qaTrafficExport = "";
    window.qaRecord = null;
    window.iotpsLogFile = async (_action, content) => {
      window.qaExport = content;
      return { ok: true, cancelled: false, content: "" };
    };
    window.iotpsTrafficFile = async (_action, content) => {
      window.qaTrafficExport = content;
      return { ok: true, cancelled: false, content: "" };
    };
    window.qaTcpStarts = [];
    window.iotpsTcp = async (_session, action, ...args) => {
      if (action === "start") {
        tcp.state = "open";
        tcp.host = args[1];
        tcp.port = Number(args[2]);
        window.qaTcpStarts.push([tcp.host, tcp.port]);
      }
      if (action === "stop") tcp.state = "closed";
      if (action === "export")
        return { ok: true, dropped: 0, records: window.qaRecord ? [window.qaRecord] : [] };
      if (action !== "poll") return { ok: true };
      const detail = window.qaDiagnostic;
      window.qaDiagnostic = "";
      window.qaRecord = detail
        ? {
            id: 1,
            time: Date.now(),
            direction: "SYS",
            peer: 0,
            address: "",
            hex: "",
            size: 0,
            detail,
          }
        : window.qaRecord;
      return {
        ok: true,
        state: tcp.state,
        server: false,
        host: tcp.host,
        port: tcp.port,
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
        records: detail ? [window.qaRecord] : [],
      };
    };
  });
  await page.reload();
  await page.getByRole("button", { name: "Environments", exact: true }).click();
  await page.getByRole("textbox", { name: "New environment name" }).fill("Lab A");
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByText("Active environment: Lab A").waitFor();
  await page.getByRole("button", { name: "Add variable" }).click();
  const row = page.locator(".environment-variable").first();
  await row.getByRole("textbox", { name: "Name" }).fill("host");
  await row.getByRole("textbox", { name: "Default value" }).fill("127.0.0.1");
  await row.getByRole("checkbox", { name: "Required" }).check();
  await page.getByRole("button", { name: "Add variable" }).click();
  const secretRow = page.locator(".environment-variable").nth(1);
  await secretRow.getByRole("textbox", { name: "Name" }).fill("token");
  await secretRow.getByRole("textbox", { name: "Default value" }).fill("qa-secret-4.3");
  await secretRow.getByRole("checkbox", { name: "Sensitive" }).check();
  const secretInput = secretRow.getByLabel("Default value");
  if ((await secretInput.getAttribute("type")) !== "password") {
    throw new Error("Sensitive value is visible by default");
  }
  await secretRow.getByRole("button", { name: "Reveal sensitive value" }).click();
  if ((await secretInput.getAttribute("type")) !== "text") {
    throw new Error("Sensitive value did not reveal explicitly");
  }
  await secretRow.getByRole("button", { name: "Hide sensitive value" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("textbox", { name: "New environment name" }).fill("Lab B");
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByRole("combobox", { name: "Active environment" }).selectOption("Lab A");
  await row.getByRole("textbox", { name: "Default value" }).waitFor();
  if ((await row.getByRole("textbox", { name: "Default value" }).inputValue()) !== "127.0.0.1") {
    throw new Error("Variable default was lost when switching environments");
  }
  await page.reload();
  await page.getByRole("button", { name: "Environments", exact: true }).click();
  await page.getByText("Active environment: Lab A").waitFor();
  if ((await page.locator(".environment-variable").count()) !== 2) {
    throw new Error("Saved environment did not reload");
  }
  if (!(await row.getByRole("checkbox", { name: "Required" }).isChecked())) {
    throw new Error("Required setting did not reload");
  }
  if (
    !(await secretRow.getByRole("checkbox", { name: "Sensitive" }).isChecked()) ||
    (await secretRow.getByLabel("Default value").getAttribute("type")) !== "password"
  ) {
    throw new Error("Sensitive value did not reload hidden");
  }
  await page.getByRole("textbox", { name: "Environment name", exact: true }).fill("Lab Alpha");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Environments", exact: true }).click();
  await page.getByText("Active environment: Lab Alpha").waitFor();
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page.getByRole("textbox", { name: "IP", exact: true }).fill("127.0.0.9");
  await page.getByRole("spinbutton", { name: "Port" }).fill("9011");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("textbox", { name: "IP", exact: true }).waitFor({ state: "visible" });
  await page.evaluate(() => {
    window.qaDiagnostic = "error qa-secret-4.3";
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: /error •/ }).waitFor();
  await page.getByRole("button", { name: "Export diagnostic log" }).click();
  const exported = await page.evaluate(() => window.qaExport);
  if (!exported.includes("•") || exported.includes("qa-secret-4.3")) {
    throw new Error("Diagnostic export leaked sensitive value");
  }
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  if ((await page.locator(".tcp-log").textContent()).includes("qa-secret-4.3")) {
    throw new Error("Traffic event displayed sensitive value");
  }
  await page.getByRole("button", { name: "Save / export" }).click();
  await page.waitForFunction(() => !!window.qaTrafficExport);
  const traffic = await page.evaluate(() => window.qaTrafficExport);
  if (!traffic.includes("•") || traffic.includes("qa-secret-4.3")) {
    throw new Error("Traffic export leaked sensitive value");
  }
  const archiveValid = await page.evaluate(async () => {
    const { readTrafficArchive } = await import("/src/trafficFile.ts");
    return readTrafficArchive(window.qaTrafficExport).records.length === 1;
  });
  if (!archiveValid) throw new Error("Redacted traffic export is invalid");
  await page.getByRole("button", { name: "Environments", exact: true }).click();
  await page.getByRole("combobox", { name: "Active environment" }).selectOption("Lab B");
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  const ip = page.getByRole("textbox", { name: "IP", exact: true });
  if ((await ip.inputValue()) !== "127.0.0.9" || !(await ip.isDisabled())) {
    throw new Error("Running connection inputs changed after environment switch");
  }
  const starts = await page.evaluate(() => window.qaTcpStarts);
  if (starts.length !== 1 || starts[0][1] !== 9011) {
    throw new Error("Environment switch restarted the connection");
  }
  return "PASS: sensitive values hide by default, reveal explicitly and redact diagnostics; running TCP remains unchanged";
}

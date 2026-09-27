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
    window.qaTcpStarts = [];
    window.iotpsTcp = async (_session, action, ...args) => {
      if (action === "start") {
        tcp.state = "open";
        tcp.host = args[1];
        tcp.port = Number(args[2]);
        window.qaTcpStarts.push([tcp.host, tcp.port]);
      }
      if (action === "stop") tcp.state = "closed";
      if (action !== "poll") return { ok: true };
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
        records: [],
      };
    };
  });
  await page.reload();
  await page.getByRole("button", { name: "Environments", exact: true }).click();
  await page.getByRole("textbox", { name: "New environment name" }).fill("Lab A");
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByText("Active environment: Lab A").waitFor();
  await page.getByRole("button", { name: "Add variable" }).click();
  const row = page.locator(".environment-variable");
  await row.getByRole("textbox", { name: "Name" }).fill("host");
  await row.getByRole("textbox", { name: "Default value" }).fill("127.0.0.1");
  await row.getByRole("checkbox", { name: "Required" }).check();
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
  if ((await page.locator(".environment-variable").count()) !== 1) {
    throw new Error("Saved environment did not reload");
  }
  if (!(await row.getByRole("checkbox", { name: "Required" }).isChecked())) {
    throw new Error("Required setting did not reload");
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
  return "PASS: required variable persists; environment switch preserves running TCP connection";
}

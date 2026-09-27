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
  await page.getByRole("textbox", { name: "Environment name", exact: true }).fill("Lab Alpha");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Environments", exact: true }).click();
  await page.getByText("Active environment: Lab Alpha").waitFor();
  return "PASS: create, edit, rename, switch and reload environments";
}

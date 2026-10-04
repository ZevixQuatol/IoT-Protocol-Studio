// Presentation/interaction fixture only. Never opens sockets or writes project files.
const parameters = new URLSearchParams(location.search);
localStorage.setItem("iotps.theme-mode", parameters.get("theme") || "dark");
const fixtureProject = (await window.iotpsWorkspaceCurrent()).project;
if (parameters.has("empty"))
  window.iotpsWorkspaceCurrent = async () => ({ ok: true, project: null });
window.iotpsWorkspaceOpen = async () => ({ ok: true, cancelled: false, project: fixtureProject });
let environmentState = parameters.has("blank")
  ? { active: "", environments: [] }
  : {
      active: "Development",
      environments: [
        {
          name: "Development",
          description: "开发环境，用于日常调试",
          variables: [
            {
              name: "deviceId",
              type: "string",
              defaultValue: "A10001",
              required: true,
              sensitive: false,
              description: "设备 ID，示例：A10001",
            },
            {
              name: "sampleInterval",
              type: "number",
              defaultValue: "30",
              required: false,
              sensitive: false,
              description: "采样间隔（秒）",
            },
            {
              name: "enableTelemetry",
              type: "boolean",
              defaultValue: "true",
              required: false,
              sensitive: false,
              description: "启用遥测上报",
            },
            {
              name: "accessToken",
              type: "string",
              defaultValue: "preview-only-value",
              required: true,
              sensitive: true,
              description: "访问令牌（示例）",
            },
          ],
        },
        {
          name: "Lab",
          description: "实验室测试环境",
          variables: [
            {
              name: "deviceId",
              type: "string",
              defaultValue: "B20002",
              required: true,
              sensitive: false,
              description: "实验室设备",
            },
            {
              name: "sampleInterval",
              type: "number",
              defaultValue: "10",
              required: false,
              sensitive: false,
              description: "采样间隔（秒）",
            },
          ],
        },
      ],
    };
window.iotpsEnvironments = async (action, ...args) => {
  if (parameters.has("loadError"))
    return {
      ok: false,
      error: {
        code: "invalid_manifest",
        message: "Fixture: environment file cannot be loaded",
        path: "environments.yaml",
      },
    };
  if (action !== "load") {
    if (parameters.has("saveError"))
      return {
        ok: false,
        error: { code: "io_error", message: "Fixture: save failed", path: "environments.yaml" },
      };
    const metadata = action === "save_v2";
    let index = 2;
    const next = { active: args[0], environments: [] };
    for (let e = 0; e < Number(args[1]); e++) {
      const env = {
        name: args[index++],
        description: metadata ? args[index++] : "",
        variables: [],
      };
      const count = Number(args[index++]);
      for (let v = 0; v < count; v++) {
        env.variables.push({
          name: args[index++],
          type: args[index++],
          defaultValue: args[index++],
          required: args[index++] === "true",
          sensitive: args[index++] === "true",
          description: metadata ? args[index++] : "",
        });
      }
      next.environments.push(env);
    }
    if (index !== args.length) throw new Error("Unexpected fixture argument count");
    environmentState = next;
    console.info("P13 fixture saved", next.active, next.environments.length);
  }
  return { ok: true, config: structuredClone(environmentState) };
};
const navigate = setInterval(() => {
  const button = [...document.querySelectorAll("button")].find((item) =>
    ["环境与变量", "Environments and variables"].includes(item.getAttribute("aria-label")),
  );
  if (button) {
    clearInterval(navigate);
    button.click();
  }
}, 80);

// Browser verification only. Production records and matching remain owned by Core.
const query = new URLSearchParams(location.search);
localStorage.setItem("iotps.locale", query.get("locale") || "zh-CN");
localStorage.setItem("iotps.theme", query.get("theme") || "dark");
const protocol = "protocols/SensorLink/sensorlink.yaml";
const base = new Date("2026-10-04T14:35:00+08:00").getTime();
const records = [],
  rows = [];
function packet(flow, sequence, seconds, device = "0x0123", status = "ok") {
  const response = flow === "RX";
  const hex =
    `55 AA ${response ? "02" : "01"} 00 ${sequence.toString(16).padStart(2, "0")} 01 23 ${response ? "00 07 00 00 00 41 00 CC 4C 42 4F 5A" : "A7"}`.toUpperCase();
  const record = {
    id: records.length + 1,
    time: base + seconds,
    direction: "FRAME",
    flow,
    peer: device === "0x0123" ? 1 : 2,
    address: "preview-endpoint",
    device,
    hex,
    size: hex.split(" ").length,
    detail: "",
    parsed: {
      protocolPath: protocol,
      messageName: response ? "StatusReply" : "ReadStatus",
      status,
      checksum: "pass",
      error: status === "ok" ? "" : "Invalid frame",
      fields: [
        { name: "header", type: "uint16", value: "0x55AA", offset: 0, length: 2 },
        {
          name: "messageId",
          type: "uint8",
          value: response ? "0x02" : "0x01",
          offset: 2,
          length: 1,
        },
        {
          name: "sequence",
          type: "uint16",
          value: `0x${sequence.toString(16).padStart(4, "0")}`,
          offset: 3,
          length: 2,
        },
        { name: "deviceId", type: "uint16", value: device, offset: 5, length: 2 },
        ...(response
          ? [{ name: "temperature", type: "float32", value: "25.7", offset: 7, length: 4 }]
          : []),
      ].map((field) => ({ ...field, displayName: field.name })),
    },
  };
  if (status !== "ok") record.parsed.fields = [];
  records.push(record);
  return record.id;
}
for (let i = 0; i < 10; i++) {
  const state = [
    "matched",
    "matched",
    "matched",
    "timeout",
    "matched",
    "duplicate",
    "unmatched",
    "late",
    "ambiguous",
    "skipped",
  ][i];
  const seq = i + 1,
    device = i > 7 ? "0x0456" : "0x0123";
  const request =
    state === "unmatched" || state === "ambiguous"
      ? 0
      : packet("TX", seq, 1000 + i * 5000, device, state === "skipped" ? "error" : "ok");
  const elapsed = state === "late" ? 3119 : [36, 39, 44, 0, 96, 94, 0, 3119, 0, 0][i];
  const response = ["timeout", "skipped"].includes(state)
    ? 0
    : packet("RX", seq, 1000 + i * 5000 + elapsed, device);
  rows.push({
    request,
    response,
    state,
    elapsed,
    reason: {
      matched: "Matching field and scope within timeout",
      timeout: "No unique response within timeout",
      duplicate: "Request already has a response",
      unmatched: "No matching request in retained records",
      late: "Response arrived after timeout",
      ambiguous: "Multiple retained requests share the key",
      skipped: "Frame is invalid or correlation field is missing/truncated",
    }[state],
  });
}
const rule = {
  protocol,
  requestMessage: "ReadStatus",
  responseMessage: "StatusReply",
  requestField: "sequence",
  responseField: "sequence",
  requestFlow: "TX",
  scope: "connection",
  timeout: 3000,
};
const project = {
  name: "Smart Sensor Demo",
  rootPath: "Preview",
  description: "P11 browser fixture",
  folders: [],
  protocols: [
    {
      name: "SensorLink",
      path: protocol,
      content: "",
      schema: {
        version: "0.1",
        protocolVersion: "1.0",
        defaultByteOrder: "big",
        messageTypeField: "messageId",
        messages: ["ReadStatus", "StatusReply"].map((name) => ({
          name,
          displayName: name,
          fields: records.find((r) => r.parsed.messageName === name).parsed.fields,
        })),
      },
    },
  ],
};
window.iotpsWorkspaceCurrent = async () => ({
  ok: true,
  source: "browser-preview",
  cancelled: false,
  project,
});
window.iotpsEnvironments = async () => ({
  ok: true,
  config: { active: "Default", environments: [{ name: "Default", variables: [] }] },
});
window.analysisCalls = [];
window.iotpsTcp = async (session, action, ...args) => {
  window.analysisCalls.push([session, action, ...args]);
  if (action === "poll" || action === "export")
    return {
      ok: true,
      kind: "tcp",
      state: "open",
      server: false,
      host: "preview-endpoint",
      port: 9000,
      error: "",
      sent: 80,
      received: 160,
      queued: 0,
      dropped: 2,
      retries: 0,
      protocolPath: protocol,
      messageName: "",
      cursor: records.length,
      peers: [{ id: 1, address: "preview-endpoint" }],
      records: action === "export" || args[0] === "0" ? records : [],
    };
  if (action === "devices") return { ok: true, serialDevices: [], interfaces: [] };
  return { ok: true };
};
window.analysisValidation = [];
window.iotpsCorrelate = async (...args) => {
  window.analysisValidation.push(args);
  if (args[3] === "invalid")
    return {
      ok: false,
      error: { code: "invalid_configuration", message: "Invalid correlation field" },
    };
  if (args[9] === "0" && window.holdValidation)
    return new Promise((resolve) => {
      window.releaseValidation = () => resolve({ ok: true, rows: [] });
    });
  if (args[9] === "0") return { ok: true, rows: [] };
  return { ok: true, rows: records.length ? structuredClone(rows) : [] };
};
window.iotpsTrafficFile = async (action, content) => {
  if (action === "save") {
    window.savedAnalysis = JSON.parse(content);
    return { ok: true, cancelled: false, content: "" };
  }
  return {
    ok: true,
    cancelled: false,
    content: JSON.stringify({
      format: "iotps-traffic-v1",
      session: "preview",
      savedAt: new Date(base + 60000).toISOString(),
      dropped: 2,
      records,
      correlation: rule,
    }),
  };
};
window.analysisFixture = { records, rows, rule };

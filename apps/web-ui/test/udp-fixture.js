// Browser-only P10 fixture. No real sockets, devices or project writes.
const options = new URLSearchParams(location.search);
localStorage.setItem("iotps.locale", options.get("locale") || "zh-CN");
localStorage.setItem("iotps.theme", options.get("theme") || "dark");
const path = "protocols/SensorLink/sensorlink.yaml";
const fields = [
  ["header", "uint16", "0x55AA", 0, 2],
  ["messageId", "uint8", "0x02", 2, 1],
  ["length", "uint16", "19", 3, 2],
  ["sequence", "uint16", "0x0001", 5, 2],
  ["deviceId", "uint16", "0x0123", 7, 2],
  ["temperature", "float32", "25.7", 9, 4],
  ["flags", "uint32", "0x00000004", 13, 4],
  ["crc", "uint16", "0x4F2A", 17, 2],
].map(([name, type, value, offset, length]) => ({
  name,
  displayName: name,
  type,
  value,
  offset,
  length,
}));
const request = "55 AA 01 00 04 00 01 03";
const reply = "55 AA 02 00 13 00 01 01 23 41 CD 99 9A 00 00 00 04 2A 4F";
const protocol = {
  name: "SensorLink",
  path,
  content: "",
  schema: {
    version: "0.1",
    protocolVersion: "1.0",
    defaultByteOrder: "big",
    messageTypeField: "messageId",
    messages: [
      { name: "ReadStatus", displayName: "ReadStatus", fields: [] },
      {
        name: "StatusReply",
        displayName: "StatusReply",
        fields: fields.map((item) => ({
          ...item,
          offset: String(item.offset),
          length: String(item.length),
          byteOrder: "big",
          byteOrderInherited: true,
        })),
      },
    ],
  },
};
const project = {
  name: "UDP Preview",
  rootPath: "D:\\Preview\\UDP",
  description: "P10 browser verification fixture",
  folders: [],
  protocols: [protocol],
};
window.iotpsWorkspaceCurrent = async () => ({
  ok: true,
  source: "native-workspace",
  cancelled: false,
  project,
});
window.iotpsCoreInfo = async () => ({
  product: "IoT Protocol Studio",
  version: "0.1.0",
  platform: "Windows",
  architecture: "x86_64",
  source: "browser-preview",
});
window.previewCalls = [];
const sessions = new Map();
const fail = (message) => ({ ok: false, error: { code: "preview_failure", message } });
window.iotpsTcp = async (id, action, ...args) => {
  window.previewCalls.push([id, action, ...args]);
  if (action === "create") {
    if (!sessions.has(id))
      sessions.set(id, {
        ok: true,
        kind: "udp",
        state: "closed",
        server: false,
        host: "0.0.0.0",
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
        multicastJoined: false,
      });
    return { ok: true };
  }
  if (action === "devices")
    return {
      ok: true,
      serialDevices: ["COM3"],
      interfaces: ["0.0.0.0", "192.168.1.50", "127.0.0.1"],
    };
  const state = sessions.get(id);
  if (!state) return fail("Unknown fixture session");
  if (action === "poll")
    return structuredClone({
      ...state,
      records: state.records.filter((item) => item.id > Number(args[0])),
    });
  if (action === "udp") {
    if (options.has("failure")) return fail("UDP bind failed: address in use");
    state.state = "open";
    state.kind = "udp";
    state.host = args[0];
    state.port = Number(args[1]) || 54321;
    state.peers = [{ id: 1, address: `${args[2]}:${args[3]}` }];
    state.multicastJoined = args[4] === "multicast";
    const now = Date.now() - 8000;
    if (!options.has("empty")) {
      state.records.push({
        id: ++state.cursor,
        time: now,
        direction: "SYS",
        peer: 0,
        address: "",
        hex: "",
        size: 0,
        detail: `UDP 已打开 (${args[4]})`,
      });
      for (let index = 0; index < 6; index++) {
        const tx = index % 2 === 0;
        state.records.push({
          id: ++state.cursor,
          time: now + index * 900 + 400,
          direction: "FRAME",
          flow: tx ? "TX" : "RX",
          peer: 0,
          address: tx ? state.peers[0].address : "192.168.1.100:9001",
          hex: tx ? request : reply,
          size: tx ? 8 : 19,
          detail: "",
          parsed: {
            protocolPath: path,
            messageName: tx ? "ReadStatus" : "StatusReply",
            status: "ok",
            checksum: "pass",
            error: "",
            fields: tx
              ? fields.slice(0, 4).map((field) => ({
                  ...field,
                  value:
                    field.name === "length"
                      ? "4"
                      : field.name === "messageId"
                        ? "0x01"
                        : field.value,
                }))
              : fields,
          },
        });
      }
    }
  }
  if (action === "stop") {
    state.state = "closed";
    state.peers = [];
    state.multicastJoined = false;
  }
  if (action === "membership") {
    if (options.has("membershipFailure")) return fail("UDP membership failed");
    state.multicastJoined = args[0] === "join";
  }
  if (action === "bind") {
    state.protocolPath = args[0] === "off" ? "" : args[0];
    state.messageName = args[1] || "";
  }
  if (action === "send") {
    if (options.has("sendFailure")) return fail("UDP send failed");
    state.sent += args[1].split(/\s+/).length;
    state.records.push({
      id: ++state.cursor,
      time: Date.now(),
      direction: "TX",
      peer: 1,
      address: state.peers[0].address,
      hex: args[1],
      size: args[1].split(/\s+/).length,
      detail: "",
    });
  }
  if (action === "clear") state.records = [];
  if (action === "destroy") sessions.delete(id);
  return { ok: true };
};
window.iotpsCorrelate = async () => ({ ok: true, rows: [] });
window.iotpsMessageTemplates = async (action, protocol, message, name) => ({
  ok: true,
  templates:
    message === "ReadStatus" ? [{ name: "ReadStatus 默认请求", compatible: true, fields: [] }] : [],
});
window.iotpsEncodeProtocolMessage = async () => ({
  ok: true,
  source: "browser-preview",
  normalizedHex: request,
  ascii: "U.......",
  byteCount: 8,
});
window.iotpsTrafficFile = async (action, content) => ({
  ok: true,
  cancelled: false,
  content:
    action === "open"
      ? JSON.stringify({
          format: "iotps-traffic-v1",
          session: "offline",
          savedAt: new Date().toISOString(),
          dropped: 0,
          records: sessions.get("tcp-1")?.records ?? [],
        })
      : "",
});

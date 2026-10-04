// Development-only P09 fixture; never imported by the production entry.
const query = new URLSearchParams(location.search);
let failure = query.get("state") === "occupied";
let state = "closed";
let error = "";
let bound = "";
let records = [];
let sent = 0;
let received = 0;
const packet = "55 AA 81 0E 00 01 00 23 01 00 00 00 A0 CD 41 04 00 00 00 2B 79";
const fields = [
  ["header", "bytes[2]", "55 AA", 0, 2],
  ["messageId", "uint8", "0x81", 2, 1],
  ["length", "uint16", "14", 3, 2],
  ["sequence", "uint16", "1", 5, 2],
  ["deviceId", "uint32", "291", 7, 4],
  ["temperature", "float32", "25.7", 11, 4],
  ["flags", "uint32", "4", 15, 4],
  ["crc", "uint16", "0x792B", 19, 2],
].map(([name, type, value, offset, length]) => ({
  name,
  displayName: name,
  type,
  value,
  offset,
  length,
}));
const add = (direction, hex = "", detail = "", parsed) => {
  records.push({
    id: (records.at(-1)?.id ?? 0) + 1,
    time: Date.now(),
    direction,
    flow: direction === "FRAME" ? "RX" : undefined,
    peer: hex ? 1 : 0,
    address: "COM3",
    hex,
    size: hex ? hex.split(" ").length : 0,
    detail,
    parsed,
  });
};
const sample = () => {
  add("SYS", "", "串口已打开 (COM3, 115200, 8-N-1)");
  for (let index = 0; index < 4; index++) {
    add("TX", "55 AA 01 00 04 00 01 03");
    add("FRAME", packet, "", {
      protocolPath: "protocols/sensorlink.yaml",
      messageName: "StatusReply",
      status: "ok",
      checksum: "pass",
      error: "",
      fields,
    });
  }
  sent += 32;
  received += 84;
};
window.p09Calls = [];
window.p09Errors = [];
window.addEventListener("error", (event) => window.p09Errors.push(event.message));
window.addEventListener("unhandledrejection", (event) =>
  window.p09Errors.push(String(event.reason)),
);
window.p09Disconnect = () => {
  state = "faulted";
  error = "Serial read failed: 1167";
  add("SYS", "", "串口连接已中断：设备未连接");
};
window.p09AllowOpen = () => {
  failure = false;
};
window.iotpsTcp = async (session, action, ...args) => {
  if (action !== "poll") window.p09Calls.push([session, action, ...args]);
  if (action === "devices") return { ok: true, serialDevices: ["COM3", "COM5"], interfaces: [] };
  if (action === "serial") {
    if (failure) {
      state = "faulted";
      error = "Serial open failed (occupied, absent or unplugged): 5";
    } else {
      state = "open";
      error = "";
      sample();
    }
  }
  if (action === "stop") {
    state = "closed";
    error = "";
  }
  if (action === "bind") bound = args[0] === "off" ? "" : args[0];
  if (action === "clear") records = [];
  if (action === "send") {
    if (state !== "open")
      return { ok: false, error: { code: "closed", message: "Serial port closed" } };
    add("TX", args[1]);
    sent += args[1].trim().split(/\s+/).length;
  }
  if (action === "poll" || action === "export")
    return {
      ok: true,
      kind: "serial",
      state,
      server: false,
      host: "COM3",
      port: 0,
      error,
      sent,
      received,
      queued: 0,
      dropped: 0,
      retries: 0,
      protocolPath: bound,
      messageName: "",
      cursor: records.at(-1)?.id ?? 0,
      peers: state === "open" ? [{ id: 1, address: "COM3" }] : [],
      records:
        action === "export"
          ? records
          : records.filter((record) => record.id > Number(args[0] ?? 0)),
    };
  return { ok: true };
};
window.iotpsTrafficFile = async (action, content) => {
  window.p09Calls.push(["archive", action, content]);
  return { ok: true, cancelled: false, content: "" };
};

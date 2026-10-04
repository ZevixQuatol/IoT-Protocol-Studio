// Browser-only P08 visual fixture. Production always uses the native transport bridge.
const now = Date.now() - 15000;
const peers = [1, 2, 3].map((id) => ({ id, address: `192.168.0.${99 + id}:${52340 + id}` }));
const withCrc = (prefix) => {
  let crc = 0xffff;
  for (const byte of prefix.split(" ")) {
    crc ^= Number.parseInt(byte, 16);
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  const hex = (value) => value.toString(16).padStart(2, "0").toUpperCase();
  return {
    hex: `${prefix} ${hex(crc & 0xff)} ${hex(crc >>> 8)}`,
    crc: `0x${crc.toString(16).padStart(4, "0").toUpperCase()}`,
  };
};
const requestFrame = withCrc("55 AA 00 00 10 00 01 00 00 00 01 00 00 00");
const responseFrame = withCrc("55 AA 01 00 01 00 00 00 10 01 05 03 03 01 02 03");
const request = requestFrame.hex;
const response = responseFrame.hex;
const field = (name, type, value, offset, length) => ({
  name,
  displayName: name,
  type,
  value,
  offset,
  length,
});
const fields = [
  field("header", "u8[2]", "55 AA", 0, 2),
  field("msgType", "u8", "0x01", 2, 1),
  field("sequence", "u16", "0x0001", 3, 2),
  field("deviceId", "u32", "0x00000010", 5, 4),
  field("temperature", "i16", "26.1 °C", 9, 2),
  field("flags", "u8", "0x03", 11, 1),
  field("payloadLength", "u8", "3", 12, 1),
  field("payload", "u8[3]", "01 02 03", 13, 3),
  field("crc", "u16LE", responseFrame.crc, 16, 2),
];
let records = [
  {
    id: 1,
    time: now,
    direction: "SYS",
    peer: 1,
    address: peers[0].address,
    hex: "",
    size: 0,
    detail: "客户端已连接",
  },
];
for (let index = 0; index < 9; index++) {
  const peer = peers[Math.floor(index / 2) % 3];
  const tx = index % 2 === 1;
  const hex = tx ? response : request;
  records.push({
    id: records.length + 1,
    time: now + 500 + index * 950,
    direction: tx ? "TX" : "FRAME",
    flow: tx ? "TX" : "RX",
    peer: peer.id,
    address: peer.address,
    hex,
    size: hex.split(" ").length,
    detail: "",
    parsed: {
      protocolPath: "protocols/SensorLink/sensorlink.yaml",
      messageName: tx ? "StatusReply" : "ReadStatus",
      status: "ok",
      checksum: "pass",
      error: "",
      fields: tx
        ? fields
        : [
            field("header", "u8[2]", "55 AA", 0, 2),
            field("msgType", "u8", "0x00", 2, 1),
            field("length", "u16", "0x0010", 3, 2),
            field("sequence", "u16", "0x0001", 5, 2),
            field("deviceId", "u32", "0x00000001", 7, 4),
            field("reserved", "u16", "0x0000", 11, 2),
            field("crc", "u16LE", requestFrame.crc, 14, 2),
          ],
    },
  });
}
records.push({
  id: 11,
  time: now + 12000,
  direction: "SYS",
  peer: 4,
  address: "192.168.0.104:52344",
  hex: "",
  size: 0,
  detail: "客户端已断开连接",
});
let open = false;
let currentPeers = [...peers];
window.p08Calls = [];
window.iotpsTcp = async (session, action, ...args) => {
  if (action !== "poll") window.p08Calls.push([session, action, ...args]);
  if (action === "start") {
    open = true;
    currentPeers = new URLSearchParams(location.search).has("empty") ? [] : [...peers];
  }
  if (action === "stop") {
    open = false;
    currentPeers = [];
  }
  if (action === "disconnect")
    currentPeers = currentPeers.filter((peer) => String(peer.id) !== args[0]);
  if (action === "clear") records = [];
  if (action === "send") {
    const peer = currentPeers.find((peer) => String(peer.id) === args[0]);
    if (!peer) return { ok: false, error: { code: "peer_closed", message: "Client disconnected" } };
    records.push({
      id: Math.max(0, ...records.map((item) => item.id)) + 1,
      time: Date.now(),
      direction: "TX",
      peer: peer.id,
      address: peer.address,
      hex: args[1],
      size: args[1].trim().split(/\s+/).length,
      detail: "",
    });
  }
  if (action === "poll")
    return {
      ok: true,
      state: open ? "open" : "closed",
      server: open,
      host: "0.0.0.0",
      port: 9000,
      error: "",
      sent: 234,
      received: 256,
      queued: 0,
      dropped: 0,
      retries: 0,
      protocolPath: "",
      messageName: "",
      cursor: open ? (records.at(-1)?.id ?? 0) : 0,
      peers: open ? currentPeers : [],
      records:
        open && !new URLSearchParams(location.search).has("empty")
          ? records.filter((record) => record.id > Number(args[0] ?? 0))
          : [],
    };
  return { ok: true };
};
window.p08Errors = [];
window.addEventListener("error", (event) => window.p08Errors.push(event.message));
window.addEventListener("unhandledrejection", (event) =>
  window.p08Errors.push(String(event.reason)),
);

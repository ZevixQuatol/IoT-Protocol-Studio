// P12 browser fixture: no real file, network or device operations.
const p12Base = new Date("2024-12-18T14:35:21+08:00").getTime();
const p12Records = [];
const p12Protocol = "protocols/SensorLink/sensorlink.yaml";
for (let index = 0; index < 40; index++) {
  const flow = index % 2 ? "RX" : "TX";
  const hex =
    flow === "RX"
      ? "55 AA 02 00 01 23 00 1A 00 96 01 00 00 00 00 41 7C 30"
      : "55 AA 01 00 01 23 00 A7";
  const raw = {
    id: p12Records.length + 1,
    time: p12Base + index * 200,
    direction: flow,
    peer: 1,
    address: "192.168.1.50:9000",
    device: "0x0123",
    hex,
    size: hex.split(" ").length,
    detail: "",
  };
  p12Records.push(raw);
  p12Records.push({
    ...raw,
    id: p12Records.length + 1,
    direction: "FRAME",
    flow,
    parsed: {
      protocolPath: p12Protocol,
      messageName: flow === "RX" ? "StatusReply (0x02)" : "ReadStatus (0x01)",
      status: index === 23 ? "error" : "ok",
      checksum: index === 23 ? "fail" : "pass",
      error: index === 23 ? "CRC 校验失败" : "",
      fields:
        index === 23
          ? []
          : [
              {
                name: "header",
                displayName: "帧头",
                type: "uint16",
                value: "0x55AA",
                offset: 0,
                length: 2,
              },
              {
                name: "messageId",
                displayName: "消息类型",
                type: "uint8",
                value: flow === "RX" ? "0x02" : "0x01",
                offset: 2,
                length: 1,
              },
              {
                name: "deviceId",
                displayName: "设备标识",
                type: "uint16",
                value: "0x0123 (291)",
                offset: 5,
                length: 2,
              },
              ...(flow === "RX"
                ? [
                    {
                      name: "temperature",
                      displayName: "温度",
                      type: "float32",
                      value: "25.7",
                      offset: 8,
                      length: 4,
                    },
                  ]
                : []),
            ],
    },
  });
}
const p12Archive = {
  format: "iotps-traffic-v1",
  session: "Sensor TCP",
  savedAt: new Date(p12Base + 8500).toISOString(),
  dropped: 0,
  records: p12Records,
};
const priorTcp = window.iotpsTcp;
window.p12Calls = [];
window.iotpsTcp = async (session, action, ...args) => {
  if (action !== "poll") window.p12Calls.push([session, action, ...args]);
  if (action === "send") console.info("P12 fixture send", args[0], args[1]);
  if (action === "export") return { ok: true, records: structuredClone(p12Records), dropped: 0 };
  return priorTcp(session, action, ...args);
};
window.iotpsTrafficFile = async (action, content) => {
  window.p12Calls.push(["file", action]);
  if (action === "save") {
    window.p12Saved = JSON.parse(content);
    return { ok: true, cancelled: false, content: "" };
  }
  if (new URLSearchParams(location.search).has("badArchive"))
    return { ok: true, cancelled: false, content: "invalid" };
  return {
    ok: true,
    cancelled: false,
    path: "D:/captures/sensor_20241218.iottraffic.json",
    size: 58432,
    content: JSON.stringify(p12Archive),
  };
};
window.iotpsPcapFile = async (session, localIpv4) => {
  window.p12Calls.push(["pcap", session, localIpv4]);
  if (new URLSearchParams(location.search).has("badPcap"))
    return { ok: false, error: { code: "invalid_pcap", message: "Invalid PCAP magic" } };
  const records = structuredClone(p12Records);
  records.push({
    id: 81,
    time: p12Base + 8300,
    direction: "SYS",
    peer: 0,
    address: "",
    hex: "",
    size: 0,
    detail: "unsupported EtherType 34525 (IPv4 only)",
  });
  records.push({
    id: 82,
    time: p12Base + 8500,
    direction: "SYS",
    peer: 0,
    address: "",
    hex: "",
    size: 0,
    detail:
      "PCAP offline import: 43 packet(s), 3 issue(s) (unsupported=2; truncated=1; ); latest 100 diagnostics retained; classic Ethernet/VLAN IPv4 TCP/UDP; transport checksums not verified; no packets sent",
  });
  return {
    ok: true,
    cancelled: false,
    path: "D:/captures/sensor_20241218.pcap",
    size: 23556,
    content: JSON.stringify({ time: p12Base + 8500, dropped: 0, records }),
  };
};

// A direct review link opens the history screen through its normal UI controls.
if (new URLSearchParams(location.search).has("history")) {
  let attempts = 0;
  let entered = false;
  let imported = false;
  const timer = window.setInterval(() => {
    if (++attempts > 200) return window.clearInterval(timer);
    const buttons = Array.from(document.querySelectorAll("button"));
    if (!entered) {
      const connection = buttons.find((button) => button.getAttribute("aria-label") === "通信连接");
      if (connection && document.querySelector("#project-manager-title")) {
        connection.click();
        entered = true;
      }
    } else if (!imported) {
      const open = buttons.find((button) => button.textContent.trim() === "导入");
      if (open) {
        open.click();
        imported = true;
      }
    } else {
      const record = buttons.find((button) => button.getAttribute("aria-label") === "查看记录 #4");
      if (record) {
        record.click();
        window.clearInterval(timer);
      }
    }
  }, 100);
}

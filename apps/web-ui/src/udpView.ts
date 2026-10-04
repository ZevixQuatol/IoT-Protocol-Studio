import type { TcpRecord } from "./bridge";
import type { UdpEndpoints } from "./UdpRecordDetail";

export function udpEndpoint(host: string, port: number | string) {
  return `${host.includes(":") ? `[${host}]` : host}:${port}`;
}

export function udpEndpoints(record: TcpRecord | null, local = ""): UdpEndpoints {
  if (!record || record.direction === "SYS") return { source: "—", target: "—" };
  const tx = record.direction === "TX" || (record.direction === "FRAME" && record.flow === "TX");
  return {
    source: tx ? local || "—" : record.address || "—",
    target: tx ? record.address || "—" : local || "—",
  };
}

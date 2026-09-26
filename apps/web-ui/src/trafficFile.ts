import type { TcpRecord } from "./bridge";

export type TrafficArchive = {
  format: "iotps-traffic-v1";
  session: string;
  savedAt: string;
  dropped: number;
  records: TcpRecord[];
};

export function readTrafficArchive(content: string): TrafficArchive {
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== "object") throw new Error("Invalid traffic archive");
  const archive = value as Partial<TrafficArchive>;
  if (
    archive.format !== "iotps-traffic-v1" ||
    typeof archive.session !== "string" ||
    archive.session.length > 64 ||
    typeof archive.savedAt !== "string" ||
    !Number.isFinite(Date.parse(archive.savedAt)) ||
    !Number.isSafeInteger(archive.dropped) ||
    archive.dropped! < 0 ||
    !Array.isArray(archive.records) ||
    archive.records.length > 1000
  )
    throw new Error("Invalid traffic archive");
  let bytes = 0;
  for (const item of archive.records) {
    if (
      !item ||
      !Number.isSafeInteger(item.id) ||
      item.id <= 0 ||
      !Number.isSafeInteger(item.time) ||
      item.time < 0 ||
      !["TX", "RX", "FRAME", "SYS"].includes(item.direction) ||
      !Number.isSafeInteger(item.peer) ||
      item.peer < 0 ||
      typeof item.address !== "string" ||
      item.address.length > 256 ||
      typeof item.detail !== "string" ||
      item.detail.length > 4096 ||
      typeof item.hex !== "string" ||
      !/^(?:[0-9a-fA-F]{2}(?: [0-9a-fA-F]{2})*)?$/.test(item.hex) ||
      !Number.isSafeInteger(item.size) ||
      item.size !== (item.hex ? (item.hex.length + 1) / 3 : 0)
    )
      throw new Error("Invalid traffic archive record");
    bytes += item.size;
  }
  if (bytes > 4 * 1024 * 1024) throw new Error("Traffic archive exceeds 4 MiB");
  return archive as TrafficArchive;
}

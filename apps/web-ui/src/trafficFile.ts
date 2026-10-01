import type { CorrelationRule, TcpRecord } from "./bridge";

export type TrafficArchive = {
  format: "iotps-traffic-v1";
  session: string;
  savedAt: string;
  dropped: number;
  records: TcpRecord[];
  correlation?: CorrelationRule;
};

export function readTrafficArchive(content: string): TrafficArchive {
  if (content.length > 16 * 1024 * 1024) throw new Error("Traffic archive exceeds 16 MiB");
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
  if (archive.correlation !== undefined) {
    const rule = archive.correlation;
    if (
      !rule ||
      typeof rule !== "object" ||
      [
        rule.protocol,
        rule.requestMessage,
        rule.responseMessage,
        rule.requestField,
        rule.responseField,
      ].some(
        (value, index) =>
          typeof value !== "string" ||
          !value.trim() ||
          new TextEncoder().encode(value).length > (index === 0 ? 1024 : 256) ||
          /[\u0000-\u001f\u007f]/.test(value),
      ) ||
      !["TX", "RX"].includes(rule.requestFlow) ||
      !["connection", "session"].includes(rule.scope) ||
      !Number.isSafeInteger(rule.timeout) ||
      rule.timeout < 1 ||
      rule.timeout > 3600000
    )
      throw new Error("Invalid traffic correlation rule");
  }
  let previousId = 0;
  for (const item of archive.records) {
    if (
      !item ||
      !Number.isSafeInteger(item.id) ||
      item.id <= previousId ||
      !Number.isSafeInteger(item.time) ||
      item.time < 0 ||
      !["TX", "RX", "FRAME", "SYS"].includes(item.direction) ||
      (item.flow !== undefined &&
        (item.direction !== "FRAME" || !["TX", "RX"].includes(item.flow))) ||
      !Number.isSafeInteger(item.peer) ||
      item.peer < 0 ||
      typeof item.address !== "string" ||
      item.address.length > 256 ||
      typeof item.detail !== "string" ||
      item.detail.length > 4096 ||
      (item.device !== undefined &&
        (typeof item.device !== "string" ||
          new TextEncoder().encode(item.device).length > 512 ||
          /[\u0000-\u001f\u007f]/.test(item.device))) ||
      typeof item.hex !== "string" ||
      !/^(?:[0-9a-fA-F]{2}(?: [0-9a-fA-F]{2})*)?$/.test(item.hex) ||
      !Number.isSafeInteger(item.size) ||
      item.size !== (item.hex ? (item.hex.length + 1) / 3 : 0)
    )
      throw new Error("Invalid traffic archive record");
    bytes += item.size;
    previousId = item.id;
    if (item.parsed !== undefined) {
      const parsed = item.parsed;
      if (
        item.direction !== "FRAME" ||
        !parsed ||
        typeof parsed !== "object" ||
        typeof parsed.protocolPath !== "string" ||
        parsed.protocolPath.length > 1024 ||
        typeof parsed.messageName !== "string" ||
        parsed.messageName.length > 256 ||
        !["ok", "error", "unmatched"].includes(parsed.status) ||
        !["", "none", "pass", "fail"].includes(parsed.checksum) ||
        typeof parsed.error !== "string" ||
        parsed.error.length > 4096 ||
        !Array.isArray(parsed.fields) ||
        parsed.fields.length > 1000 ||
        (parsed.status !== "ok" && parsed.fields.length > 0) ||
        parsed.fields.some(
          (field) =>
            !field ||
            typeof field.name !== "string" ||
            field.name.length > 256 ||
            typeof field.displayName !== "string" ||
            field.displayName.length > 256 ||
            typeof field.type !== "string" ||
            field.type.length > 64 ||
            typeof field.value !== "string" ||
            (field.redacted !== undefined && typeof field.redacted !== "boolean") ||
            field.value.length > 515 ||
            (field.enumName !== undefined &&
              (typeof field.enumName !== "string" || field.enumName.length > 200)) ||
            (field.bits !== undefined &&
              (!Array.isArray(field.bits) ||
                field.bits.length > 64 ||
                field.bits.some(
                  (bit) =>
                    !bit ||
                    typeof bit.name !== "string" ||
                    bit.name.length > 100 ||
                    typeof bit.displayName !== "string" ||
                    bit.displayName.length > 200 ||
                    typeof bit.value !== "string" ||
                    bit.value.length > 20 ||
                    !Number.isSafeInteger(bit.offset) ||
                    !Number.isSafeInteger(bit.length) ||
                    !Number.isSafeInteger(bit.bitOffset) ||
                    !Number.isSafeInteger(bit.width) ||
                    bit.offset < field.offset ||
                    bit.offset + bit.length > field.offset + field.length ||
                    bit.length < 1 ||
                    bit.bitOffset < 0 ||
                    bit.width < 1 ||
                    bit.bitOffset + bit.width > field.length * 8,
                ))) ||
            !Number.isSafeInteger(field.offset) ||
            !Number.isSafeInteger(field.length) ||
            field.offset < 0 ||
            field.length < 1 ||
            field.offset + field.length > item.size,
        )
      )
        throw new Error("Invalid parsed traffic record");
    }
  }
  if (bytes > 4 * 1024 * 1024) throw new Error("Traffic archive exceeds 4 MiB");
  return archive as TrafficArchive;
}

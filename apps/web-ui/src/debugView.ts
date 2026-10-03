export type DebugAnnotation = {
  id: number;
  start: number;
  end: number;
  label: string;
  color: number;
  note?: string;
};
export type DebugRange = { start: number; end: number } | null;

export const annotationColors = {
  light: [
    "#C15DD5",
    "#9075FC",
    "#1EC0D7",
    "#79C93A",
    "#D5D71A",
    "#FFCB45",
    "#FF813A",
    "#FB5E49",
    "#F92A5E",
    "#F16BA3",
  ],
  dark: [
    "#C981D7",
    "#A18CF0",
    "#66BECA",
    "#9CC673",
    "#D0D16A",
    "#EDCB74",
    "#E99463",
    "#F27A6A",
    "#EC6486",
    "#E991B5",
  ],
};

export function readAnnotationFile(content: string): {
  hex: string;
  annotations: DebugAnnotation[];
} {
  if (new TextEncoder().encode(content).length > 1024 * 1024) throw new Error("File exceeds 1 MiB");
  const file = JSON.parse(content.replace(/^\uFEFF/, ""));
  if (
    !file ||
    file.kind !== "iotps-debug" ||
    file.version !== 1 ||
    typeof file.hex !== "string" ||
    !/^[\da-f]{2}(?: [\da-f]{2})*$/i.test(file.hex) ||
    file.hex.length > 65536 * 3 ||
    !Array.isArray(file.annotations) ||
    file.annotations.length > 1000
  )
    throw new Error("Invalid annotation file / unsupported version");
  const count = (file.hex.length + 1) / 3;
  const annotations = file.annotations.map((item: unknown, index: number) => {
    if (!item || typeof item !== "object") throw new Error("Invalid annotation");
    const row = item as Record<string, unknown>;
    if (
      !Number.isInteger(row.start) ||
      !Number.isInteger(row.end) ||
      (row.start as number) < 0 ||
      (row.end as number) < (row.start as number) ||
      (row.end as number) >= count ||
      typeof row.label !== "string" ||
      !row.label.trim() ||
      row.label.length > 160 ||
      !Number.isInteger(row.color) ||
      (row.color as number) < 0 ||
      (row.color as number) > 9 ||
      (row.note !== undefined && (typeof row.note !== "string" || row.note.length > 1000))
    )
      throw new Error("Invalid annotation range, label, note or color");
    return {
      id: index + 1,
      start: row.start as number,
      end: row.end as number,
      label: row.label.trim(),
      color: row.color as number,
      ...(row.note === undefined ? {} : { note: row.note as string }),
    };
  });
  return { hex: file.hex.toUpperCase(), annotations };
}

export function interpretBytes(bytes: number[], little: boolean) {
  const hex = bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
  // ponytail: integer interpretation is limited to 64 bits; wider protocol values stay in Core's field value.
  if (!bytes.length || bytes.length > 8)
    return { hex, unsigned: "—", signed: "—", binary: "—", float: "—" };
  const ordered = little ? [...bytes].reverse() : bytes;
  const unsigned = BigInt(
    `0x${ordered.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`,
  );
  const bits = bytes.length * 8;
  const signed = unsigned >= 1n << BigInt(bits - 1) ? unsigned - (1n << BigInt(bits)) : unsigned;
  const view = new DataView(Uint8Array.from(bytes).buffer);
  return {
    hex,
    unsigned: String(unsigned),
    signed: String(signed),
    binary: unsigned.toString(2).padStart(bits, "0").match(/.{4}/g)!.join(" "),
    float:
      bytes.length === 4
        ? String(view.getFloat32(0, little))
        : bytes.length === 8
          ? String(view.getFloat64(0, little))
          : "—",
  };
}

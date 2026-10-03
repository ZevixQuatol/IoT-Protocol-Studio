// Browser-only P06 verification fixture. Production calls the native Core bridge.
window.iotpsDebugTool = async (operation, ...args) => {
  window.projectUICalls.push([operation, ...args]);
  const bytes = (input, format = "hex", order = "big") => {
    if (format === "hex") {
      const compact = input.replace(/0x|[\s,:_-]/gi, "");
      if (!compact || compact.length % 2 || /[^\da-f]/i.test(compact))
        throw Error("Invalid HEX bytes");
      return compact.match(/../g).map((v) => parseInt(v, 16));
    }
    if (format === "binary")
      return input.split(/\s+/).map((v) => {
        if (!/^[01]{8}$/.test(v)) throw Error("Invalid binary byte");
        return parseInt(v, 2);
      });
    if (format === "decimal")
      return input.split(/\s+/).map((v) => {
        if (!/^\d+$/.test(v) || Number(v) > 255) throw Error("Invalid decimal byte");
        return Number(v);
      });
    if (format === "ascii" || format === "utf8") return [...new TextEncoder().encode(input)];
    if (/^(u?int)(8|16|32|64)$/.test(format)) {
      const bits = Number(format.match(/\d+/)[0]);
      let n = BigInt(input);
      if (
        n < (format[0] === "u" ? 0n : -(1n << BigInt(bits - 1))) ||
        n >= 1n << BigInt(format[0] === "u" ? bits : bits - 1)
      )
        throw Error("Integer overflow");
      if (n < 0) n += 1n << BigInt(bits);
      const result = Array.from({ length: bits / 8 }, () => {
        const b = Number(n & 255n);
        n >>= 8n;
        return b;
      });
      return order === "little" ? result : result.reverse();
    }
    if (format === "bcd") {
      if (!/^(\d\d)+$/.test(input)) throw Error("Invalid packed BCD");
      return input.match(/../g).map((v) => parseInt(v, 16));
    }
    throw Error("Unsupported fixture format");
  };
  const hex = (b) => b.map((v) => v.toString(16).toUpperCase().padStart(2, "0")).join(" ");
  try {
    let text = "",
      data = [],
      matches = [];
    if (operation === "convert") {
      data = bytes(args[0], args[1], args[3]);
      const target = args[2];
      if (target === "reverse") {
        data.reverse();
        text = hex(data);
      } else if (target === "hex") text = hex(data);
      else if (target === "binary")
        text = data.map((b) => b.toString(2).padStart(8, "0")).join(" ");
      else if (/^u?int/.test(target)) {
        const bits = Number(target.match(/\d+/)[0]);
        if (data.length !== bits / 8) throw Error("Numeric width mismatch");
        let n = BigInt(
          "0x" + hex(args[3] === "little" ? [...data].reverse() : data).replace(/ /g, ""),
        );
        if (target[0] !== "u" && n >= 1n << BigInt(bits - 1)) n -= 1n << BigInt(bits);
        text = String(n);
      } else if (target === "bcd") {
        text = hex(data).replace(/ /g, "");
        if (/[^\d]/.test(text)) throw Error("Invalid BCD digit");
      } else if (/^float/.test(target)) {
        const bits = Number(target.slice(5));
        if (data.length !== bits / 8) throw Error("Numeric width mismatch");
        const v = new DataView(Uint8Array.from(data).buffer);
        text = String(
          bits === 32
            ? v.getFloat32(0, args[3] === "little")
            : v.getFloat64(0, args[3] === "little"),
        );
      } else throw Error("Unsupported fixture output");
    } else if (operation === "find" || operation === "replace") {
      const source = bytes(args[0]),
        needle = bytes(args[1]),
        next = args[2] ? bytes(args[2]) : [];
      for (let i = 0; i < source.length;) {
        if (needle.every((b, j) => source[i + j] === b)) {
          matches.push(i);
          data.push(...(operation === "replace" ? next : needle));
          i += needle.length;
        } else data.push(source[i++]);
      }
      text = String(matches.length);
    } else if (operation === "checksum") {
      const source = bytes(args[0]),
        start = Number(args[2]),
        end = Number(args[3]);
      if (!/^\d+$/.test(args[2]) || !/^\d+$/.test(args[3]) || start > end || end >= source.length)
        throw Error("Invalid inclusive byte offset range");
      const input = source.slice(start, end + 1);
      const width = args[1] === "SUM16" ? 16 : args[1] === "CRC" ? Number(args[4]) : 8;
      const mask = width === 32 ? 0xffffffff : (1 << width) - 1;
      const reflect = (n, size) => {
        let v = 0;
        for (let i = 0; i < size; i++) {
          v = (v << 1) | (n & 1);
          n >>>= 1;
        }
        return v >>> 0;
      };
      let n = 0;
      if (args[1] === "CRC") {
        const poly = parseInt(args[5], 16);
        n = parseInt(args[6], 16);
        if (!poly || poly > mask) throw Error("Invalid CRC polynomial");
        for (const b of input) {
          n ^= (args[7] === "1" ? reflect(b, 8) : b) << (width - 8);
          for (let i = 0; i < 8; i++) n = ((n << 1) ^ (n & (1 << (width - 1)) ? poly : 0)) & mask;
        }
        if (args[8] === "1") n = reflect(n, width);
        n ^= parseInt(args[9], 16);
      } else if (args[1] === "XOR8") for (const b of input) n ^= b;
      else {
        n = input.reduce((a, b) => a + b, 0);
        if (args[1] === "LRC") n = -n;
      }
      text = ((n & mask) >>> 0)
        .toString(16)
        .toUpperCase()
        .padStart(width / 4, "0");
    } else if (operation === "bits") {
      data = bytes(args[0]).map((b) =>
        args[1] === "XOR"
          ? b ^ parseInt(args[2], 16)
          : args[1] === "AND"
            ? b & parseInt(args[2], 16)
            : b | parseInt(args[2], 16),
      );
      text = hex(data);
    } else throw Error("Unsupported fixture operation");
    return { ok: true, text, hex: hex(data), matches };
  } catch (error) {
    return { ok: false, error: { code: "invalid_input", message: error.message } };
  }
};

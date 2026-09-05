// Run with sharp available through node_modules or NODE_PATH.
// node tools/generate-icons.cjs [--check]
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const sharp = require("sharp");

async function main() {
  const root = path.resolve(__dirname, "..");
  const web = path.join(root, "apps/web-ui/public");
  const source = await fs.readFile(path.join(web, "iot-protocol-studio.svg"));
  assert.deepEqual(await fs.readFile(path.join(web, "favicon.svg")), source);
  const checkOnly = process.argv.includes("--check");
  const sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 180, 192, 256, 512];
  const pngs = new Map();
  for (const size of sizes) {
    const png = await sharp(source).resize(size, size).png().toBuffer();
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.width, size);
    assert.equal(info.height, size);
    assert.equal(data[3], 0, "Corner must remain transparent");
    const center = (Math.floor(size / 2) * size + Math.floor(size / 2)) * 4;
    assert.deepEqual([...data.subarray(center, center + 4)], [77, 191, 92, 255]);
    pngs.set(size, png);
  }
  const outputs = new Map();
  for (const size of [16, 32, 48])
    outputs.set(path.join(web, `favicon-${size}.png`), pngs.get(size));
  for (const size of [180, 192, 512])
    outputs.set(path.join(web, `icon-${size}.png`), pngs.get(size));

  // Windows ICO directory: ten PNG-backed images, matching the existing DPI sizes.
  const icoSizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
  const directory = Buffer.alloc(6 + 16 * icoSizes.length);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(icoSizes.length, 4);
  let offset = directory.length;
  for (const [index, size] of icoSizes.entries()) {
    const entry = 6 + index * 16;
    directory[entry] = directory[entry + 1] = size === 256 ? 0 : size;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(pngs.get(size).length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += pngs.get(size).length;
  }
  const ico = Buffer.concat([directory, ...icoSizes.map((size) => pngs.get(size))]);
  assert.equal(ico.length, offset);
  outputs.set(path.join(root, "apps/desktop-win/resources/app.ico"), ico);
  for (const [file, bytes] of outputs) {
    if (checkOnly) assert.deepEqual(await fs.readFile(file), bytes, `Stale icon: ${file}`);
    else await fs.writeFile(file, bytes);
  }
  console.log(
    `PASS: ${checkOnly ? "verified" : "generated"} 6 PNGs and 10-size ICO; colors, dimensions and transparency checked`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "scripts/app-icon.svg"));
const mediaDir =
  "/cursor/stores/bc-ee50c4d2-114a-4d08-907f-d7ec1011e7f1/media/app-icon";

/** Rasterize the 512-unit icon SVG at an exact pixel size, fully opaque. */
export async function renderIcon(size) {
  const density = Math.max(72, Math.ceil((72 * size) / 512));
  const buf = await sharp(svg, { density })
    .resize(size, size, { fit: "fill" })
    .flatten({ background: "#e0f2fe" })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const meta = await sharp(buf).metadata();
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (meta.width !== size || meta.height !== size) {
    throw new Error(`icon is ${meta.width}x${meta.height}, expected ${size}`);
  }
  if (meta.hasAlpha || info.channels < 3) {
    throw new Error(`icon ${size} is not an opaque RGB PNG`);
  }
  const pixel = (x, y) => {
    const i = (y * size + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  for (const [x, y] of [
    [0, 0],
    [size - 1, 0],
    [0, size - 1],
    [size - 1, size - 1],
  ]) {
    const [r, g, b, a] = pixel(x, y);
    if (a !== 255 || (r < 40 && g < 40 && b < 40)) {
      throw new Error(`icon ${size} corner ${x},${y} is ${r},${g},${b},${a}`);
    }
  }
  return buf;
}

function icoFromPngs(pngs) {
  const count = pngs.length;
  const header = 6 + count * 16;
  let offset = header;
  const dir = Buffer.alloc(header);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(count, 4);
  pngs.forEach((png, i) => {
    const size = png.size >= 256 ? 0 : png.size;
    const base = 6 + i * 16;
    dir.writeUInt8(size, base);
    dir.writeUInt8(size, base + 1);
    dir.writeUInt16LE(1, base + 4);
    dir.writeUInt16LE(32, base + 6);
    dir.writeUInt32LE(png.buffer.length, base + 8);
    dir.writeUInt32LE(offset, base + 12);
    offset += png.buffer.length;
  });
  return Buffer.concat([dir, ...pngs.map((png) => png.buffer)]);
}

async function maskedIcon(size) {
  const radius = Math.round(size * 0.2237);
  const icon = await renderIcon(size);
  const mask = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
    ),
  )
    .png()
    .toBuffer();
  return sharp(icon)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

function placeholder(fill, glyph) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150">
      <rect width="150" height="150" rx="34" fill="${fill}"/>
      ${glyph}
    </svg>`,
  );
}

async function renderHomeScreen(icon180) {
  const width = 900;
  const height = 1400;
  const wallpaper = await sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="wall" x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0%" stop-color="#7dd3fc"/>
          <stop offset="42%" stop-color="#818cf8"/>
          <stop offset="100%" stop-color="#f9a8d4"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#wall)"/>
      <circle cx="140" cy="220" r="90" fill="#ffffff" fill-opacity="0.18"/>
      <circle cx="760" cy="980" r="140" fill="#ffffff" fill-opacity="0.12"/>
    </svg>`),
  )
    .png()
    .toBuffer();

  const iconSize = 150;
  const marginX = 54;
  const gapX = Math.round((width - marginX * 2 - iconSize * 4) / 3);
  const colX = (col) => marginX + col * (iconSize + gapX);
  const rows = [300, 530];

  const tiles = [
    { src: icon180, col: 0, row: 0 },
    {
      src: placeholder("#f472b6", `<polygon points="75,38 88,68 120,72 96,94 102,126 75,110 48,126 54,94 30,72 62,68" fill="#fff"/>`),
      col: 1,
      row: 0,
    },
    {
      src: placeholder("#facc15", `<circle cx="75" cy="75" r="34" fill="#fff"/>`),
      col: 2,
      row: 0,
    },
    {
      src: placeholder("#34d399", `<rect x="46" y="46" width="58" height="58" rx="16" fill="#fff"/>`),
      col: 3,
      row: 0,
    },
    {
      src: placeholder("#38bdf8", `<polygon points="75,36 118,114 32,114" fill="#fff"/>`),
      col: 0,
      row: 1,
    },
    {
      src: placeholder("#fb7185", `<circle cx="75" cy="62" r="22" fill="#fff"/><circle cx="58" cy="92" r="16" fill="#fff"/><circle cx="96" cy="94" r="18" fill="#fff"/>`),
      col: 1,
      row: 1,
    },
    {
      src: placeholder("#a78bfa", `<rect x="40" y="58" width="70" height="18" rx="9" fill="#fff"/><rect x="40" y="86" width="48" height="18" rx="9" fill="#fff"/>`),
      col: 2,
      row: 1,
    },
  ];

  const composites = [];
  const labels = [
    ["Kids Games", "Draw", "Stories", "Music"],
    ["Weather", "Photos", "Notes"],
  ];

  for (const tile of tiles) {
    const input = Buffer.isBuffer(tile.src) ? tile.src : await sharp(tile.src).png().toBuffer();
    composites.push({
      input: await sharp(input).resize(iconSize, iconSize).png().toBuffer(),
      left: colX(tile.col),
      top: rows[tile.row],
    });
  }

  composites.unshift({
    input: await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="36" y="1176" width="828" height="184" rx="42" fill="#ffffff" fill-opacity="0.28"/></svg>`,
      ),
    )
      .png()
      .toBuffer(),
    left: 0,
    top: 0,
  });

  const dockSize = 112;
  const dockY = 1216;
  const dockGap = 48;
  const dockSpan = dockSize * 4 + dockGap * 3;
  const dockX0 = Math.round((width - dockSpan) / 2);
  const dockTiles = [
    placeholder("#0ea5e9", `<rect x="48" y="44" width="54" height="62" rx="12" fill="#fff"/>`),
    placeholder("#f472b6", `<circle cx="75" cy="75" r="28" fill="#fff"/>`),
    placeholder("#facc15", `<polygon points="75,40 90,70 122,74 98,96 104,128 75,112 46,128 52,96 28,74 60,70" fill="#fff"/>`),
    placeholder("#34d399", `<rect x="42" y="58" width="66" height="16" rx="8" fill="#fff"/><rect x="42" y="82" width="44" height="16" rx="8" fill="#fff"/>`),
  ];
  for (let i = 0; i < dockTiles.length; i++) {
    composites.push({
      input: await sharp(dockTiles[i]).resize(dockSize, dockSize).png().toBuffer(),
      left: dockX0 + i * (dockSize + dockGap),
      top: dockY,
    });
  }

  const labelSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `<text x="${width / 2}" y="168" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="88" font-weight="500" fill="#ffffff">9:41</text>`,
    `<text x="${width / 2}" y="214" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="28" font-weight="600" fill="#ffffff">Thursday 24 Sep</text>`,
  ];
  labels.forEach((row, rowIndex) => {
    row.forEach((label, col) => {
      const x = colX(col) + iconSize / 2;
      const y = rows[rowIndex] + iconSize + 28;
      labelSvg.push(
        `<text x="${x + 1}" y="${y + 1}" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="22" font-weight="700" fill="#0b2a3d" fill-opacity="0.35">${label}</text>`,
        `<text x="${x}" y="${y}" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="22" font-weight="700" fill="#ffffff">${label}</text>`,
      );
    });
  });
  labelSvg.push(`</svg>`);

  composites.push({
    input: await sharp(Buffer.from(labelSvg.join(""))).png().toBuffer(),
    left: 0,
    top: 0,
  });

  return sharp(wallpaper).composite(composites).png().toBuffer();
}

const outputs = [
  ["public/apple-touch-icon.png", 180],
  ["public/icons/icon-32.png", 32],
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["public/icons/icon-maskable-192.png", 192],
  ["public/icons/icon-maskable-512.png", 512],
];

const rendered = new Map();
for (const [rel, size] of outputs) {
  const buf = rendered.get(size) ?? (await renderIcon(size));
  rendered.set(size, buf);
  await sharp(buf).toFile(join(root, rel));
  console.log(`${rel} ${size}x${size}`);
}

const icon512 = rendered.get(512);
const { data, info } = await sharp(icon512).raw().toBuffer({ resolveWithObject: true });
let outside = 0;
for (let y = 0; y < 512; y++) {
  for (let x = 0; x < 512; x++) {
    const i = (y * 512 + x) * info.channels;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const controller =
      (r > 245 && g > 245 && b > 245) ||
      (b > 150 && r < 90 && b > r + 30) ||
      (r > 200 && g > 150 && b < 120) ||
      (r > 180 && g < 140 && b > 80);
    if (!controller) continue;
    const dx = x - 256;
    const dy = y - 256;
    if (dx * dx + dy * dy > 210 * 210) outside++;
  }
}
if (outside > 0) {
  throw new Error(`controller pixels outside the maskable safe zone: ${outside}`);
}
console.log("maskable safe zone ok");

async function rgbaPng(size, cached) {
  const source = cached ?? (await renderIcon(size));
  return sharp(source).ensureAlpha().png().toBuffer();
}

const favicon = icoFromPngs([
  { size: 16, buffer: await rgbaPng(16) },
  { size: 32, buffer: await rgbaPng(32, rendered.get(32)) },
  { size: 48, buffer: await rgbaPng(48) },
]);
writeFileSync(join(root, "src/app/favicon.ico"), favicon);
console.log(`src/app/favicon.ico ${favicon.length} bytes`);

mkdirSync(mediaDir, { recursive: true });
await sharp(icon512).toFile(join(mediaDir, "icon.png"));
await sharp(rendered.get(180)).toFile(join(mediaDir, "apple-touch-icon.png"));
const home = await renderHomeScreen(await maskedIcon(180));
await sharp(home).toFile(join(mediaDir, "home-screen.png"));
console.log(`preview ${mediaDir}`);

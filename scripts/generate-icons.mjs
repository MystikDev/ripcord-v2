import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join } from 'path';

const ICONS_DIR = join(import.meta.dirname, '..', 'apps', 'desktop', 'src-tauri', 'icons');

// ---------------------------------------------------------------------------
// SVG source — Ripcord "R" logo (matches DM HomeButton) on a red background
// with rounded corners. White logo on #dc2626 (Tailwind red-600).
// ---------------------------------------------------------------------------

function createSvg(size) {
  // Corner radius scales with size (≈18% of width, matching the UI rounded-2xl look)
  const r = Math.round(size * 0.18);
  // The viewBox for the R logo is 0 0 32 32, we center it in the icon with padding
  const padding = size * 0.15;
  const logoSize = size - padding * 2;
  const logoX = padding;
  const logoY = padding;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- Red rounded-rect background -->
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#dc2626"/>
  <!-- Ripcord "R" logo in white, scaled and centered -->
  <svg x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" viewBox="0 0 32 32" fill="none">
    <path d="M8 4h10c4.42 0 8 2.69 8 6s-3.58 6-8 6h-2l8 12h-5.5L11 16H12c3.31 0 6-1.34 6-4s-2.69-4-6-4h-4v18H8V4z" fill="white"/>
    <path d="M6 2l4 2v24l-4 2V2z" fill="white" opacity="0.6"/>
  </svg>
</svg>`;
}

// ---------------------------------------------------------------------------
// Generate all icon variants
// ---------------------------------------------------------------------------

async function generateIcons() {
  // Generate PNG icons at required sizes
  const sizes = [
    { name: '32x32.png', size: 32 },
    { name: '128x128.png', size: 128 },
    { name: '128x128@2x.png', size: 256 },
    { name: 'icon.png', size: 256 },  // tray icon + general
  ];

  for (const { name, size } of sizes) {
    const svg = createSvg(size);
    const outPath = join(ICONS_DIR, name);
    await sharp(Buffer.from(svg)).ensureAlpha().png().toFile(outPath);
    console.log(`Generated ${name} (${size}x${size})`);
  }

  // Generate ICO (Windows) - embed 16, 32, 48, 256 px sizes
  const icoSizes = [16, 32, 48, 256];
  const icoBuffers = [];

  for (const s of icoSizes) {
    const svg = createSvg(s);
    const buf = await sharp(Buffer.from(svg)).ensureAlpha().png().toBuffer();
    icoBuffers.push({ size: s, buffer: buf });
  }

  const icoBuffer = createIco(icoBuffers);
  writeFileSync(join(ICONS_DIR, 'icon.ico'), icoBuffer);
  console.log('Generated icon.ico (16, 32, 48, 256)');

  // Generate ICNS (macOS) - 512px PNG
  const icnsSvg = createSvg(512);
  await sharp(Buffer.from(icnsSvg)).ensureAlpha().png().toFile(join(ICONS_DIR, 'icon.icns'));
  console.log('Generated icon.icns (512x512 PNG)');

  console.log('\nAll icons generated!');
}

/**
 * Create a minimal ICO file from PNG buffers.
 * ICO format: header (6 bytes) + directory entries (16 bytes each) + PNG data
 */
function createIco(entries) {
  const HEADER_SIZE = 6;
  const DIR_ENTRY_SIZE = 16;
  const headerBuf = Buffer.alloc(HEADER_SIZE);
  headerBuf.writeUInt16LE(0, 0);           // reserved
  headerBuf.writeUInt16LE(1, 2);           // type: 1 = ICO
  headerBuf.writeUInt16LE(entries.length, 4); // count

  let dataOffset = HEADER_SIZE + DIR_ENTRY_SIZE * entries.length;
  const dirEntries = [];
  const dataBuffers = [];

  for (const { size, buffer } of entries) {
    const dir = Buffer.alloc(DIR_ENTRY_SIZE);
    dir.writeUInt8(size >= 256 ? 0 : size, 0);  // width (0 = 256)
    dir.writeUInt8(size >= 256 ? 0 : size, 1);  // height
    dir.writeUInt8(0, 2);                         // color palette
    dir.writeUInt8(0, 3);                         // reserved
    dir.writeUInt16LE(1, 4);                      // color planes
    dir.writeUInt16LE(32, 6);                     // bits per pixel
    dir.writeUInt32LE(buffer.length, 8);          // data size
    dir.writeUInt32LE(dataOffset, 12);            // data offset

    dirEntries.push(dir);
    dataBuffers.push(buffer);
    dataOffset += buffer.length;
  }

  return Buffer.concat([headerBuf, ...dirEntries, ...dataBuffers]);
}

generateIcons().catch(console.error);

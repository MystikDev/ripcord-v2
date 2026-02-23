import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join } from 'path';

const SOURCE = join(import.meta.dirname, '..', 'ripcord_desktop_app.png');
const ICONS_DIR = join(import.meta.dirname, '..', 'apps', 'desktop', 'src-tauri', 'icons');

async function generateIcons() {
  const src = sharp(SOURCE);
  const meta = await src.metadata();
  console.log(`Source: ${meta.width}x${meta.height}`);

  // Determine the square crop (center the logo)
  const size = Math.min(meta.width, meta.height);
  const left = Math.round((meta.width - size) / 2);
  const top = Math.round((meta.height - size) / 2);

  // Ensure RGBA output (Tauri requires alpha channel)
  const squared = sharp(SOURCE).extract({ left, top, width: size, height: size }).ensureAlpha();

  // Generate PNG icons at required sizes
  const sizes = [
    { name: '32x32.png', size: 32 },
    { name: '128x128.png', size: 128 },
    { name: '128x128@2x.png', size: 256 },
    { name: 'icon.png', size: 256 },  // tray icon + general
  ];

  for (const { name, size: s } of sizes) {
    const outPath = join(ICONS_DIR, name);
    await squared.clone().resize(s, s, { kernel: 'lanczos3' }).png().toFile(outPath);
    console.log(`Generated ${name} (${s}x${s})`);
  }

  // Generate ICO (Windows) - embed 16, 32, 48, 256 px sizes
  // ICO format: we'll create a multi-size PNG-based ICO
  const icoSizes = [16, 32, 48, 256];
  const icoBuffers = [];

  for (const s of icoSizes) {
    const buf = await squared.clone().resize(s, s, { kernel: 'lanczos3' }).png().toBuffer();
    icoBuffers.push({ size: s, buffer: buf });
  }

  const icoBuffer = createIco(icoBuffers);
  writeFileSync(join(ICONS_DIR, 'icon.ico'), icoBuffer);
  console.log('Generated icon.ico (16, 32, 48, 256)');

  // Generate ICNS (macOS) - just use a 512px PNG as a placeholder
  // Real icns requires special tooling, but Tauri accepts PNG in the icns slot on non-macOS builds
  // For CI (Windows-only builds), this is fine. For macOS builds, you'd need iconutil.
  await squared.clone().resize(512, 512, { kernel: 'lanczos3' }).png().toFile(join(ICONS_DIR, 'icon.icns'));
  console.log('Generated icon.icns (512x512 PNG — Windows CI compatible)');

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

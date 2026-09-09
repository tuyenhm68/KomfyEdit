import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

const approvedImgPath = 'C:/Users/tuyenhm/.gemini/antigravity-ide/brain/a9160d94-019e-4d58-a971-a5bf3d9f1edb/k_extra_large_bright_1788690299071.jpg';

if (!fs.existsSync(approvedImgPath)) {
  console.error('Approved image not found at', approvedImgPath);
  process.exit(1);
}

const root = process.cwd();
const resourcesDir = path.join(root, 'resources');
const iconsSubdir = path.join(resourcesDir, 'icons');
const publicDir = path.join(root, 'public');

if (!fs.existsSync(iconsSubdir)) {
  fs.mkdirSync(iconsSubdir, { recursive: true });
}

// 1. Convert approved image to master PNG 1024x1024
const masterPngPath = path.join(resourcesDir, 'icon.png');
if (fs.existsSync(masterPngPath)) fs.unlinkSync(masterPngPath);
execFileSync(ffmpegPath, ['-y', '-i', approvedImgPath, '-vf', 'scale=1024:1024:flags=lanczos', '-update', '1', '-frames:v', '1', masterPngPath]);
console.log('Master PNG 1024x1024 generated:', masterPngPath);

// 2. Render all standard sizes from master PNG
const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const renderedMap = new Map();

for (const size of sizes) {
  const outPath = path.join(iconsSubdir, `${size}x${size}.png`);
  if (fs.existsSync(outPath)) {
    try { fs.unlinkSync(outPath); } catch {}
  }
  execFileSync(ffmpegPath, ['-y', '-i', masterPngPath, '-vf', `scale=${size}:${size}:flags=lanczos`, '-update', '1', '-frames:v', '1', outPath]);
  const buf = fs.readFileSync(outPath);
  renderedMap.set(size, buf);
  console.log(`Rendered icon: ${size}x${size} -> ${outPath}`);
}

// 3. Helper to create ICO buffer
function createIcoBuffer(images) {
  const count = images.length;
  const headerLen = 6;
  const dirEntryLen = 16;
  const dirLen = headerLen + count * dirEntryLen;

  let totalSize = dirLen;
  for (const img of images) {
    totalSize += img.pngBuffer.length;
  }

  const out = Buffer.alloc(totalSize);
  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2);
  out.writeUInt16LE(count, 4);

  let currentOffset = dirLen;
  for (let i = 0; i < count; i++) {
    const { size, pngBuffer } = images[i];
    const entryOffset = headerLen + i * dirEntryLen;

    out.writeUInt8(size >= 256 ? 0 : size, entryOffset);
    out.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1);
    out.writeUInt8(0, entryOffset + 2);
    out.writeUInt8(0, entryOffset + 3);
    out.writeUInt16LE(1, entryOffset + 4);
    out.writeUInt16LE(32, entryOffset + 6);
    out.writeUInt32LE(pngBuffer.length, entryOffset + 8);
    out.writeUInt32LE(currentOffset, entryOffset + 12);

    pngBuffer.copy(out, currentOffset);
    currentOffset += pngBuffer.length;
  }

  return out;
}

// 4. Helper to create ICNS buffer
function createIcnsBuffer(chunks) {
  let totalDataLen = 0;
  for (const c of chunks) {
    totalDataLen += 8 + c.pngBuffer.length;
  }

  const totalLen = 8 + totalDataLen;
  const out = Buffer.alloc(totalLen);
  out.write('icns', 0, 4, 'ascii');
  out.writeUInt32BE(totalLen, 4);

  let offset = 8;
  for (const c of chunks) {
    const chunkTotalLen = 8 + c.pngBuffer.length;
    out.write(c.type, offset, 4, 'ascii');
    out.writeUInt32BE(chunkTotalLen, offset + 4);
    c.pngBuffer.copy(out, offset + 8);
    offset += chunkTotalLen;
  }

  return out;
}

// 5. Build Windows ICO
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoImages = icoSizes.map(size => ({ size, pngBuffer: renderedMap.get(size) }));
const icoBuffer = createIcoBuffer(icoImages);
const icoPath = path.join(resourcesDir, 'icon.ico');
if (fs.existsSync(icoPath)) {
  try { fs.unlinkSync(icoPath); } catch {}
}
fs.writeFileSync(icoPath, icoBuffer);
console.log('Saved Windows ICO:', icoPath);

// 6. Build macOS ICNS
const icnsChunks = [
  { type: 'ic07', pngBuffer: renderedMap.get(128) },
  { type: 'ic08', pngBuffer: renderedMap.get(256) },
  { type: 'ic09', pngBuffer: renderedMap.get(512) },
  { type: 'ic10', pngBuffer: renderedMap.get(1024) },
];
const icnsBuffer = createIcnsBuffer(icnsChunks);
const icnsPath = path.join(resourcesDir, 'icon.icns');
if (fs.existsSync(icnsPath)) {
  try { fs.unlinkSync(icnsPath); } catch {}
}
fs.writeFileSync(icnsPath, icnsBuffer);
console.log('Saved macOS ICNS:', icnsPath);

// 7. Synchronize into public/ directory
if (fs.existsSync(publicDir)) {
  const pubIcon = path.join(publicDir, 'icon.png');
  const pubFavicon = path.join(publicDir, 'favicon.ico');
  try { if (fs.existsSync(pubIcon)) fs.unlinkSync(pubIcon); } catch {}
  try { if (fs.existsSync(pubFavicon)) fs.unlinkSync(pubFavicon); } catch {}
  fs.writeFileSync(pubIcon, fs.readFileSync(masterPngPath));
  fs.writeFileSync(pubFavicon, icoBuffer);
  console.log('Synchronized public/icon.png and public/favicon.ico');
}

console.log('ALL_ICONS_BUILT_FROM_APPROVED_IMAGE_SUCCESS');

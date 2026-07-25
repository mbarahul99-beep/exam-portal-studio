import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function crc32(buf) {
  let c = 0xffffffff;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let k = n;
    for (let b = 0; b < 8; b++) {
      k = (k & 1) ? (0xedb88320 ^ (k >>> 1)) : (k >>> 1);
    }
    table[n] = k;
  }
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const typeAndData = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([lenBuf, typeAndData, crcBuf]);
}

function generateApexPng(width, height) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = createChunk('IHDR', ihdr);

  // Background Dark Green: #065f46 -> R: 6, G: 95, B: 70
  // Text White: #ffffff -> R: 255, G: 255, B: 255
  const bgR = 6, bgG = 95, bgB = 70;
  const fgR = 255, fgG = 255, fgB = 255;

  // 5x5 Letter bitmaps (A, P, E, X)
  const letters = {
    A: [
      [0,1,1,1,0],
      [1,0,0,0,1],
      [1,1,1,1,1],
      [1,0,0,0,1],
      [1,0,0,0,1]
    ],
    P: [
      [1,1,1,1,0],
      [1,0,0,0,1],
      [1,1,1,1,0],
      [1,0,0,0,0],
      [1,0,0,0,0]
    ],
    E: [
      [1,1,1,1,1],
      [1,0,0,0,0],
      [1,1,1,1,0],
      [1,0,0,0,0],
      [1,1,1,1,1]
    ],
    X: [
      [1,0,0,0,1],
      [0,1,0,1,0],
      [0,0,1,0,0],
      [0,1,0,1,0],
      [1,0,0,0,1]
    ]
  };

  const rawData = Buffer.alloc(height * (width * 4 + 1));
  let offset = 0;

  const rx = width * 0.18;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0;
    for (let x = 0; x < width; x++) {
      let dx = 0, dy = 0;
      if (x < rx && y < rx) { dx = rx - x; dy = rx - y; }
      else if (x >= width - rx && y < rx) { dx = x - (width - rx); dy = rx - y; }
      else if (x < rx && y >= height - rx) { dx = rx - x; dy = y - (height - rx); }
      else if (x >= width - rx && y >= height - rx) { dx = x - (width - rx); dy = y - (height - rx); }

      if (dx * dx + dy * dy > rx * rx) {
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        continue;
      }

      const gridScale = Math.floor(width / 32);
      const gridW = 23 * gridScale;
      const gridH = 5 * gridScale;

      const startX = Math.floor((width - gridW) / 2);
      const startY = Math.floor((height - gridH) / 2);

      let isTextPixel = false;
      if (x >= startX && x < startX + gridW && y >= startY && y < startY + gridH) {
        const relX = x - startX;
        const relY = y - startY;

        const colIdx = Math.floor(relX / gridScale);
        const rowIdx = Math.floor(relY / gridScale);

        let letterObj = null;
        let charCol = -1;
        if (colIdx >= 0 && colIdx <= 4) { letterObj = letters.A; charCol = colIdx; }
        else if (colIdx >= 6 && colIdx <= 10) { letterObj = letters.P; charCol = colIdx - 6; }
        else if (colIdx >= 12 && colIdx <= 16) { letterObj = letters.E; charCol = colIdx - 12; }
        else if (colIdx >= 18 && colIdx <= 22) { letterObj = letters.X; charCol = colIdx - 18; }

        if (letterObj && rowIdx >= 0 && rowIdx < 5 && charCol >= 0 && charCol < 5) {
          if (letterObj[rowIdx][charCol] === 1) {
            isTextPixel = true;
          }
        }
      }

      if (isTextPixel) {
        rawData[offset++] = fgR;
        rawData[offset++] = fgG;
        rawData[offset++] = fgB;
        rawData[offset++] = 255;
      } else {
        rawData[offset++] = bgR;
        rawData[offset++] = bgG;
        rawData[offset++] = bgB;
        rawData[offset++] = 255;
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.join(__dirname, '..', 'public');
const distDir = path.join(__dirname, '..', 'dist');

const p192 = generateApexPng(192, 192);
const p512 = generateApexPng(512, 512);
const p180 = generateApexPng(180, 180);

fs.writeFileSync(path.join(publicDir, 'icon-192.png'), p192);
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), p512);
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), p180);

if (fs.existsSync(distDir)) {
  fs.writeFileSync(path.join(distDir, 'icon-192.png'), p180);
  fs.writeFileSync(path.join(distDir, 'icon-512.png'), p512);
  fs.writeFileSync(path.join(distDir, 'apple-touch-icon.png'), p180);
}

console.log('PNG Icons successfully created!');

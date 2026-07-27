const fs = require('fs');
const path = require('path');
const https = require('https');

const wasmSourceDir = path.join(__dirname, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const publicWasmDir = path.join(__dirname, 'public', 'wasm');

// 1. Download face_landmarker.task locally
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const modelDest = path.join(__dirname, 'public', 'face_landmarker.task');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    console.log(`Downloading ${url} -> ${dest}...`);
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: status code ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded ${url} successfully.`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

function copyWasmFiles() {
  if (!fs.existsSync(publicWasmDir)) {
    fs.mkdirSync(publicWasmDir, { recursive: true });
  }

  if (fs.existsSync(wasmSourceDir)) {
    console.log(`Found node_modules tasks-vision wasm directory. Copying assets...`);
    const files = fs.readdirSync(wasmSourceDir);
    for (const file of files) {
      const src = path.join(wasmSourceDir, file);
      const dest = path.join(publicWasmDir, file);
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, dest);
        console.log(`Copied ${file} to public/wasm/`);
      }
    }
  } else {
    console.warn(`node_modules tasks-vision wasm directory not found at: ${wasmSourceDir}`);
  }
}

async function run() {
  try {
    // Copy local WASM modules from node_modules
    copyWasmFiles();
    
    // Download task model file
    await download(modelUrl, modelDest);

    console.log('All biometrics assets resolved and copied locally successfully!');
  } catch (err) {
    console.error('Resolution failed:', err);
    process.exit(1);
  }
}

run();

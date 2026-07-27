const fs = require('fs');
const path = require('path');
const https = require('https');

const assets = [
  {
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    dest: path.join(__dirname, 'public', 'face_landmarker.task')
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm/vision_wasm_internal.wasm',
    dest: path.join(__dirname, 'public', 'wasm', 'vision_wasm_internal.wasm')
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm/vision_wasm_internal.js',
    dest: path.join(__dirname, 'public', 'wasm', 'vision_wasm_internal.js')
  }
];

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

async function run() {
  try {
    for (const asset of assets) {
      await download(asset.url, asset.dest);
    }
    console.log('All biometrics assets downloaded locally successfully!');
  } catch (err) {
    console.error('Download failed:', err);
    process.exit(1);
  }
}

run();

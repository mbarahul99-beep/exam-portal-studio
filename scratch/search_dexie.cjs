const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, '..', 'node_modules', 'dexie', 'dist', 'dexie.js');
if (!fs.existsSync(filepath)) {
  console.log("Dexie file not found at:", filepath);
  process.exit(1);
}

const content = fs.readFileSync(filepath, 'utf8');
let pos = -1;
let count = 0;
while ((pos = content.indexOf('.reduce(', pos + 1)) !== -1) {
  const slice = content.substring(pos - 100, pos + 250);
  if (slice.includes('type') || slice.includes('add') || slice.includes('mut')) {
    count++;
    console.log(`\n--- Match ${count} (pos ${pos}) ---`);
    console.log(slice);
  }
}

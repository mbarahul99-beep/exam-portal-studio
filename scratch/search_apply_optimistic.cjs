const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, '..', 'node_modules', 'dexie', 'dist', 'dexie.js');
const content = fs.readFileSync(filepath, 'utf8');

let pos = -1;
let count = 0;
while ((pos = content.indexOf('applyOptimisticOps(', pos + 1)) !== -1) {
  count++;
  console.log(`\n--- Match ${count} (pos ${pos}) ---`);
  console.log(content.substring(pos - 150, pos + 250));
}

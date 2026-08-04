const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, '..', 'node_modules', 'dexie', 'dist', 'dexie.js');
const content = fs.readFileSync(filepath, 'utf8');

const target = 'tblCache.optimisticOps.push(adjustedReq);';
let pos = -1;
while ((pos = content.indexOf(target, pos + 1)) !== -1) {
  console.log(`\nFound target at position ${pos}:`);
  console.log(content.substring(pos - 150, pos + 150));
}

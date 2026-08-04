const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, '..', 'node_modules', 'dexie', 'dist', 'dexie.js');
const content = fs.readFileSync(filepath, 'utf8');

let pos = content.indexOf('function adjustOptimisticFromFailures');
if (pos === -1) {
  pos = content.indexOf('adjustOptimisticFromFailures =');
}
if (pos === -1) {
  console.log("Not found");
} else {
  console.log(content.substring(pos, pos + 2500));
}

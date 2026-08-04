const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, '..', 'node_modules', 'dexie', 'dist', 'dexie.js');
const content = fs.readFileSync(filepath, 'utf8');

const pos = content.indexOf('var modRes = applyOptimisticOps(entry.res');
if (pos === -1) {
  console.log("Not found");
} else {
  // Go backwards to find the function definition
  const start = Math.max(0, pos - 1500);
  console.log(content.substring(start, pos + 500));
}

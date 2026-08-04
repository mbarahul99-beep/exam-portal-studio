const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, '..', 'node_modules', 'dexie', 'dist', 'dexie.js');
const content = fs.readFileSync(filepath, 'utf8');

const pos = content.indexOf('var adjustedReq = adjustOptimisticFromFailures(tblCache, reqWithResolvedKeys, res);');
if (pos === -1) {
  console.log("Not found");
} else {
  console.log(content.substring(pos - 1500, pos + 500));
}

const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, '..', 'dist', 'assets', 'index-CC8ZPBmp.js');
const content = fs.readFileSync(filepath, 'utf8');

let pos = -1;
while ((pos = content.indexOf('optimisticOps', pos + 1)) !== -1) {
  console.log(`\n--- Match at pos ${pos} ---`);
  console.log(content.substring(pos - 150, pos + 150));
}

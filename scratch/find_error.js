const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'dist', 'assets');
const files = fs.readdirSync(dir);
const jsFile = files.find(f => f.startsWith('index-') && f.endsWith('.js'));

if (!jsFile) {
  console.log("No built index JS file found!");
  process.exit(1);
}

const filepath = path.join(dir, jsFile);
console.log("Reading file:", filepath);
const content = fs.readFileSync(filepath, 'utf8');

// Find all occurrences of '.reduce' and print 200 characters before and after
let pos = -1;
let count = 0;
while ((pos = content.indexOf('.reduce', pos + 1)) !== -1) {
  count++;
  console.log(`\n--- Match ${count} (position ${pos}) ---`);
  console.log(content.substring(pos - 150, pos + 150));
}

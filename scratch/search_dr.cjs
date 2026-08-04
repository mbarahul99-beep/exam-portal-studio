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
const content = fs.readFileSync(filepath, 'utf8');

// Find function definitions or variables named dr
// Minified bundle may have 'function dr(' or 'let dr='
const matches = [
  'function dr(',
  'function dr=',
  'let dr=',
  'var dr=',
  'const dr=',
  ',dr='
];

for (const m of matches) {
  let pos = -1;
  while ((pos = content.indexOf(m, pos + 1)) !== -1) {
    console.log(`\n--- Match for "${m}" at position ${pos} ---`);
    console.log(content.substring(pos - 150, pos + 250));
  }
}

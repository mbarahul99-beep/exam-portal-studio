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

// We want to find We, Ke, m, dt. They might be Dexie's or React's minified functions
// Let's search around applyOptimisticOps caller (pos 236301) to see what functions are calling it
const pos = 236301;
console.log("--- Surrounding of applyOptimisticOps caller ---");
console.log(content.substring(pos - 1000, pos + 1000));

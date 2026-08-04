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

// We want to find any .reduce call where the callback body contains 'type'
let pos = -1;
let count = 0;
while ((pos = content.indexOf('.reduce(', pos + 1)) !== -1) {
  // Extract the function body of the reduce call (e.g. up to 200 characters)
  const slice = content.substring(pos, pos + 400);
  if (slice.includes('type') || slice.includes('.type') || slice.includes('["type"]')) {
    count++;
    console.log(`\n--- Reduce Match ${count} (position ${pos}) ---`);
    console.log(content.substring(pos - 100, pos + 300));
  }
}

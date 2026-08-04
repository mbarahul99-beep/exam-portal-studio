const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, '..', 'node_modules', 'dexie', 'dist', 'dexie.js');
const content = fs.readFileSync(filepath, 'utf8');

const pos = 241147;
console.log(content.substring(pos - 1000, pos + 500));

const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, '..', 'node_modules', 'dexie', 'package.json');
const pkg = JSON.parse(fs.readFileSync(filepath, 'utf8'));
console.log("main:", pkg.main);
console.log("module:", pkg.module);
console.log("browser:", pkg.browser);
console.log("jsnext:main:", pkg['jsnext:main']);
console.log("exports:", JSON.stringify(pkg.exports, null, 2));

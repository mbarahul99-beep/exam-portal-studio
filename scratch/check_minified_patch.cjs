const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, '..', 'dist', 'assets', 'index-CC8ZPBmp.js');
const content = fs.readFileSync(filepath, 'utf8');

// Let's search for "adjustOptimisticFromFailures" or the minified name in the built file
// In minified file, adjustOptimisticFromFailures might keep its name, or be minified.
// Let's search for "adjustOptimisticFromFailures" in the built file first
const pos = content.indexOf('adjustOptimisticFromFailures');
if (pos === -1) {
  console.log("adjustOptimisticFromFailures not found as a name.");
} else {
  console.log("Found adjustOptimisticFromFailures at position", pos);
  console.log(content.substring(pos - 100, pos + 400));
}

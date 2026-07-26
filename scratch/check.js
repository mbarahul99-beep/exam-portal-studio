const fs = require('fs');
const code = fs.readFileSync('src/components/ScanImagesView.tsx', 'utf8');

let p = 0, b = 0, c = 0;
const lines = code.split('\n');

lines.forEach((l, i) => {
  for (let ch of l) {
    if (ch === '(') p++;
    if (ch === ')') p--;
    if (ch === '{') b++;
    if (ch === '}') b--;
    if (ch === '[') c++;
    if (ch === ']') c--;
  }
  if (p < 0 || b < 0 || c < 0) {
    console.log(`Line ${i + 1} unbalanced: Parens=${p}, Braces=${b}, Brackets=${c}`);
    console.log(`  Content: ${l.trim()}`);
  }
});

console.log(`Final balance -> Parens: ${p}, Braces: ${b}, Brackets: ${c}`);

const fs = require('fs');
const code = fs.readFileSync('src/components/ScanImagesView.tsx', 'utf8');

const lines = code.split('\n');
let depth = 0;
let stack = [];

lines.forEach((l, i) => {
  for (let col = 0; col < l.length; col++) {
    const char = l[col];
    if (char === '{') {
      depth++;
      stack.push({ line: i + 1, content: l.trim().slice(0, 45) });
    } else if (char === '}') {
      depth--;
      if (stack.length > 0) stack.pop();
      else console.log(`Extra '}' at line ${i+1}: ${l.trim().slice(0, 45)}`);
    }
  }
});

console.log('Final depth:', depth);
console.log('Unclosed braces count:', stack.length);
stack.forEach(s => console.log(`Unclosed '{' opened at Line ${s.line}: ${s.content}`));

import fs from 'fs';
import path from 'path';

let out = "";

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
        searchDir(fullPath);
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('triggerPrint') || content.includes('print') || content.includes('Print')) {
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.includes('Print') || line.includes('print')) {
            out += `${file}:${idx+1}: ${line.trim()}\n`;
          }
        });
      }
    }
  }
}

searchDir('src');
fs.writeFileSync('scratch/print_search_results.txt', out, 'utf8');
console.log("Wrote scratch/print_search_results.txt!");

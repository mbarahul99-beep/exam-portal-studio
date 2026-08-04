import fs from 'fs';

const code = fs.readFileSync('src/App.tsx', 'utf8');
const lines = code.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('useEffect(')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});

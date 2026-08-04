import fs from 'fs';

const content = fs.readFileSync('src/App.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes("activeTab === 'teachers'") || (idx > 3400 && idx < 3450)) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});

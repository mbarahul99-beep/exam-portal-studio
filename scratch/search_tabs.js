import fs from 'fs';

const content = fs.readFileSync('src/App.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('setActiveTab(') || line.includes('nav-item')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});

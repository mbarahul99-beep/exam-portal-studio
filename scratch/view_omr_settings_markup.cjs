const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/App.tsx', 'utf8');
const lines = content.split('\n');
let active = false;
let start = 0;
lines.forEach((line, idx) => {
  if (line.includes('OMR Settings') && line.includes('h2') || line.includes('OMR Card Configuration')) {
    active = true;
    start = idx;
  }
  if (active && idx < start + 250) {
    console.log(`${idx + 1}: ${line}`);
  }
});

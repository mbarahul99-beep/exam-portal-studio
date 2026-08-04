const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/StudentReportPrint.tsx', 'utf8');
const regex = /(color|background|border|fill):\s*['"]?([^'";}]+)['"]?/g;
let match;
const found = [];
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('color') || line.includes('#') || line.includes('rgb')) {
    found.push(`${idx + 1}: ${line.trim()}`);
  }
});
fs.writeFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/scratch/found_colors.txt', found.join('\n'));
console.log(`Found ${found.length} color lines. Saved to scratch/found_colors.txt`);

const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/StudentReportPrint.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('<table') || line.includes('</table') || line.includes('thead') || line.includes('tbody')) {
    console.log(`${idx + 1}: ${line}`);
  }
});

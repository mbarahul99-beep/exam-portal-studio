const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/StudentReportPortal.tsx', 'utf8');
const lines = content.split('\n');
lines.slice(0, 30).forEach((line, idx) => {
  console.log(`${idx + 1}: ${line}`);
});

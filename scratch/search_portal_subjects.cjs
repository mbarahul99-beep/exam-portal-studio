const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/StudentReportPortal.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('subjectStats') || line.includes('Subject-wise Performance Diagnostics')) {
    console.log(`${idx + 1}: ${line}`);
  }
});

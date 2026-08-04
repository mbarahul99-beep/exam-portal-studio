const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/StudentReportPrint.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('report-header') || line.includes('logo-brand') || line.includes('print-logo-img')) {
    console.log(`${idx + 1}: ${line}`);
  }
});

const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/StudentReportPortal.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('Download PDF') || line.includes('handleDownload') || line.includes('pdf') || line.includes('Print')) {
    if (line.includes('button') || line.includes('onClick') || line.includes('function')) {
      console.log(`${idx + 1}: ${line}`);
    }
  }
});

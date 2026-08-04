const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/StudentReportPortal.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('html2pdf') || line.includes('jspdf') || line.includes('generatePdf') || line.includes('downloadPdf') || line.includes('window.print')) {
    console.log(`${idx + 1}: ${line}`);
  }
});

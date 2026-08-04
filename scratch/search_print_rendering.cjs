const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/StudentReportPrint.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('className="') || line.includes('<table') || line.includes('section-wise') || line.includes('Response Map')) {
    console.log(`${idx + 1}: ${line}`);
  }
});

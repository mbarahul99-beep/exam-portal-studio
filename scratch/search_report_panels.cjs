const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/StudentReportPortal.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('className="hub-') || line.includes('className="glass-card') || line.includes('Scorecard') || line.includes('Analysis')) {
    console.log(`${idx + 1}: ${line}`);
  }
});

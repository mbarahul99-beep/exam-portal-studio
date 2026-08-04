const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/StudentReportPrint.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('difficulty metrics') || line.toLowerCase().includes('easy questions') || line.toLowerCase().includes('moderate questions')) {
    console.log(`${idx + 1}: ${line}`);
  }
});

const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/StudentReportPortal.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (idx + 1 >= 1030 && idx + 1 <= 1260) {
    if (line.includes('split') || line.includes('Section-wise Performance Breakdown') || line.includes('Question Response Map') || line.includes('Bubble grid list')) {
      console.log(`${idx + 1}: ${line}`);
    }
  }
});

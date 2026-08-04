const fs = require('fs');

function findPoints(filepath) {
  console.log(`Searching points in ${filepath}:`);
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (/point/i.test(line)) {
      console.log(`  L${idx + 1}: ${line.trim()}`);
    }
  });
}

findPoints('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/StudentReportPortal.tsx');
findPoints('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/StudentReportPrint.tsx');

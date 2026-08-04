const fs = require('fs');

function searchFile(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n');
  console.log(`=== ${filepath} ===`);
  lines.forEach((line, idx) => {
    if (line.includes('omr_custom_settings')) {
      console.log(`${idx + 1}: ${line}`);
    }
  });
}

searchFile('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/StudentReportPrint.tsx');
searchFile('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/StudentReportPortal.tsx');

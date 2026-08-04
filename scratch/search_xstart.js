const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/utils/omrScanner.ts', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('studentId') || line.includes('xStart')) {
    console.log(`${idx + 1}: ${line}`);
  }
});

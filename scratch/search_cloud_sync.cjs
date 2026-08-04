const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/utils/cloudSync.ts', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('difficulties') || line.includes('JSON.stringify') || line.includes('JSON.parse') || line.includes('answerKeys')) {
    console.log(`${idx + 1}: ${line}`);
  }
});

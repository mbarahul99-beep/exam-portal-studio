const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/OnlineSubmissionViewer.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('db.questions') || line.includes('questions') || line.includes('difficulty')) {
    console.log(`${idx + 1}: ${line}`);
  }
});

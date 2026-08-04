const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/server.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('/api/exams') || line.includes('answerKeys') || line.includes('insert into exams') || line.includes('update exams')) {
    console.log(`${idx + 1}: ${line}`);
  }
});

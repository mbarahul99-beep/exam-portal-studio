const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/server.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('/api/questions') || line.includes('insert into questions') || line.includes('update questions') || line.includes('explanation')) {
    console.log(`${idx + 1}: ${line}`);
  }
});

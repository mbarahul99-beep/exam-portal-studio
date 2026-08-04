const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/server.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('settings') || line.includes('custom_settings') || line.includes('/api/')) {
    console.log(`${idx + 1}: ${line}`);
  }
});

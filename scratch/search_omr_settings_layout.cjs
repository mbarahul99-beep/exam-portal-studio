const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/OmrSettingsView.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('gridTemplateColumns') || line.includes('display: \'grid\'') || line.includes('flexWrap') || line.includes('maxWidth')) {
    console.log(`${idx + 1}: ${line}`);
  }
});

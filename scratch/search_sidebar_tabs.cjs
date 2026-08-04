const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/App.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('activeTab') || line.includes('setActiveTab') || line.includes('Sliders') || line.includes('Settings')) {
    if (line.trim().startsWith('<') || line.includes('useState') || line.includes('const [activeTab')) {
      console.log(`${idx + 1}: ${line.trim()}`);
    }
  }
});

const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/BrandingSettingsView.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('Difficulty') || line.includes('Section-wise') || line.includes('Subject-wise')) {
    console.log(`${idx + 1}: ${line}`);
  }
});

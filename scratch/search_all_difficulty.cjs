const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/StudentReportPrint.tsx', 'utf8');
console.log('Includes Difficulty Metrics Summary?', content.includes('Difficulty Metrics Summary'));
console.log('Includes DIFFICULTY METRICS SUMMARY?', content.includes('DIFFICULTY METRICS SUMMARY'));
console.log('Includes Difficulty-level Diagnostics?', content.includes('Difficulty-level Diagnostics'));

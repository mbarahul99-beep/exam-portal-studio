const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/StudentReportPortal.tsx', 'utf8');
console.log('Includes Difficulty Metrics Summary?', content.includes('Difficulty Metrics Summary'));
console.log('Includes Section-wise Performance Breakdown?', content.includes('Section-wise Performance Breakdown'));

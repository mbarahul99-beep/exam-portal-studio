import fs from 'fs';

const content = fs.readFileSync('src/components/OnlineExamPortal.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('clear') || line.toLowerCase().includes('mark for review') || line.toLowerCase().includes('prev') || line.toLowerCase().includes('next')) {
    if (line.includes('button') || line.includes('onClick')) {
      console.log(`${idx + 1}: ${line.trim()}`);
    }
  }
});

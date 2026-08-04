import fs from 'fs';

const content = fs.readFileSync('src/components/StudentReportPortal.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('pdf') || line.toLowerCase().includes('download') || line.toLowerCase().includes('print')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});

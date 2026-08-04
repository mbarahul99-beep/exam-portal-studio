import fs from 'fs';

const content = fs.readFileSync('src/components/StudentReportPrint.tsx', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('<style>') || line.includes('</style>') || line.includes('@media')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});

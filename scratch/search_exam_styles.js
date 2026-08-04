import fs from 'fs';

const content = fs.readFileSync('src/components/OnlineExamPortal.tsx', 'utf8');
const lines = content.split('\n');

let inStyle = false;
lines.forEach((line, idx) => {
  if (line.includes('<style>{`')) inStyle = true;
  if (inStyle && (line.includes('cbt-') || line.includes('pane') || line.includes('navigation'))) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
  if (line.includes('`}</style>')) inStyle = false;
});

import fs from 'fs';

const appContent = fs.readFileSync('src/App.tsx', 'utf8');
const loginContent = fs.readFileSync('src/components/UnifiedLoginPortal.tsx', 'utf8');

console.log("UnifiedLoginPortal search:");
const loginLines = loginContent.split('\n');
loginLines.forEach((line, idx) => {
  if (line.toLowerCase().includes('email') || line.toLowerCase().includes('admin') || line.toLowerCase().includes('google')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});

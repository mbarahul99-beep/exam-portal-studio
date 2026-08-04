import fs from 'fs';

const scannerCode = fs.readFileSync('src/utils/omrScanner.ts', 'utf8');
const lines = scannerCode.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('export const OMR_CONFIG') || line.includes('getDynamicOMRQuestionLayout')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});

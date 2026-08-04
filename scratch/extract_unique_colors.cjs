const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/StudentReportPrint.tsx', 'utf8');

// Match hex colors, rgb, rgba, and named colors
const hexRegex = /#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})/g;
const rgbRegex = /rgba?\([^)]+\)/g;

const hexMatches = content.match(hexRegex) || [];
const rgbMatches = content.match(rgbRegex) || [];

const allColors = new Set([...hexMatches, ...rgbMatches]);
console.log('Unique colors found:', Array.from(allColors));

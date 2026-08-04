const fs = require('fs');
const filePath = 'C:/Users/ADMIN/.gemini/antigravity/scratch/exam-portal/src/components/StudentReportPrint.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Replace color codes
content = content.replace(/#2b6cb0/gi, '#000000');
content = content.replace(/#1e3a8a/gi, '#000000');
content = content.replace(/#475569/gi, '#000000');
content = content.replace(/#1e293b/gi, '#000000');
content = content.replace(/#64748b/gi, '#000000');
content = content.replace(/#718096/gi, '#000000');
content = content.replace(/#94a3b8/gi, '#000000');
content = content.replace(/#ebf8ff/gi, '#f8fafc');

// Add optimizeLegibility and font smoothing to the body style
const bodyTarget = 'body {\n          background: #f1f5f9 !important;\n          color: #000000 !important;';
const bodyReplacement = 'body {\n          background: #f1f5f9 !important;\n          color: #000000 !important;\n          -webkit-font-smoothing: antialiased;\n          -moz-osx-font-smoothing: grayscale;\n          text-rendering: optimizeLegibility;';
content = content.replace(bodyTarget, bodyReplacement);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Colors replaced successfully and print quality enhanced in StudentReportPrint.tsx.');

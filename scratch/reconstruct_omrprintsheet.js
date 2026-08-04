import fs from 'fs';
import readline from 'readline';

async function main() {
  const fileStream = fs.createReadStream('C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\c8b074ad-077b-46f3-b977-d7ef0b1974ac\\.system_generated\\logs\\transcript_full.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const stepsToExtract = [358, 360, 362, 364];
  const contents = {};

  for await (const line of rl) {
    const parsed = JSON.parse(line);
    if (stepsToExtract.includes(parsed.step_index)) {
      contents[parsed.step_index] = parsed.content;
    }
  }

  // Reconstruct
  let reconstructedLines = [];
  
  stepsToExtract.forEach(step => {
    const rawContent = contents[step];
    if (!rawContent) {
      console.error(`Step ${step} content not found!`);
      return;
    }

    const lines = rawContent.split('\n');
    let startProcessing = false;
    for (const l of lines) {
      if (l.includes('Showing lines')) {
        startProcessing = true;
        continue;
      }
      if (l.includes('The following code has been modified') || l.includes('Please note that any changes targeting the original code')) {
        continue;
      }
      if (startProcessing) {
        // Match line number prefix like "1: content" or "10: content"
        const match = l.match(/^\s*(\d+):\s?(.*)$/);
        if (match) {
          const lineNum = parseInt(match[1]);
          const content = match[2];
          reconstructedLines.push({ num: lineNum, content });
        }
      }
    }
  });

  // Sort by line number
  reconstructedLines.sort((a, b) => a.num - b.num);

  const finalCode = reconstructedLines.map(r => r.content).join('\n');
  fs.writeFileSync('src/components/OmrPrintSheet.original.tsx', finalCode, 'utf8');
  console.log('Reconstructed OmrPrintSheet.original.tsx successfully!');
  console.log(`Reconstructed ${reconstructedLines.length} lines.`);
}

main().catch(console.error);

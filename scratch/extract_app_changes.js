import fs from 'fs';
import readline from 'readline';

async function main() {
  const fileStream = fs.createReadStream('C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\c8b074ad-077b-46f3-b977-d7ef0b1974ac\\.system_generated\\logs\\transcript_full.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const stepsToInspect = [443, 445, 453, 459];

  for await (const line of rl) {
    const parsed = JSON.parse(line);
    if (stepsToInspect.includes(parsed.step_index) && parsed.tool_calls) {
      parsed.tool_calls.forEach(c => {
        if (c.name === 'replace_file_content') {
          console.log(`=== STEP ${parsed.step_index} ===`);
          console.log(`StartLine: ${c.args.StartLine}, EndLine: ${c.args.EndLine}`);
          console.log("TARGET CONTENT:");
          console.log(c.args.TargetContent);
          console.log("REPLACEMENT CONTENT:");
          console.log(c.args.ReplacementContent);
          console.log("\n");
        }
      });
    }
  }
}

main().catch(console.error);

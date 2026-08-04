import fs from 'fs';
import readline from 'readline';

async function main() {
  const fileStream = fs.createReadStream('C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\c8b074ad-077b-46f3-b977-d7ef0b1974ac\\.system_generated\\logs\\transcript_full.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const stepsToInspect = [443, 445, 453, 459];
  let logContent = "";

  for await (const line of rl) {
    const parsed = JSON.parse(line);
    if (stepsToInspect.includes(parsed.step_index) && parsed.tool_calls) {
      parsed.tool_calls.forEach(c => {
        if (c.name === 'replace_file_content') {
          logContent += `=== STEP ${parsed.step_index} ===\n`;
          logContent += `StartLine: ${c.args.StartLine}, EndLine: ${c.args.EndLine}\n`;
          logContent += `TARGET CONTENT:\n${c.args.TargetContent}\n`;
          logContent += `REPLACEMENT CONTENT:\n${c.args.ReplacementContent}\n\n`;
        }
      });
    }
  }

  fs.writeFileSync('scratch/app_changes_details.txt', logContent, 'utf8');
  console.log("Successfully wrote scratch/app_changes_details.txt!");
}

main().catch(console.error);

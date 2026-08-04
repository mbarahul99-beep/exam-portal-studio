import fs from 'fs';
import readline from 'readline';

async function main() {
  const fileStream = fs.createReadStream('C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\c8b074ad-077b-46f3-b977-d7ef0b1974ac\\.system_generated\\logs\\transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const parsed = JSON.parse(line);
    if (parsed.tool_calls) {
      parsed.tool_calls.forEach(c => {
        if (c.name === 'replace_file_content' || c.name === 'write_to_file' || c.name === 'multi_replace_file_content') {
          console.log(`STEP ${parsed.step_index}: ${c.name} on ${c.args.TargetFile}`);
        }
      });
    }
  }
}

main().catch(console.error);

import fs from 'fs';
import readline from 'readline';

async function main() {
  const fileStream = fs.createReadStream('C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\c8b074ad-077b-46f3-b977-d7ef0b1974ac\\.system_generated\\logs\\transcript_full.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let out = "";

  for await (const line of rl) {
    const parsed = JSON.parse(line);
    if (parsed.tool_calls) {
      parsed.tool_calls.forEach(c => {
        const str = JSON.stringify(c);
        if (str.toLowerCase().includes('push') || str.toLowerCase().includes('git') || str.toLowerCase().includes('commit')) {
          out += `STEP ${parsed.step_index}: Call to ${c.name} with args: ${JSON.stringify(c.args)}\n`;
        }
      });
    }
    if (parsed.type === 'USER_INPUT' && (parsed.content.toLowerCase().includes('push') || parsed.content.toLowerCase().includes('github'))) {
      out += `STEP ${parsed.step_index} USER PROMPT: ${parsed.content}\n`;
    }
  }

  fs.writeFileSync('scratch/push_history.txt', out, 'utf8');
  console.log("Wrote scratch/push_history.txt!");
}

main().catch(console.error);

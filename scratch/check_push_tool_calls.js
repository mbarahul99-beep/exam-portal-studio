import fs from 'fs';
import readline from 'readline';

async function main() {
  const fileStream = fs.createReadStream('C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\c8b074ad-077b-46f3-b977-d7ef0b1974ac\\.system_generated\\logs\\transcript_full.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const parsed = JSON.parse(line);
    if (parsed.tool_calls) {
      parsed.tool_calls.forEach(c => {
        const str = JSON.stringify(c);
        if (str.toLowerCase().includes('push') || str.toLowerCase().includes('git') || str.toLowerCase().includes('commit')) {
          console.log(`STEP ${parsed.step_index}: Call to ${c.name} with args:`, c.args);
        }
      });
    }
    if (parsed.type === 'USER_INPUT' && (parsed.content.toLowerCase().includes('push') || parsed.content.toLowerCase().includes('github'))) {
      console.log(`STEP ${parsed.step_index} USER PROMPT: ${parsed.content}`);
    }
  }
}

main().catch(console.error);

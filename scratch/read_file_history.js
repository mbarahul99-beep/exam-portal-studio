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
    
    // Check if tool_calls has view_file for OmrPrintSheet.tsx or App.tsx
    if (parsed.tool_calls) {
      parsed.tool_calls.forEach(c => {
        if (c.name === 'view_file' && (c.args.AbsolutePath.includes('OmrPrintSheet.tsx') || c.args.AbsolutePath.includes('App.tsx'))) {
          console.log(`STEP ${parsed.step_index}: view_file on ${c.args.AbsolutePath} (StartLine: ${c.args.StartLine}, EndLine: ${c.args.EndLine})`);
        }
        if ((c.name === 'replace_file_content' || c.name === 'multi_replace_file_content') && (c.args.TargetFile.includes('OmrPrintSheet.tsx') || c.args.TargetFile.includes('App.tsx'))) {
          console.log(`STEP ${parsed.step_index}: ${c.name} on ${c.args.TargetFile}`);
        }
      });
    }

    // Check if the system/model response contains the viewed content
    if (parsed.type === 'PLANNER_RESPONSE' && parsed.step_index < 439) {
      // If we need to print, we can print here
    }
  }
}

main().catch(console.error);

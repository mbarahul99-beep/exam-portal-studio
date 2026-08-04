import fs from 'fs';
import readline from 'readline';

async function main() {
  const fileStream = fs.createReadStream('C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\c8b074ad-077b-46f3-b977-d7ef0b1974ac\\.system_generated\\logs\\transcript_full.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let contents = {};
  
  for await (const line of rl) {
    const parsed = JSON.parse(line);
    
    // Look for tool response in transcript
    if (parsed.source === 'SYSTEM' || parsed.type === 'PLANNER_RESPONSE') {
      // Wait, in transcript, tool output is usually in a step of type PLANNER_RESPONSE (the response)
      // or in the subsequent step's content/logs.
      // Let's inspect the keys of parsed to find where the output of tool calls is stored.
    }
    
    // Let's search for the raw content string in the JSON
    const contentStr = line;
    if (contentStr.includes('OmrPrintSheet.tsx') && contentStr.includes('Showing lines')) {
      const parsedObj = JSON.parse(line);
      // Let's find if this is the tool output
      console.log(`Found a match in step ${parsedObj.step_index}`);
      console.log(contentStr.substring(0, 500));
    }
  }
}

main().catch(console.error);

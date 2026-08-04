import fs from 'fs';

function restoreOmrPrintSheet() {
  console.log("Restoring OmrPrintSheet.tsx...");
  const originalCode = fs.readFileSync('src/components/OmrPrintSheet.original.tsx', 'utf8');
  fs.writeFileSync('src/components/OmrPrintSheet.tsx', originalCode, 'utf8');
  console.log("OmrPrintSheet.tsx restored!");
}

function restoreApp() {
  console.log("Restoring App.tsx changes...");
  
  // Read from the clean backup to start fresh
  let appCode = fs.readFileSync('src/App.backup.tsx', 'utf8');
  
  // Normalize all newlines in App.tsx to \n
  appCode = appCode.replace(/\r\n/g, '\n');

  // Step 443 Revert
  const step443Replacement = `import { scanOMRSheet, OMR_CONFIG, getDynamicOMRQuestionLayout } from './utils/omrScanner';
import { OmrPrintSheet } from './components/OmrPrintSheet';
import { DEFAULT_OMR_SETTINGS } from './components/OmrSettingsView';`.replace(/\r\n/g, '\n');

  const step443Target = `import { scanOMRSheet, OMR_CONFIG } from './utils/omrScanner';
import { OmrPrintSheet } from './components/OmrPrintSheet';`.replace(/\r\n/g, '\n');

  if (appCode.includes(step443Replacement)) {
    appCode = appCode.replace(step443Replacement, step443Target);
    console.log("Reverted Step 443!");
  } else {
    console.warn("Step 443 replacement pattern not found!");
  }

  // Step 445 Revert
  const step445Replacement = `  // Printing Action
  const triggerPrint = (exam: Exam) => {
    setPrintExam(exam);
    setTimeout(() => {
      window.print();
      // Keep it mounted longer (e.g. 3000ms) on mobile or listen to afterprint
      const handleAfterPrint = () => {
        setPrintExam(null);
        window.removeEventListener('afterprint', handleAfterPrint);
      };
      window.addEventListener('afterprint', handleAfterPrint);
      setTimeout(handleAfterPrint, 3000);
    }, 500);
  };`.replace(/\r\n/g, '\n');

  const step445Target = `  // Printing Action
  const triggerPrint = (exam: Exam) => {
    setPrintExam(exam);
    setTimeout(() => {
      window.print();
      setPrintExam(null);
    }, 300);
  };`.replace(/\r\n/g, '\n');

  if (appCode.includes(step445Replacement)) {
    appCode = appCode.replace(step445Replacement, step445Target);
    console.log("Reverted Step 445!");
  } else {
    console.warn("Step 445 replacement pattern not found!");
  }

  // Step 459 Revert
  const step459Replacement = `        .print-only {
          display: none;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
        }`.replace(/\r\n/g, '\n');

  const step459Target = `        @media print {
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
        }`.replace(/\r\n/g, '\n');

  if (appCode.includes(step459Replacement)) {
    appCode = appCode.replace(step459Replacement, step459Target);
    console.log("Reverted Step 459!");
  } else {
    console.warn("Step 459 replacement pattern not found!");
  }

  // Step 453 Revert
  const details = fs.readFileSync('scratch/app_changes_details.txt', 'utf8');
  
  // Parse STEP 453 blocks
  const step453Index = details.indexOf('=== STEP 453 ===');
  const nextStepIndex = details.indexOf('=== STEP 459 ===');
  const step453Block = details.substring(step453Index, nextStepIndex);
  
  const targetStart = step453Block.indexOf('TARGET CONTENT:\n') + 'TARGET CONTENT:\n'.length;
  const targetEnd = step453Block.indexOf('REPLACEMENT CONTENT:\n');
  const step453Target = step453Block.substring(targetStart, targetEnd).trim().replace(/\r\n/g, '\n');
  const step453Replacement = step453Block.substring(targetEnd + 'REPLACEMENT CONTENT:\n'.length).trim().replace(/\r\n/g, '\n');

  if (appCode.includes(step453Replacement)) {
    appCode = appCode.replace(step453Replacement, step453Target);
    console.log("Reverted Step 453!");
  } else {
    console.warn("Step 453 replacement pattern not matched exactly, attempting substring search...");
    const prefix = step453Replacement.substring(0, 150);
    const suffix = step453Replacement.substring(step453Replacement.length - 150);
    
    const prefixIdx = appCode.indexOf(prefix);
    const suffixIdx = appCode.indexOf(suffix);
    
    if (prefixIdx !== -1 && suffixIdx !== -1 && prefixIdx < suffixIdx) {
      const actualMatchedText = appCode.substring(prefixIdx, suffixIdx + suffix.length);
      appCode = appCode.replace(actualMatchedText, step453Target);
      console.log("Reverted Step 453 via substring matching!");
    } else {
      console.error("Step 453 Revert FAILED!");
    }
  }

  // Convert newlines back to CRLF for Windows compatibility if needed, or keep LF. Let's convert to CRLF.
  const crlfCode = appCode.replace(/\n/g, '\r\n');
  fs.writeFileSync('src/App.tsx', crlfCode, 'utf8');
  console.log("App.tsx restore completed successfully!");
}

try {
  restoreOmrPrintSheet();
  restoreApp();
} catch (e) {
  console.error("Restore failed:", e);
}

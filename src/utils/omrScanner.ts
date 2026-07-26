// OMR Scanner Computer Vision utility using OpenCV.js (NEET 200-Question Layout)
// Warped page resolution: 1000 x 1414 (A4 aspect ratio)

import { scanOMRSheetPureJS } from './jsOMRScanner';

export interface ScanResult {
  studentNum: string;
  answers: Record<number, string>;
  bookletSet?: string;
  debugWarpedCanvas?: HTMLCanvasElement; // For showing the warped, aligned page in UI
}

// Coordinate mapping parameters (matching the generated HTML NEET sheet)
export const OMR_CONFIG = {
  width: 1000,
  height: 1414,
  
  // Anchors target coordinates (centers of the black squares)
  anchors: {
    tl: { x: 30, y: 30 },
    tr: { x: 970, y: 30 },
    bl: { x: 30, y: 1384 },
    br: { x: 970, y: 1384 }
  },

  // Student ID block coordinates (Roll No: 10 digits, 1-9 then 0)
  studentId: {
    xStart: 100, // Center of first digit column
    xStep: 25,   // Horizontal spacing between digits
    yStart: 216, // Center of '1' bubble row
    yStep: 20,   // Vertical spacing between rows 1-9, 0 (10 rows)
    numDigits: 10,
    bubbleRadius: 7
  },

  // Test Booklet No coordinates (7 digits, 1-9 then 0)
  bookletNo: {
    xStart: 370,
    xStep: 25,
    yStart: 216,
    yStep: 20,
    numDigits: 7,
    bubbleRadius: 7
  },

  // Questions layout coordinates (5 columns of 40 questions each = 200 total)
  questions: {
    bubbleRadius: 6,
    yStart: 450,
    yStep: 20,
    columns: [
      { qStart: 1, qEnd: 40, xLabel: 90, xOptions: [120, 145, 170, 195] },
      { qStart: 41, qEnd: 80, xLabel: 260, xOptions: [290, 315, 340, 365] },
      { qStart: 81, qEnd: 120, xLabel: 430, xOptions: [460, 485, 510, 535] },
      { qStart: 121, qEnd: 160, xLabel: 600, xOptions: [630, 655, 680, 705] },
      { qStart: 161, qEnd: 200, xLabel: 770, xOptions: [800, 825, 850, 875] }
    ]
  }
};


/**
 * Main OMR Scanner function. Processes an source image (HTMLCanvasElement, HTMLImageElement, or ImageData)
 * and returns the detected Student ID (Roll No) and Answers.
 */
export async function scanOMRSheet(
  sourceImage: HTMLCanvasElement | HTMLImageElement,
  numQuestions: number,
  rollNoDigits: number = 10,
  examSetsCount: number = 1,
  sections: any[] = []
): Promise<ScanResult> {
  const cv = window.cv;
  if (!cv || typeof cv.Mat !== 'function') {
    // Pure JS Canvas OMR Engine fallback (Instant 0ms execution on mobile devices)
    return scanOMRSheetPureJS(sourceImage, numQuestions, rollNoDigits, examSetsCount, sections);
  }

  // 1. Read source image into Mat
  let src = cv.imread(sourceImage);
  let gray = new cv.Mat();
  let blurred = new cv.Mat();
  let thresh = new cv.Mat();
  let contours: any = null;
  let hierarchy: any = null;
  let warpedGray: any = null;

  try {
    // 2. Preprocessing
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    
    // Apply Gaussian blur to smooth out noise
    let ksize = new cv.Size(5, 5);
    cv.GaussianBlur(gray, blurred, ksize, 0);
    
    // Apply adaptive thresholding to get binary black/white image (handling shadow variations)
    cv.adaptiveThreshold(
      blurred,
      thresh,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      15, // Block size
      9   // Constant
    );

    // 3. Find contours
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // 4. Find the 4 corner anchors
    const candidates: Array<{ center: { x: number; y: number }; area: number; rect: any }> = [];
    const srcWidth = src.cols;
    const srcHeight = src.rows;

    for (let i = 0; i < contours.size(); ++i) {
      const cnt = contours.get(i);
      const rect = cv.boundingRect(cnt);
      const area = rect.width * rect.height;
      const aspectRatio = rect.width / rect.height;

      const pageArea = srcWidth * srcHeight;
      // Ultra-forgiving range for camera distance & angle (0.00001 * pageArea to 0.05 * pageArea)
      const isCorrectSize = area > pageArea * 0.00001 && area < pageArea * 0.05;
      // Allow aspect ratios between 0.4 and 2.5 to handle camera tilt angles
      const isSquare = aspectRatio >= 0.4 && aspectRatio <= 2.5;

      if (isCorrectSize && isSquare) {
        const center = {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2
        };
        candidates.push({ center, area, rect });
      }
    }

    const findBestQuadInCandidates = (cands: Array<{ center: { x: number; y: number }; area: number; rect: any }>) => {
      const sorted = [...cands].sort((a, b) => b.area - a.area);
      const topCands = sorted.slice(0, 25);
      
      let bestQuad: { tl: any; tr: any; bl: any; br: any } | null = null;
      let maxQuadArea = 0;

      if (topCands.length >= 4) {
        for (let i = 0; i < topCands.length; i++) {
          for (let j = i + 1; j < topCands.length; j++) {
            for (let k = j + 1; k < topCands.length; k++) {
              for (let l = k + 1; l < topCands.length; l++) {
                const pts = [topCands[i], topCands[j], topCands[k], topCands[l]];
                
                const sortedBySum = [...pts].sort((a, b) => (a.center.x + a.center.y) - (b.center.x + b.center.y));
                const tl = sortedBySum[0];
                const br = sortedBySum[3];
                
                const remaining = [sortedBySum[1], sortedBySum[2]];
                const sortedByDiff = remaining.sort((a, b) => (a.center.x - a.center.y) - (b.center.x - b.center.y));
                const bl = sortedByDiff[0];
                const tr = sortedByDiff[1];

                const wTop = Math.sqrt((tl.center.x - tr.center.x) ** 2 + (tl.center.y - tr.center.y) ** 2);
                const wBot = Math.sqrt((bl.center.x - br.center.x) ** 2 + (bl.center.y - br.center.y) ** 2);
                const hLeft = Math.sqrt((tl.center.x - bl.center.x) ** 2 + (tl.center.y - bl.center.y) ** 2);
                const hRight = Math.sqrt((tr.center.x - br.center.x) ** 2 + (tr.center.y - br.center.y) ** 2);

                const avgW = (wTop + wBot) / 2;
                const avgH = (hLeft + hRight) / 2;

                if (avgW === 0) continue;
                const ratio = avgH / avgW;

                // Ultra-forgiving ratio (0.8 to 2.0) and width/height variation (up to 45% perspective tilt)
                const isRatioValid = ratio >= 0.80 && ratio <= 2.0;
                const isWidthSimilar = Math.abs(wTop - wBot) / Math.max(wTop, wBot) < 0.45;
                const isHeightSimilar = Math.abs(hLeft - hRight) / Math.max(hLeft, hRight) < 0.45;

                if (isRatioValid && isWidthSimilar && isHeightSimilar) {
                  const quadArea = avgW * avgH;
                  if (quadArea > maxQuadArea) {
                    maxQuadArea = quadArea;
                    bestQuad = { tl, tr, bl, br };
                  }
                }
              }
            }
          }
        }
      }
      return bestQuad;
    };

    let tlMarker: any = null;
    let trMarker: any = null;
    let blMarker: any = null;
    let brMarker: any = null;

    let quad = findBestQuadInCandidates(candidates);
    if (quad) {
      tlMarker = quad.tl;
      trMarker = quad.tr;
      blMarker = quad.bl;
      brMarker = quad.br;
    }

    // Fallback: If markers are not successfully detected using adaptive threshold, try multi-level global thresholding
    if (!tlMarker || !trMarker || !blMarker || !brMarker) {
      const fallbackThresholds = [70, 95, 120, 150];
      for (const threshVal of fallbackThresholds) {
        cv.threshold(gray, thresh, threshVal, 255, cv.THRESH_BINARY_INV);

        candidates.length = 0;
        contours.delete();
        hierarchy.delete();
        contours = new cv.MatVector();
        hierarchy = new cv.Mat();
        cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        for (let i = 0; i < contours.size(); ++i) {
          const cnt = contours.get(i);
          const rect = cv.boundingRect(cnt);
          const area = rect.width * rect.height;
          const aspectRatio = rect.width / rect.height;
          const pageArea = srcWidth * srcHeight;

          const isCorrectSize = area > pageArea * 0.00001 && area < pageArea * 0.05;
          const isSquare = aspectRatio >= 0.4 && aspectRatio <= 2.5;

          if (isCorrectSize && isSquare) {
            const center = {
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2
            };
            candidates.push({ center, area, rect });
          }
        }

        quad = findBestQuadInCandidates(candidates);
        if (quad) {
          tlMarker = quad.tl;
          trMarker = quad.tr;
          blMarker = quad.bl;
          brMarker = quad.br;
          break;
        }
      }
    }

    if (!tlMarker || !trMarker || !blMarker || !brMarker) {
      throw new Error("Could not locate the 4 corner anchors. Please hold camera directly over the paper and ensure all 4 black square corner anchors are clearly visible.");
    }

    // Validate paper geometry aspect ratio (Standard A4 ratio is ~1.41, allow 0.75 to 2.2 for camera perspective tilt)
    const topWidth = Math.hypot(trMarker.center.x - tlMarker.center.x, trMarker.center.y - tlMarker.center.y);
    const leftHeight = Math.hypot(blMarker.center.x - tlMarker.center.x, blMarker.center.y - tlMarker.center.y);
    const paperAspectRatio = leftHeight / (topWidth || 1);

    if (paperAspectRatio < 0.75 || paperAspectRatio > 2.2) {
      throw new Error("Sheet Layout Mismatch: The detected sheet aspect ratio does not match the standard OMR template.");
    }

    if (numQuestions > 200) {
      throw new Error(`Sheet Layout Mismatch: Exam is set for ${numQuestions} questions, but standard template supports up to 200 questions.`);
    }

    // 5. Perspective Warp to standard A4 (1000 x 1414)
    let srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      tlMarker.center.x, tlMarker.center.y,
      trMarker.center.x, trMarker.center.y,
      brMarker.center.x, brMarker.center.y,
      blMarker.center.x, blMarker.center.y
    ]);

    let dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      OMR_CONFIG.anchors.tl.x, OMR_CONFIG.anchors.tl.y,
      OMR_CONFIG.anchors.tr.x, OMR_CONFIG.anchors.tr.y,
      OMR_CONFIG.anchors.br.x, OMR_CONFIG.anchors.br.y,
      OMR_CONFIG.anchors.bl.x, OMR_CONFIG.anchors.bl.y
    ]);

    let M = cv.getPerspectiveTransform(srcPts, dstPts);
    let warped = new cv.Mat();
    let warpedSize = new cv.Size(OMR_CONFIG.width, OMR_CONFIG.height);
    cv.warpPerspective(src, warped, M, warpedSize);

    // Convert warped image to grayscale for bubble average intensity scan
    warpedGray = new cv.Mat();
    cv.cvtColor(warped, warpedGray, cv.COLOR_RGBA2GRAY);

    const debugWarpedCanvas = document.createElement('canvas');
    cv.imshow(debugWarpedCanvas, warped);

    // 5.2. Auto-Calibrate Vertical Scan Offset
    // Scans range of vertical shifts from -25px to +25px to find the alignment that maximizes bubble darkness contrast
    let bestDy = 0;
    let minAvgIntensity = 256;
    const sidConf = OMR_CONFIG.studentId;

    for (let dy = -5; dy <= 5; dy += 1) {
      let totalIntensity = 0;
      let filledColumnsCount = 0;
      for (let colIdx = 0; colIdx < rollNoDigits; colIdx++) {
        const x = sidConf.xStart + colIdx * sidConf.xStep;
        let colMin = 256;
        let colMax = -1;
        for (let rowIdx = 0; rowIdx < 10; rowIdx++) {
          const y = sidConf.yStart + rowIdx * sidConf.yStep + dy;
          const avgGray = calculateBubbleAverageGray(warpedGray, x, y, 4.5);
          if (avgGray < colMin) {
            colMin = avgGray;
          }
          if (avgGray > colMax) {
            colMax = avgGray;
          }
        }
        // Only count columns with a clear contrast difference (indicating a filled bubble)
        if (colMax - colMin > 50) {
          totalIntensity += colMin;
          filledColumnsCount++;
        }
      }
      if (filledColumnsCount > 0) {
        const avg = totalIntensity / filledColumnsCount;
        if (avg < minAvgIntensity) {
          minAvgIntensity = avg;
          bestDy = dy;
        }
      }
    }
    console.log("[OMR Scanner] Calibrated vertical offset:", bestDy, "px");

    // 5.5. Scan Booklet Code Set
    let bookletSet: string | undefined = undefined;
    const setIntensities: number[] = [];
    const checkCount = Math.min(4, Math.max(1, examSetsCount));
    for (let idx = 0; idx < checkCount; idx++) {
      const x = 580 + idx * 25;
      const y = OMR_CONFIG.studentId.yStart + bestDy;
      const avgGray = calculateBubbleAverageGray(warpedGray, x, y, 4.5);
      setIntensities.push(avgGray);
    }
    let minVal = 256;
    let maxVal = -1;
    let minIdx = -1;
    for (let idx = 0; idx < checkCount; idx++) {
      const val = setIntensities[idx];
      if (val < minVal) {
        minVal = val;
        minIdx = idx;
      }
      if (val > maxVal) {
        maxVal = val;
      }
    }
    if (minIdx !== -1 && maxVal - minVal > 45 && minVal < 140) {
      bookletSet = String.fromCharCode(65 + minIdx);
    }

    // 6. Scan Roll No (rollNoDigits digits instead of hardcoded 10)
    let studentNum = '';
    const digitValuesList = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

    for (let colIdx = 0; colIdx < rollNoDigits; colIdx++) {
      const x = sidConf.xStart + colIdx * sidConf.xStep;
      const intensities: number[] = [];

      for (let rowIdx = 0; rowIdx < 10; rowIdx++) {
        const y = sidConf.yStart + rowIdx * sidConf.yStep + bestDy;
        // Inner radius 4.5px to cover the bubble interior
        const avgGray = calculateBubbleAverageGray(warpedGray, x, y, 4.5);
        intensities.push(avgGray);
      }

      // Find darkest row (minimum gray value)
      let minVal = 256;
      let maxVal = -1;
      let minIdx = -1;
      for (let r = 0; r < 10; r++) {
        const val = intensities[r];
        if (val < minVal) {
          minVal = val;
          minIdx = r;
        }
        if (val > maxVal) {
          maxVal = val;
        }
      }

      // Determine if a digit is filled: must be at least 40 units darker than brightest bubble, and darkest value < 155
      if (maxVal - minVal > 40 && minVal < 155) {
        studentNum += digitValuesList[minIdx].toString();
      } else {
        studentNum += '0'; // default fallback
      }
    }

    // 7. Scan Answers (200 questions, 5 columns of 40 questions)
    const answers: Record<number, string> = {};
    const qConf = OMR_CONFIG.questions;
    const OPTIONS_FIVE = ['A', 'B', 'C', 'D', 'E'];

    for (let q = 1; q <= numQuestions; q++) {
      let colConf = null;
      for (const col of qConf.columns) {
        if (q >= col.qStart && q <= col.qEnd) {
          colConf = col;
          break;
        }
      }

      if (!colConf) {
        answers[q] = '';
        continue;
      }

      // Check section options count
      const sec = sections.find((s: any) => q >= s.qStart && q < s.qStart + s.qCount);
      const is5Option = sec && sec.questionType === '5 option';
      const numOptions = is5Option ? 5 : 4;

      const qIndex = q - colConf.qStart;
      const y = qConf.yStart + qIndex * qConf.yStep + bestDy;
      
      const intensities: number[] = [];
      for (let optIdx = 0; optIdx < numOptions; optIdx++) {
        const x = optIdx === 4 ? colConf.xOptions[3] + 25 : colConf.xOptions[optIdx];
        // Inner radius 4.0px to cover the bubble interior
        const avgGray = calculateBubbleAverageGray(warpedGray, x, y, 4.0);
        intensities.push(avgGray);
      }

      let maxVal = -1;
      for (let o = 0; o < numOptions; o++) {
        const val = intensities[o];
        if (val > maxVal) {
          maxVal = val;
        }
      }

      // Detect all filled options for this question using strict thresholds to prevent stray lines/folds
      const filledOptions: number[] = [];
      for (let o = 0; o < numOptions; o++) {
        const val = intensities[o];
        if (maxVal - val > 40 && val < 155) {
          filledOptions.push(o);
        }
      }

      if (filledOptions.length === 1) {
        answers[q] = OPTIONS_FIVE[filledOptions[0]];
      } else if (filledOptions.length > 1) {
        answers[q] = 'MULTIPLE'; // Mark wrong due to multiple bubble selections
      } else {
        answers[q] = ''; // unanswered
      }
    }

    // Cleanup
    src.delete();
    gray.delete();
    blurred.delete();
    thresh.delete();
    contours.delete();
    hierarchy.delete();
    srcPts.delete();
    dstPts.delete();
    M.delete();
    warped.delete();
    warpedGray.delete();

    return {
      studentNum,
      answers,
      bookletSet,
      debugWarpedCanvas
    };

  } catch (err: any) {
    if (src && !src.isDeleted()) src.delete();
    if (gray && !gray.isDeleted()) gray.delete();
    if (blurred && !blurred.isDeleted()) blurred.delete();
    if (thresh && !thresh.isDeleted()) thresh.delete();
    if (contours && !contours.isDeleted()) contours.delete();
    if (hierarchy && !hierarchy.isDeleted()) hierarchy.delete();
    if (warpedGray && !warpedGray.isDeleted()) warpedGray.delete();
    throw err;
  }
}



/**
 * Calculates the average grayscale intensity of pixels inside a circular bubble ROI.
 * Highly robust against bubble outlines and characters printed in dark grayscale ink.
 */
function calculateBubbleAverageGray(grayMatrix: any, cx: number, cy: number, r: number): number {
  let sum = 0;
  let count = 0;
  const rSq = r * r;
  const startX = Math.max(0, Math.floor(cx - r));
  const endX = Math.min(grayMatrix.cols - 1, Math.ceil(cx + r));
  const startY = Math.max(0, Math.floor(cy - r));
  const endY = Math.min(grayMatrix.rows - 1, Math.ceil(cy + r));

  for (let y = startY; y <= endY; y++) {
    const dy = y - cy;
    const dySq = dy * dy;
    for (let x = startX; x <= endX; x++) {
      const dx = x - cx;
      if (dx * dx + dySq <= rSq) {
        const pixelVal = grayMatrix.ucharAt(y, x);
        sum += pixelVal;
        count++;
      }
    }
  }
  return count > 0 ? sum / count : 255;
}

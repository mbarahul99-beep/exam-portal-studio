// OMR Scanner Computer Vision utility using OpenCV.js (NEET 200-Question Layout)
// Warped page resolution: 1000 x 1414 (A4 aspect ratio)

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
    yStart: 460,
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

export interface OMRColumnConfig {
  qStart: number;
  qEnd: number;
  xLabel: number;
  xOptions: number[];
}

export interface OMRQuestionLayout {
  bubbleRadius: number;
  yStart: number;
  yStep: number;
  rowsPerCol: number;
  numCols: number;
  columns: OMRColumnConfig[];
}

/**
 * Calculates a dynamic question grid layout that adjusts columns, row counts, and vertical spacing (yStep)
 * to perfectly fit between y = 460 and y = 1220 so question bubbles NEVER overlap signature boxes!
 */
export function getDynamicOMRQuestionLayout(
  numQuestions: number,
  preferredCols?: number,
  density: 'auto' | 'compact' | 'normal' | 'spacious' = 'auto'
): OMRQuestionLayout {
  const total = Math.min(Math.max(1, numQuestions), 200);

  // 1. Determine optimal columns count if not specified
  let numCols = preferredCols;
  if (!numCols || numCols < 1) {
    if (total >= 160) numCols = 5;
    else if (total >= 90) numCols = 4;
    else if (total >= 45) numCols = 3;
    else numCols = 2;
  }
  numCols = Math.min(5, Math.max(2, numCols));

  // 2. Calculate rows per column so all columns are balanced
  const rowsPerCol = Math.ceil(total / numCols);

  // 3. Dynamic yStart & yStep calculation (y = 460 to 1220)
  const minY = 460;
  const maxY = 1220;
  const maxAvailableHeight = maxY - minY; // 760px

  let yStep = 20;
  if (rowsPerCol > 1) {
    yStep = maxAvailableHeight / (rowsPerCol - 1);
  }

  if (density === 'auto') {
    if (total <= 30) {
      yStep = Math.min(34, Math.max(24, yStep));
    } else if (total <= 60) {
      yStep = Math.min(28, Math.max(20, yStep));
    } else {
      yStep = Math.min(21.7, Math.max(15, yStep));
    }
  } else if (density === 'spacious') {
    yStep = 24;
  } else if (density === 'compact') {
    yStep = 16;
  } else {
    yStep = 20;
  }

  let yStart = minY;
  const totalGridHeight = (rowsPerCol - 1) * yStep;
  if (totalGridHeight < maxAvailableHeight) {
    yStart = minY + (maxAvailableHeight - totalGridHeight) / 2;
  }

  // 4. Generate column positions horizontally across 1000px page (frame x=70 to x=930)
  const frameLeft = 70;
  const frameRight = 930;
  const availWidth = frameRight - frameLeft; // 860px
  const colWidth = availWidth / numCols;
  const columns: OMRColumnConfig[] = [];

  for (let c = 0; c < numCols; c++) {
    const qStart = c * rowsPerCol + 1;
    const qEnd = Math.min(total, (c + 1) * rowsPerCol);
    if (qStart > total) break;

    // Shift whole questions area right to balance left/right blank space evenly inside frame
    const colXStart = frameLeft + 12 + c * colWidth;
    const xLabel = colXStart + (numCols <= 3 ? 20 : 12);
    const optStart = colXStart + (numCols <= 3 ? 62 : 44);
    const optStep = numCols <= 3 ? 28 : 24;

    columns.push({
      qStart,
      qEnd,
      xLabel,
      xOptions: [
        optStart,
        optStart + optStep,
        optStart + optStep * 2,
        optStart + optStep * 3
      ]
    });
  }

  return {
    bubbleRadius: yStep < 18 ? 5.5 : 6.5,
    yStart,
    yStep,
    rowsPerCol,
    numCols,
    columns
  };
}


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
  if (!cv) {
    throw new Error('OpenCV.js is not loaded yet');
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
      // Allow smaller and larger contours to handle skewed, distant, or closer photos
      const isCorrectSize = area > pageArea * 0.000005 && area < pageArea * 0.08;
      const isSquare = aspectRatio >= 0.5 && aspectRatio <= 2.0;

      if (isCorrectSize && isSquare) {
        const center = {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2
        };
        candidates.push({ center, area, rect });
      }
    }

    const findBestQuadInCandidates = (cands: Array<{ center: { x: number; y: number }; area: number; rect: any }>) => {
      // Sort by area descending to ensure we analyze the most prominent squares first
      const sorted = [...cands].sort((a, b) => b.area - a.area);
      const topCands = sorted.slice(0, 15);
      
      let bestQuad: { tl: any; tr: any; bl: any; br: any } | null = null;
      let maxQuadArea = 0;

      if (topCands.length >= 4) {
        for (let i = 0; i < topCands.length; i++) {
          for (let j = i + 1; j < topCands.length; j++) {
            for (let k = j + 1; k < topCands.length; k++) {
              for (let l = k + 1; l < topCands.length; l++) {
                const pts = [topCands[i], topCands[j], topCands[k], topCands[l]];
                
                // Identify TL, TR, BL, BR
                // TL: min (x+y), BR: max (x+y)
                // TR: max (x-y), BL: min (x-y)
                const sortedBySum = [...pts].sort((a, b) => (a.center.x + a.center.y) - (b.center.x + b.center.y));
                const tl = sortedBySum[0];
                const br = sortedBySum[3];
                
                const remaining = [sortedBySum[1], sortedBySum[2]];
                const sortedByDiff = remaining.sort((a, b) => (a.center.x - a.center.y) - (b.center.x - b.center.y));
                const bl = sortedByDiff[0];
                const tr = sortedByDiff[1];

                // Validate that the areas of the 4 markers are similar (relaxed range for perspective skew)
                const minArea = Math.min(tl.area, tr.area, bl.area, br.area);
                const maxArea = Math.max(tl.area, tr.area, bl.area, br.area);
                if (minArea === 0 || maxArea / minArea > 3.2) continue;

                // Side lengths
                const wTop = Math.sqrt((tl.center.x - tr.center.x) ** 2 + (tl.center.y - tr.center.y) ** 2);
                const wBot = Math.sqrt((bl.center.x - br.center.x) ** 2 + (bl.center.y - br.center.y) ** 2);
                const hLeft = Math.sqrt((tl.center.x - bl.center.x) ** 2 + (tl.center.y - bl.center.y) ** 2);
                const hRight = Math.sqrt((tr.center.x - br.center.x) ** 2 + (tr.center.y - br.center.y) ** 2);

                const avgW = (wTop + wBot) / 2;
                const avgH = (hLeft + hRight) / 2;

                if (avgW === 0) continue;
                const ratio = avgH / avgW;

                // Validate A4-like anchor ratio (~1.34 portrait or ~0.75 landscape) and parallelism of opposite sides
                const isRatioValid = (ratio >= 0.45 && ratio <= 0.98) || (ratio >= 0.95 && ratio <= 1.85);
                const isWidthSimilar = Math.abs(wTop - wBot) / Math.max(wTop, wBot) < 0.45;
                const isHeightSimilar = Math.abs(hLeft - hRight) / Math.max(hLeft, hRight) < 0.45;
                const isAnglesValid = validateQuadAngles(tl.center, tr.center, br.center, bl.center);

                if (isRatioValid && isWidthSimilar && isHeightSimilar && isAnglesValid) {
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

    // Fallback: If markers are not successfully detected using adaptive threshold, try global thresholding
    if (!tlMarker || !trMarker || !blMarker || !brMarker) {
      // Global threshold at 110: pure black anchors stand out cleanly from shadows/wooden table edge
      cv.threshold(gray, thresh, 110, 255, cv.THRESH_BINARY_INV);

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

        const isCorrectSize = area > pageArea * 0.00003 && area < pageArea * 0.02;
        const isSquare = aspectRatio >= 0.5 && aspectRatio <= 1.8;

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
      }
    }

    if (!tlMarker || !trMarker || !blMarker || !brMarker) {
      throw new Error("Could not locate the OMR sheet. Please make sure the entire sheet (with all 4 black square corner anchors) is flat and fully visible inside the image.");
    }

    // 5. Automatic Orientation Auto-Correction (Handles 0°, 90°, 180°, 270° horizontal/vertical photos)
    const basePts = [
      tlMarker.center,
      trMarker.center,
      brMarker.center,
      blMarker.center
    ];

    // 4 Possible Rotations (0°, 90°, 180°, 270°)
    const candidateRotations = [
      [basePts[0], basePts[1], basePts[2], basePts[3]], // 0°
      [basePts[3], basePts[0], basePts[1], basePts[2]], // 90° CW
      [basePts[2], basePts[3], basePts[0], basePts[1]], // 180°
      [basePts[1], basePts[2], basePts[3], basePts[0]]  // 270° CW
    ];

    let bestWarpedMat: any = null;
    let maxOrientationContrast = -1;

    let dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      OMR_CONFIG.anchors.tl.x, OMR_CONFIG.anchors.tl.y,
      OMR_CONFIG.anchors.tr.x, OMR_CONFIG.anchors.tr.y,
      OMR_CONFIG.anchors.br.x, OMR_CONFIG.anchors.br.y,
      OMR_CONFIG.anchors.bl.x, OMR_CONFIG.anchors.bl.y
    ]);

    const warpedSize = new cv.Size(OMR_CONFIG.width, OMR_CONFIG.height);

    for (let rotIdx = 0; rotIdx < candidateRotations.length; rotIdx++) {
      const rot = candidateRotations[rotIdx];
      const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        rot[0].x, rot[0].y,
        rot[1].x, rot[1].y,
        rot[2].x, rot[2].y,
        rot[3].x, rot[3].y
      ]);

      const M_temp = cv.getPerspectiveTransform(srcPts, dstPts);
      const tempWarped = new cv.Mat();
      cv.warpPerspective(src, tempWarped, M_temp, warpedSize);

      const tempGray = new cv.Mat();
      cv.cvtColor(tempWarped, tempGray, cv.COLOR_RGBA2GRAY);

      // Evaluate candidate roll number area (y: 216-416) for valid header/roll box structure
      let contrastScore = 0;
      const sidConf = OMR_CONFIG.studentId;
      for (let col = 0; col < Math.min(5, rollNoDigits); col++) {
        const x = sidConf.xStart + col * sidConf.xStep;
        let cMin = 256, cMax = -1;
        for (let row = 0; row < 10; row++) {
          const y = sidConf.yStart + row * sidConf.yStep;
          const g = calculateBubbleAverageGray(tempGray, x, y, 4.5);
          if (g < cMin) cMin = g;
          if (g > cMax) cMax = g;
        }
        contrastScore += (cMax - cMin);
      }

      if (contrastScore > maxOrientationContrast || !bestWarpedMat) {
        maxOrientationContrast = contrastScore;
        if (bestWarpedMat) bestWarpedMat.delete();
        bestWarpedMat = tempWarped;
      } else {
        tempWarped.delete();
      }

      tempGray.delete();
      M_temp.delete();
      srcPts.delete();
    }

    dstPts.delete();
    let warped = bestWarpedMat;

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
    let bookletSet = 'A';
    if (examSetsCount > 1) {
      const setIntensities: number[] = [];
      for (let idx = 0; idx < examSetsCount; idx++) {
        const x = 610 + idx * 45;
        const y = OMR_CONFIG.studentId.yStart + bestDy;
        const avgGray = calculateBubbleAverageGray(warpedGray, x, y, 4.5);
        setIntensities.push(avgGray);
      }
      let minVal = 256;
      let maxVal = -1;
      let minIdx = 0;
      for (let idx = 0; idx < examSetsCount; idx++) {
        const val = setIntensities[idx];
        if (val < minVal) {
          minVal = val;
          minIdx = idx;
        }
        if (val > maxVal) {
          maxVal = val;
        }
      }
      if (maxVal - minVal > 40 && minVal < 155) {
        bookletSet = String.fromCharCode(65 + minIdx);
      }
    }

    // 5.8. Dynamic White Level Auto-Calibration
    // Samples the brightest bubble across the first 30 questions to detect the background paper brightness under current lighting
    const samples: number[] = [];
    const qConf = getDynamicOMRQuestionLayout(numQuestions);
    for (let q = 1; q <= Math.min(numQuestions, 30); q++) {
      let colConf = null;
      for (const col of qConf.columns) {
        if (q >= col.qStart && q <= col.qEnd) { colConf = col; break; }
      }
      if (!colConf) continue;
      const qIndex = q - colConf.qStart;
      const y = qConf.yStart + qIndex * qConf.yStep + bestDy;
      let maxVal = -1;
      for (let o = 0; o < 4; o++) {
        const x = colConf.xOptions[o];
        const val = calculateBubbleAverageGray(warpedGray, x, y, 4.0);
        if (val > maxVal) maxVal = val;
      }
      if (maxVal > 0) samples.push(maxVal);
    }
    samples.sort((a, b) => a - b);
    const whitePaperLevel = samples.length > 0 ? samples[Math.floor(samples.length * 0.7)] : 220;
    console.log("[OMR Scanner] Dynamically detected white paper level:", whitePaperLevel);

    const fillDiffThreshold = 45; // Raised from 30 to 45 to prevent false bubble detections from shadows/gradients
    const maxAbsoluteFillVal = Math.min(whitePaperLevel - 45, 170); // Must be at least 45 levels darker than paper and under 170 absolute gray

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

      // Determine if a digit is filled: must satisfy adaptive thresholds
      if (maxVal - minVal > fillDiffThreshold && minVal < maxAbsoluteFillVal) {
        studentNum += digitValuesList[minIdx].toString();
      } else {
        studentNum += '0'; // default fallback
      }
    }

    // 7. Scan Answers (Dynamic Grid Layout matching printed OMR sheet)
    const answers: Record<number, string> = {};
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

      // Detect all filled options for this question using adaptive thresholds
      const filledOptions: number[] = [];
      for (let o = 0; o < numOptions; o++) {
        const val = intensities[o];
        if (maxVal - val > fillDiffThreshold && val < maxAbsoluteFillVal) {
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

let smallCanvas: HTMLCanvasElement | null = null;
let smallCtx: CanvasRenderingContext2D | null = null;

/**
 * Detects the four corner points of the OMR sheet in a video frame.
 * Returns the points scaled to the original video dimensions.
 */
export function findOMRSheetCornersLive(
  video: HTMLVideoElement
): Array<{ x: number; y: number }> | null {
  const cv = window.cv;
  if (!cv) return null;

  const vW = video.videoWidth;
  const vH = video.videoHeight;
  if (vW === 0 || vH === 0) return null;

  // Downscale to a fixed width of 400px for speed
  const scaleW = 400;
  const scaleH = Math.round((vH / vW) * scaleW);

  if (!smallCanvas) {
    smallCanvas = document.createElement('canvas');
  }
  if (smallCanvas.width !== scaleW || smallCanvas.height !== scaleH) {
    smallCanvas.width = scaleW;
    smallCanvas.height = scaleH;
    smallCtx = smallCanvas.getContext('2d');
  }

  if (!smallCtx) return null;
  smallCtx.drawImage(video, 0, 0, scaleW, scaleH);

  let src = cv.imread(smallCanvas);
  let gray = new cv.Mat();
  let blurred = new cv.Mat();
  let thresh = new cv.Mat();
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.adaptiveThreshold(
      blurred,
      thresh,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      11,
      7
    );

    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const candidates: Array<{ center: { x: number; y: number }; area: number; rect: any }> = [];
    const pageArea = scaleW * scaleH;

    for (let i = 0; i < contours.size(); ++i) {
      const cnt = contours.get(i);
      const rect = cv.boundingRect(cnt);
      const area = rect.width * rect.height;
      const aspectRatio = rect.width / rect.height;

      // Anchors are square-like black marks (relaxed sizes and aspect ratios for away or tilted camera)
      const isCorrectSize = area > pageArea * 0.000005 && area < pageArea * 0.08;
      const isSquare = aspectRatio >= 0.5 && aspectRatio <= 2.0;

      if (isCorrectSize && isSquare) {
        const center = {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2
        };
        candidates.push({ center, area, rect });
      }
    }

    // Sort by area desc and take top 10 candidates
    const sorted = candidates.sort((a, b) => b.area - a.area).slice(0, 10);
    if (sorted.length < 4) return null;

    let bestQuad: Array<{ x: number; y: number }> | null = null;
    let maxQuadArea = 0;

    // Search for a quad of 4 candidates that forms a valid OMR box ratio
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        for (let k = j + 1; k < sorted.length; k++) {
          for (let l = k + 1; l < sorted.length; l++) {
            const pts = [sorted[i], sorted[j], sorted[k], sorted[l]];
            
            // Sort corners geometrically
            const sortedBySum = [...pts].sort((a, b) => (a.center.x + a.center.y) - (b.center.x + b.center.y));
            const tl = sortedBySum[0];
            const br = sortedBySum[3];
            
            const remaining = [sortedBySum[1], sortedBySum[2]];
            const sortedByDiff = remaining.sort((a, b) => (a.center.x - a.center.y) - (b.center.x - b.center.y));
            const bl = sortedByDiff[0];
            const tr = sortedByDiff[1];

            // Validate that the areas of the 4 markers are similar (relaxed range for perspective skew)
            const minArea = Math.min(tl.area, tr.area, bl.area, br.area);
            const maxArea = Math.max(tl.area, tr.area, bl.area, br.area);
            if (minArea === 0 || maxArea / minArea > 3.2) continue;

            const wTop = Math.sqrt((tl.center.x - tr.center.x) ** 2 + (tl.center.y - tr.center.y) ** 2);
            const wBot = Math.sqrt((bl.center.x - br.center.x) ** 2 + (bl.center.y - br.center.y) ** 2);
            const hLeft = Math.sqrt((tl.center.x - bl.center.x) ** 2 + (tl.center.y - bl.center.y) ** 2);
            const hRight = Math.sqrt((tr.center.x - br.center.x) ** 2 + (tr.center.y - br.center.y) ** 2);

            const avgW = (wTop + wBot) / 2;
            const avgH = (hLeft + hRight) / 2;
            if (avgW === 0) continue;
            
            const ratio = avgH / avgW;
            const isRatioValid = (ratio >= 0.95 && ratio <= 1.85); // Portrait A4 ratio is ~1.41
            const isWidthSimilar = Math.abs(wTop - wBot) / Math.max(wTop, wBot) < 0.45;
            const isHeightSimilar = Math.abs(hLeft - hRight) / Math.max(hLeft, hRight) < 0.45;
            const isAnglesValid = validateQuadAngles(tl.center, tr.center, br.center, bl.center);

            if (isRatioValid && isWidthSimilar && isHeightSimilar && isAnglesValid) {
              const quadArea = avgW * avgH;
              if (quadArea > maxQuadArea) {
                maxQuadArea = quadArea;
                bestQuad = [
                  { x: tl.center.x * (vW / scaleW), y: tl.center.y * (vH / scaleH) },
                  { x: tr.center.x * (vW / scaleW), y: tr.center.y * (vH / scaleH) },
                  { x: br.center.x * (vW / scaleW), y: br.center.y * (vH / scaleH) },
                  { x: bl.center.x * (vW / scaleW), y: bl.center.y * (vH / scaleH) }
                ];
              }
            }
          }
        }
      }
    }

    return bestQuad;

  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    thresh.delete();
    contours.delete();
    hierarchy.delete();
  }
}

/**
 * Validates that the four corner anchors form a well-shaped, solid rectangle/quadrilateral.
 * Checks that all four interior angles are close to 90 degrees (between 70 and 110 degrees),
 * preventing collinear lines or triangle-like degenerate configurations.
 */
function validateQuadAngles(
  tl: { x: number; y: number },
  tr: { x: number; y: number },
  br: { x: number; y: number },
  bl: { x: number; y: number }
): boolean {
  const getAngle = (A: { x: number; y: number }, B: { x: number; y: number }, C: { x: number; y: number }) => {
    const BAx = A.x - B.x;
    const BAy = A.y - B.y;
    const BCx = C.x - B.x;
    const BCy = C.y - B.y;
    const dot = BAx * BCx + BAy * BCy;
    const lenBA = Math.sqrt(BAx * BAx + BAy * BAy);
    const lenBC = Math.sqrt(BCx * BCx + BCy * BCy);
    if (lenBA === 0 || lenBC === 0) return 0;
    return (Math.acos(Math.max(-1, Math.min(1, dot / (lenBA * lenBC)))) * 180) / Math.PI;
  };

  const a0 = getAngle(tr, tl, bl); // Angle at TL
  const a1 = getAngle(tl, tr, br); // Angle at TR
  const a2 = getAngle(tr, br, bl); // Angle at BR
  const a3 = getAngle(br, bl, tl); // Angle at BL

  return (
    a0 >= 55 && a0 <= 125 &&
    a1 >= 55 && a1 <= 125 &&
    a2 >= 55 && a2 <= 125 &&
    a3 >= 55 && a3 <= 125
  );
}

// OMR Scanner Computer Vision utility using OpenCV.js (NEET 200-Question Layout)
// Warped page resolution: 1000 x 1414 (A4 aspect ratio)

export interface ScanResult {
  studentNum: string;
  answers: Record<number, string>;
  bookletSet?: string;
  debugWarpedCanvas?: HTMLCanvasElement; // For showing the warped, aligned page in UI
  bestDy?: number;
  questionOffsets?: Record<number, { dx: number; dy: number }>;
}

let currentYScale = 1.0;
let currentYStartOffset = 70;

// Helper function to scale Y coordinates to compensate for bottom-anchor cut-off scaling compression
export function getScaledY(rawY: number, dy: number): number {
  return currentYStartOffset + (rawY - currentYStartOffset) * currentYScale + dy;
}

// Coordinate mapping parameters (matching the generated HTML NEET sheet)
export const OMR_CONFIG = {
  width: 1000,
  height: 1414,

  // Anchors target coordinates (centers of the black squares)
  anchors: {
    tl: { x: 70, y: 70 },
    tr: { x: 930, y: 70 },
    bl: { x: 70, y: 1344 },
    br: { x: 930, y: 1344 }
  },

  // Student ID block coordinates (Roll No: 10 digits, 1-9 then 0)
  studentId: {
    xStart: 124, // Center of first digit column (perfectly centered dynamically)
    xStep: 36,   // Horizontal spacing between digits (enlarged)
    yStart: 185, // Center of '1' bubble row (adjusted to y = 185)
    yStep: 20,   // Vertical spacing between rows (adjusted to yStep = 20 to fill box)
    numDigits: 10,
    bubbleRadius: 8
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
      { qStart: 1, qEnd: 40, xLabel: 90, xOptions: [120, 145, 170, 195], yStart: 460 },
      { qStart: 41, qEnd: 80, xLabel: 260, xOptions: [290, 315, 340, 365], yStart: 460 },
      { qStart: 81, qEnd: 120, xLabel: 430, xOptions: [460, 485, 510, 535], yStart: 460 },
      { qStart: 121, qEnd: 160, xLabel: 600, xOptions: [630, 655, 680, 705], yStart: 460 },
      { qStart: 161, qEnd: 200, xLabel: 770, xOptions: [800, 825, 850, 875], yStart: 460 }
    ]
  }
};

export interface OMRColumnConfig {
  qStart: number;
  qEnd: number;
  xLabel: number;
  xOptions: number[];
  yStart: number;
}

export interface OMRQuestionLayout {
  bubbleRadius: number;
  yStart: number;
  yStep: number;
  rowsPerCol: number;
  numCols: number;
  columns: OMRColumnConfig[];
}

export interface OMRSlot {
  type: 'subject-header' | 'option-header' | 'question';
  slotIdx: number;
  subjectName?: string;
  qNum?: number;
  nextQNum?: number;
}

export function getColumnSlots(
  qStart: number,
  qEnd: number,
  _sections: any[] | undefined,
  totalQuestions: number
): OMRSlot[] {
  const slots: OMRSlot[] = [];
  let slotIdx = 0;
  let qNum = qStart;

  while (qNum <= qEnd && qNum <= totalQuestions) {
    // We are starting a group of up to 5 questions.
    // Before the group, we insert an option-header slot
    slots.push({
      type: 'option-header',
      slotIdx: slotIdx++,
      nextQNum: qNum
    });

    // Insert up to 5 questions in the current group
    for (let i = 0; i < 5; i++) {
      if (qNum > qEnd || qNum > totalQuestions) break;

      slots.push({
        type: 'question',
        slotIdx: slotIdx++,
        qNum: qNum++
      });
    }
  }

  return slots;
}

/**
 * Calculates a dynamic question grid layout that adjusts columns, row counts, and vertical spacing (yStep)
 * to perfectly fit between y = 460 and y = 1220 so question bubbles NEVER overlap signature boxes!
 */
export function getDynamicOMRQuestionLayout(
  numQuestions: number,
  preferredCols?: number,
  density: 'auto' | 'compact' | 'normal' | 'spacious' = 'auto',
  sections?: any[]
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

  // 2. Generate column positions horizontally across 1000px page (frame x=70 to x=930)
  const frameLeft = 70;
  const frameRight = 930;
  const availWidth = frameRight - frameLeft; // 860px
  const colWidth = availWidth / numCols;

  // 3. Question distribution
  const colCounts = Array(numCols).fill(0);
  const base = Math.floor(total / numCols);
  const rem = total % numCols;
  for (let c = 0; c < numCols; c++) {
    colCounts[c] = base + (c < rem ? 1 : 0);
  }

  // 4. Dynamic yStep calculation based on maximum column slots to perfectly fit page height (up to y = 1295)
  let minLimit = 999;
  let currentQStart = 1;
  for (let c = 0; c < numCols; c++) {
    const count = colCounts[c];
    if (count === 0) continue;
    const slots = getColumnSlots(currentQStart, currentQStart + count - 1, sections, total);
    currentQStart += count;

    const colYStart = 410;
    const availHeight = 1295 - colYStart;
    const limit = availHeight / slots.length;
    if (limit < minLimit) {
      minLimit = limit;
    }
  }

  let yStep = 20;
  if (density === 'auto') {
    yStep = Math.min(25.5, Math.max(18.5, minLimit));
  } else if (density === 'spacious') {
    yStep = Math.min(25.5, Math.max(20.0, minLimit));
  } else if (density === 'compact') {
    yStep = Math.min(20.0, Math.max(16.5, minLimit - 1.5));
  } else {
    yStep = Math.min(23.0, Math.max(18.0, minLimit - 0.5));
  }

  const columns: OMRColumnConfig[] = [];
  let currentQ = 1;
  for (let c = 0; c < numCols; c++) {
    const count = colCounts[c];
    if (count === 0) continue;
    const qStart = currentQ;
    const qEnd = currentQ + count - 1;
    currentQ += count;

    const colXStart = frameLeft + 12 + c * colWidth;
    const xLabel = colXStart + (numCols <= 3 ? 20 : 12);
    const optStart = colXStart + (numCols <= 3 ? 62 : 44);
    const optStep = numCols <= 3 ? 28 : 24;
    const colYStart = 410;

    columns.push({
      qStart,
      qEnd,
      xLabel,
      yStart: colYStart,
      xOptions: [
        optStart,
        optStart + optStep,
        optStart + optStep * 2,
        optStart + optStep * 3
      ]
    });
  }

  const yStart = 410;
  const rowsPerCol = Math.max(...colCounts);

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
 * Corrects uneven lighting (shadows, glare hot-spots, vignetting, one edge of the
 * page darker than the other) across a handheld phone photo by estimating a smooth
 * background-brightness map (a heavy Gaussian blur, which washes out bubbles/text
 * but preserves slow lighting gradients) and dividing it out of the original image.
 * The result reads as evenly-lit "paper white" everywhere on the page.
 *
 * WHY THIS MATTERS: this is the single biggest lever against bubbles being missed
 * "randomly" from scan to scan. A shadow or glare gradient across a phone photo
 * means the SAME pen darkness produces a different raw grayscale value depending on
 * where on the page the bubble happens to sit. Any threshold — fixed or adaptive —
 * calibrated against one region of such a photo will misjudge bubbles elsewhere.
 * Flattening the illumination first means every bubble's raw grayscale can be
 * trusted as "ink darkness" alone, independent of where it sits on the page.
 */
function normalizeIllumination(cv: any, grayMat: any): any {
  let background = new cv.Mat();
  let grayFloat = new cv.Mat();
  let bgFloat = new cv.Mat();
  let divided = new cv.Mat();
  let normalized = new cv.Mat();

  try {
    // Kernel large enough to blur away bubbles/text/lines but track slow lighting
    // gradients across the page. Must be odd.
    let k = Math.round(Math.min(grayMat.cols, grayMat.rows) / 10);
    if (k % 2 === 0) k += 1;
    k = Math.max(31, k);

    cv.GaussianBlur(grayMat, background, new cv.Size(k, k), 0);

    grayMat.convertTo(grayFloat, cv.CV_32F);
    // +1 avoids division by zero in near-black regions (printed anchors, etc.)
    background.convertTo(bgFloat, cv.CV_32F, 1, 1);

    // (gray / background) * 255 -> flattens local brightness back to a 0-255 range
    // where "paper white" reads consistently as ~255 across the whole page.
    cv.divide(grayFloat, bgFloat, divided, 255.0);
    divided.convertTo(normalized, cv.CV_8U);

    return normalized;
  } finally {
    background.delete();
    grayFloat.delete();
    bgFloat.delete();
    divided.delete();
  }
}

/**
 * Otsu's method adapted to a plain 1-D array of numeric samples (rather than an
 * image histogram). Finds the cut point that maximizes between-class variance,
 * i.e. the value that best splits a bimodal distribution into two groups.
 *
 * WHY THIS REPLACES HAND-PICKED CONSTANTS: the old code decided "filled vs blank"
 * with fixed magic numbers (subtract 50 from an estimated paper-white level, cap at
 * 118, require 15/25-point gaps, etc.), each tuned for one lighting condition and
 * one pen. Those constants are exactly why the same physical sheet gives different
 * results scan to scan — a slightly darker or lighter photo silently shifts every
 * bubble's raw value out from under a fixed cutoff. Otsu instead looks at the ACTUAL
 * distribution of "how much darker is this bubble than its own row's blank
 * baseline" across every bubble on THIS sheet, and finds the natural gap between
 * the large population of blanks (clustered near zero) and the smaller population
 * of genuine marks (clustered much higher) — self-calibrating on every single scan.
 */
function otsuThreshold(values: number[], numBins = 256): number {
  if (values.length === 0) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return min;

  const hist = new Array(numBins).fill(0);
  const binWidth = (max - min) / numBins;
  for (const v of values) {
    let bin = Math.floor((v - min) / binWidth);
    if (bin >= numBins) bin = numBins - 1;
    if (bin < 0) bin = 0;
    hist[bin]++;
  }

  const total = values.length;
  let sumAll = 0;
  for (let i = 0; i < numBins; i++) sumAll += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let bestBin = 0;

  for (let i = 0; i < numBins; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);

    if (varBetween > maxVar) {
      maxVar = varBetween;
      bestBin = i;
    }
  }

  return min + bestBin * binWidth;
}

/**
 * Assesses whether a captured photo is even usable before spending time trying to
 * scan it — catching the two most common phone-camera failure modes that make
 * bubble detection unreliable: motion/focus blur (variance of the Laplacian) and
 * blown-out glare/very low contrast (a flattened brightness histogram). Call this
 * BEFORE scanOMRSheet and prompt a retake if `usable` is false — this fixes far
 * more "random" misses than any post-hoc thresholding trick, because no amount of
 * clever thresholding can recover ink detail that motion blur or glare destroyed.
 */
export function assessCaptureQuality(
  sourceImage: HTMLCanvasElement | HTMLImageElement
): { usable: boolean; blurScore: number; contrastScore: number; warnings: string[] } {
  const cv = window.cv;
  const warnings: string[] = [];
  if (!cv) return { usable: true, blurScore: 0, contrastScore: 0, warnings };

  let src = new cv.Mat();
  let gray = new cv.Mat();
  let lap = new cv.Mat();
  let mean = new cv.Mat();
  let stddev = new cv.Mat();

  try {
    src = cv.imread(sourceImage);
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Blur detection: sharp images have high-variance Laplacian response;
    // blurry/out-of-focus images are smooth, so variance collapses toward zero.
    cv.Laplacian(gray, lap, cv.CV_64F);
    cv.meanStdDev(lap, mean, stddev);
    const lapStd = stddev.doubleAt(0, 0);
    const blurScore = lapStd * lapStd; // variance

    // Contrast / glare detection: a well-lit page of mostly white paper with dark
    // ink should have a wide spread of gray values. A photo blown out by flash
    // glare or shot in flat, dim light collapses that spread.
    cv.meanStdDev(gray, mean, stddev);
    const contrastScore = stddev.doubleAt(0, 0);

    if (blurScore < 40) {
      warnings.push('Photo looks blurry — hold the phone steady and refocus, then retake.');
    }
    if (contrastScore < 25) {
      warnings.push('Low contrast detected — reduce glare/shadow or improve lighting, then retake.');
    }

    return {
      usable: blurScore >= 40 && contrastScore >= 25,
      blurScore,
      contrastScore,
      warnings
    };
  } finally {
    src.delete();
    gray.delete();
    lap.delete();
    mean.delete();
    stddev.delete();
  }
}

/**
 * Main OMR Scanner function. Processes an source image (HTMLCanvasElement, HTMLImageElement, or ImageData)
 * and returns the detected Student ID (Roll No) and Answers.
 */
export async function scanOMRSheet(
  sourceImage: HTMLCanvasElement | HTMLImageElement,
  numQuestions: number,
  rollNoDigits: number = 10,
  _examSetsCount: number = 1,
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
  let warpedBin: any = null;
  let bestWarpedMat: any = null;

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

    // 3. Find contours using multi-attempt fallback loops
    const candidates: Array<{ center: { x: number; y: number }; area: number; rect: any }> = [];
    const srcWidth = src.cols;
    const srcHeight = src.rows;
    const pageArea = srcWidth * srcHeight;

    let tlMarker: any = null;
    let trMarker: any = null;
    let blMarker: any = null;
    let brMarker: any = null;

    const findBestQuadInCandidates = (cands: Array<{ center: { x: number; y: number }; area: number; rect: any }>) => {
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

                const sortedBySum = [...pts].sort((a, b) => (a.center.x + a.center.y) - (b.center.x + b.center.y));
                const tl = sortedBySum[0];
                const br = sortedBySum[3];

                const remaining = [sortedBySum[1], sortedBySum[2]];
                const sortedByDiff = remaining.sort((a, b) => (a.center.x - a.center.y) - (b.center.x - b.center.y));
                const bl = sortedByDiff[0];
                const tr = sortedByDiff[1];

                const minArea = Math.min(tl.area, tr.area, bl.area, br.area);
                const maxArea = Math.max(tl.area, tr.area, bl.area, br.area);
                if (minArea === 0 || maxArea / minArea > 1.75) continue;

                const wTop = Math.sqrt((tl.center.x - tr.center.x) ** 2 + (tl.center.y - tr.center.y) ** 2);
                const wBot = Math.sqrt((bl.center.x - br.center.x) ** 2 + (bl.center.y - br.center.y) ** 2);
                const hLeft = Math.sqrt((tl.center.x - bl.center.x) ** 2 + (tl.center.y - bl.center.y) ** 2);
                const hRight = Math.sqrt((tr.center.x - br.center.x) ** 2 + (tr.center.y - br.center.y) ** 2);

                const avgW = (wTop + wBot) / 2;
                const avgH = (hLeft + hRight) / 2;

                if (avgW === 0) continue;
                const ratio = avgH / avgW;

                const isRatioValid = (ratio >= 0.55 && ratio <= 0.95) || (ratio >= 1.05 && ratio <= 1.85);
                const isWidthSimilar = Math.abs(wTop - wBot) / Math.max(wTop, wBot) < 0.25;
                const isHeightSimilar = Math.abs(hLeft - hRight) / Math.max(hLeft, hRight) < 0.25;
                const isAnglesValid = validateQuadAngles(tl.center, tr.center, br.center, bl.center);

                const quadArea = avgW * avgH;
                const isSheetSizeValid = quadArea > pageArea * 0.15;

                const isAnchorSizeValid =
                  (tl.rect.width >= avgW * 0.015 && tl.rect.width <= avgW * 0.08) &&
                  (tr.rect.width >= avgW * 0.015 && tr.rect.width <= avgW * 0.08) &&
                  (bl.rect.width >= avgW * 0.015 && bl.rect.width <= avgW * 0.08) &&
                  (br.rect.width >= avgW * 0.015 && br.rect.width <= avgW * 0.08);

                if (isRatioValid && isWidthSimilar && isHeightSimilar && isAnglesValid && isSheetSizeValid && isAnchorSizeValid) {
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

    const thresholdAttempts = [
      { adaptive: true, blockSize: 15, C: 9 },
      { adaptive: true, blockSize: 25, C: 9 },
      { adaptive: true, blockSize: 35, C: 9 },
      { adaptive: false, threshold: 90 },
      { adaptive: false, threshold: 110 },
      { adaptive: false, threshold: 130 },
      { adaptive: false, threshold: 150 }
    ];

    for (const attempt of thresholdAttempts) {
      if (tlMarker && trMarker && blMarker && brMarker) break;

      if (attempt.adaptive) {
        cv.adaptiveThreshold(
          blurred,
          thresh,
          255,
          cv.ADAPTIVE_THRESH_GAUSSIAN_C,
          cv.THRESH_BINARY_INV,
          attempt.blockSize,
          attempt.C
        );
      } else {
        cv.threshold(gray, thresh, attempt.threshold, 255, cv.THRESH_BINARY_INV);
      }

      contours = new cv.MatVector();
      hierarchy = new cv.Mat();
      cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      candidates.length = 0;
      for (let i = 0; i < contours.size(); ++i) {
        const cnt = contours.get(i);
        const rect = cv.boundingRect(cnt);
        const area = rect.width * rect.height;
        const aspectRatio = rect.width / rect.height;

        const isCorrectSize = area > pageArea * 0.00012 && area < pageArea * 0.02;
        const isSquare = aspectRatio >= 0.75 && aspectRatio <= 1.30;

        const cArea = cv.contourArea(cnt);
        const solidity = area > 0 ? cArea / area : 0;
        const isSolid = solidity >= 0.68;

        if (isCorrectSize && isSquare && isSolid) {
          const center = {
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2
          };
          candidates.push({ center, area, rect });
        }
        cnt.delete();
      }

      const quad = findBestQuadInCandidates(candidates);
      if (quad) {
        tlMarker = quad.tl;
        trMarker = quad.tr;
        blMarker = quad.bl;
        brMarker = quad.br;
      }

      contours.delete();
      hierarchy.delete();
    }

    if (!tlMarker || !trMarker || !blMarker || !brMarker) {
      throw new Error("Failed to locate 4 corner anchors. Align sheet inside frame.");
    }

    // 5. Warp Perspective to align standard grid
    const basePts = [tlMarker, trMarker, brMarker, blMarker];

    // 4 Possible Rotations (0°, 90°, 180°, 270°)
    const candidateRotations = [
      [basePts[0], basePts[1], basePts[2], basePts[3]], // 0°
      [basePts[3], basePts[0], basePts[1], basePts[2]], // 90° CW
      [basePts[2], basePts[3], basePts[0], basePts[1]], // 180°
      [basePts[1], basePts[2], basePts[3], basePts[0]]  // 270° CW
    ];

    const anchorConfigs = [
      {
        name: '48px anchors',
        tl: { x: 48, y: 48 },
        tr: { x: 952, y: 48 },
        br: { x: 952, y: 1366 },
        bl: { x: 48, y: 1366 },
        yScale: 0.991,
        yStartOffset: 48
      },
      {
        name: '70px anchors',
        tl: { x: 70, y: 70 },
        tr: { x: 930, y: 70 },
        br: { x: 930, y: 1344 },
        bl: { x: 70, y: 1344 },
        yScale: 1.0,
        yStartOffset: 70
      }
    ];

    bestWarpedMat = null;
    let maxOrientationContrast = -1;
    let bestConfig = anchorConfigs[1]; // default to 70px anchors

    const warpedSize = new cv.Size(OMR_CONFIG.width, OMR_CONFIG.height);

    for (const config of anchorConfigs) {
      let dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        config.tl.x, config.tl.y,
        config.tr.x, config.tr.y,
        config.br.x, config.br.y,
        config.bl.x, config.bl.y
      ]);

      // Set scaling variables temporarily for getScaledY inside loop
      currentYScale = config.yScale;
      currentYStartOffset = config.yStartOffset;

      for (let rotIdx = 0; rotIdx < candidateRotations.length; rotIdx++) {
        const rot = candidateRotations[rotIdx];
        const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
          rot[0].center.x, rot[0].center.y,
          rot[1].center.x, rot[1].center.y,
          rot[2].center.x, rot[2].center.y,
          rot[3].center.x, rot[3].center.y
        ]);

        const M_temp = cv.getPerspectiveTransform(srcPts, dstPts);
        const tempWarped = new cv.Mat();
        cv.warpPerspective(src, tempWarped, M_temp, warpedSize);

        const tempGray = new cv.Mat();
        cv.cvtColor(tempWarped, tempGray, cv.COLOR_RGBA2GRAY);

        // Evaluate candidate roll number area for valid header/roll box structure
        let contrastScore = 0;
        const sidConf = OMR_CONFIG.studentId;
        for (let col = 0; col < Math.min(5, rollNoDigits); col++) {
          const x = sidConf.xStart + col * sidConf.xStep;
          let cMin = 256, cMax = -1;
          for (let row = 0; row < 10; row++) {
            const y = getScaledY(sidConf.yStart + row * sidConf.yStep, 0);
            const g = calculateBubbleAverageGray(tempGray, x, y, 4.5);
            if (g < cMin) cMin = g;
            if (g > cMax) cMax = g;
          }
          contrastScore += (cMax - cMin);
        }

        // Orientation verification: Roll number grid alignment naturally maximizes contrastScore.
        const orientationScore = contrastScore;

        if (orientationScore > maxOrientationContrast || !bestWarpedMat) {
          maxOrientationContrast = orientationScore;
          if (bestWarpedMat) bestWarpedMat.delete();
          bestWarpedMat = tempWarped;
          bestConfig = config;
        } else {
          tempWarped.delete();
        }

        tempGray.delete();
        M_temp.delete();
        srcPts.delete();
      }

      dstPts.delete();
    }

    // Lock in the winning configuration
    currentYScale = bestConfig.yScale;
    currentYStartOffset = bestConfig.yStartOffset;
    console.log("[OMR Scanner] Auto-selected printed anchor config:", bestConfig.name);
    let warped = bestWarpedMat;

    // Convert warped image to grayscale for bubble average intensity scan
    let warpedGrayRaw = new cv.Mat();
    cv.cvtColor(warped, warpedGrayRaw, cv.COLOR_RGBA2GRAY);

    // Flatten out any residual shadow/glare gradient across the warped page BEFORE
    // any bubble is measured. See normalizeIllumination() for why this is the fix
    // for bubbles being missed inconsistently between scans.
    warpedGray = normalizeIllumination(cv, warpedGrayRaw);
    warpedGrayRaw.delete();

    warpedBin = new cv.Mat();
    cv.adaptiveThreshold(
      warpedGray,
      warpedBin,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      31,
      12
    );

    const debugWarpedCanvas = document.createElement('canvas');
    cv.imshow(debugWarpedCanvas, warped);

    // 5.2. Auto-Calibrate Vertical Scan Offset
    let bestDy = 0;
    let minAvgIntensity = 256;
    const sidConf = OMR_CONFIG.studentId;

    for (let dy = -12; dy <= 12; dy += 1) {
      let totalIntensity = 0;
      let filledColumnsCount = 0;
      for (let colIdx = 0; colIdx < rollNoDigits; colIdx++) {
        const x = sidConf.xStart + colIdx * sidConf.xStep;
        let colMin = 256;
        let colMax = -1;
        for (let rowIdx = 0; rowIdx < 10; rowIdx++) {
          const y = getScaledY(sidConf.yStart + rowIdx * sidConf.yStep, dy);
          const avgGray = calculateBubbleAverageGray(warpedGray, x, y, 3.0);
          if (avgGray < colMin) {
            colMin = avgGray;
          }
          if (avgGray > colMax) {
            colMax = avgGray;
          }
        }
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

    // 5.3. Auto-Calibrate Horizontal Scan Offset
    let bestDx = 0;
    let minAvgIntensityDx = 256;
    for (let dx = -20; dx <= 20; dx += 1) {
      let totalIntensity = 0;
      let filledColumnsCount = 0;
      for (let colIdx = 0; colIdx < rollNoDigits; colIdx++) {
        const x = sidConf.xStart + colIdx * sidConf.xStep + dx;
        let colMin = 256;
        let colMax = -1;
        for (let rowIdx = 0; rowIdx < 10; rowIdx++) {
          const y = getScaledY(sidConf.yStart + rowIdx * sidConf.yStep, bestDy);
          const avgGray = calculateBubbleAverageGray(warpedGray, x, y, 3.0);
          if (avgGray < colMin) {
            colMin = avgGray;
          }
          if (avgGray > colMax) {
            colMax = avgGray;
          }
        }
        if (colMax - colMin > 50) {
          totalIntensity += colMin;
          filledColumnsCount++;
        }
      }
      if (filledColumnsCount > 0) {
        const avg = totalIntensity / filledColumnsCount;
        if (avg < minAvgIntensityDx) {
          minAvgIntensityDx = avg;
          bestDx = dx;
        }
      }
    }
    console.log("[OMR Scanner] Calibrated horizontal offset:", bestDx, "px");

    let bookletSet = 'A';

    // Load custom OMR layout settings from storage to match printed sheet configuration
    let customCols: number | undefined = undefined;
    let layoutDensity: 'auto' | 'compact' | 'normal' | 'spacious' = 'auto';
    try {
      const storedJson = window.localStorage.getItem('omr_custom_settings');
      if (storedJson) {
        const parsed = JSON.parse(storedJson);
        if (parsed.customCols !== undefined) customCols = parsed.customCols;
        if (parsed.density) layoutDensity = parsed.density;
      }
    } catch (e) {
      console.warn("Failed loading custom OMR settings inside scanner:", e);
    }

    const qConf = getDynamicOMRQuestionLayout(numQuestions, customCols, layoutDensity, sections);

    // ================================================================
    // 6 & 7. Two-pass, self-calibrated bubble classification (Roll No + Answers)
    // ----------------------------------------------------------------
    // PASS 1 (gather): for every bubble on the sheet, measure how much darker it
    // is than its OWN row/column's blank-paper baseline (the average of the two
    // lightest bubbles in that same row/column). This "fill depth" is already
    // self-normalized against local lighting and pen pressure for that specific
    // row, on top of the page-wide illumination flattening done earlier.
    //
    // PASS 2 (decide): pool every fill-depth value from the ENTIRE sheet and run
    // Otsu's method over that pool to find the natural split between the large
    // population of blank bubbles (clustered near zero) and the smaller
    // population of genuinely marked ones. This replaces the old fixed
    // constants (-50, -15, -25, cap at 118) that were tuned for one lighting
    // condition/pen and silently misfired — inconsistently — for others. See
    // normalizeIllumination() and otsuThreshold() above for the full rationale.
    // ================================================================

    interface BubbleSample { avgGray: number; avgBin: number; }
    interface RowRecord {
      kind: 'roll' | 'question';
      key: number; // colIdx for roll digits, question number for answers
      samples: BubbleSample[];
      baseline: number;
      fillDepths: number[];
    }

    const computeBaseline = (grays: number[]): number => {
      // Robust "blank paper" estimate for this row/column: average of the two
      // lightest bubbles (rather than just the single lightest), so one blank
      // bubble catching a glint of glare doesn't skew the baseline.
      const sorted = [...grays].sort((a, b) => b - a); // brightest first
      if (sorted.length === 1) return sorted[0];
      return (sorted[0] + sorted[1]) / 2;
    };

    const digitValuesList = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
    const allFillDepths: number[] = [];

    // --- Roll No: Pass 1 (gather) ---
    const rollOffset = optimizeRollNoOffset(warpedBin, sidConf, rollNoDigits, bestDx, bestDy);
    console.log("[OMR Scanner] Calibrated Roll No local offset (dx/dy):", rollOffset.bestDx, rollOffset.bestDy);

    const rollRecords: RowRecord[] = [];
    for (let colIdx = 0; colIdx < rollNoDigits; colIdx++) {
      const x = sidConf.xStart + colIdx * sidConf.xStep + bestDx + rollOffset.bestDx;
      const samples: BubbleSample[] = [];
      for (let rowIdx = 0; rowIdx < 10; rowIdx++) {
        const y = getScaledY(sidConf.yStart + rowIdx * sidConf.yStep, bestDy + rollOffset.bestDy);
        samples.push({
          avgGray: calculateBubbleAverageGray(warpedGray, x, y, 3.0),
          avgBin: calculateBubbleAverageGray(warpedBin, x, y, 3.0)
        });
      }
      const baseline = computeBaseline(samples.map(s => s.avgGray));
      const fillDepths = samples.map(s => baseline - s.avgGray);
      fillDepths.forEach(fd => allFillDepths.push(fd));
      rollRecords.push({ kind: 'roll', key: colIdx, samples, baseline, fillDepths });
    }

    // 7. Scan Answers (Dynamic Grid Layout) — Pass 1 (gather) with Continuous
    // Dynamic 2D Warp Tracking (CD2DWT) for per-row alignment, unchanged from before.
    const answers: Record<number, string> = {};
    const OPTIONS_FIVE = ['A', 'B', 'C', 'D', 'E'];
    const questionOffsets: Record<number, { dx: number; dy: number }> = {};

    const colAccumulatedDx: Record<number, number> = {};
    const colAccumulatedDy: Record<number, number> = {};
    qConf.columns.forEach((_, idx) => {
      colAccumulatedDx[idx] = 0;
      colAccumulatedDy[idx] = 0;
    });

    const questionRecords: Record<number, RowRecord> = {};

    for (let q = 1; q <= numQuestions; q++) {
      let colConf: OMRColumnConfig | null = null;
      let colIdx = -1;
      for (let i = 0; i < qConf.columns.length; i++) {
        const col = qConf.columns[i];
        if (q >= col.qStart && q <= col.qEnd) {
          colConf = col;
          colIdx = i;
          break;
        }
      }

      if (!colConf || colIdx === -1) {
        answers[q] = '';
        continue;
      }

      const sec = sections.find((s: any) => q >= s.qStart && q < s.qStart + s.qCount);
      const is5Option = sec && sec.questionType === '5 option';
      const numOptions = is5Option ? 5 : 4;

      const slots = getColumnSlots(colConf.qStart, colConf.qEnd, sections, numQuestions);
      const qSlot = slots.find(s => s.type === 'question' && s.qNum === q);
      if (!qSlot) {
        answers[q] = '';
        continue;
      }
      const slotIndex = qSlot.slotIdx;

      const currentAccDx = colAccumulatedDx[colIdx] ?? 0;
      const currentAccDy = colAccumulatedDy[colIdx] ?? 0;

      const predictedY = getScaledY(colConf.yStart + slotIndex * qConf.yStep, bestDy) + currentAccDy;
      const xOptions = Array.from({ length: numOptions }, (_, o) =>
        (o === 4 ? colConf!.xOptions[3] + 25 : colConf!.xOptions[o]) + currentAccDx
      );

      const rowOffset = optimizeRowOffset(warpedBin, xOptions, predictedY, numOptions, bestDx);
      const localY = predictedY + rowOffset.bestDy;

      questionOffsets[q] = {
        dx: bestDx + currentAccDx + rowOffset.bestDx,
        dy: currentAccDy + rowOffset.bestDy
      };
      colAccumulatedDx[colIdx] = currentAccDx + rowOffset.bestDx * 0.75;
      colAccumulatedDy[colIdx] = currentAccDy + rowOffset.bestDy * 0.75;

      const samples: BubbleSample[] = xOptions.map((xo) => {
        const x = xo + bestDx + rowOffset.bestDx;
        return {
          avgGray: calculateBubbleAverageGray(warpedGray, x, localY, 3.5),
          avgBin: calculateBubbleAverageGray(warpedBin, x, localY, 3.5)
        };
      });

      const baseline = computeBaseline(samples.map(s => s.avgGray));
      const fillDepths = samples.map(s => baseline - s.avgGray);
      fillDepths.forEach(fd => allFillDepths.push(fd));
      questionRecords[q] = { kind: 'question', key: q, samples, baseline, fillDepths };
    }

    // --- Pass 2 (decide): self-calibrated global cut point ---
    const finiteDepths = allFillDepths.filter((v) => Number.isFinite(v));
    const otsuCut = otsuThreshold(finiteDepths);

    // Safety rails: never trust a cut so low that faint paper texture/print noise
    // would register as "filled" (floor), and never demand darkness beyond what a
    // real pencil/light-pen mark can produce (ceiling) — Otsu is self-calibrating
    // but a badly-lit or nearly-blank sheet can still push it to an unreasonable
    // extreme, so these rails keep it within a sane, empirically safe band.
    const fillDepthCutoff = Math.min(90, Math.max(20, otsuCut));
    console.log("[OMR Scanner] Self-calibrated fill-depth cutoff (Otsu):", fillDepthCutoff.toFixed(1), "raw:", otsuCut.toFixed(1));

    const classifyRow = (rec: RowRecord): number[] => {
      const filled: number[] = [];
      const depths = rec.fillDepths;
      const maxDepth = Math.max(...depths);
      for (let i = 0; i < depths.length; i++) {
        const isDarkEnough = depths[i] >= fillDepthCutoff;
        const isBinaryDense = rec.samples[i].avgBin > 60; // ink actually present, not just faint shadow
        // A genuine mark must also stand out from THIS row's own darkest other
        // option — guards against a shadow/crease darkening the whole row evenly
        // (which would otherwise still clear the global cutoff for every option).
        const isRowOutlier = depths[i] >= maxDepth - 20;
        if (isDarkEnough && isBinaryDense && isRowOutlier) {
          filled.push(i);
        }
      }
      return filled;
    };

    // --- Roll No: Pass 2 (decide) ---
    let studentNum = '';
    for (const rec of rollRecords) {
      const filled = classifyRow(rec);
      studentNum += filled.length === 1 ? digitValuesList[filled[0]].toString() : '0';
    }

    // --- Answers: Pass 2 (decide) ---
    for (let q = 1; q <= numQuestions; q++) {
      const rec = questionRecords[q];
      if (!rec) { answers[q] = ''; continue; }
      const filled = classifyRow(rec);
      if (filled.length === 1) {
        answers[q] = OPTIONS_FIVE[filled[0]];
      } else if (filled.length > 1) {
        answers[q] = 'MULTIPLE';
      } else {
        answers[q] = '';
      }
    }

    // Cleanup
    src.delete();
    gray.delete();
    blurred.delete();
    thresh.delete();
    warped.delete();
    warpedGray.delete();
    warpedBin.delete();

    return {
      studentNum,
      answers,
      bookletSet,
      debugWarpedCanvas,
      bestDy,
      questionOffsets
    };

  } catch (err: any) {
    if (src && !src.isDeleted()) src.delete();
    if (gray && !gray.isDeleted()) gray.delete();
    if (blurred && !blurred.isDeleted()) blurred.delete();
    if (thresh && !thresh.isDeleted()) thresh.delete();
    if (contours && !contours.isDeleted()) contours.delete();
    if (hierarchy && !hierarchy.isDeleted()) hierarchy.delete();
    if (warpedGray && !warpedGray.isDeleted()) warpedGray.delete();
    if (warpedBin && !warpedBin.isDeleted()) warpedBin.delete();
    if (bestWarpedMat && !bestWarpedMat.isDeleted()) bestWarpedMat.delete();
    throw err;
  }
}

interface RowOffsetResult {
  bestDx: number;
  bestDy: number;
}

/**
 * Calculates alignment score by maximizing outer printed outline ring pixels (radius = 8)
 * and minimizing center region pixels (radius = 2.5) for empty bubbles.
 */
function getBubbleOutlineScore(binMatrix: any, cx: number, cy: number): number {
  const centerVal = calculateBubbleAverageGray(binMatrix, cx, cy, 2.5);

  const r = 8;
  const offsets = [
    [r, 0], [-r, 0], [0, r], [0, -r],
    [6, 6], [-6, 6], [6, -6], [-6, -6]
  ];
  let ringSum = 0;
  for (let i = 0; i < 8; i++) {
    const dx = offsets[i][0];
    const dy = offsets[i][1];
    ringSum += calculateBubbleAverageGray(binMatrix, cx + dx, cy + dy, 1.0);
  }
  const ringVal = ringSum / 8;

  // Maximize outline ring overlaps while minimizing center overlap
  return ringVal - centerVal;
}

/**
 * Automatically optimizes alignment offsets for a question row by maximizing
 * outer printed outline ring correlation across empty options.
 */
function optimizeRowOffset(
  binMatrix: any,
  xOptions: number[],
  y: number,
  numOptions: number,
  globalDx: number
): RowOffsetResult {
  let maxScore = -999999;
  let bestDx = 0;
  let bestDy = 0;

  // 1. Coarse search in steps of 2px (dy expanded to [-12, 12], dx expanded to [-10, 10] to cross crease distortions)
  for (let dy = -12; dy <= 12; dy += 2) {
    for (let dx = -10; dx <= 10; dx += 2) {
      let totalRowScore = 0;
      for (let o = 0; o < numOptions; o++) {
        const cx = xOptions[o] + globalDx + dx;
        const cy = y + dy;
        totalRowScore += getBubbleOutlineScore(binMatrix, cx, cy);
      }
      if (totalRowScore > maxScore) {
        maxScore = totalRowScore;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }

  // 2. Fine-tune search in steps of 1px
  let fineBestDx = bestDx;
  let fineBestDy = bestDy;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const targetDx = bestDx + dx;
      const targetDy = bestDy + dy;
      if (targetDx < -10 || targetDx > 10 || targetDy < -12 || targetDy > 12) continue;

      let totalRowScore = 0;
      for (let o = 0; o < numOptions; o++) {
        const cx = xOptions[o] + globalDx + targetDx;
        const cy = y + targetDy;
        totalRowScore += getBubbleOutlineScore(binMatrix, cx, cy);
      }
      if (totalRowScore > maxScore) {
        maxScore = totalRowScore;
        fineBestDx = targetDx;
        fineBestDy = targetDy;
      }
    }
  }

  return { bestDx: fineBestDx, bestDy: fineBestDy };
}

/**
 * Automatically optimizes alignment offsets for the Roll Number grid
 * by maximizing printed outline ring correlation across empty digit bubbles.
 */
function optimizeRollNoOffset(
  binMatrix: any,
  sidConf: any,
  rollNoDigits: number,
  globalDx: number,
  globalDy: number
): RowOffsetResult {
  let maxScore = -999999;
  let bestDx = 0;
  let bestDy = 0;

  // 1. Coarse search in steps of 2px
  for (let dy = -6; dy <= 6; dy += 2) {
    for (let dx = -6; dx <= 6; dx += 2) {
      let totalScore = 0;
      for (let colIdx = 0; colIdx < rollNoDigits; colIdx++) {
        const x = sidConf.xStart + colIdx * sidConf.xStep + globalDx + dx;
        for (let rowIdx = 0; rowIdx < 10; rowIdx++) {
          const y = getScaledY(sidConf.yStart + rowIdx * sidConf.yStep, globalDy + dy);
          totalScore += getBubbleOutlineScore(binMatrix, x, y);
        }
      }
      if (totalScore > maxScore) {
        maxScore = totalScore;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }

  // 2. Fine-tune search in steps of 1px
  let fineBestDx = bestDx;
  let fineBestDy = bestDy;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const targetDx = bestDx + dx;
      const targetDy = bestDy + dy;
      if (targetDx < -6 || targetDx > 6 || targetDy < -6 || targetDy > 6) continue;

      let totalScore = 0;
      for (let colIdx = 0; colIdx < rollNoDigits; colIdx++) {
        const x = sidConf.xStart + colIdx * sidConf.xStep + globalDx + targetDx;
        for (let rowIdx = 0; rowIdx < 10; rowIdx++) {
          const y = getScaledY(sidConf.yStart + rowIdx * sidConf.yStep, globalDy + targetDy);
          totalScore += getBubbleOutlineScore(binMatrix, x, y);
        }
      }
      if (totalScore > maxScore) {
        maxScore = totalScore;
        fineBestDx = targetDx;
        fineBestDy = targetDy;
      }
    }
  }

  return { bestDx: fineBestDx, bestDy: fineBestDy };
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

      // Anchors must be black square marks (at least 0.012% of image area)
      const isCorrectSize = area > pageArea * 0.00012 && area < pageArea * 0.02;
      const isSquare = aspectRatio >= 0.75 && aspectRatio <= 1.30;

      // Check solidity (anchors are solid black squares)
      const cArea = cv.contourArea(cnt);
      const solidity = area > 0 ? cArea / area : 0;
      const isSolid = solidity >= 0.68;

      if (isCorrectSize && isSquare && isSolid) {
        const center = {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2
        };
        candidates.push({ center, area, rect });
      }
      cnt.delete();
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

            // Validate that the areas of the 4 markers are similar
            const minArea = Math.min(tl.area, tr.area, bl.area, br.area);
            const maxArea = Math.max(tl.area, tr.area, bl.area, br.area);
            if (minArea === 0 || maxArea / minArea > 1.75) continue;

            const wTop = Math.sqrt((tl.center.x - tr.center.x) ** 2 + (tl.center.y - tr.center.y) ** 2);
            const wBot = Math.sqrt((bl.center.x - br.center.x) ** 2 + (bl.center.y - br.center.y) ** 2);
            const hLeft = Math.sqrt((tl.center.x - bl.center.x) ** 2 + (tl.center.y - bl.center.y) ** 2);
            const hRight = Math.sqrt((tr.center.x - br.center.x) ** 2 + (tr.center.y - br.center.y) ** 2);

            const avgW = (wTop + wBot) / 2;
            const avgH = (hLeft + hRight) / 2;
            if (avgW === 0) continue;

            const ratio = avgH / avgW;
            const isRatioValid = (ratio >= 1.15 && ratio <= 1.7); // Portrait A4 ratio is ~1.41
            const isWidthSimilar = Math.abs(wTop - wBot) / Math.max(wTop, wBot) < 0.25;
            const isHeightSimilar = Math.abs(hLeft - hRight) / Math.max(hLeft, hRight) < 0.25;
            const isAnglesValid = validateQuadAngles(tl.center, tr.center, br.center, bl.center);

            // Strict constraints:
            const quadArea = avgW * avgH;
            const isSheetSizeValid = quadArea > pageArea * 0.15;

            const isAnchorSizeValid =
              (tl.rect.width >= avgW * 0.02 && tl.rect.width <= avgW * 0.08) &&
              (tr.rect.width >= avgW * 0.02 && tr.rect.width <= avgW * 0.08) &&
              (bl.rect.width >= avgW * 0.02 && bl.rect.width <= avgW * 0.08) &&
              (br.rect.width >= avgW * 0.02 && br.rect.width <= avgW * 0.08);

            if (isRatioValid && isWidthSimilar && isHeightSimilar && isAnglesValid && isSheetSizeValid && isAnchorSizeValid) {
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
    a0 >= 70 && a0 <= 110 &&
    a1 >= 70 && a1 <= 110 &&
    a2 >= 70 && a2 <= 110 &&
    a3 >= 70 && a3 <= 110
  );
}

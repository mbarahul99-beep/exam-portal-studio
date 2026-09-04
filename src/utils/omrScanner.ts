// OMR Scanner Computer Vision utility using OpenCV.js (NEET 200-Question Layout)
// Warped page resolution: 1000 x 1414 (A4 aspect ratio)

export interface ScanResult {
  studentNum: string;
  answers: Record<number, string>;
  bookletSet?: string;
  debugWarpedCanvas?: HTMLCanvasElement; // For showing the warped, aligned page in UI
  bestDy?: number;
  questionOffsets?: Record<number, { dx: number; dy: number }>;
  bubbleSnippets?: Record<number, Record<string, string>>; // Cropped real bubble photos for option inspection/editing
  detectedRollBubbles?: Array<{ colIdx: number; digit: number; x: number; y: number }>;
  bubbleCenters?: Record<number, Record<string, { x: number; y: number }>>;
}

let currentYScale = 1.0;
let currentYStartOffset = 70;

// Helper function to scale Y coordinates to compensate for bottom-anchor cut-off scaling compression
export function getScaledY(rawY: number, dy: number): number {
  return currentYStartOffset + (rawY - currentYStartOffset) * currentYScale + dy;
}

// Helper function to normalize multi-option answer strings (e.g. 'A,B', 'A, B', 'A/B', 'AB') into sorted array of option characters
export function normalizeAnswerSet(ans: string | undefined | null): string[] {
  if (!ans) return [];
  const trimmed = String(ans).trim();
  if (!trimmed) return [];
  if (trimmed.includes(',') || trimmed.includes('/') || trimmed.includes(';') || trimmed.includes(' ')) {
    return Array.from(new Set(trimmed.split(/[,/;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean))).sort();
  }
  if (/^[A-E]+$/i.test(trimmed) && trimmed.length > 1) {
    return Array.from(new Set(trimmed.toUpperCase().split(''))).sort();
  }
  return [trimmed.toUpperCase()];
}

// Helper function to check if student's marked answers match the correct answer key
export function isAnswerMatch(studentAns: string | undefined | null, correctAns: string | undefined | null): boolean {
  const sPicks = normalizeAnswerSet(studentAns);
  const cPicks = normalizeAnswerSet(correctAns);
  if (sPicks.length === 0 || cPicks.length === 0) return false;
  if (sPicks.length !== cPicks.length) return false;
  return sPicks.every((val, idx) => val === cPicks[idx]);
}

// Coordinate mapping parameters (matching the generated Option B OMR sheet)
export const OMR_CONFIG = {
  width: 1000,
  height: 1414,

  // Anchors target coordinates (centers of the black squares)
  anchors: {
    tl: { x: 70, y: 150 },
    tr: { x: 930, y: 150 },
    bl: { x: 70, y: 1270 },
    br: { x: 930, y: 1270 }
  },

  // Student ID block coordinates (Roll No: 1-3 digits, 1-9 then 0)
  studentId: {
    xStart: 108,
    xStep: 42,
    yStart: 236,
    yStep: 24.5,
    numDigits: 3,
    bubbleRadius: 6.8
  },

  // Dummy placeholder for backwards compatibility
  bookletNo: {
    xStart: 370,
    xStep: 25,
    yStart: 216,
    yStep: 20,
    numDigits: 7,
    bubbleRadius: 7
  },

  // Questions layout coordinates
  questions: {
    bubbleRadius: 6.5,
    yStart: 195,
    yStep: 24.5,
    columns: []
  }
};

export interface OMRColumnConfig {
  qStart: number;
  qEnd: number;
  xLabel: number;
  xOptions: number[];
  yStart: number;
}

export interface OMRTimingMarker {
  x: number;
  y: number;
  type: 'corner' | 'top' | 'left-timing' | 'right-timing' | 'col-timing';
  slotIdx?: number;
}

export interface OMRQuestionLayout {
  bubbleRadius: number;
  yStart: number;
  yStep: number;
  rowsPerCol: number;
  numCols: number;
  columns: OMRColumnConfig[];
  bottomAnchorY: number;
  colWidth: number;
  timingMarkers: OMRTimingMarker[];
}

export interface OMRSlot {
  type: 'subject-header' | 'option-header' | 'question';
  slotIdx: number;
  subjectName?: string;
  qNum?: number;
  nextQNum?: number;
}

export function calculateColumnQuestionDistribution(totalQuestions: number, totalCols: number): number[] {
  if (totalCols <= 1) return [totalQuestions];

  if (totalQuestions === 180 && totalCols === 5) {
    return [28, 38, 38, 38, 38];
  }
  if (totalQuestions === 200 && totalCols === 5) {
    return [28, 43, 43, 43, 43];
  }
  if (totalQuestions === 100 && totalCols === 4) {
    return [16, 28, 28, 28];
  }
  if (totalQuestions === 50 && totalCols === 3) {
    return [10, 20, 20];
  }
  if (totalQuestions === 30 && totalCols === 2) {
    return [6, 24];
  }

  const sideCols = totalCols - 1;
  const maxCol0Qs = Math.floor((totalQuestions / totalCols) * 0.55 / 5) * 5;
  const col0Count = Math.min(totalQuestions, Math.max(5, maxCol0Qs));
  const colCounts: number[] = [col0Count];

  let remaining = totalQuestions - col0Count;
  const sidePerCol = Math.max(5, Math.ceil(remaining / sideCols));

  for (let c = 0; c < sideCols; c++) {
    if (c === sideCols - 1) {
      colCounts.push(remaining);
    } else {
      const cnt = Math.min(remaining, sidePerCol);
      colCounts.push(cnt);
      remaining -= cnt;
    }
  }

  return colCounts;
}

export function getColumnSlots(
  qStart: number,
  qEnd: number,
  sections: any[] | undefined,
  totalQuestions: number
): OMRSlot[] {
  const slots: OMRSlot[] = [];
  let slotIdx = 0;
  let qNum = qStart;

  let currentSecId: any = null;
  if (sections && sections.length > 0) {
    const s0 = sections.find((s: any) => qStart >= s.qStart && qStart < s.qStart + s.qCount);
    if (s0) currentSecId = s0.id || s0.name;
  }

  while (qNum <= qEnd && qNum <= totalQuestions) {
    if (sections && sections.length > 0) {
      const sec = sections.find((s: any) => qNum >= s.qStart && qNum < s.qStart + s.qCount);
      const newSecId = sec ? (sec.id || sec.name) : null;
      if (newSecId !== currentSecId) {
        slots.push({
          slotIdx: slotIdx++,
          type: 'subject-header',
          subjectName: sec?.name || 'SECTION'
        });
        currentSecId = newSecId;
      }
    }

    const inColIdx = qNum - qStart;
    if (inColIdx % 5 === 0) {
      slots.push({
        slotIdx: slotIdx++,
        type: 'option-header',
        nextQNum: qNum
      });
    }

    slots.push({
      slotIdx: slotIdx++,
      type: 'question',
      qNum
    });

    qNum++;
  }

  return slots;
}

export interface OMRLayoutDetails extends OMRQuestionLayout {
  gridLeft: number;
  gridRight: number;
  topAnchorY: number;
  rollFirstX: number;
  rollXStep: number;
  rollYStep: number;
}

export function getDynamicOMRQuestionLayout(
  numQuestions?: number,
  density: 'normal' | 'compact' | 'spacious' | 'auto' = 'auto',
  customColumns: number | 'auto' = 'auto',
  sections?: any[],
  rollNoDigits: number = 2
): OMRLayoutDetails {
  const total = numQuestions || 100;

  // 1. Column Count Determination
  let totalCols: number;
  if (typeof customColumns === 'number' && customColumns >= 2 && customColumns <= 5) {
    totalCols = customColumns;
  } else {
    if (total >= 135) totalCols = 5;
    else if (total >= 70) totalCols = 4;
    else if (total >= 36) totalCols = 3;
    else totalCols = 2;
  }
  totalCols = Math.min(5, Math.max(2, totalCols));

  // 2. Geometry & Spacing Parameters per Column Count
  const topAnchorY = 150;
  const bottomAnchorY = 1270;

  let colWidth: number;
  let gridLeft: number;
  let optStep: number;
  let idealYStep: number;
  let bubbleRadius: number;
  let rollXStep: number;
  let rollYStep: number;

  if (totalCols === 2) {
    colWidth = 430;
    gridLeft = 70;
    optStep = 44;
    idealYStep = 40.0;
    bubbleRadius = 7.5;
  } else if (totalCols === 3) {
    colWidth = 286;
    gridLeft = 70;
    optStep = 36;
    idealYStep = 30.0;
    bubbleRadius = 6.8;
  } else if (totalCols === 4) {
    colWidth = 215;
    gridLeft = 70;
    optStep = 28;
    idealYStep = 25.0;
    bubbleRadius = 6.4;
  } else {
    // 5 Columns (180 / 200 Questions Layout)
    colWidth = 180;
    gridLeft = 50;
    optStep = 24.0;
    idealYStep = 23.7;
    bubbleRadius = 6.2;
  }

  const gridRight = gridLeft + totalCols * colWidth;

  let yStep = idealYStep;
  if (density === 'spacious') yStep = idealYStep + 1.5;
  if (density === 'compact') yStep = Math.max(16.0, idealYStep - 1.5);

  // 3. Roll Number Geometry dynamically matching question row spacing
  rollYStep = yStep;
  rollXStep = Math.max(32, optStep * 1.10);

  // 3. Roll Number Geometry in Column 0
  const numRollDigits = Math.max(1, Math.min(6, rollNoDigits || 2));
  const col0Center = gridLeft + 0.5 * colWidth;
  const rollTotalWidth = (numRollDigits - 1) * rollXStep;
  const rollFirstX = col0Center - 0.5 * rollTotalWidth;

  // 4. Sequential Question Allocation per Column
  const colCounts = calculateColumnQuestionDistribution(total, totalCols);

  // Compute maximum slot count across all side columns to align bottom equal baseline
  let maxSideSlots = 0;
  let curQ = colCounts[0] + 1;
  for (let c = 1; c < totalCols; c++) {
    const qCount = colCounts[c] || 0;
    const qStart = curQ;
    const qEnd = curQ + qCount - 1;
    curQ += qCount;
    const sideSlots = getColumnSlots(qStart, qEnd, sections, total);
    if (sideSlots.length > maxSideSlots) {
      maxSideSlots = sideSlots.length;
    }
  }

  const col0Slots = getColumnSlots(1, colCounts[0], sections, total);
  const slotDiff = Math.max(0, maxSideSlots - col0Slots.length);
  const col0QuestionsYStart = 180 + slotDiff * yStep;

  // 5. Build Column Configurations
  const columns: OMRColumnConfig[] = [];
  let currentQ = 1;

  for (let c = 0; c < totalCols; c++) {
    const qCount = colCounts[c] || 0;
    if (qCount <= 0) continue;

    const qStart = currentQ;
    const qEnd = currentQ + qCount - 1;
    currentQ += qCount;

    const cCenter = gridLeft + (c + 0.5) * colWidth;
    const optA = cCenter - 1.5 * optStep;
    const optB = cCenter - 0.5 * optStep;
    const optC = cCenter + 0.5 * optStep;
    const optD = cCenter + 1.5 * optStep;
    const xLabel = optA - 26;

    const yStart = c === 0 ? col0QuestionsYStart : 180;

    columns.push({
      qStart,
      qEnd,
      xLabel,
      yStart,
      xOptions: [optA, optB, optC, optD]
    });
  }

  // 6. Generate Clean Gutter Timing Markers (Fiducial Grid)
  const timingMarkers: OMRTimingMarker[] = [];
  const gutterXs: number[] = [];
  for (let g = 0; g <= totalCols; g++) {
    gutterXs.push(Math.round(gridLeft + g * colWidth));
  }

  const yLevels = [150, 290, 430, 570, 710, 850, 990, 1130, 1270];
  for (let idx = 0; idx < yLevels.length; idx++) {
    const y = yLevels[idx];
    const isCorner = idx === 0 || idx === yLevels.length - 1;
    for (const gx of gutterXs) {
      timingMarkers.push({
        x: gx,
        y,
        type: isCorner ? 'corner' : 'col-timing'
      });
    }
  }

  const referenceSlots = getColumnSlots(1, colCounts[1] || 38, sections, total);

  return {
    bubbleRadius,
    yStart: topAnchorY,
    yStep,
    rowsPerCol: referenceSlots.length,
    numCols: totalCols,
    columns,
    bottomAnchorY,
    colWidth,
    timingMarkers,
    gridLeft,
    gridRight,
    topAnchorY,
    rollFirstX,
    rollXStep,
    rollYStep
  };
}

export function calculateBubbleAverageGray(grayMatrix: any, cx: number, cy: number, r: number): number {
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

export function calculateRingAverageGray(grayMatrix: any, cx: number, cy: number, rInner: number, rOuter: number): number {
  let sum = 0;
  let count = 0;
  const rInSq = rInner * rInner;
  const rOutSq = rOuter * rOuter;
  const startX = Math.max(0, Math.floor(cx - rOuter));
  const endX = Math.min(grayMatrix.cols - 1, Math.ceil(cx + rOuter));
  const startY = Math.max(0, Math.floor(cy - rOuter));
  const endY = Math.min(grayMatrix.rows - 1, Math.ceil(cy + rOuter));

  for (let y = startY; y <= endY; y++) {
    const dy = y - cy;
    const dySq = dy * dy;
    for (let x = startX; x <= endX; x++) {
      const dx = x - cx;
      const dSq = dx * dx + dySq;
      if (dSq >= rInSq && dSq <= rOutSq) {
        sum += grayMatrix.ucharAt(y, x);
        count++;
      }
    }
  }
  return count > 0 ? sum / count : 255;
}

/**
 * High-Precision Dual-Mode Bubble Centroid Snapper (Industry-Grade / Evalbee Level)
 * - If bubble has a dark pencil/pen mark: calculates the weighted center of mass of the dark fill.
 * - If bubble is empty: optimizes circular ring contrast (peaks when ring is darkest and inner core
 *   and outer paper are brightest white). Mathematically CANNOT jump or drift to borders!
 */
export function findExactBubbleCentroid(
  grayMatrix: any,
  approxX: number,
  approxY: number,
  searchRadius: number = 3,
  expectedBubbleR: number = 6.8
): { x: number; y: number } {
  const rCore = Math.max(2.2, Math.min(2.9, expectedBubbleR * 0.42));
  const rRingIn = expectedBubbleR * 0.78;
  const rRingOut = expectedBubbleR * 1.08;
  const rPaperIn = expectedBubbleR * 1.45;
  const rPaperOut = expectedBubbleR * 1.85;

  const initCore = calculateBubbleAverageGray(grayMatrix, approxX, approxY, rCore);
  const initPaper = calculateRingAverageGray(grayMatrix, approxX, approxY, rPaperIn, rPaperOut);

  // 1. If distinctly filled mark (dark core, high contrast against local paper baseline):
  if (initCore <= 140 && (initPaper - initCore >= 35)) {
    let sumWeight = 0;
    let sumX = 0;
    let sumY = 0;
    const maxR = expectedBubbleR * 0.85;
    const maxRSq = maxR * maxR;
    const darkThresh = Math.max(35, initPaper - 30);

    const startX = Math.max(0, Math.floor(approxX - maxR));
    const endX = Math.min(grayMatrix.cols - 1, Math.ceil(approxX + maxR));
    const startY = Math.max(0, Math.floor(approxY - maxR));
    const endY = Math.min(grayMatrix.rows - 1, Math.ceil(approxY + maxR));

    for (let py = startY; py <= endY; py++) {
      const dy = py - approxY;
      const dySq = dy * dy;
      for (let px = startX; px <= endX; px++) {
        const dx = px - approxX;
        if (dx * dx + dySq <= maxRSq) {
          const val = grayMatrix.ucharAt(py, px);
          if (val < darkThresh) {
            const w = darkThresh - val;
            sumWeight += w;
            sumX += px * w;
            sumY += py * w;
          }
        }
      }
    }

    if (sumWeight > 0) {
      const cx = sumX / sumWeight;
      const cy = sumY / sumWeight;
      if (Math.abs(cx - approxX) <= searchRadius + 1 && Math.abs(cy - approxY) <= searchRadius + 1) {
        return { x: Math.round(cx * 10) / 10, y: Math.round(cy * 10) / 10 };
      }
    }
    return { x: approxX, y: approxY };
  }

  // 2. Empty / Unmarked bubble:
  // Find (cx, cy) within [-searchRadius, searchRadius] that maximizes the circular ring contrast:
  // score = (coreVal - ringVal) + (paperVal - ringVal)
  // At the true circle center, the ring is darkest (printed stroke) while core & paper are white.
  // If candidate drifts toward the printed border, coreVal plummets and score collapses.
  let bestX = approxX;
  let bestY = approxY;
  let bestScore = -9999;

  const startDy = -Math.min(4, Math.max(1, searchRadius));
  const endDy = Math.min(4, Math.max(1, searchRadius));
  const startDx = -Math.min(4, Math.max(1, searchRadius));
  const endDx = Math.min(4, Math.max(1, searchRadius));

  for (let dy = startDy; dy <= endDy; dy += 1) {
    for (let dx = startDx; dx <= endDx; dx += 1) {
      const cx = approxX + dx;
      const cy = approxY + dy;
      if (cx >= 10 && cx < grayMatrix.cols - 10 && cy >= 10 && cy < grayMatrix.rows - 10) {
        const coreVal = calculateBubbleAverageGray(grayMatrix, cx, cy, rCore);
        const ringVal = calculateRingAverageGray(grayMatrix, cx, cy, rRingIn, rRingOut);
        const paperVal = calculateRingAverageGray(grayMatrix, cx, cy, rPaperIn, rPaperOut);

        const score = (coreVal - ringVal) + (paperVal - ringVal);
        if (score > bestScore) {
          bestScore = score;
          bestX = cx;
          bestY = cy;
        }
      }
    }
  }

  // Only shift if circular ring symmetry is detected (score >= 18); else stay firmly at theoretical grid
  if (bestScore >= 18) {
    return { x: bestX, y: bestY };
  }

  return { x: approxX, y: approxY };
}

/**
 * Calculates rigorous multi-factor fill metrics strictly inside the bubble inner core:
 * - meanVal: average gray level of inner core (safe radius well inside printed border)
 * - darkRatio: fraction of pixels distinctly darker than local paper background
 * - minVal: darkest point inside the core
 */
export function calculateBubbleFillMetrics(
  grayMatrix: any,
  cx: number,
  cy: number,
  sampleRadius: number,
  paperBaseline: number
): { meanVal: number; darkRatio: number; minVal: number } {
  let sum = 0;
  let count = 0;
  let darkCount = 0;
  let minVal = 255;
  const rSq = sampleRadius * sampleRadius;
  const darkThreshold = Math.max(35, paperBaseline - 32);

  const startX = Math.max(0, Math.floor(cx - sampleRadius));
  const endX = Math.min(grayMatrix.cols - 1, Math.ceil(cx + sampleRadius));
  const startY = Math.max(0, Math.floor(cy - sampleRadius));
  const endY = Math.min(grayMatrix.rows - 1, Math.ceil(cy + sampleRadius));

  for (let y = startY; y <= endY; y++) {
    const dy = y - cy;
    const dySq = dy * dy;
    for (let x = startX; x <= endX; x++) {
      const dx = x - cx;
      if (dx * dx + dySq <= rSq) {
        const pixelVal = grayMatrix.ucharAt(y, x);
        sum += pixelVal;
        count++;
        if (pixelVal <= darkThreshold) {
          darkCount++;
        }
        if (pixelVal < minVal) {
          minVal = pixelVal;
        }
      }
    }
  }

  const meanVal = count > 0 ? sum / count : 255;
  const darkRatio = count > 0 ? darkCount / count : 0;
  return { meanVal, darkRatio, minVal };
}

function verifyOMRFiducialMatrix(warpedGrayMat: any, layout: OMRLayoutDetails): boolean {
  if (!warpedGrayMat || warpedGrayMat.cols === 0) return false;

  const timingMarkers = layout.timingMarkers || [];
  if (timingMarkers.length === 0) return true;

  let matched = 0;
  const markHalf = 4;

  for (const tm of timingMarkers) {
    const cx = Math.round(tm.x);
    const cy = Math.round(tm.y);

    if (cx - markHalf >= 0 && cx + markHalf < warpedGrayMat.cols && cy - markHalf >= 0 && cy + markHalf < warpedGrayMat.rows) {
      let sum = 0, cnt = 0;
      for (let py = cy - markHalf; py <= cy + markHalf; py++) {
        for (let px = cx - markHalf; px <= cx + markHalf; px++) {
          sum += warpedGrayMat.ucharAt(py, px);
          cnt++;
        }
      }
      const centerVal = cnt > 0 ? sum / cnt : 255;
      const bgVal = calculateRingAverageGray(warpedGrayMat, cx, cy, markHalf + 3, markHalf + 7);
      const contrast = bgVal - centerVal;

      if (contrast >= 18) {
        matched++;
      }
    }
  }

  const matchRate = timingMarkers.length > 0 ? matched / timingMarkers.length : 1.0;
  return matchRate >= 0.45;
}

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

    cv.Laplacian(gray, lap, cv.CV_64F);
    cv.meanStdDev(lap, mean, stddev);
    const lapStd = stddev.doubleAt(0, 0);
    const blurScore = lapStd * lapStd;

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

export function findOuterGridCorners(
  cands: Array<{ center: { x: number; y: number }; area: number; rect: any }>,
  expectedRatio: number,
  pageArea: number
): { tl: any; tr: any; bl: any; br: any } | null {
  if (cands.length < 4) return null;

  const areas = cands.map(c => c.area).sort((a, b) => a - b);
  const medianArea = areas[Math.floor(areas.length / 2)];
  const validCands = cands.filter(c => c.area >= medianArea * 0.25 && c.area <= medianArea * 3.5);
  if (validCands.length < 4) return null;

  const minX = Math.min(...validCands.map(c => c.center.x));
  const maxX = Math.max(...validCands.map(c => c.center.x));
  const minY = Math.min(...validCands.map(c => c.center.y));
  const maxY = Math.max(...validCands.map(c => c.center.y));

  const tlExt = [...validCands].sort((a, b) => Math.hypot(a.center.x - minX, a.center.y - minY) - Math.hypot(b.center.x - minX, b.center.y - minY))[0];
  const trExt = [...validCands].sort((a, b) => Math.hypot(a.center.x - maxX, a.center.y - minY) - Math.hypot(b.center.x - maxX, b.center.y - minY))[0];
  const blExt = [...validCands].sort((a, b) => Math.hypot(a.center.x - minX, a.center.y - maxY) - Math.hypot(b.center.x - minX, b.center.y - maxY))[0];
  const brExt = [...validCands].sort((a, b) => Math.hypot(a.center.x - maxX, a.center.y - maxY) - Math.hypot(b.center.x - maxX, b.center.y - maxY))[0];

  if (tlExt && trExt && blExt && brExt && new Set([tlExt, trExt, blExt, brExt]).size === 4) {
    const isQuadrantValid =
      tlExt.center.x < trExt.center.x &&
      blExt.center.x < brExt.center.x &&
      tlExt.center.y < blExt.center.y &&
      trExt.center.y < brExt.center.y;

    if (!isQuadrantValid) return null;

    const wTop = Math.hypot(tlExt.center.x - trExt.center.x, tlExt.center.y - trExt.center.y);
    const wBot = Math.hypot(blExt.center.x - brExt.center.x, blExt.center.y - brExt.center.y);
    const hLeft = Math.hypot(tlExt.center.x - blExt.center.x, tlExt.center.y - blExt.center.y);
    const hRight = Math.hypot(trExt.center.x - brExt.center.x, trExt.center.y - brExt.center.y);
    const avgW = (wTop + wBot) / 2;
    const avgH = (hLeft + hRight) / 2;
    const quadArea = avgW * avgH;

    if (avgW > 50 && avgH > 60 && quadArea > pageArea * 0.18) {
      const ratio = avgH / avgW;
      const minRatio = Math.max(0.95, expectedRatio - 0.18);
      const maxRatio = Math.min(1.85, expectedRatio + 0.18);
      const isWidthSimilar = Math.abs(wTop - wBot) / Math.max(wTop, wBot) <= 0.12;
      const isHeightSimilar = Math.abs(hLeft - hRight) / Math.max(hLeft, hRight) <= 0.12;
      const isAnglesValid = validateQuadAngles(tlExt.center, trExt.center, brExt.center, blExt.center, 75, 105);

      const isTopStraight = Math.abs(tlExt.center.y - trExt.center.y) / avgH <= 0.10;
      const isBotStraight = Math.abs(blExt.center.y - brExt.center.y) / avgH <= 0.10;
      const isLeftStraight = Math.abs(tlExt.center.x - blExt.center.x) / avgW <= 0.10;
      const isRightStraight = Math.abs(trExt.center.x - brExt.center.x) / avgW <= 0.10;

      if (
        ratio >= minRatio &&
        ratio <= maxRatio &&
        isWidthSimilar &&
        isHeightSimilar &&
        isAnglesValid &&
        isTopStraight &&
        isBotStraight &&
        isLeftStraight &&
        isRightStraight
      ) {
        return { tl: tlExt, tr: trExt, bl: blExt, br: brExt };
      }
    }
  }

  return null;
}

export async function scanOMRSheet(
  sourceImage: HTMLCanvasElement | HTMLImageElement,
  numQuestions: number,
  rollNoDigits: number = 3,
  _examSetsCount: number = 1,
  sections: any[] = [],
  knownCorners?: Array<{ x: number; y: number }> | null
): Promise<ScanResult> {
  const cv = window.cv;
  if (!cv) {
    throw new Error('OpenCV.js is not loaded yet');
  }

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
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    let ksize = new cv.Size(5, 5);
    cv.GaussianBlur(gray, blurred, ksize, 0);

    cv.adaptiveThreshold(
      blurred,
      thresh,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      15,
      9
    );

    const effectiveRollDigits = Math.min(3, Math.max(1, rollNoDigits || 3));
    const layout = getDynamicOMRQuestionLayout(numQuestions, undefined, 'auto', sections, effectiveRollDigits);

    const srcWidth = src.cols;
    const srcHeight = src.rows;
    const pageArea = srcWidth * srcHeight;

    let tlMarker: any = null;
    let trMarker: any = null;
    let blMarker: any = null;
    let brMarker: any = null;

    const expectedGridRatio = (layout.bottomAnchorY - layout.topAnchorY) / (layout.gridRight - layout.gridLeft);

    if (knownCorners && knownCorners.length === 4) {
      tlMarker = { center: { x: knownCorners[0].x, y: knownCorners[0].y } };
      trMarker = { center: { x: knownCorners[1].x, y: knownCorners[1].y } };
      brMarker = { center: { x: knownCorners[2].x, y: knownCorners[2].y } };
      blMarker = { center: { x: knownCorners[3].x, y: knownCorners[3].y } };
    }

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

      const attemptCandidates: Array<{ center: { x: number; y: number }; area: number; rect: any }> = [];
      for (let i = 0; i < contours.size(); ++i) {
        const cnt = contours.get(i);
        const rect = cv.boundingRect(cnt);
        const area = rect.width * rect.height;
        const aspectRatio = rect.width / rect.height;

        const isCorrectSize = area > pageArea * 0.00006 && area < pageArea * 0.05;
        const isSquare = aspectRatio >= 0.60 && aspectRatio <= 1.65;

        const cArea = cv.contourArea(cnt);
        const solidity = area > 0 ? cArea / area : 0;
        const isSolid = solidity >= 0.55;

        if (isCorrectSize && isSquare && isSolid) {
          const M = cv.moments(cnt, false);
          const center = (M && M.m00 !== 0)
            ? { x: M.m10 / M.m00, y: M.m01 / M.m00 }
            : { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
          attemptCandidates.push({ center, area, rect });
        }
        cnt.delete();
      }

      const quad = findOuterGridCorners(attemptCandidates, expectedGridRatio, pageArea);
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
      throw new Error('Failed to locate all 4 corner anchors. Please align the sheet within the camera guide boxes.');
    }

    const targetAnchors = {
      tl: { x: layout.gridLeft, y: layout.topAnchorY },
      tr: { x: layout.gridRight, y: layout.topAnchorY },
      br: { x: layout.gridRight, y: layout.bottomAnchorY },
      bl: { x: layout.gridLeft, y: layout.bottomAnchorY }
    };

    const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      tlMarker.center.x, tlMarker.center.y,
      trMarker.center.x, trMarker.center.y,
      brMarker.center.x, brMarker.center.y,
      blMarker.center.x, blMarker.center.y
    ]);

    const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      targetAnchors.tl.x, targetAnchors.tl.y,
      targetAnchors.tr.x, targetAnchors.tr.y,
      targetAnchors.br.x, targetAnchors.br.y,
      targetAnchors.bl.x, targetAnchors.bl.y
    ]);

    currentYScale = 1.0;
    currentYStartOffset = layout.topAnchorY;

    const warpedSize = new cv.Size(OMR_CONFIG.width, OMR_CONFIG.height);
    const M_warp = cv.getPerspectiveTransform(srcPts, dstPts);
    bestWarpedMat = new cv.Mat();
    cv.warpPerspective(src, bestWarpedMat, M_warp, warpedSize);

    srcPts.delete();
    dstPts.delete();
    M_warp.delete();
    let warped = bestWarpedMat;

    warpedGray = new cv.Mat();
    cv.cvtColor(warped, warpedGray, cv.COLOR_RGBA2GRAY);

    // Enforce 100% fail-safe fiducial matrix check
    const isFiducialValid = verifyOMRFiducialMatrix(warpedGray, layout);
    if (!isFiducialValid) {
      throw new Error("OMR Sheet truncated or misaligned — Please ensure all 4 outer corner registration marks are fully visible inside the camera view.");
    }

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

    let bookletSet = 'A';
    const qConf = layout;

    // ── Robust Adaptive Timing Mark Grid Detector ──
    interface TimingMarkOffset {
      expectedX: number;
      expectedY: number;
      actualDx: number;
      actualDy: number;
    }

    const tmOffsets: TimingMarkOffset[] = [];
    const searchR = 14;

    for (const tm of qConf.timingMarkers) {
      const isCorner = tm.type === 'corner';
      const markHalf = isCorner ? 10 : 7;

      let bestDx = 0;
      let bestDy = 0;
      let bestContrast = -9999;

      // Coarse search (2px step)
      for (let dy = -searchR; dy <= searchR; dy += 2) {
        for (let dx = -searchR; dx <= searchR; dx += 2) {
          const cx = tm.x + dx;
          const cy = tm.y + dy;
          if (cx - markHalf >= 5 && cx + markHalf < warpedGray.cols - 5 && cy - markHalf >= 5 && cy + markHalf < warpedGray.rows - 5) {
            let sum = 0, cnt = 0;
            for (let py = cy - markHalf; py <= cy + markHalf; py += 2) {
              for (let px = cx - markHalf; px <= cx + markHalf; px += 2) {
                sum += warpedGray.ucharAt(py, px);
                cnt++;
              }
            }
            const centerVal = cnt > 0 ? sum / cnt : 255;
            const bgVal = calculateRingAverageGray(warpedGray, cx, cy, markHalf + 3, markHalf + 8);
            const contrast = bgVal - centerVal;

            if (contrast > bestContrast) {
              bestContrast = contrast;
              bestDx = dx;
              bestDy = dy;
            }
          }
        }
      }

      // Fine search (1px resolution)
      let fineDx = bestDx, fineDy = bestDy, fineContrast = bestContrast;
      for (let dy = bestDy - 2; dy <= bestDy + 2; dy++) {
        for (let dx = bestDx - 2; dx <= bestDx + 2; dx++) {
          const cx = tm.x + dx;
          const cy = tm.y + dy;
          if (cx - markHalf >= 5 && cx + markHalf < warpedGray.cols - 5 && cy - markHalf >= 5 && cy + markHalf < warpedGray.rows - 5) {
            let sum = 0, cnt = 0;
            for (let py = cy - markHalf; py <= cy + markHalf; py++) {
              for (let px = cx - markHalf; px <= cx + markHalf; px++) {
                sum += warpedGray.ucharAt(py, px);
                cnt++;
              }
            }
            const centerVal = cnt > 0 ? sum / cnt : 255;
            const bgVal = calculateRingAverageGray(warpedGray, cx, cy, markHalf + 3, markHalf + 8);
            const contrast = bgVal - centerVal;

            if (contrast > fineContrast) {
              fineContrast = contrast;
              fineDx = dx;
              fineDy = dy;
            }
          }
        }
      }

      if (fineContrast >= 20) {
        tmOffsets.push({
          expectedX: tm.x,
          expectedY: tm.y,
          actualDx: fineDx,
          actualDy: fineDy
        });
      }
    }

    const tmXSet = new Set(tmOffsets.map(t => t.expectedX));
    const tmYSet = new Set(tmOffsets.map(t => t.expectedY));
    const tmXs = Array.from(tmXSet).sort((a, b) => a - b);
    const tmYs = Array.from(tmYSet).sort((a, b) => a - b);

    let bestDx = 0;
    let bestDy = 0;
    if (tmOffsets.length >= 4) {
      bestDx = Math.round(tmOffsets.reduce((s, o) => s + o.actualDx, 0) / tmOffsets.length);
      bestDy = Math.round(tmOffsets.reduce((s, o) => s + o.actualDy, 0) / tmOffsets.length);
    }

    function getLocalOffset(x: number, y: number): { dx: number; dy: number } {
      if (tmOffsets.length < 4 || tmXs.length < 2 || tmYs.length < 2) {
        return { dx: bestDx, dy: bestDy };
      }

      let x0 = tmXs[0], x1 = tmXs[tmXs.length - 1];
      for (let i = 0; i < tmXs.length - 1; i++) {
        if (x >= tmXs[i] && x <= tmXs[i + 1]) {
          x0 = tmXs[i];
          x1 = tmXs[i + 1];
          break;
        }
      }

      let y0 = tmYs[0], y1 = tmYs[tmYs.length - 1];
      for (let i = 0; i < tmYs.length - 1; i++) {
        if (y >= tmYs[i] && y <= tmYs[i + 1]) {
          y0 = tmYs[i];
          y1 = tmYs[i + 1];
          break;
        }
      }

      const getOff = (ex: number, ey: number) => {
        const tm = tmOffsets.find(t => t.expectedX === ex && t.expectedY === ey);
        if (tm) return { dx: tm.actualDx, dy: tm.actualDy };
        const sameY = tmOffsets.filter(t => t.expectedY === ey);
        if (sameY.length > 0) {
          sameY.sort((a, b) => Math.abs(a.expectedX - ex) - Math.abs(b.expectedX - ex));
          return { dx: sameY[0].actualDx, dy: sameY[0].actualDy };
        }
        return { dx: bestDx, dy: bestDy };
      };

      const tl = getOff(x0, y0);
      const tr = getOff(x1, y0);
      const bl = getOff(x0, y1);
      const br = getOff(x1, y1);

      const xSpan = x1 - x0 || 1;
      const ySpan = y1 - y0 || 1;
      const tx = Math.max(0, Math.min(1, (x - x0) / xSpan));
      const ty = Math.max(0, Math.min(1, (y - y0) / ySpan));

      const dx = (1 - tx) * (1 - ty) * tl.dx + tx * (1 - ty) * tr.dx +
                 (1 - tx) * ty * bl.dx + tx * ty * br.dx;
      const dy = (1 - tx) * (1 - ty) * tl.dy + tx * (1 - ty) * tr.dy +
                 (1 - tx) * ty * bl.dy + tx * ty * br.dy;

      return { dx: Math.round(dx), dy: Math.round(dy) };
    }

    // 7. Scan Answers (Timing-Mark Mesh Aligned & Sub-pixel Centroid Snapped)
    const answers: Record<number, string> = {};
    const OPTIONS_FIVE = ['A', 'B', 'C', 'D', 'E'];
    const questionOffsets: Record<number, { dx: number; dy: number }> = {};
    const bubbleCenters: Record<number, Record<string, { x: number; y: number }>> = {};

    for (let q = 1; q <= numQuestions; q++) {
      let colConf: OMRColumnConfig | null = null;
      for (let i = 0; i < qConf.columns.length; i++) {
        const col = qConf.columns[i];
        if (q >= col.qStart && q <= col.qEnd) {
          colConf = col;
          break;
        }
      }

      if (!colConf) {
        answers[q] = '';
        questionOffsets[q] = { dx: bestDx, dy: bestDy };
        continue;
      }

      const sec = sections.find((s: any) => q >= s.qStart && q < s.qStart + s.qCount);
      const is5Option = sec && sec.questionType === '5 option';
      const numOptions = is5Option ? 5 : 4;

      const slots = getColumnSlots(colConf.qStart, colConf.qEnd, sections, numQuestions);
      const qSlot = slots.find(s => s.type === 'question' && s.qNum === q);
      if (!qSlot) {
        answers[q] = '';
        questionOffsets[q] = { dx: bestDx, dy: bestDy };
        continue;
      }
      const slotIndex = qSlot.slotIdx;
      const rawY = colConf.yStart + slotIndex * qConf.yStep;
      
      const colCenter = colConf.xOptions[1];
      const localOff = getLocalOffset(colCenter, rawY);
      
      questionOffsets[q] = localOff;
      const y = rawY + localOff.dy;
      bubbleCenters[q] = {};

      const optData: Array<{
        optIdx: number;
        optChar: string;
        centerPt: { x: number; y: number };
        innerVal: number;
        outerVal: number;
        contrast: number;
        metrics: { meanVal: number; darkRatio: number; minVal: number };
      }> = [];

      for (let optIdx = 0; optIdx < numOptions; optIdx++) {
        const optChar = OPTIONS_FIVE[optIdx];
        const rawX = (optIdx === 4 ? colConf.xOptions[3] + 25 : colConf.xOptions[optIdx]) + localOff.dx;
        
        // Exact sub-pixel bubble centroid alignment (never drifts onto printed borders)
        const centerPt = findExactBubbleCentroid(warpedGray, rawX, y, 3, qConf.bubbleRadius);
        bubbleCenters[q][optChar] = centerPt;

        // Local paper baseline sampled around this bubble (r in [10, 13])
        const bubblePaper = calculateRingAverageGray(warpedGray, centerPt.x, centerPt.y, 10.0, 13.0);
        
        // Safe inner core metrics (r = 3.0px, strictly inside circle with >2.4px margin from border)
        const sampleRadius = Math.max(2.2, Math.min(3.1, qConf.bubbleRadius * 0.44));
        const metrics = calculateBubbleFillMetrics(warpedGray, centerPt.x, centerPt.y, sampleRadius, bubblePaper);

        const innerVal = metrics.meanVal;
        const outerVal = bubblePaper;
        const contrast = outerVal - innerVal;

        optData.push({
          optIdx,
          optChar,
          centerPt,
          innerVal,
          outerVal,
          contrast,
          metrics
        });
      }

      // Local row paper baseline: highest brightness among bubble outer backgrounds
      const rowPaperBaseline = Math.max(...optData.map(d => d.outerVal), 190);

      // Evalbee multi-tier fill qualification:
      // Candidate must be distinctly dark, have high drop from white paper, and high dark pixel density
      const candidateIndices: number[] = [];

      for (const d of optData) {
        const drop = rowPaperBaseline - d.metrics.meanVal;
        const ratio = rowPaperBaseline > 0 ? (d.metrics.meanVal / rowPaperBaseline) : 1.0;

        const isMarked = d.metrics.meanVal <= 160 &&
                         drop >= 30 &&
                         d.metrics.darkRatio >= 0.28 &&
                         ratio <= 0.80;

        if (isMarked) {
          candidateIndices.push(d.optIdx);
        }
      }

      if (candidateIndices.length === 1) {
        const candIdx = candidateIndices[0];
        const otherDrops = optData.filter(d => d.optIdx !== candIdx).map(d => Math.max(0, rowPaperBaseline - d.metrics.meanVal));
        const maxOtherDrop = otherDrops.length > 0 ? Math.max(...otherDrops) : 0;
        const candDrop = rowPaperBaseline - optData[candIdx].metrics.meanVal;
        const separation = candDrop - maxOtherDrop;

        // Single option marked: verify clear separation or intense dark fill
        if (separation >= 16 || candDrop >= 48 || optData[candIdx].metrics.darkRatio >= 0.55) {
          answers[q] = OPTIONS_FIVE[candIdx];
        } else {
          answers[q] = ''; // Ambiguous / noise -> unattempted
        }
      } else if (candidateIndices.length > 1) {
        // Sort candidate options by darkness (lowest meanVal first)
        const sortedCands = [...candidateIndices].sort((a, b) => optData[a].metrics.meanVal - optData[b].metrics.meanVal);
        const bestIdx = sortedCands[0];
        const secondIdx = sortedCands[1];

        const bestDrop = rowPaperBaseline - optData[bestIdx].metrics.meanVal;
        const secondDrop = rowPaperBaseline - optData[secondIdx].metrics.meanVal;

        // If one mark clearly dominates (e.g. pencil smudge/erasure vs pen fill)
        if (bestDrop - secondDrop >= 28) {
          answers[q] = OPTIONS_FIVE[bestIdx];
        } else {
          // Genuine multiple picks
          answers[q] = candidateIndices.map(idx => OPTIONS_FIVE[idx]).sort().join(',');
        }
      } else {
        answers[q] = '';
      }
    }

    // 8. Roll No Scanning (Auto 2/3 Column Detection + Exact Bubble Centroids + Strict Evalbee Fill)
    const col0Width = qConf.colWidth;
    const col0Center = qConf.gridLeft + 0.5 * col0Width;
    const rollXStep = qConf.rollXStep;
    const rollYStep = qConf.rollYStep;
    const rollLocalOff = getLocalOffset(col0Center, 188);

    // Determine whether the printed sheet has 2 columns or 3 columns
    let effectiveRollCols = Math.min(3, Math.max(1, rollNoDigits || 2));
    if (!rollNoDigits || rollNoDigits === 3) {
      // Auto-check if 10 circular bubbles exist down the center line (col0Center):
      // For 3 columns, column 1 is centered at col0Center.
      // For 2 columns, col0Center is empty paper between col 0 and col 1.
      let centerBubbleRingCount = 0;
      for (let r = 0; r < 10; r++) {
        const ry = 188 + r * rollYStep + rollLocalOff.dy;
        const ringV = calculateRingAverageGray(warpedGray, col0Center + rollLocalOff.dx, ry, 5.2, 7.2);
        const coreV = calculateBubbleAverageGray(warpedGray, col0Center + rollLocalOff.dx, ry, 2.8);
        if (coreV - ringV >= 15) centerBubbleRingCount++;
      }
      effectiveRollCols = centerBubbleRingCount >= 5 ? 3 : 2;
    }

    const rollTotalWidth = (effectiveRollCols - 1) * rollXStep;
    const rollFirstX = col0Center - 0.5 * rollTotalWidth;

    const digitValuesList = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const detectedRollBubbles: Array<{ colIdx: number; digit: number; x: number; y: number }> = [];
    const detectedDigitsByCol: Record<number, number> = {};

    for (let colIdx = 0; colIdx < effectiveRollCols; colIdx++) {
      const approxX = rollFirstX + colIdx * rollXStep + rollLocalOff.dx;
      const rowMetrics: Array<{
        digit: number;
        centerPt: { x: number; y: number };
        innerVal: number;
        outerVal: number;
        contrast: number;
        metrics: { meanVal: number; darkRatio: number; minVal: number };
      }> = [];

      for (let rowIdx = 0; rowIdx < 10; rowIdx++) {
        const rawY = 188 + rowIdx * rollYStep + rollLocalOff.dy;
        const centerPt = findExactBubbleCentroid(warpedGray, approxX, rawY, 3, qConf.bubbleRadius);
        const bubblePaper = calculateRingAverageGray(warpedGray, centerPt.x, centerPt.y, 10.0, 13.0);
        const sampleRadius = Math.max(2.2, Math.min(3.1, qConf.bubbleRadius * 0.44));
        const metrics = calculateBubbleFillMetrics(warpedGray, centerPt.x, centerPt.y, sampleRadius, bubblePaper);

        rowMetrics.push({
          digit: digitValuesList[rowIdx],
          centerPt,
          innerVal: metrics.meanVal,
          outerVal: bubblePaper,
          contrast: bubblePaper - metrics.meanVal,
          metrics
        });
      }

      // Column paper baseline from top 5 brightest bubbles
      const sortedIntensities = [...rowMetrics].map(m => m.outerVal).sort((a, b) => b - a);
      const colPaperBaseline = sortedIntensities.slice(0, 5).reduce((a, b) => a + b, 0) / 5;

      // Find the darkest candidate digit in this column
      let bestRow = rowMetrics[0];
      for (const rm of rowMetrics) {
        if (rm.innerVal < bestRow.innerVal) {
          bestRow = rm;
        }
      }

      // Check separation against second lowest
      const otherVals = rowMetrics.filter(rm => rm.digit !== bestRow.digit).map(rm => rm.innerVal);
      const secondLowest = otherVals.length > 0 ? Math.min(...otherVals) : 255;
      const separation = secondLowest - bestRow.innerVal;
      const rollDrop = colPaperBaseline - bestRow.innerVal;
      const rollRatio = colPaperBaseline > 0 ? (bestRow.innerVal / colPaperBaseline) : 1.0;

      // Strict fill criterion for roll number bubble
      const isDigitFilled = bestRow.innerVal <= 160 &&
                            rollDrop >= 30 &&
                            bestRow.metrics.darkRatio >= 0.28 &&
                            rollRatio <= 0.80 &&
                            (separation >= 16 || rollDrop >= 48);

      if (isDigitFilled) {
        detectedDigitsByCol[colIdx] = bestRow.digit;
        detectedRollBubbles.push({
          colIdx,
          digit: bestRow.digit,
          x: bestRow.centerPt.x,
          y: bestRow.centerPt.y
        });
      }
    }

    // Build studentNum string
    let studentNum = '';
    const detectedColIndices = Object.keys(detectedDigitsByCol).map(Number).sort((a, b) => a - b);
    if (detectedColIndices.length > 0) {
      for (let c = 0; c < effectiveRollCols; c++) {
        if (detectedDigitsByCol[c] !== undefined) {
          studentNum += detectedDigitsByCol[c].toString();
        }
      }
    }

    const bubbleSnippets = undefined;

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
      questionOffsets,
      bubbleSnippets,
      detectedRollBubbles,
      bubbleCenters
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

let smallCanvas: HTMLCanvasElement | null = null;
let smallCtx: CanvasRenderingContext2D | null = null;

export interface ViewfinderROI {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewfinderROIs {
  tl: ViewfinderROI;
  tr: ViewfinderROI;
  bl: ViewfinderROI;
  br: ViewfinderROI;
}

export interface ROIDetectionResult {
  tl: { x: number; y: number } | null;
  tr: { x: number; y: number } | null;
  bl: { x: number; y: number } | null;
  br: { x: number; y: number } | null;
  allFound: boolean;
  corners: Array<{ x: number; y: number }> | null;
}

export function findOMRSheetCornersInROI(
  video: HTMLVideoElement,
  rois: ViewfinderROIs,
  _numQuestions: number = 100
): ROIDetectionResult | null {
  const cv = window.cv;
  if (!cv) return null;

  const vW = video.videoWidth;
  const vH = video.videoHeight;
  if (vW === 0 || vH === 0) return null;

  if (!smallCanvas) {
    smallCanvas = document.createElement('canvas');
  }
  if (smallCanvas.width !== vW || smallCanvas.height !== vH) {
    smallCanvas.width = vW;
    smallCanvas.height = vH;
    smallCtx = smallCanvas.getContext('2d', { willReadFrequently: true });
  }

  if (!smallCtx) return null;
  smallCtx.drawImage(video, 0, 0, vW, vH);

  let src = cv.imread(smallCanvas);
  let gray = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const keys: Array<'tl' | 'tr' | 'bl' | 'br'> = ['tl', 'tr', 'bl', 'br'];
    const detected: Record<string, { x: number; y: number; width: number; height: number; score: number } | null> = {
      tl: null,
      tr: null,
      bl: null,
      br: null
    };

    for (const key of keys) {
      const roiBox = rois[key];
      const rx = Math.max(0, Math.min(vW - 10, Math.round(roiBox.x)));
      const ry = Math.max(0, Math.min(vH - 10, Math.round(roiBox.y)));
      const rw = Math.max(10, Math.min(vW - rx, Math.round(roiBox.width)));
      const rh = Math.max(10, Math.min(vH - ry, Math.round(roiBox.height)));
      const rect = new cv.Rect(rx, ry, rw, rh);
      let roiGray = gray.roi(rect);
      let roiBlurred = new cv.Mat();
      let roiThresh = new cv.Mat();
      let contours = new cv.MatVector();
      let hierarchy = new cv.Mat();

      try {
        cv.GaussianBlur(roiGray, roiBlurred, new cv.Size(5, 5), 0);
        const adaptiveBlock = Math.max(25, Math.floor(rw / 2) | 1);
        const threshMethods = [
          () => cv.threshold(roiBlurred, roiThresh, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU),
          () => cv.adaptiveThreshold(roiBlurred, roiThresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, adaptiveBlock, 5)
        ];

        let bestCand: { x: number; y: number; width: number; height: number; score: number } | null = null;
        
        // Expected square marker size for the 3.6mm fiducial square on the printed A4 sheet
        // In the viewfinder, the sheet width is roughly rw / 0.24; the corner square is ~1.7% of sheet width
        const expectedSquareSize = Math.max(12, Math.min(36, Math.round(rw * 0.09)));

        for (const applyThresh of threshMethods) {
          applyThresh();
          cv.findContours(roiThresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

          for (let i = 0; i < contours.size(); ++i) {
            const cnt = contours.get(i);
            const bRect = cv.boundingRect(cnt);
            const bw = bRect.width;
            const bh = bRect.height;
            const bArea = bw * bh;

            // 1. Strict Physical Dimension & Area Filtering
            // Reject tiny noise or oversized objects/icons (never allow 100px+ icons or banners)
            if (bw < 8 || bw > 46 || bh < 8 || bh > 46) {
              cnt.delete();
              continue;
            }
            if (bArea < 64 || bArea > 2100) {
              cnt.delete();
              continue;
            }

            // 2. Aspect Ratio: Must be an equilateral square
            const aspectRatio = bw / bh;
            if (aspectRatio < 0.72 || aspectRatio > 1.38) {
              cnt.delete();
              continue;
            }

            // 3. Solidity: Must be a solid filled shape (not hollow text, letters, or curved icon)
            const cArea = cv.contourArea(cnt);
            const solidity = bArea > 0 ? cArea / bArea : 0;
            if (solidity < 0.68) {
              cnt.delete();
              continue;
            }

            const M = cv.moments(cnt, false);
            const cx = (M && M.m00 !== 0) ? (M.m10 / M.m00) : (bRect.x + bw / 2);
            const cy = (M && M.m00 !== 0) ? (M.m01 / M.m00) : (bRect.y + bh / 2);

            // 4. Center Core Darkness: Solid black ink (never gray or paper)
            const sampleR = Math.max(2, Math.min(4, Math.round(Math.min(bw, bh) * 0.25)));
            const centerGray = calculateBubbleAverageGray(roiGray, cx, cy, sampleR);
            if (centerGray > 125) {
              cnt.delete();
              continue;
            }

            // 5. Surrounding White Paper Ring: Must sit on bright white paper!
            // This immediately eliminates dark icons, keys, table corners, and desk clutter.
            const rInner = Math.max(bw, bh) * 0.70;
            const rOuter = Math.max(bw, bh) * 1.35;
            const paperGray = calculateRingAverageGray(roiGray, cx, cy, rInner, rOuter);
            if (paperGray < 135) {
              cnt.delete();
              continue;
            }

            const contrast = paperGray - centerGray;
            if (contrast < 35) {
              cnt.delete();
              continue;
            }

            // 6. Optimal Fiducial Marker Scoring (Peaks on genuine 3.6mm corner square)
            const sizeDiff = Math.abs(bw - expectedSquareSize);
            const sizeScore = Math.exp(-(sizeDiff * sizeDiff) / (2 * 9 * 9));
            const squareScore = 1.0 - Math.abs(aspectRatio - 1.0);
            const solidScore = Math.min(1.0, solidity);
            const contrastScore = Math.min(1.0, contrast / 160);

            // Centering score relative to viewfinder box center
            const distFromBoxCenter = Math.hypot(cx - rw / 2, cy - rh / 2);
            const centerScore = Math.exp(-(distFromBoxCenter * distFromBoxCenter) / (2 * (rw * 0.38) * (rw * 0.38)));

            const score = sizeScore * 0.35 + squareScore * 0.25 + solidScore * 0.15 + contrastScore * 0.15 + centerScore * 0.10;

            if (!bestCand || score > bestCand.score) {
              bestCand = {
                x: rx + cx,
                y: ry + cy,
                width: bw,
                height: bh,
                score
              };
            }

            cnt.delete();
          }
        }

        if (bestCand) {
          detected[key] = bestCand;
        }
      } finally {
        roiGray.delete();
        roiBlurred.delete();
        roiThresh.delete();
        contours.delete();
        hierarchy.delete();
      }
    }

    let allFound = !!(detected.tl && detected.tr && detected.bl && detected.br);
    if (allFound) {
      const tl = detected.tl!;
      const tr = detected.tr!;
      const bl = detected.bl!;
      const br = detected.br!;

      // ── CHECK 1: Size Homogeneity Across the 4 Corners ──
      // Real printed corner fiducials are 4 identical squares of the same size.
      const candWidths = [tl.width, tr.width, bl.width, br.width];
      const minW = Math.min(...candWidths);
      const maxW = Math.max(...candWidths);
      if (minW <= 0 || maxW / minW > 1.85) {
        allFound = false;
      }

      // ── CHECK 2: Sheet Quadrilateral Geometry ──
      const widthTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
      const widthBottom = Math.hypot(br.x - bl.x, br.y - bl.y);
      const heightLeft = Math.hypot(bl.x - tl.x, bl.y - tl.y);
      const heightRight = Math.hypot(br.x - tr.x, br.y - tr.y);

      const avgW = (widthTop + widthBottom) / 2;
      const avgH = (heightLeft + heightRight) / 2;
      const sheetAspect = avgW > 0 ? avgH / avgW : 0;

      const layout = getDynamicOMRQuestionLayout(_numQuestions);
      const expectedAspect = (layout.bottomAnchorY - layout.topAnchorY) / (layout.gridRight - layout.gridLeft);

      const isA4Proportion = sheetAspect >= (expectedAspect - 0.20) && sheetAspect <= (expectedAspect + 0.20);
      const isAngleValid = validateQuadAngles(tl, tr, br, bl, 72, 108);

      const isWidthsEqual = Math.abs(widthTop - widthBottom) / avgW <= 0.14;
      const isHeightsEqual = Math.abs(heightLeft - heightRight) / avgH <= 0.14;

      const diag1 = Math.hypot(br.x - tl.x, br.y - tl.y);
      const diag2 = Math.hypot(bl.x - tr.x, bl.y - tr.y);
      const isDiagsEqual = Math.abs(diag1 - diag2) / Math.max(diag1, diag2) <= 0.14;

      const topEdgeSkew = Math.abs(tl.y - tr.y) / avgH;
      const botEdgeSkew = Math.abs(bl.y - br.y) / avgH;
      const leftEdgeSkew = Math.abs(tl.x - bl.x) / avgW;
      const rightEdgeSkew = Math.abs(tr.x - br.x) / avgW;
      const isStraight = topEdgeSkew <= 0.12 && botEdgeSkew <= 0.12 && leftEdgeSkew <= 0.12 && rightEdgeSkew <= 0.12;

      // ── CHECK 3: Sheet Interior Whiteness (Must enclose real paper, not dark desk/monitor) ──
      const sheetCenterX = Math.round((tl.x + tr.x + br.x + bl.x) / 4);
      const sheetCenterY = Math.round((tl.y + tr.y + br.y + bl.y) / 4);
      let isSheetInteriorValid = true;
      if (sheetCenterX >= 15 && sheetCenterX < vW - 15 && sheetCenterY >= 15 && sheetCenterY < vH - 15) {
        const centerGrayVal = calculateBubbleAverageGray(gray, sheetCenterX, sheetCenterY, 15);
        if (centerGrayVal < 130) {
          isSheetInteriorValid = false;
        }
      }

      if (!isA4Proportion || !isAngleValid || !isStraight || !isWidthsEqual || !isHeightsEqual || !isDiagsEqual || !isSheetInteriorValid) {
        allFound = false;
      }
    }

    const corners = allFound
      ? [
          { x: detected.tl!.x, y: detected.tl!.y },
          { x: detected.tr!.x, y: detected.tr!.y },
          { x: detected.br!.x, y: detected.br!.y },
          { x: detected.bl!.x, y: detected.bl!.y }
        ]
      : null;

    return {
      tl: detected.tl ? { x: detected.tl.x, y: detected.tl.y } : null,
      tr: detected.tr ? { x: detected.tr.x, y: detected.tr.y } : null,
      bl: detected.bl ? { x: detected.bl.x, y: detected.bl.y } : null,
      br: detected.br ? { x: detected.br.x, y: detected.br.y } : null,
      allFound,
      corners
    };
  } finally {
    src.delete();
    gray.delete();
  }
}

export function findOMRSheetCornersLive(
  video: HTMLVideoElement,
  _numQuestions: number = 100
): Array<{ x: number; y: number }> | null {
  const vW = video.videoWidth;
  const vH = video.videoHeight;
  if (vW === 0 || vH === 0) return null;

  const layout = getDynamicOMRQuestionLayout(_numQuestions);
  const expectedAspect = (layout.bottomAnchorY - layout.topAnchorY) / (layout.gridRight - layout.gridLeft);

  const frameW = Math.round(vW * 0.78);
  const frameH = Math.min(Math.round(vH * 0.78), Math.round(frameW * expectedAspect));
  const startX = Math.round((vW - frameW) / 2);
  const startY = Math.round((vH - frameH) / 2);
  const boxSize = Math.round(frameW * 0.18);

  const rois: ViewfinderROIs = {
    tl: { x: startX, y: startY, width: boxSize, height: boxSize },
    tr: { x: startX + frameW - boxSize, y: startY, width: boxSize, height: boxSize },
    bl: { x: startX, y: startY + frameH - boxSize, width: boxSize, height: boxSize },
    br: { x: startX + frameW - boxSize, y: startY + frameH - boxSize, width: boxSize, height: boxSize }
  };

  const res = findOMRSheetCornersInROI(video, rois, _numQuestions);
  return res?.corners || null;
}

export function validateQuadAngles(
  tl: { x: number; y: number },
  tr: { x: number; y: number },
  br: { x: number; y: number },
  bl: { x: number; y: number },
  minAngleDeg: number = 65,
  maxAngleDeg: number = 115
): boolean {
  const getAngle = (p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }): number => {
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.hypot(v1.x, v1.y);
    const mag2 = Math.hypot(v2.x, v2.y);
    if (mag1 === 0 || mag2 === 0) return 0;
    const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return (Math.acos(cosAngle) * 180) / Math.PI;
  };

  const aTL = getAngle(bl, tl, tr);
  const aTR = getAngle(tl, tr, br);
  const aBR = getAngle(tr, br, bl);
  const aBL = getAngle(br, bl, tl);

  return (
    aTL >= minAngleDeg && aTL <= maxAngleDeg &&
    aTR >= minAngleDeg && aTR <= maxAngleDeg &&
    aBR >= minAngleDeg && aBR <= maxAngleDeg &&
    aBL >= minAngleDeg && aBL <= maxAngleDeg
  );
}

export function extractQuestionBubbleSnippets(
  warpedCanvas: HTMLCanvasElement,
  numQuestions: number,
  sections: any[] = [],
  questionOffsets: Record<number, { dx: number; dy: number }> = {},
  _bestDy: number = 0
): Record<number, Record<string, string>> {
  const snippets: Record<number, Record<string, string>> = {};
  const qConf = getDynamicOMRQuestionLayout(numQuestions, 'auto', 'auto', sections);
  const optionChars = ['A', 'B', 'C', 'D', 'E'];
  const tileSize = 36; // Generous 36x36 window so bubble is never clipped
  const halfTile = tileSize / 2;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = tileSize;
  tempCanvas.height = tileSize;
  const tCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  if (!tCtx) return snippets;

  const cv = window.cv;
  let warpedGrayMat: any = null;
  if (cv) {
    try {
      const srcMat = cv.imread(warpedCanvas);
      warpedGrayMat = new cv.Mat();
      cv.cvtColor(srcMat, warpedGrayMat, cv.COLOR_RGBA2GRAY);
      srcMat.delete();
    } catch (e) {
      warpedGrayMat = null;
    }
  }

  for (let q = 1; q <= numQuestions; q++) {
    let colConf: any = null;
    for (const col of qConf.columns) {
      if (q >= col.qStart && q <= col.qEnd) {
        colConf = col;
        break;
      }
    }
    if (!colConf) continue;

    const sec = sections.find((s: any) => q >= s.qStart && q < s.qStart + s.qCount);
    const is5Option = sec && sec.questionType === '5 option';
    const numOptions = is5Option ? 5 : 4;

    const slots = getColumnSlots(colConf.qStart, colConf.qEnd, sections, numQuestions);
    const qSlot = slots.find((s: any) => s.type === 'question' && s.qNum === q);
    if (!qSlot) continue;
    const slotIndex = qSlot.slotIdx;

    const offset = questionOffsets[q] || { dx: 0, dy: 0 };
    const y = colConf.yStart + slotIndex * qConf.yStep + offset.dy;

    snippets[q] = {};
    for (let optIdx = 0; optIdx < numOptions; optIdx++) {
      const optChar = optionChars[optIdx];
      const approxX = (optIdx === 4 ? colConf.xOptions[3] + 25 : colConf.xOptions[optIdx]) + offset.dx;

      // Crop snippet perfectly centered on geometric grid coordinate
      const finalX = approxX;
      const finalY = y;

      tCtx.clearRect(0, 0, tileSize, tileSize);
      tCtx.drawImage(
        warpedCanvas,
        finalX - halfTile,
        finalY - halfTile,
        tileSize,
        tileSize,
        0,
        0,
        tileSize,
        tileSize
      );
      snippets[q][optChar] = tempCanvas.toDataURL('image/jpeg', 0.80);
    }
  }

  if (warpedGrayMat) {
    warpedGrayMat.delete();
  }

  return snippets;
}

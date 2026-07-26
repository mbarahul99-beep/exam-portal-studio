// Pure JavaScript HTML5 Canvas OMR Reader Engine
// Runs instantly on all mobile phones, iPhones, and tablets without requiring OpenCV.js or WebAssembly

import { OMR_CONFIG, type ScanResult } from './omrScanner';

export function scanOMRSheetPureJS(
  sourceImage: HTMLCanvasElement | HTMLImageElement,
  numQuestions: number,
  rollNoDigits: number = 10,
  examSetsCount: number = 1,
  sections: any[] = []
): ScanResult {
  const canvas = document.createElement('canvas');
  const w = sourceImage instanceof HTMLImageElement ? sourceImage.naturalWidth || sourceImage.width : sourceImage.width;
  const h = sourceImage instanceof HTMLImageElement ? sourceImage.naturalHeight || sourceImage.height : sourceImage.height;

  canvas.width = w || 1000;
  canvas.height = h || 1414;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  // Convert to grayscale helper
  const getGray = (x: number, y: number): number => {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || px >= canvas.width || py < 0 || py >= canvas.height) return 255;
    const idx = (py * canvas.width + px) * 4;
    return Math.round(data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
  };

  // Find 4 corner anchors (black squares near top-left, top-right, bottom-left, bottom-right)
  const findAnchorInRegion = (rxStart: number, rxEnd: number, ryStart: number, ryEnd: number) => {
    let minSum = Infinity;
    let bestX = (rxStart + rxEnd) / 2;
    let bestY = (ryStart + ryEnd) / 2;

    const step = 4;
    for (let y = ryStart; y < ryEnd; y += step) {
      for (let x = rxStart; x < rxEnd; x += step) {
        let sum = 0;
        let count = 0;
        for (let dy = -6; dy <= 6; dy += 2) {
          for (let dx = -6; dx <= 6; dx += 2) {
            sum += getGray(x + dx, y + dy);
            count++;
          }
        }
        const avg = sum / count;
        if (avg < minSum) {
          minSum = avg;
          bestX = x;
          bestY = y;
        }
      }
    }
    return { x: bestX, y: bestY };
  };

  const W = canvas.width;
  const H = canvas.height;

  const tl = findAnchorInRegion(0, W * 0.25, 0, H * 0.20);
  const tr = findAnchorInRegion(W * 0.75, W, 0, H * 0.20);
  const bl = findAnchorInRegion(0, W * 0.25, H * 0.80, H);
  const br = findAnchorInRegion(W * 0.75, W, H * 0.80, H);

  // Map normalized coordinates from target A4 template (1000x1414) to detected paper canvas
  const mapPoint = (tx: number, ty: number) => {
    const u = tx / 1000;
    const v = ty / 1414;

    const topX = tl.x + u * (tr.x - tl.x);
    const topY = tl.y + u * (tr.y - tl.y);
    const botX = bl.x + u * (br.x - bl.x);
    const botY = bl.y + u * (br.y - bl.y);

    const realX = topX + v * (botX - topX);
    const realY = topY + v * (botY - topY);

    return { x: realX, y: realY };
  };

  // Helper to measure bubble fill intensity
  const getBubbleFill = (tx: number, ty: number, radius: number = 7): number => {
    const pt = mapPoint(tx, ty);
    let darkCount = 0;
    let totalCount = 0;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          const val = getGray(pt.x + dx, pt.y + dy);
          if (val < 130) {
            darkCount++;
          }
          totalCount++;
        }
      }
    }
    return totalCount > 0 ? darkCount / totalCount : 0;
  };

  // 1. Read Student Roll Number
  let detectedStudentId = "";
  for (let col = 0; col < rollNoDigits; col++) {
    const cx = OMR_CONFIG.studentId.xStart + col * OMR_CONFIG.studentId.xStep;
    let maxFill = 0.35; // Threshold for marked bubble
    let bestDigit = -1;

    for (let digitRow = 0; digitRow < 10; digitRow++) {
      const cy = OMR_CONFIG.studentId.yStart + digitRow * OMR_CONFIG.studentId.yStep;
      const fill = getBubbleFill(cx, cy, OMR_CONFIG.studentId.bubbleRadius);

      if (fill > maxFill) {
        maxFill = fill;
        bestDigit = (digitRow === 9) ? 0 : digitRow + 1; // 1-9, then 0
      }
    }

    detectedStudentId += (bestDigit !== -1) ? bestDigit.toString() : "?";
  }

  // 2. Read Booklet Set Code (A, B, C, D)
  let bookletSet = "A";
  if (examSetsCount > 1) {
    const setNames = ["A", "B", "C", "D"];
    let maxSetFill = 0.35;
    for (let s = 0; s < Math.min(examSetsCount, 4); s++) {
      const sx = 580 + s * 25;
      const sy = 240;
      const fill = getBubbleFill(sx, sy, 7);
      if (fill > maxSetFill) {
        maxSetFill = fill;
        bookletSet = setNames[s];
      }
    }
  }

  // 3. Read Answers
  const answers: Record<number, string> = {};
  const options = ["A", "B", "C", "D"];

  const buildQuestionColumns = () => {
    if (sections && sections.length > 0) {
      let currentQIndex = 1;
      const cols: Array<{ qStart: number; qEnd: number; xLabel: number; xOptions: number[] }> = [];

      sections.forEach((sec: any) => {
        const qCount = sec.qCount || 0;
        let qProcessed = 0;

        while (qProcessed < qCount && currentQIndex <= numQuestions) {
          const colIndex = Math.floor((currentQIndex - 1) / 40);
          const qRemainingInCol = 40 - ((currentQIndex - 1) % 40);
          const chunk = Math.min(qCount - qProcessed, qRemainingInCol);

          const qStart = currentQIndex;
          const qEnd = currentQIndex + chunk - 1;

          const baseLabelX = 90 + colIndex * 170;
          cols.push({
            qStart,
            qEnd,
            xLabel: baseLabelX,
            xOptions: [baseLabelX + 30, baseLabelX + 55, baseLabelX + 80, baseLabelX + 105]
          });

          currentQIndex += chunk;
          qProcessed += chunk;
        }
      });

      return cols;
    }

    const defaultCols: Array<{ qStart: number; qEnd: number; xLabel: number; xOptions: number[] }> = [];
    const questionsPerCol = Math.min(40, Math.ceil(numQuestions / 5));

    for (let c = 0; c < 5; c++) {
      const qStart = c * questionsPerCol + 1;
      const qEnd = Math.min(numQuestions, (c + 1) * questionsPerCol);
      if (qStart <= numQuestions) {
        const baseLabelX = 90 + c * 170;
        defaultCols.push({
          qStart,
          qEnd,
          xLabel: baseLabelX,
          xOptions: [baseLabelX + 30, baseLabelX + 55, baseLabelX + 80, baseLabelX + 105]
        });
      }
    }

    return defaultCols;
  };

  const layoutCols = buildQuestionColumns();

  for (const col of layoutCols) {
    for (let q = col.qStart; q <= col.qEnd; q++) {
      const qInColIndex = (q - col.qStart) % 40;
      const sy = OMR_CONFIG.questions.yStart + qInColIndex * OMR_CONFIG.questions.yStep;

      let maxFill = 0.35;
      let pickedOpt = "";

      for (let optIdx = 0; optIdx < 4; optIdx++) {
        const sx = col.xOptions[optIdx];
        const fill = getBubbleFill(sx, sy, OMR_CONFIG.questions.bubbleRadius);

        if (fill > maxFill) {
          maxFill = fill;
          pickedOpt = options[optIdx];
        }
      }

      if (pickedOpt) {
        answers[q] = pickedOpt;
      }
    }
  }

  // Draw warped debug canvas
  const debugWarpedCanvas = document.createElement('canvas');
  debugWarpedCanvas.width = 1000;
  debugWarpedCanvas.height = 1414;
  const dCtx = debugWarpedCanvas.getContext('2d');
  if (dCtx) {
    dCtx.drawImage(canvas, 0, 0, 1000, 1414);
  }

  return {
    studentNum: detectedStudentId,
    answers,
    bookletSet,
    debugWarpedCanvas
  };
}

// Pure JavaScript HTML5 Canvas OMR Reader Engine
// Runs instantly on all mobile phones, iPhones, and tablets without requiring OpenCV.js or WebAssembly

import { OMR_CONFIG, type ScanResult } from './omrScanner';

export function scanOMRSheetPureJS(
  sourceImage: HTMLCanvasElement | HTMLImageElement,
  numQuestions: number,
  rollNoDigits: number = 10,
  _examSetsCount: number = 1,
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

  const W = canvas.width;
  const H = canvas.height;

  // Find 4 corner anchors (black square blocks near corners of the paper)
  const findAnchorInRegion = (rxStart: number, rxEnd: number, ryStart: number, ryEnd: number, defaultX: number, defaultY: number) => {
    let minSum = Infinity;
    let bestX = defaultX;
    let bestY = defaultY;
    let foundDarkBlock = false;

    const step = 4;
    for (let y = Math.floor(ryStart); y < Math.floor(ryEnd); y += step) {
      for (let x = Math.floor(rxStart); x < Math.floor(rxEnd); x += step) {
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
          if (avg < 145) {
            foundDarkBlock = true;
          }
        }
      }
    }

    if (!foundDarkBlock || minSum > 145) {
      return { x: defaultX, y: defaultY };
    }
    return { x: bestX, y: bestY };
  };

  // Expanded search quadrants to find black corner square anchors even when photo has wide margins
  const tl = findAnchorInRegion(0, W * 0.45, 0, H * 0.35, W * 0.05, H * 0.05);
  const tr = findAnchorInRegion(W * 0.55, W, 0, H * 0.35, W * 0.95, H * 0.05);
  const bl = findAnchorInRegion(0, W * 0.45, H * 0.65, H, W * 0.05, H * 0.95);
  const br = findAnchorInRegion(W * 0.55, W, H * 0.65, H, W * 0.95, H * 0.95);

  // Build clean, sharp 4-corner cropped canvas preview (crops out floor/extra background)
  const debugWarpedCanvas = document.createElement('canvas');
  debugWarpedCanvas.width = 1000;
  debugWarpedCanvas.height = 1414;
  const dCtx = debugWarpedCanvas.getContext('2d');
  if (dCtx) {
    const padX = Math.round(W * 0.03);
    const padY = Math.round(H * 0.03);
    const minX = Math.max(0, Math.min(tl.x, bl.x) - padX);
    const maxX = Math.min(canvas.width, Math.max(tr.x, br.x) + padX);
    const minY = Math.max(0, Math.min(tl.y, tr.y) - padY);
    const maxY = Math.min(canvas.height, Math.max(bl.y, br.y) + padY);
    const cropW = Math.max(10, maxX - minX);
    const cropH = Math.max(10, maxY - minY);

    dCtx.imageSmoothingEnabled = true;
    dCtx.imageSmoothingQuality = 'high';
    dCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, 1000, 1414);
  }

  // Map target A4 template coordinates (1000x1414) accurately relative to detected 4 anchor squares
  const mapPoint = (tx: number, ty: number) => {
    // Template anchors are at (30,30), (970,30), (30,1384), (970,1384)
    const u = (tx - 30) / 940;
    const v = (ty - 30) / 1354;

    const topX = tl.x + u * (tr.x - tl.x);
    const topY = tl.y + u * (tr.y - tl.y);
    const botX = bl.x + u * (br.x - bl.x);
    const botY = bl.y + u * (br.y - bl.y);

    const realX = topX + v * (botX - topX);
    const realY = topY + v * (botY - topY);

    return { x: realX, y: realY };
  };

  // Helper to measure bubble fill intensity at mapped point
  const getBubbleFill = (tx: number, ty: number, radius: number = 7): number => {
    const pt = mapPoint(tx, ty);
    let darkCount = 0;
    let totalCount = 0;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          const val = getGray(pt.x + dx, pt.y + dy);
          if (val < 135) {
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
  let bookletSet: string | undefined = undefined;
  const setNames = ["A", "B", "C", "D"];
  let maxSetFill = 0.42; // Require genuinely shaded bubble
  let bestSetIndex = -1;

  for (let s = 0; s < 4; s++) {
    const sx = 580 + s * 25;
    const sy = 240;
    const fill = getBubbleFill(sx, sy, 7);
    if (fill > maxSetFill) {
      maxSetFill = fill;
      bestSetIndex = s;
    }
  }

  if (bestSetIndex !== -1) {
    bookletSet = setNames[bestSetIndex];
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

  return {
    studentNum: detectedStudentId,
    answers,
    bookletSet,
    debugWarpedCanvas
  };
}

import React from 'react';
import { OMR_CONFIG } from '../utils/omrScanner';

interface OmrPrintSheetProps {
  examTitle: string;
  numQuestions: number;
}

export const OmrPrintSheet: React.FC<OmrPrintSheetProps> = ({ examTitle, numQuestions }) => {
  const options = ['A', 'B', 'C', 'D'];
  const totalQuestions = Math.min(numQuestions, 200);

  // Conversion: OMR coordinates (1000 x 1414) mapped to A4 millimeters (210 x 297)
  const toX = (x: number) => `${x * 0.21}mm`;
  const toY = (y: number) => `${y * 0.21}mm`;

  const rollCols = Array.from({ length: 10 });
  const bookletCols = Array.from({ length: 7 });
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

  return (
    <div className="omr-print-page">
      {/* 4 Corner Alignment Anchors */}
      <div className="omr-anchor anchor-tl" style={{ left: toX(OMR_CONFIG.anchors.tl.x), top: toY(OMR_CONFIG.anchors.tl.y) }} />
      <div className="omr-anchor anchor-tr" style={{ left: toX(OMR_CONFIG.anchors.tr.x), top: toY(OMR_CONFIG.anchors.tr.y) }} />
      <div className="omr-anchor anchor-bl" style={{ left: toX(OMR_CONFIG.anchors.bl.x), top: toY(OMR_CONFIG.anchors.bl.y) }} />
      <div className="omr-anchor anchor-br" style={{ left: toX(OMR_CONFIG.anchors.br.x), top: toY(OMR_CONFIG.anchors.br.y) }} />

      {/* Outer Border Frame */}
      <div className="sheet-border-frame" 
           style={{
             left: toX(70),
             top: toY(70),
             width: toX(860),
             height: toY(1300)
           }} 
      />

      {/* Header section (Shifted higher to 40 to prevent overlap with title cards) */}
      <div className="omr-header-section" style={{ top: toY(40) }}>
        <h1 className="omr-title">{examTitle.toUpperCase()}</h1>
        <div className="omr-subtitle">OMR ANSWER BUBBLE SHEET - {totalQuestions} QUESTIONS</div>
      </div>

      {/* Decorative Border Cards (Moved top down to 112 to clear the header) */}
      <div className="bg-border-card" 
           style={{
             left: toX(70),
             top: toY(112),
             width: toX(275),
             height: toY(283)
           }}
      >
        <div className="box-title">ROLL NO. / अनुक्रमांक</div>
      </div>

      <div className="bg-border-card" 
           style={{
             left: toX(345),
             top: toY(112),
             width: toX(200),
             height: toY(283)
           }}
      >
        <div className="box-title">TEST BOOKLET NO.</div>
      </div>

      <div className="bg-border-card" 
           style={{
             left: toX(545),
             top: toY(112),
             width: toX(385),
             height: toY(283)
           }}
      >
        <div className="box-title">BOOKLET CODE / पुस्तिका कोड</div>
      </div>

      {/* ROLL NO DIGIT HEADER BOXES */}
      {rollCols.map((_, colIdx) => {
        const x = OMR_CONFIG.studentId.xStart + colIdx * OMR_CONFIG.studentId.xStep;
        return (
          <div 
            key={`roll-h-${colIdx}`}
            className="digit-box-header"
            style={{
              left: toX(x),
              top: toY(OMR_CONFIG.studentId.yStart - 28)
            }}
          />
        );
      })}

      {/* ROLL NO BUBBLES */}
      {rollCols.map((_, colIdx) => {
        const x = OMR_CONFIG.studentId.xStart + colIdx * OMR_CONFIG.studentId.xStep;
        return digits.map((digitVal, rowIdx) => {
          const y = OMR_CONFIG.studentId.yStart + rowIdx * OMR_CONFIG.studentId.yStep;
          return (
            <div
              key={`roll-b-${colIdx}-${digitVal}`}
              className="omr-bubble id-bubble"
              style={{
                left: toX(x),
                top: toY(y)
              }}
            >
              {digitVal}
            </div>
          );
        });
      })}

      {/* TEST BOOKLET NO DIGIT HEADER BOXES */}
      {bookletCols.map((_, colIdx) => {
        const x = OMR_CONFIG.bookletNo.xStart + colIdx * OMR_CONFIG.bookletNo.xStep;
        return (
          <div 
            key={`bk-h-${colIdx}`}
            className="digit-box-header"
            style={{
              left: toX(x),
              top: toY(OMR_CONFIG.bookletNo.yStart - 28)
            }}
          />
        );
      })}

      {/* TEST BOOKLET NO BUBBLES */}
      {bookletCols.map((_, colIdx) => {
        const x = OMR_CONFIG.bookletNo.xStart + colIdx * OMR_CONFIG.bookletNo.xStep;
        return digits.map((digitVal, rowIdx) => {
          const y = OMR_CONFIG.bookletNo.yStart + rowIdx * OMR_CONFIG.bookletNo.yStep;
          return (
            <div
              key={`bk-b-${colIdx}-${digitVal}`}
              className="omr-bubble id-bubble"
              style={{
                left: toX(x),
                top: toY(y)
              }}
            >
              {digitVal}
            </div>
          );
        });
      })}

      {/* BOOKLET CODE OPTIONS */}
      {['A', 'B', 'C', 'D'].map((code, idx) => (
        <div
          key={`bk-code-${code}`}
          className="omr-bubble code-bubble"
          style={{
            left: toX(610 + idx * 45),
            top: toY(175)
          }}
        >
          {code}
        </div>
      ))}

      {/* CANDIDATE INFO FIELDS */}
      <div className="candidate-info-table" style={{ left: toX(575), top: toY(225), width: toX(335) }}>
        <div className="info-row">
          <span className="info-label">CANDIDATE'S NAME (IN CAPITAL LETTERS)</span>
          <div className="info-line" />
        </div>
        <div className="info-row">
          <span className="info-label">MOTHER'S NAME (IN CAPITAL LETTERS)</span>
          <div className="info-line" />
        </div>
        <div className="info-row">
          <span className="info-label">FATHER'S NAME (IN CAPITAL LETTERS)</span>
          <div className="info-line" />
        </div>
      </div>

      {/* QUESTIONS GRID SECTION - 200 Questions (5 Columns of 40 Rows) */}
      {OMR_CONFIG.questions.columns.map((col, colIdx) => {
        const qNumbers = Array.from(
          { length: Math.max(0, Math.min(col.qEnd, totalQuestions) - col.qStart + 1) },
          (_, i) => col.qStart + i
        );

        if (qNumbers.length === 0) return null;

        return (
          <React.Fragment key={`col-grid-${colIdx}`}>
            {/* Column Title Header */}
            <div 
              className="q-col-header"
              style={{
                top: toY(OMR_CONFIG.questions.yStart - 18)
              }}
            >
              <span className="q-hdr-label" style={{ left: toX(col.xLabel) }}>Q.No</span>
              <span className="q-hdr-opt" style={{ left: toX(col.xOptions[0]) }}>A</span>
              <span className="q-hdr-opt" style={{ left: toX(col.xOptions[1]) }}>B</span>
              <span className="q-hdr-opt" style={{ left: toX(col.xOptions[2]) }}>C</span>
              <span className="q-hdr-opt" style={{ left: toX(col.xOptions[3]) }}>D</span>
            </div>

            {/* Questions list */}
            {qNumbers.map((qNum) => {
              const qIndex = qNum - col.qStart;
              const y = OMR_CONFIG.questions.yStart + qIndex * OMR_CONFIG.questions.yStep;
              return (
                <React.Fragment key={`q-row-${qNum}`}>
                  {/* Number Label */}
                  <span 
                    className="omr-q-label"
                    style={{
                      left: toX(col.xLabel),
                      top: toY(y)
                    }}
                  >
                    {String(qNum).padStart(2, '0')}
                  </span>
                  
                  {/* Bubbles A, B, C, D (Sized slightly smaller to 3.6mm to fit vertical grid spacing) */}
                  {options.map((opt, optIdx) => {
                    const x = col.xOptions[optIdx];
                    return (
                      <div
                        key={`q-${qNum}-opt-${opt}`}
                        className="omr-bubble opt-bubble"
                        style={{
                          left: toX(x),
                          top: toY(y),
                          width: '3.6mm',
                          height: '3.6mm'
                        }}
                      >
                        {opt}
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        );
      })}

      {/* Footer boxes: Signatures & Thumb Impression */}
      <div className="sheet-footer-section" 
           style={{
             left: toX(70),
             bottom: '16mm',
             width: toX(860),
             height: '18mm'
           }}
      >
        <div className="footer-box">
          <div className="footer-box-label">CANDIDATE'S LEFT HAND THUMB IMPRESSION</div>
        </div>
        <div className="footer-box">
          <div className="footer-box-label">SIGNATURE OF CANDIDATE (WITH TIME)</div>
        </div>
        <div className="footer-box">
          <div className="footer-box-label">SIGNATURE OF INVIGILATOR (WITH TIME)</div>
        </div>
      </div>

      {/* Bottom disclaimer */}
      <div className="bottom-disclaimer" style={{ bottom: '11mm' }}>
        ★ DO NOT FOLD OR MUTILATE THIS DOCUMENT. NEET ORIGINAL ANSWER COPY - ROSE SCHEME ★
      </div>

      <style>{`
        .omr-print-page {
          width: 210mm;
          height: 297mm;
          background-color: #fff !important;
          color: #000 !important;
          position: relative;
          box-sizing: border-box;
          font-family: Arial, sans-serif;
          page-break-after: always;
          overflow: hidden;
          box-shadow: 0 0 20px rgba(0,0,0,0.15);
          margin: 20px auto;
          border-radius: 4px;
        }

        .sheet-border-frame {
          position: absolute;
          border: 1px solid #dc0045 !important;
          pointer-events: none;
          box-sizing: border-box;
        }

        .omr-anchor {
          width: 10mm;
          height: 10mm;
          background-color: #000 !important;
          position: absolute;
          transform: translate(-50%, -50%);
          border-radius: 1px;
          z-index: 10;
        }

        .omr-header-section {
          position: absolute;
          left: 15mm;
          right: 15mm;
          text-align: center;
        }

        .omr-title {
          font-size: 22px;
          font-weight: 900;
          color: #dc0045 !important;
          margin-bottom: 2px;
          letter-spacing: 0.5px;
        }

        .omr-subtitle {
          background-color: #dc0045 !important;
          color: #fff !important;
          display: inline-block;
          font-size: 11px;
          font-weight: 800;
          padding: 3px 20px;
          border-radius: 20px;
          letter-spacing: 0.5px;
        }

        /* Border Cards */
        .bg-border-card {
          position: absolute;
          border: 1.2px solid #dc0045 !important;
          border-radius: 6px;
          box-sizing: border-box;
          pointer-events: none;
        }

        .box-title {
          background-color: #dc0045 !important;
          color: #fff !important;
          font-size: 8.5px;
          font-weight: bold;
          text-align: center;
          padding: 4px;
          border-top-left-radius: 4px;
          border-top-right-radius: 4px;
          letter-spacing: 0.3px;
        }

        .digit-box-header {
          position: absolute;
          width: 5.5mm;
          height: 5.5mm;
          border: 0.3mm solid #dc0045 !important;
          transform: translate(-50%, -50%);
          background-color: #fff !important;
          z-index: 1;
        }

        .omr-bubble {
          position: absolute;
          width: 4.2mm;
          height: 4.2mm;
          transform: translate(-50%, -50%);
          border: 0.32mm solid #dc0045 !important;
          border-radius: 50%;
          background-color: transparent !important;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 7px;
          font-weight: bold;
          color: rgba(220, 0, 69, 0.22) !important;
          user-select: none;
          z-index: 2;
        }

        .code-bubble {
          width: 5.2mm;
          height: 5.2mm;
          font-size: 10px;
        }

        .candidate-info-table {
          position: absolute;
          display: flex;
          flex-direction: column;
          gap: 5mm;
        }

        .info-row {
          display: flex;
          flex-direction: column;
          gap: 0.5mm;
        }

        .info-label {
          font-size: 6px;
          font-weight: bold;
          color: #dc0045 !important;
          white-space: nowrap;
        }

        .info-line {
          border-bottom: 0.3mm solid #dc0045 !important;
          width: 100%;
          height: 2mm;
        }

        /* Questions Grid Styling */
        .q-col-header {
          position: absolute;
          width: 100%;
          height: 5mm;
          font-size: 7.5px;
          font-weight: bold;
          color: #dc0045 !important;
        }

        .q-hdr-label {
          position: absolute;
          transform: translate(-50%, -50%);
        }

        .q-hdr-opt {
          position: absolute;
          transform: translate(-50%, -50%);
          width: 4.2mm;
          text-align: center;
        }

        .omr-q-label {
          position: absolute;
          transform: translate(-50%, -50%);
          font-size: 7.5px;
          font-weight: bold;
          color: #dc0045 !important;
          font-family: monospace;
          z-index: 2;
        }

        /* Signatures footer box positioning */
        .sheet-footer-section {
          position: absolute;
          display: grid;
          grid-template-columns: 1fr 1.3fr 1.3fr;
          gap: 6mm;
        }

        .footer-box {
          border: 1px solid #dc0045 !important;
          border-radius: 4px;
          position: relative;
          box-sizing: border-box;
          background-color: #fff !important;
        }

        .footer-box-label {
          position: absolute;
          bottom: 1px;
          left: 0;
          right: 0;
          text-align: center;
          font-size: 5.5px;
          font-weight: bold;
          color: #dc0045 !important;
          padding: 2px;
          border-top: 0.15mm dashed rgba(220, 0, 69, 0.3) !important;
        }

        .bottom-disclaimer {
          position: absolute;
          left: 15mm;
          right: 15mm;
          text-align: center;
          font-size: 7.5px;
          font-weight: 800;
          color: #dc0045 !important;
          letter-spacing: 0.3px;
        }

        @media print {
          @page {
            size: A4;
            margin: 0 !important;
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }
          .omr-print-page {
            box-shadow: none !important;
            margin: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            position: relative !important;
          }
        }
      `}</style>
    </div>
  );
};

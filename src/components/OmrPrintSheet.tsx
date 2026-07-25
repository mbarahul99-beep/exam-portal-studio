import React from 'react';
import { OMR_CONFIG } from '../utils/omrScanner';

interface OmrPrintSheetProps {
  examTitle: string;
  numQuestions: number;
  exam?: any;
}

export const OmrPrintSheet: React.FC<OmrPrintSheetProps> = ({ examTitle, numQuestions, exam }) => {
  const totalQuestions = Math.min(numQuestions, 200);

  // Conversion: OMR coordinates (1000 x 1414) mapped to A4 millimeters (210 x 297)
  const toX = (x: number) => `${x * 0.21}mm`;
  const toY = (y: number) => `${y * 0.21}mm`;

  const rollNoDigits = exam?.rollNoDigits || 10;
  const examSetsCount = exam?.examSetsCount || 4;
  const rollNoWidth = 275 - (10 - rollNoDigits) * 25;

  const rollCols = Array.from({ length: rollNoDigits });
  const bookletCols = Array.from({ length: 7 });
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

  const getQuestionOptions = (qNum: number): string[] => {
    if (!exam || !exam.sections) return ['A', 'B', 'C', 'D'];
    const sec = exam.sections.find((s: any) => qNum >= s.qStart && qNum < s.qStart + s.qCount);
    return sec && sec.questionType === '5 option' ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
  };

  const getQuestionLabel = (qNum: number): string => {
    if (!exam || !exam.sections || exam.sections.length === 0) {
      return String(qNum).padStart(2, '0');
    }
    const sec = exam.sections.find((s: any) => qNum >= s.qStart && qNum < s.qStart + s.qCount);
    if (!sec) return String(qNum).padStart(2, '0');
    const subCode = sec.subjectName.substring(0, 3).toUpperCase();
    return `${String(qNum).padStart(2, '0')} ${subCode}`;
  };

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

      {/* Header section with APEX INSTITUTE, JIND */}
      <div className="omr-header-section" style={{ top: toY(65) }}>
        <h1 className="omr-institute-title">APEX INSTITUTE, JIND</h1>
        <div className="omr-exam-title">{examTitle.toUpperCase()}</div>
        <div className="omr-subtitle">OMR ANSWER SHEET - {totalQuestions} QUESTIONS</div>
      </div>

      {/* Decorative Border Cards (Moved top down to 150 to clear the header) */}
      <div className="bg-border-card" 
           style={{
             left: toX(70),
             top: toY(150),
             width: toX(rollNoWidth),
             height: toY(260)
           }}
      >
        <div className="box-title">ROLL NO. / अनुक्रमांक</div>
      </div>

      <div className="bg-border-card" 
           style={{
             left: toX(70 + rollNoWidth),
             top: toY(150),
             width: toX(200),
             height: toY(260)
           }}
      >
        <div className="box-title">TEST BOOKLET NO.</div>
      </div>

      <div className="bg-border-card" 
           style={{
             left: toX(70 + rollNoWidth + 200),
             top: toY(150),
             width: toX(660 - rollNoWidth),
             height: toY(260)
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
              top: toY(OMR_CONFIG.studentId.yStart - 30)
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
        const bookletShift = rollNoWidth - 275;
        const x = OMR_CONFIG.bookletNo.xStart + colIdx * OMR_CONFIG.bookletNo.xStep + bookletShift;
        return (
          <div 
            key={`bk-h-${colIdx}`}
            className="digit-box-header"
            style={{
              left: toX(x),
              top: toY(OMR_CONFIG.bookletNo.yStart - 30)
            }}
          />
        );
      })}

      {/* TEST BOOKLET NO BUBBLES */}
      {bookletCols.map((_, colIdx) => {
        const bookletShift = rollNoWidth - 275;
        const x = OMR_CONFIG.bookletNo.xStart + colIdx * OMR_CONFIG.bookletNo.xStep + bookletShift;
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
      {Array.from({ length: examSetsCount }).map((_, idx) => {
        const bookletShift = rollNoWidth - 275;
        const code = String.fromCharCode(65 + idx);
        return (
          <div
            key={`bk-code-${code}`}
            className="omr-bubble code-bubble"
            style={{
              left: toX(610 + idx * 45 + bookletShift),
              top: toY(OMR_CONFIG.studentId.yStart)
            }}
          >
            {code}
          </div>
        );
      })}

      {/* CANDIDATE INFO FIELDS */}
      {(() => {
        const bookletShift = rollNoWidth - 275;
        return (
          <div className="candidate-info-table" style={{ left: toX(575 + bookletShift), top: toY(250), width: toX(335 - bookletShift) }}>
            <div className="info-row">
              <span className="info-label">CANDIDATE'S NAME (IN CAPITAL LETTERS)</span>
              <div className="info-line" />
            </div>
            <div className="info-row">
              <span className="info-label">FATHER'S NAME (IN CAPITAL LETTERS)</span>
              <div className="info-line" />
            </div>
            <div className="info-row">
              <span className="info-label">EXAM NAME</span>
              <div className="info-line" style={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase', color: '#000', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {examTitle}
              </div>
            </div>
          </div>
        );
      })()}

      {/* QUESTIONS GRID SECTION - 200 Questions (5 Columns of 40 Rows) */}
      {OMR_CONFIG.questions.columns.map((col, colIdx) => {
        const qNumbers = Array.from(
          { length: Math.max(0, Math.min(col.qEnd, totalQuestions) - col.qStart + 1) },
          (_, i) => col.qStart + i
        );

        if (qNumbers.length === 0) return null;

        // Check if this column has any 5 option questions
        const colHas5Option = qNumbers.some(qNum => {
          const sec = exam?.sections?.find((s: any) => qNum >= s.qStart && qNum < s.qStart + s.qCount);
          return sec && sec.questionType === '5 option';
        });

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
              {colHas5Option && (
                <span className="q-hdr-opt" style={{ left: toX(col.xOptions[3] + 25) }}>E</span>
              )}
            </div>

            {/* Questions list */}
            {qNumbers.map((qNum) => {
              const qIndex = qNum - col.qStart;
              const y = OMR_CONFIG.questions.yStart + qIndex * OMR_CONFIG.questions.yStep;
              const qOptions = getQuestionOptions(qNum);
              return (
                <React.Fragment key={`q-row-${qNum}`}>
                  {/* Number Label */}
                  <span 
                    className="omr-q-label"
                    style={{
                      left: toX(col.xLabel),
                      top: toY(y),
                      fontSize: '5.5px'
                    }}
                  >
                    {getQuestionLabel(qNum)}
                  </span>
                  
                  {/* Bubbles A, B, C, D, E (Sized slightly smaller to 3.6mm to fit vertical grid spacing) */}
                  {qOptions.map((opt, optIdx) => {
                    const x = optIdx === 4 ? col.xOptions[3] + 25 : col.xOptions[optIdx];
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

      {/* Footer boxes: Only Two Signature Boxes (Student & Invigilator) */}
      <div className="sheet-footer-section" 
           style={{
             left: toX(70),
             bottom: '16mm',
             width: toX(860),
             height: '18mm',
             display: 'grid',
             gridTemplateColumns: '1fr 1fr',
             gap: '20px'
           }}
      >
        <div className="footer-box">
          <div className="footer-box-label">STUDENT'S SIGNATURE</div>
        </div>
        <div className="footer-box">
          <div className="footer-box-label">INVIGILATOR'S SIGNATURE</div>
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

        .omr-institute-title {
          font-size: 20px;
          font-weight: 900;
          color: #dc0045 !important;
          margin: 0 0 2px 0 !important;
          line-height: 1 !important;
          letter-spacing: 0.8px;
        }

        .omr-exam-title {
          font-size: 13px;
          font-weight: 800;
          color: #0f172a !important;
          margin: 0 0 4px 0 !important;
          line-height: 1.1 !important;
          letter-spacing: 0.3px;
        }

        .omr-subtitle {
          background-color: #dc0045 !important;
          color: #fff !important;
          display: inline-block;
          font-size: 9.5px;
          font-weight: 800;
          padding: 1.5px 16px;
          border-radius: 12px;
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

        .id-bubble {
          width: 3.6mm;
          height: 3.6mm;
          font-size: 6px;
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

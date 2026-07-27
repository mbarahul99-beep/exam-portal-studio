import React, { useState } from 'react';
import { OMR_CONFIG, getDynamicOMRQuestionLayout } from '../utils/omrScanner';
import { Printer, Sliders, Columns, Maximize2 } from 'lucide-react';

interface OmrPrintSheetProps {
  examTitle: string;
  numQuestions: number;
  exam?: any;
}

export const OmrPrintSheet: React.FC<OmrPrintSheetProps> = ({ examTitle, numQuestions, exam }) => {
  const totalQuestions = Math.min(numQuestions, 200);

  // Customization controls
  const [customCols, setCustomCols] = useState<number | undefined>(undefined);
  const [density, setDensity] = useState<'auto' | 'compact' | 'normal' | 'spacious'>('auto');
  const [bubbleScale, setBubbleScale] = useState<'normal' | 'large' | 'compact'>('normal');
  const [instituteName, setInstituteName] = useState('APEX INSTITUTE, JIND');

  // Calculate dynamic question layout to fill 100% of vertical page height without leaving blank space
  const layout = getDynamicOMRQuestionLayout(totalQuestions, customCols, density);

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
    if (
      !sec || 
      !sec.subjectName || 
      sec.subjectName.toUpperCase().includes('SUB') || 
      sec.subjectName.toLowerCase() === 'subject' || 
      sec.subjectName.toLowerCase() === 'general'
    ) {
      return String(qNum).padStart(2, '0');
    }
    const subCode = sec.subjectName.substring(0, 3).toUpperCase();
    return `${String(qNum).padStart(2, '0')} ${subCode}`;
  };

  // Determine bubble size string based on scale selection
  const getBubbleSize = () => {
    if (bubbleScale === 'large') return '4.2mm';
    if (bubbleScale === 'compact') return '3.2mm';
    return layout.yStep < 18 ? '3.5mm' : '3.8mm';
  };

  return (
    <div className="omr-print-wrapper">
      
      {/* INTERACTIVE PRINT & LAYOUT CONTROLLER (HIDDEN ON PRINT) */}
      <div className="no-print omr-print-toolbar" style={{
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '12px',
        padding: '14px 20px',
        margin: '0 auto 20px auto',
        maxWidth: '210mm',
        boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={20} color="#2563eb" />
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
              Full Page OMR Layout Controls ({totalQuestions} Questions)
            </h4>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(37,99,235,0.3)'
            }}
          >
            <Printer size={16} /> Print / Save PDF
          </button>
        </div>

        {/* Controls Row */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.85rem' }}>
          
          {/* Columns Selection */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Columns size={15} color="#64748b" />
            <span style={{ fontWeight: 600, color: '#475569' }}>Columns:</span>
            <select 
              value={customCols || ''} 
              onChange={(e) => setCustomCols(e.target.value ? Number(e.target.value) : undefined)}
              style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 600 }}
            >
              <option value="">Auto ({layout.numCols} Cols)</option>
              <option value="2">2 Columns</option>
              <option value="3">3 Columns</option>
              <option value="4">4 Columns</option>
              <option value="5">5 Columns</option>
            </select>
          </div>

          {/* Height Fill / Density Selection */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Maximize2 size={15} color="#64748b" />
            <span style={{ fontWeight: 600, color: '#475569' }}>Full Page Fill:</span>
            <select 
              value={density} 
              onChange={(e) => setDensity(e.target.value as any)}
              style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 600 }}
            >
              <option value="auto">⚡ Auto-Fit Full Page (100% Height)</option>
              <option value="spacious">Spacious Spacing</option>
              <option value="normal">Normal</option>
              <option value="compact">Compact</option>
            </select>
          </div>

          {/* Bubble Size */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 600, color: '#475569' }}>Bubble Size:</span>
            <select 
              value={bubbleScale} 
              onChange={(e) => setBubbleScale(e.target.value as any)}
              style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 600 }}
            >
              <option value="normal">Normal</option>
              <option value="large">Large</option>
              <option value="compact">Compact</option>
            </select>
          </div>

          {/* Institute Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '220px' }}>
            <span style={{ fontWeight: 600, color: '#475569' }}>Header:</span>
            <input 
              type="text"
              value={instituteName}
              onChange={(e) => setInstituteName(e.target.value)}
              style={{ flex: 1, padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
            />
          </div>

        </div>
      </div>

      {/* PRINTABLE A4 PAGE CONTAINER */}
      <div className="omr-print-page">
        {/* 4 Corner Alignment Anchors - Positioned at 11.55mm / 198.45mm to guarantee zero left/right clipping */}
        <div className="omr-anchor anchor-tl" style={{ left: toX(55), top: toY(45) }} />
        <div className="omr-anchor anchor-tr" style={{ left: toX(945), top: toY(45) }} />
        <div className="omr-anchor anchor-bl" style={{ left: toX(55), top: toY(1365) }} />
        <div className="omr-anchor anchor-br" style={{ left: toX(945), top: toY(1365) }} />

        {/* Outer Border Frame */}
        <div className="sheet-border-frame" 
             style={{
               left: toX(70),
               top: toY(70),
               width: toX(860),
               height: toY(1275)
             }} 
        />

        {/* Institute Name */}
        <div style={{ position: 'absolute', top: toY(28), left: 0, right: 0, textAlign: 'center', zIndex: 12 }}>
          <h1 className="omr-institute-title">{instituteName.toUpperCase()}</h1>
        </div>

        {/* Header section inside the margin frame */}
        <div className="omr-header-section" style={{ top: toY(76) }}>
          <div className="omr-exam-title">{examTitle.toUpperCase()}</div>
          <div className="omr-subtitle">OMR ANSWER SHEET - {totalQuestions} QUESTIONS</div>
        </div>

        {/* Decorative Border Cards */}
        <div className="bg-border-card" 
             style={{
               left: toX(70),
               top: toY(146),
               width: toX(rollNoWidth),
               height: toY(260)
             }}
        >
          <div className="box-title">ROLL NO. / अनुक्रमांक</div>
        </div>

        <div className="bg-border-card" 
             style={{
               left: toX(70 + rollNoWidth),
               top: toY(146),
               width: toX(200),
               height: toY(260)
             }}
        >
          <div className="box-title">TEST BOOKLET NO.</div>
        </div>

        <div className="bg-border-card" 
             style={{
               left: toX(70 + rollNoWidth + 200),
               top: toY(146),
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
            <div className="candidate-info-table" style={{ left: toX(575 + bookletShift), top: toY(246), width: toX(335 - bookletShift) }}>
              <div className="info-row">
                <span className="info-label">CANDIDATE'S NAME (IN CAPITAL LETTERS)</span>
                <div className="info-line" />
              </div>
              <div className="info-row">
                <span className="info-label">FATHER'S NAME (IN CAPITAL LETTERS)</span>
                <div className="info-line" />
              </div>
            </div>
          );
        })()}

        {/* DYNAMIC FULL-PAGE QUESTIONS GRID SECTION */}
        {layout.columns.map((col, colIdx) => {
          const qNumbers = Array.from(
            { length: Math.max(0, Math.min(col.qEnd, totalQuestions) - col.qStart + 1) },
            (_, i) => col.qStart + i
          );

          if (qNumbers.length === 0) return null;

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
                  top: toY(layout.yStart - 18)
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
                const y = layout.yStart + qIndex * layout.yStep;
                const qOptions = getQuestionOptions(qNum);
                return (
                  <React.Fragment key={`q-row-${qNum}`}>
                    {/* Number Label */}
                    <span 
                      className="omr-q-label"
                      style={{
                        left: toX(col.xLabel),
                        top: toY(y),
                        fontSize: layout.yStep < 18 ? '5px' : '5.5px'
                      }}
                    >
                      {getQuestionLabel(qNum)}
                    </span>
                    
                    {/* Bubbles */}
                    {qOptions.map((opt, optIdx) => {
                      const x = optIdx === 4 ? col.xOptions[3] + 25 : col.xOptions[optIdx];
                      return (
                        <div
                          key={`q-${qNum}-opt-${opt}`}
                          className="omr-bubble opt-bubble"
                          style={{
                            left: toX(x),
                            top: toY(y),
                            width: getBubbleSize(),
                            height: getBubbleSize()
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

        {/* Footer boxes: Compact Student & Invigilator Signatures (Height 10mm) */}
        <div className="sheet-footer-section" 
             style={{
               left: toX(70),
               bottom: '10mm',
               width: toX(860),
               height: '10mm',
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
        <div className="bottom-disclaimer" style={{ bottom: '4.5mm' }}>
          ★ DO NOT FOLD OR MUTILATE THIS DOCUMENT. ORIGINAL ANSWER SHEET ★
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
            margin: 0 auto;
            border-radius: 4px;
          }

          .sheet-border-frame {
            position: absolute;
            border: 1px solid #dc0045 !important;
            pointer-events: none;
            box-sizing: border-box;
          }

          .omr-anchor {
            width: 8.5mm;
            height: 8.5mm;
            background-color: #000 !important;
            position: absolute;
            transform: translate(-50%, -50%);
            border-radius: 0px;
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
            font-size: 7.5px;
            font-weight: bold;
            text-align: center;
            padding: 3px;
            border-top-left-radius: 4px;
            border-top-right-radius: 4px;
            letter-spacing: 0.2px;
            white-space: nowrap;
            overflow: hidden;
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
            gap: 1.5mm;
          }

          .info-label {
            font-size: 6.5px;
            font-weight: bold;
            color: #dc0045 !important;
            letter-spacing: 0.3px;
          }

          .info-line {
            border-bottom: 0.8px dashed #dc0045 !important;
            height: 1px;
          }

          .q-col-header {
            position: absolute;
            display: flex;
            align-items: center;
          }

          .q-hdr-label {
            position: absolute;
            transform: translate(-50%, -50%);
            font-size: 6.5px;
            font-weight: 900;
            color: #dc0045 !important;
          }

          .q-hdr-opt {
            position: absolute;
            transform: translate(-50%, -50%);
            font-size: 6.5px;
            font-weight: 900;
            color: #dc0045 !important;
          }

          .omr-q-label {
            position: absolute;
            transform: translate(-50%, -50%);
            font-weight: 800;
            color: #0f172a !important;
            white-space: nowrap;
          }

          .sheet-footer-section {
            position: absolute;
            box-sizing: border-box;
          }

          .footer-box {
            border: 1.2px solid #dc0045 !important;
            border-radius: 4px;
            position: relative;
            background-color: #fff !important;
          }

          .footer-box-label {
            position: absolute;
            bottom: 1.5mm;
            left: 0;
            right: 0;
            text-align: center;
            font-size: 6.5px;
            font-weight: bold;
            color: #dc0045 !important;
            letter-spacing: 0.4px;
          }

          .bottom-disclaimer {
            position: absolute;
            left: 0;
            right: 0;
            text-align: center;
            font-size: 6px;
            font-weight: bold;
            color: #dc0045 !important;
            letter-spacing: 0.5px;
          }

          @media print {
            @page {
              size: A4 portrait;
              margin: 4mm 2mm;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              height: 100% !important;
              overflow: hidden !important;
            }
            .no-print {
              display: none !important;
            }
            .omr-print-wrapper {
              padding: 0 !important;
              margin: 0 !important;
            }
            .omr-print-page {
              margin: 0 auto !important;
              box-shadow: none !important;
              border: none !important;
              height: 272mm !important;
              transform: scale(0.95);
              transform-origin: top center;
              page-break-before: avoid !important;
              page-break-after: avoid !important;
              page-break-inside: avoid !important;
            }
          }
        `}</style>
      </div>

    </div>
  );
};

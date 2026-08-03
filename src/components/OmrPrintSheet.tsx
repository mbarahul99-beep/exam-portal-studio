import React, { useState, useEffect } from 'react';
import { OMR_CONFIG, getDynamicOMRQuestionLayout, getColumnSlots } from '../utils/omrScanner';
import { DEFAULT_OMR_SETTINGS, type OmrCustomSettings } from './OmrSettingsView';
import { Printer, Sliders, Columns, Maximize2 } from 'lucide-react';
import { db } from '../db';

interface OmrPrintSheetProps {
  examTitle: string;
  numQuestions: number;
  exam?: any;
}

export const OmrPrintSheet: React.FC<OmrPrintSheetProps> = ({ examTitle, numQuestions, exam }) => {
  const totalQuestions = Math.min(numQuestions, 200);

  // Customization controls & settings state
  const [customCols, setCustomCols] = useState<number | undefined>(undefined);
  const [density, setDensity] = useState<'auto' | 'compact' | 'normal' | 'spacious'>('auto');
  const [bubbleScale, setBubbleScale] = useState<'normal' | 'large' | 'compact'>('normal');
  const [omrConfig, setOmrConfig] = useState<OmrCustomSettings>(DEFAULT_OMR_SETTINGS);

  // Load custom OMR settings from storage
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storedJson = localStorage.getItem('omr_custom_settings');
        if (storedJson) {
          setOmrConfig({ ...DEFAULT_OMR_SETTINGS, ...JSON.parse(storedJson) });
          return;
        }

        const record = await db.settings.where('key').equals('omr_custom_settings').first();
        if (record && record.value) {
          setOmrConfig({ ...DEFAULT_OMR_SETTINGS, ...JSON.parse(record.value) });
        }
      } catch (e) {
        console.warn("Failed loading OMR custom settings in print view:", e);
      }
    };
    loadSettings();
  }, []);

  // Calculate dynamic question layout to fit cleanly between y = 460 and y = 1220
  const layout = getDynamicOMRQuestionLayout(totalQuestions, customCols, density, exam?.sections);

  // Conversion: OMR coordinates (1000 x 1414) mapped to A4 millimeters (210 x 297)
  const toX = (x: number) => `${x * 0.21}mm`;
  const toY = (y: number) => `${y * 0.21}mm`;

  const rollNoDigits = Math.min(3, exam?.rollNoDigits || 3);
  const rollNoWidth = rollNoDigits * OMR_CONFIG.studentId.xStep + 30;

  const rollCols = Array.from({ length: rollNoDigits });
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

  const getQuestionOptions = (qNum: number): string[] => {
    if (!exam || !exam.sections) return ['A', 'B', 'C', 'D'];
    const sec = exam.sections.find((s: any) => qNum >= s.qStart && qNum < s.qStart + s.qCount);
    return sec && sec.questionType === '5 option' ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
  };

  const getQuestionLabel = (qNum: number): string => {
    return String(qNum).padStart(2, '0');
  };

  // Determine bubble size string based on scale selection
  const getBubbleSize = () => {
    if (bubbleScale === 'large') return '4.2mm';
    if (bubbleScale === 'compact') return '3.0mm';
    return layout.yStep <= 20 ? '3.4mm' : '3.6mm';
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

          {/* Institute Title Header Live Customizer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '220px' }}>
            <span style={{ fontWeight: 600, color: '#475569' }}>Header:</span>
            <input 
              type="text"
              value={omrConfig.instituteName}
              onChange={(e) => setOmrConfig(prev => ({ ...prev, instituteName: e.target.value }))}
              style={{ flex: 1, padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
            />
          </div>

        </div>
      </div>

      {/* PRINTABLE A4 PAGE CONTAINER */}
      <div className="omr-print-page">
        {/* 4 Corner Alignment Anchors (Matching exact target coordinates: x: 30, 970; y: 30, 1384) */}
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

        {/* Institute Name (Text) and Icon Logo Side-by-Side */}
        <div style={{ position: 'absolute', top: toY(20), left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', zIndex: 12 }}>
          <img 
            src="/logo.png" 
            alt="APEX Logo" 
            style={{ 
              height: toY((omrConfig.omrLogoHeight || 42) * 0.85),
              width: 'auto',
              objectFit: 'contain'
            }} 
          />
          <span style={{
            fontSize: `${omrConfig.omrInstitutionFontSize || 18}px`,
            fontWeight: 900,
            color: '#dc0045',
            fontFamily: "'Titan One', sans-serif",
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            {omrConfig.instituteName || 'INSTITUTE APEX'}
          </span>
        </div>

        {/* Header section inside the margin frame */}
        <div className="omr-header-section" style={{ top: toY(62), display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 11 }}>
          <div className="omr-subtitle" style={{ fontSize: `${omrConfig.headerSubtitleFontSize || 8.5}px`, padding: '1px 12px', marginBottom: '1.5mm' }}>
            INSTITUTE OF NEET & IIT-JEE COACHING
          </div>
          <div className="omr-exam-title" style={{ fontSize: `${omrConfig.headerTitleFontSize || 11}px`, margin: 0, fontWeight: 900, color: '#0f172a' }}>
            CLASS: {exam?.className?.toUpperCase() || 'NEET'} &nbsp;|&nbsp; EXAM: {examTitle.toUpperCase()}
          </div>

          {/* Candidate Name & Father's Name side-by-side in a single row */}
          <div style={{
            display: 'flex',
            width: '100%',
            justifyContent: 'space-between',
            gap: '12mm',
            padding: '0 8mm',
            boxSizing: 'border-box',
            marginTop: '3.5mm'
          }}>
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: '2mm' }}>
              <span style={{ fontSize: `${omrConfig.headerCandidateFontSize || 7.5}px`, fontWeight: 'bold', color: '#dc0045', whiteSpace: 'nowrap' }}>CANDIDATE NAME:</span>
              <div style={{ flex: 1, borderBottom: '0.8px dashed #dc0045', height: '11px' }} />
            </div>
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: '2mm' }}>
              <span style={{ fontSize: `${omrConfig.headerCandidateFontSize || 7.5}px`, fontWeight: 'bold', color: '#dc0045', whiteSpace: 'nowrap' }}>FATHER'S NAME:</span>
              <div style={{ flex: 1, borderBottom: '0.8px dashed #dc0045', height: '11px' }} />
            </div>
          </div>
        </div>

        {/* Decorative Border Cards (Custom Editable Box Titles) */}
        <div className="bg-border-card" 
             style={{
               left: toX(70),
               top: toY(150),
               width: toX(rollNoWidth),
               height: toY(305)
             }}
        >
          <div className="box-title">{omrConfig.rollNoBoxTitle}</div>
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
                top: toY(OMR_CONFIG.studentId.yStart - 32)
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

        {/* BOOKLET CODE CARD (BOOK NUMBER) */}
        <div className="bg-border-card" 
             style={{
               left: toX(228),
               top: toY(150),
               width: toX(174),
               height: toY(305)
             }}
        >
          <div className="box-title">{omrConfig.bookletCodeBoxTitle || 'BOOKLET CODE'}</div>
        </div>

        {/* BOOKLET CODE OPTIONS */}
        {Array.from({ length: 4 }).map((_, idx) => {
          const code = String.fromCharCode(65 + idx);
          return (
            <div
              key={`bk-code-${code}`}
              className="omr-bubble code-bubble"
              style={{
                left: toX(261 + idx * 36),
                top: toY(206),
                width: '4.8mm',
                height: '4.8mm',
                fontSize: '8px',
                fontWeight: 800
              }}
            >
              {code}
            </div>
          );
        })}

        {/* DYNAMIC QUESTIONS GRID SECTION */}
        {layout.columns.map((col, colIdx) => {
          const qNumbers = Array.from(
            { length: Math.max(0, Math.min(col.qEnd, totalQuestions) - col.qStart + 1) },
            (_, i) => col.qStart + i
          );

          if (qNumbers.length === 0) return null;

          const slots = getColumnSlots(col.qStart, col.qEnd, exam?.sections, totalQuestions);

          return (
            <React.Fragment key={`col-grid-${colIdx}`}>
              {slots.map((item) => {
                const y = col.yStart + item.slotIdx * layout.yStep;

                if (item.type === 'subject-header') {
                  return (
                    <div
                      key={`subj-slot-${colIdx}-${item.slotIdx}`}
                      style={{
                        position: 'absolute',
                        left: toX(col.xLabel),
                        width: toX(col.xOptions[3] + 24 - col.xLabel),
                        top: toY(y),
                        transform: 'translate(0, -50%)',
                        display: 'flex',
                        alignItems: 'center',
                        zIndex: 10
                      }}
                    >
                      <span style={{
                        fontSize: '9.8px',
                        fontWeight: 900,
                        color: '#dc0045',
                        textTransform: 'uppercase',
                        letterSpacing: '0.6px',
                        fontFamily: "'Outfit', sans-serif",
                        whiteSpace: 'nowrap'
                      }}>
                        {item.subjectName}
                      </span>
                    </div>
                  );
                }

                if (item.type === 'option-header') {
                  const qNumForOptions = item.nextQNum;
                  if (qNumForOptions === undefined || qNumForOptions > totalQuestions) return null;
                  const qOptions = getQuestionOptions(qNumForOptions);
                  const has5Option = qOptions.includes('E');
                  return (
                    <div 
                      key={`hdr-slot-${colIdx}-${item.slotIdx}`}
                      className="q-col-header"
                      style={{
                        top: toY(y + 3.5)
                      }}
                    >
                      <span className="q-hdr-label" style={{ left: toX(col.xLabel) }}>Q.No</span>
                      <span className="q-hdr-opt" style={{ left: toX(col.xOptions[0]) }}>A</span>
                      <span className="q-hdr-opt" style={{ left: toX(col.xOptions[1]) }}>B</span>
                      <span className="q-hdr-opt" style={{ left: toX(col.xOptions[2]) }}>C</span>
                      <span className="q-hdr-opt" style={{ left: toX(col.xOptions[3]) }}>D</span>
                      {has5Option && (
                        <span className="q-hdr-opt" style={{ left: toX(col.xOptions[3] + 25) }}>E</span>
                      )}
                    </div>
                  );
                }

                const qNum = item.qNum;
                if (qNum === undefined || qNum > totalQuestions) return null;
                const qOptions = getQuestionOptions(qNum);

                return (
                  <React.Fragment key={`q-row-${qNum}`}>
                    {/* Number Label */}
                    <span 
                      className="omr-q-label"
                      style={{
                        left: toX(col.xLabel),
                        top: toY(y),
                        fontSize: layout.yStep < 18 ? '8.5px' : '10.2px'
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

        {/* Bottom disclaimer */}
        <div className="bottom-disclaimer" style={{ top: toY(1335), left: 0, right: 0, textAlign: 'center' }}>
          {omrConfig.disclaimerText}
        </div>

        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Titan+One&display=swap');

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
            width: 10mm;
            height: 10mm;
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
            font-family: 'Titan One', cursive, sans-serif !important;
            font-size: 26px !important;
            font-weight: normal !important;
            color: #dc0045 !important;
            margin: 0 0 2px 0 !important;
            line-height: 1.1 !important;
            letter-spacing: 0.5px;
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
            font-size: 8px;
            font-weight: bold;
            text-align: center;
            padding: 3.5px;
            border-top-left-radius: 4px;
            border-top-right-radius: 4px;
            letter-spacing: 0.4px;
            white-space: nowrap;
            overflow: hidden;
          }

          .digit-box-header {
            position: absolute;
            width: 6.8mm;
            height: 6.8mm;
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
            width: 4.8mm;
            height: 4.8mm;
            font-size: 8px;
            font-weight: 800;
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
            font-size: 8.5px;
            font-weight: 900;
            color: #dc0045 !important;
          }

          .omr-q-label {
            position: absolute;
            transform: translate(-50%, -50%);
            font-weight: 900 !important;
            color: #000000 !important;
            white-space: nowrap;
            letter-spacing: -0.15px;
            font-family: 'Outfit', 'Inter', sans-serif;
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
            font-size: 6px;
            font-weight: bold;
            color: #dc0045 !important;
            letter-spacing: 0.5px;
          }

          @media print {
            @page {
              size: A4 portrait;
              margin: 0mm !important;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
            }
            .no-print {
              display: none !important;
            }
            .omr-print-wrapper {
              padding: 0 !important;
              margin: 0 !important;
              width: 210mm !important;
              height: 297mm !important;
            }
            .omr-print-page {
              margin: 0 auto !important;
              box-shadow: none !important;
              border: none !important;
              width: 210mm !important;
              height: 297mm !important;
              page-break-before: avoid !important;
              page-break-after: avoid !important;
              page-break-inside: avoid !important;
              transform: none !important;
            }
          }
        `}</style>
      </div>

    </div>
  );
};

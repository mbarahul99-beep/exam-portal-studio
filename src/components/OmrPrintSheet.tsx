import React, { useState, useEffect } from 'react';
import { getDynamicOMRQuestionLayout, getColumnSlots } from '../utils/omrScanner';
import { DEFAULT_OMR_SETTINGS, type OmrCustomSettings } from './OmrSettingsView';
import { Printer, Sliders, Columns, Maximize2 } from 'lucide-react';
import { db } from '../db';
import { APEX_ICON_PURE_BASE64 } from '../assets/iconPureBase64';

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
        let jsonStr = localStorage.getItem('omr_custom_settings');
        if (!jsonStr) {
          const record = await db.settings.where('key').equals('omr_custom_settings').first();
          if (record && record.value) jsonStr = record.value;
        }
        if (jsonStr) {
          const parsed = JSON.parse(jsonStr);
          setOmrConfig({ ...DEFAULT_OMR_SETTINGS, ...parsed });
          if (parsed.customCols !== undefined) setCustomCols(parsed.customCols);
          if (parsed.density) setDensity(parsed.density);
        }
      } catch (e) {
        console.warn("Failed loading OMR custom settings in print view:", e);
      }
    };
    loadSettings();
  }, []);

  const rollNoDigits = Math.min(3, exam?.rollNoDigits || 3);
  const layout = getDynamicOMRQuestionLayout(totalQuestions, density, customCols, exam?.sections, rollNoDigits);
  const bottomAnchorY = layout.bottomAnchorY || 1344;

  // Conversion: OMR coordinates (1000 x 1414) mapped to A4 millimeters (210 x 297)
  const toX = (x: number) => `${x * 0.21}mm`;
  const toY = (y: number) => `${y * 0.21}mm`;

  const rollCols = Array.from({ length: rollNoDigits });

  const getQuestionOptions = (qNum: number): string[] => {
    if (!exam || !exam.sections) return ['A', 'B', 'C', 'D'];
    const sec = exam.sections.find((s: any) => qNum >= s.qStart && qNum < s.qStart + s.qCount);
    return sec && sec.questionType === '5 option' ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
  };

  const getQuestionLabel = (qNum: number): string => {
    return String(qNum).padStart(2, '0');
  };

  const handleColsChange = async (val: number | undefined) => {
    setCustomCols(val);
    try {
      const stored = localStorage.getItem('omr_custom_settings') || '{}';
      const parsed = JSON.parse(stored);
      parsed.customCols = val;
      const json = JSON.stringify(parsed);
      localStorage.setItem('omr_custom_settings', json);
      
      const record = await db.settings.where('key').equals('omr_custom_settings').first();
      if (record) {
        await db.settings.update(record.id!, { value: json });
      } else {
        await db.settings.add({ key: 'omr_custom_settings', value: json });
      }
    } catch (e) {
      console.warn("Failed saving custom columns:", e);
    }
  };

  const handleDensityChange = async (val: 'auto' | 'compact' | 'normal' | 'spacious') => {
    setDensity(val);
    try {
      const stored = localStorage.getItem('omr_custom_settings') || '{}';
      const parsed = JSON.parse(stored);
      parsed.density = val;
      const json = JSON.stringify(parsed);
      localStorage.setItem('omr_custom_settings', json);
      
      const record = await db.settings.where('key').equals('omr_custom_settings').first();
      if (record) {
        await db.settings.update(record.id!, { value: json });
      } else {
        await db.settings.add({ key: 'omr_custom_settings', value: json });
      }
    } catch (e) {
      console.warn("Failed saving custom density:", e);
    }
  };

  // Determine bubble size string based on scale selection and dynamic column layout
  const getBubbleSize = () => {
    if (bubbleScale === 'large') return '4.5mm';
    if (bubbleScale === 'compact') return '3.0mm';
    if (layout.numCols <= 2) return '4.5mm';
    if (layout.numCols === 3) return '3.8mm';
    if (layout.numCols === 4) return '3.5mm';
    return '3.3mm';
  };

  const getRollBubbleSize = () => getBubbleSize();

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
              Print OMR Sheet Preview
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              {totalQuestions} Questions • {layout.numCols} Columns Layout • High Precision Grid
            </p>
          </div>
          <button
            onClick={() => window.print()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              backgroundColor: '#dc0045',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(220, 0, 69, 0.25)'
            }}
          >
            <Printer size={16} /> Print / Save PDF
          </button>
        </div>

        {/* CONTROLS ROW */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          paddingTop: '10px',
          borderTop: '1px solid #f1f5f9',
          fontSize: '13px'
        }}>
          {/* Columns Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Columns size={15} color="#64748b" />
            <span style={{ fontWeight: 600, color: '#334155' }}>Columns:</span>
            <select
              value={customCols || 'auto'}
              onChange={(e) => handleColsChange(e.target.value === 'auto' ? undefined : Number(e.target.value))}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontWeight: 600,
                fontSize: '12px',
                color: '#0f172a'
              }}
            >
              <option value="auto">Auto ({layout.numCols} Cols)</option>
              <option value="2">2 Columns (1-35 Qs)</option>
              <option value="3">3 Columns (36-69 Qs)</option>
              <option value="4">4 Columns (70-134 Qs)</option>
              <option value="5">5 Columns (135-200 Qs)</option>
            </select>
          </div>

          {/* Density Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={15} color="#64748b" />
            <span style={{ fontWeight: 600, color: '#334155' }}>Spacing:</span>
            <select
              value={density}
              onChange={(e) => handleDensityChange(e.target.value as any)}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontWeight: 600,
                fontSize: '12px',
                color: '#0f172a'
              }}
            >
              <option value="auto">Auto (Balanced)</option>
              <option value="compact">Compact (More Top Space)</option>
              <option value="normal">Normal</option>
              <option value="spacious">Spacious (Full Page)</option>
            </select>
          </div>

          {/* Bubble Scale Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Maximize2 size={15} color="#64748b" />
            <span style={{ fontWeight: 600, color: '#334155' }}>Bubble Size:</span>
            <select
              value={bubbleScale}
              onChange={(e) => setBubbleScale(e.target.value as any)}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontWeight: 600,
                fontSize: '12px',
                color: '#0f172a'
              }}
            >
              <option value="normal">Auto Dynamic ({getBubbleSize()})</option>
              <option value="large">Large ({bubbleScale === 'large' ? '4.8mm' : '4.8mm'})</option>
              <option value="compact">Compact (3.2mm)</option>
            </select>
          </div>

        </div>
      </div>

      {/* PRINTABLE A4 PAGE CONTAINER */}
      <div className="omr-print-page">

        {/* ═══════════════════════════════════════════════════════════════════
            ZONE A: TOP HEADER & CANDIDATE DETAILS (ORIGINAL BEAUTIFUL APEX HEADER)
            ═══════════════════════════════════════════════════════════════════ */}
        <div style={{
          position: 'absolute',
          top: toY(10),
          left: toX(layout.gridLeft),
          width: toX(layout.gridRight - layout.gridLeft),
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          zIndex: 12
        }}>
          {/* Logo & Institute Name */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
            <img 
              src={APEX_ICON_PURE_BASE64} 
              alt="APEX Logo" 
              style={{ 
                height: `${omrConfig.logoHeight ? Math.min(32, omrConfig.logoHeight) : 26}px`, 
                width: 'auto', 
                objectFit: 'contain',
                display: 'block'
              }} 
            />
            <span style={{
              fontSize: `${omrConfig.omrInstitutionFontSize || 18}px`,
              fontWeight: 900,
              color: '#dc0045',
              fontFamily: omrConfig.headerInstitutionFontFamily || "'Titan One', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              {omrConfig.instituteName || 'Institute APEX'}
            </span>
          </div>

          {/* Subtitle */}
          <div className="omr-subtitle" style={{ 
            fontSize: `${omrConfig.headerSubtitleFontSize || 8.2}px`, 
            fontWeight: 800,
            color: '#dc0045',
            letterSpacing: '0.4px',
            marginBottom: '2px',
            fontFamily: omrConfig.headerGeneralFontFamily || "'Outfit', sans-serif"
          }}>
            INSTITUTE OF NEET & IIT-JEE COACHING
          </div>

          {/* Exam Title */}
          <div className="omr-exam-title" style={{ 
            fontSize: `${omrConfig.headerTitleFontSize || 10.5}px`, 
            margin: 0, 
            fontWeight: 900, 
            color: '#0f172a',
            marginBottom: '6px',
            fontFamily: omrConfig.headerGeneralFontFamily || "'Outfit', sans-serif"
          }}>
            CLASS: {exam?.className?.toUpperCase() || 'NEET'} &nbsp;|&nbsp; EXAM: {examTitle.toUpperCase()}
          </div>

          {/* Candidate & Father Name Handwriting Line */}
          <div style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
            boxSizing: 'border-box'
          }}>
            {/* Candidate Name */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: `${omrConfig.headerCandidateFontSize || 8}px`,
                fontWeight: 800,
                color: '#dc0045',
                whiteSpace: 'nowrap',
                fontFamily: omrConfig.headerGeneralFontFamily || "'Outfit', sans-serif"
              }}>
                {omrConfig.candidateNameLabel || "CANDIDATE'S NAME (IN CAPITAL LETTERS)"}:
              </span>
              <div style={{ flex: 1, borderBottom: '1px dashed #94a3b8', height: '14px' }} />
            </div>

            {/* Father's Name */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: `${omrConfig.headerCandidateFontSize || 8}px`,
                fontWeight: 800,
                color: '#dc0045',
                whiteSpace: 'nowrap',
                fontFamily: omrConfig.headerGeneralFontFamily || "'Outfit', sans-serif"
              }}>
                {omrConfig.fatherNameLabel || "FATHER'S NAME (IN CAPITAL LETTERS)"}:
              </span>
              <div style={{ flex: 1, borderBottom: '1px dashed #94a3b8', height: '14px' }} />
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            ZONE B: PURE UNIFORM EVALBEE GUTTER FIDUCIAL MATRIX
            ═══════════════════════════════════════════════════════════════════ */}
        {layout.timingMarkers && layout.timingMarkers.map((tm, tmIdx) => (
          <div 
            key={`timing-marker-${tmIdx}`}
            className={tm.type === 'corner' ? "corner-timing-marker" : "omr-timing-marker"}
            style={{
              left: toX(tm.x),
              top: toY(tm.y)
            }}
          />
        ))}

        {/* ═══════════════════════════════════════════════════════════════════
            ZONE C: ROLL NUMBER (CENTERED IN COLUMN 0 TRACK)
            ═══════════════════════════════════════════════════════════════════ */}
        {(() => {
          const col0Width = layout.colWidth;
          const col0Center = layout.gridLeft + 0.5 * col0Width;
          const rollXStep = layout.rollXStep;
          const rollTotalWidth = (rollNoDigits - 1) * rollXStep;
          const rollFirstX = col0Center - 0.5 * rollTotalWidth;
          const rollYStep = layout.rollYStep;

          return (
            <>
              {/* CLEAN ROLL NUMBER HEADER */}
              <div style={{
                position: 'absolute',
                left: toX(col0Center),
                top: toY(120),
                transform: 'translate(-50%, -50%)',
                fontSize: '10px',
                fontWeight: 900,
                color: '#dc0045',
                letterSpacing: '0.6px',
                fontFamily: "'Outfit', sans-serif",
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                zIndex: 10
              }}>
                {omrConfig.rollNoBoxTitle || 'ROLL NO'}
              </div>

              {/* ROLL NO DIGIT HEADER BOXES */}
              {rollCols.map((_, colIdx) => {
                const x = rollFirstX + colIdx * rollXStep;
                return (
                  <div 
                    key={`roll-h-${colIdx}`}
                    className="digit-box-header"
                    style={{
                      left: toX(x),
                      top: toY(152),
                      width: '5.5mm',
                      height: '5.5mm'
                    }}
                  />
                );
              })}

              {/* ROLL NO BUBBLES (DIGITS 0 TO 9) */}
              {rollCols.map((_, colIdx) => {
                const x = rollFirstX + colIdx * rollXStep;
                return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digitVal, rowIdx) => {
                  const y = 188 + rowIdx * rollYStep;
                  return (
                    <div
                      key={`roll-b-${colIdx}-${digitVal}`}
                      className="omr-bubble id-bubble"
                      style={{
                        left: toX(x),
                        top: toY(y),
                        width: getRollBubbleSize(),
                        height: getRollBubbleSize()
                      }}
                    />
                  );
                });
              })}

              {/* LEFT DIGIT ROW LABELS (0..9) */}
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digitVal, rowIdx) => {
                const y = 188 + rowIdx * rollYStep;
                const leftX = rollFirstX - 22;
                return (
                  <div
                    key={`roll-row-label-${digitVal}`}
                    style={{
                      position: 'absolute',
                      left: toX(leftX),
                      top: toY(y),
                      transform: 'translate(-50%, -50%)',
                      fontSize: '8.5px',
                      fontWeight: 800,
                      color: '#dc0045'
                    }}
                  >
                    {digitVal}
                  </div>
                );
              })}
            </>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════════════════
            ZONE D: DYNAMIC QUESTIONS GRID
            ═══════════════════════════════════════════════════════════════════ */}
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
                        fontSize: '9.5px',
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
                        fontSize: layout.yStep < 18 ? '8.5px' : '10.0px'
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
                        />
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          );
        })}

        {/* Optional Clean Bottom disclaimer */}
        <div className="bottom-disclaimer" style={{ top: toY(Math.min(1390, bottomAnchorY + 25)), left: 0, right: 0, textAlign: 'center' }}>
          {omrConfig.disclaimerText || 'DO NOT FOLD OR TEAR THIS SHEET • KEEP ANCHORS CLEAN'}
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

          .omr-timing-marker {
            width: 3.0mm;
            height: 3.0mm;
            background-color: #000 !important;
            position: absolute;
            transform: translate(-50%, -50%);
            border-radius: 0px;
            z-index: 9;
          }

          .omr-exam-title {
            font-size: 12px;
            font-weight: 800;
            color: #0f172a !important;
            margin: 0 0 4px 0 !important;
            line-height: 1.1 !important;
            letter-spacing: 0.3px;
          }

          .omr-subtitle {
            background-color: transparent !important;
            color: #dc0045 !important;
            display: inline-block;
            font-size: 8.5px;
            font-weight: 800;
            padding: 0;
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
            background-color: transparent !important;
            color: #dc0045 !important;
            font-size: 8px;
            font-weight: bold;
            text-align: center;
            padding: 3.5px;
            letter-spacing: 0.4px;
            white-space: nowrap;
            overflow: hidden;
          }

          .digit-box-header {
            position: absolute;
            width: 6.8mm;
            height: 6.8mm;
            border: 0.25mm solid #cbd5e1 !important;
            transform: translate(-50%, -50%);
            background-color: #ffffff !important;
            z-index: 1;
          }

          .omr-bubble {
            position: absolute;
            transform: translate(-50%, -50%);
            border: 0.45mm solid #8c0029 !important;
            border-radius: 50%;
            background-color: transparent !important;
            display: flex;
            align-items: center;
            justify-content: center;
            user-select: none;
            z-index: 2;
          }

          .id-bubble {
            font-size: 7.5px;
            font-weight: 800;
            color: #8c0029 !important;
            border: 0.45mm solid #8c0029 !important;
          }

          .opt-bubble {
            border: 0.45mm solid #8c0029 !important;
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

          .omr-timing-marker {
            position: absolute;
            width: 3.6mm;
            height: 3.6mm;
            background-color: #000000 !important;
            transform: translate(-50%, -50%);
            z-index: 5;
          }

          .corner-timing-marker {
            position: absolute;
            width: 3.6mm;
            height: 3.6mm;
            background-color: #000000 !important;
            transform: translate(-50%, -50%);
            z-index: 6;
          }

          .bottom-disclaimer {
            position: absolute;
            font-size: 6.5px;
            font-weight: bold;
            color: #94a3b8 !important;
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


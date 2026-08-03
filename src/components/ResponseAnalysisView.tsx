import React, { useState } from 'react';
import { ArrowLeft, ArrowDown, SlidersHorizontal } from 'lucide-react';
import { type Exam, type ExamSubmission } from '../db';

interface ResponseAnalysisViewProps {
  exam: Exam;
  submissions: ExamSubmission[];
  onClose: () => void;
}

export const ResponseAnalysisView: React.FC<ResponseAnalysisViewProps> = ({ exam, submissions, onClose }) => {
  const [analysisTab, setAnalysisTab] = useState<'option' | 'answer'>('answer');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterMode, setFilterMode] = useState<'all' | 'highest_wrong' | 'highest_correct' | 'highest_unattempted'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  const totalQuestions = exam.numQuestions || 100;
  const examSubs = submissions.filter(s => s.examId === exam.id);

  // Compute metrics for each question
  const questionMetrics = Array.from({ length: totalQuestions }, (_, idx) => {
    const qNum = idx + 1;
    const correctKey = (exam.answerKey && exam.answerKey[qNum]) ? exam.answerKey[qNum] : 'A';
    
    // Check if 5-option question
    let options = ['A', 'B', 'C', 'D'];
    if (exam.sections) {
      const sec = exam.sections.find(s => qNum >= s.qStart && qNum < s.qStart + s.qCount);
      if (sec && sec.questionType === '5 option') {
        options = ['A', 'B', 'C', 'D', 'E'];
      }
    }

    const optionCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    let correctCount = 0;
    let incorrectCount = 0;
    let unattemptedCount = 0;

    examSubs.forEach(sub => {
      const ans = sub.answers ? (sub.answers[qNum] || '') : '';
      if (!ans || ans.trim() === '') {
        unattemptedCount++;
      } else {
        const cleanAns = ans.trim().toUpperCase();
        if (optionCounts[cleanAns] !== undefined) {
          optionCounts[cleanAns]++;
        }
        const subSet = sub.bookletSet || 'A';
        const correctKeyForSub = exam.answerKeys?.[subSet]?.[qNum] || exam.answerKey?.[qNum] || 'A';
        if (cleanAns === correctKeyForSub) {
          correctCount++;
        } else {
          incorrectCount++;
        }
      }
    });

    return {
      qNum,
      correctKey,
      options,
      optionCounts,
      correctCount,
      incorrectCount,
      unattemptedCount
    };
  });

  // Filter & Sort
  let displayedMetrics = [...questionMetrics];

  if (filterMode === 'highest_wrong') {
    displayedMetrics.sort((a, b) => b.incorrectCount - a.incorrectCount);
  } else if (filterMode === 'highest_correct') {
    displayedMetrics.sort((a, b) => b.correctCount - a.correctCount);
  } else if (filterMode === 'highest_unattempted') {
    displayedMetrics.sort((a, b) => b.unattemptedCount - a.unattemptedCount);
  } else {
    if (sortOrder === 'desc') {
      displayedMetrics.reverse();
    }
  }

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh', width: '100%', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Top Header Bar matching Screenshot */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: '#ffffff',
        borderBottom: '1px solid #f1f5f9',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px'
      }}>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#1e293b'
          }}
          title="Back to Exam Details"
        >
          <ArrowLeft size={22} />
        </button>

        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Response Analysis
          </h1>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{exam.title}</span>
            <span>•</span>
            <span>{examSubs.length} Student Submissions</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 16px 40px 16px' }}>
        
        {/* Top Tabs (Option Response vs Answer Response) */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #e2e8f0',
          marginTop: '12px',
          marginBottom: '16px'
        }}>
          <button
            onClick={() => setAnalysisTab('option')}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              background: 'transparent',
              fontSize: '1rem',
              fontWeight: analysisTab === 'option' ? 700 : 500,
              color: analysisTab === 'option' ? '#1d4ed8' : '#64748b',
              borderBottom: analysisTab === 'option' ? '3px solid #1d4ed8' : '3px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              textAlign: 'center'
            }}
          >
            Option Response
          </button>

          <button
            onClick={() => setAnalysisTab('answer')}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              background: 'transparent',
              fontSize: '1rem',
              fontWeight: analysisTab === 'answer' ? 700 : 500,
              color: analysisTab === 'answer' ? '#1d4ed8' : '#64748b',
              borderBottom: analysisTab === 'answer' ? '3px solid #1d4ed8' : '3px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              textAlign: 'center'
            }}
          >
            Answer Response
          </button>
        </div>

        {/* Controls Bar (Sort & Filter Icons at Right) */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '12px',
          padding: '4px 8px 12px 8px',
          position: 'relative'
        }}>
          {/* Sort order toggle */}
          <button
            onClick={() => {
              setFilterMode('all');
              setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
            }}
            style={{
              border: 'none',
              background: '#f8fafc',
              padding: '8px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#475569',
              fontSize: '0.85rem',
              fontWeight: 600
            }}
            title="Toggle Question Sort Order"
          >
            <ArrowDown size={16} style={{ transform: sortOrder === 'desc' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            <span>{sortOrder === 'asc' ? 'Q1 → Q' + totalQuestions : 'Q' + totalQuestions + ' → Q1'}</span>
          </button>

          {/* Filter dropdown button */}
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            style={{
              border: 'none',
              background: filterMode !== 'all' ? '#eff6ff' : '#f8fafc',
              color: filterMode !== 'all' ? '#1d4ed8' : '#475569',
              padding: '8px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.85rem',
              fontWeight: 600
            }}
            title="Filter Analysis"
          >
            <SlidersHorizontal size={16} />
            <span>Filter</span>
          </button>

          {/* Filter Dropdown Popover */}
          {showFilterDropdown && (
            <div style={{
              position: 'absolute',
              top: '44px',
              right: '8px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
              padding: '6px',
              zIndex: 200,
              minWidth: '220px'
            }}>
              <button
                onClick={() => { setFilterMode('all'); setShowFilterDropdown(false); }}
                style={{ width: '100%', padding: '10px 14px', border: 'none', background: filterMode === 'all' ? '#f1f5f9' : 'transparent', textAlign: 'left', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}
              >
                All Questions (Sequential)
              </button>
              <button
                onClick={() => { setFilterMode('highest_wrong'); setShowFilterDropdown(false); }}
                style={{ width: '100%', padding: '10px 14px', border: 'none', background: filterMode === 'highest_wrong' ? '#f1f5f9' : 'transparent', textAlign: 'left', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#dc2626' }}
              >
                Most Incorrect Questions
              </button>
              <button
                onClick={() => { setFilterMode('highest_correct'); setShowFilterDropdown(false); }}
                style={{ width: '100%', padding: '10px 14px', border: 'none', background: filterMode === 'highest_correct' ? '#f1f5f9' : 'transparent', textAlign: 'left', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#16a34a' }}
              >
                Most Correct Questions
              </button>
              <button
                onClick={() => { setFilterMode('highest_unattempted'); setShowFilterDropdown(false); }}
                style={{ width: '100%', padding: '10px 14px', border: 'none', background: filterMode === 'highest_unattempted' ? '#f1f5f9' : 'transparent', textAlign: 'left', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}
              >
                Most Unattempted Questions
              </button>
            </div>
          )}
        </div>

        {/* LIST VIEW BASED ON ACTIVE TAB */}
        {analysisTab === 'answer' ? (
          /* TAB 2: ANSWER RESPONSE (Matching Screenshot 1) */
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {displayedMetrics.map(item => (
              <div 
                key={`ans-resp-${item.qNum}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '18px 12px',
                  borderBottom: '1px solid #f1f5f9'
                }}
              >
                {/* Question Number */}
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1e293b', width: '48px' }}>
                  {item.qNum}
                </div>

                {/* Metrics Group: Correct (✓), Incorrect (✕), Unattempted (◯) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
                  
                  {/* Correct Metric */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      border: '1.8px solid #16a34a',
                      color: '#16a34a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <span style={{ fontSize: '13px', fontWeight: 900 }}>✓</span>
                    </div>
                    <span style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', minWidth: '24px' }}>
                      {item.correctCount}
                    </span>
                  </div>

                  {/* Incorrect Metric */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      border: '1.8px solid #dc2626',
                      color: '#dc2626',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <span style={{ fontSize: '13px', fontWeight: 900 }}>✕</span>
                    </div>
                    <span style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', minWidth: '24px' }}>
                      {item.incorrectCount}
                    </span>
                  </div>

                  {/* Unattempted Metric */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      border: '1.8px solid #64748b',
                      color: '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <span style={{ fontSize: '12px' }}>◯</span>
                    </div>
                    <span style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', minWidth: '24px' }}>
                      {item.unattemptedCount}
                    </span>
                  </div>

                </div>
              </div>
            ))}
          </div>
        ) : (
          /* TAB 1: OPTION RESPONSE (Matching Screenshot 2) */
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {displayedMetrics.map(item => (
              <div 
                key={`opt-resp-${item.qNum}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '18px 12px',
                  borderBottom: '1px solid #f1f5f9'
                }}
              >
                {/* Question Number */}
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1e293b', width: '48px' }}>
                  {item.qNum}
                </div>

                {/* Options Grid: A, B, C, D (Green if correct, Red if incorrect) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
                  {item.options.map(opt => {
                    const isCorrect = opt === item.correctKey;
                    const optColor = isCorrect ? '#16a34a' : '#dc2626';
                    const count = item.optionCounts[opt] || 0;

                    return (
                      <div key={`opt-${item.qNum}-${opt}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '28px' }}>
                        {/* Option Letter (Green if correct, Red if wrong) */}
                        <span style={{ fontSize: '0.95rem', fontWeight: 800, color: optColor }}>
                          {opt}
                        </span>
                        {/* Sub-count of students who chose this option */}
                        <span style={{ fontSize: '0.95rem', fontWeight: 500, color: '#1e293b' }}>
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};

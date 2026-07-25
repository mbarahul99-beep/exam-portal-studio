import React, { useState } from 'react';
import { X, Globe, Send, CheckCircle2, Lock, ShieldCheck, RefreshCw } from 'lucide-react';
import { db, type Exam, type ExamSubmission } from '../db';

interface PublishResultsModalProps {
  exam: Exam;
  submissions: ExamSubmission[];
  onClose: () => void;
  onStartWhatsAppBroadcast: () => void;
  onUpdateExam: (updated: Exam) => void;
}

export const PublishResultsModal: React.FC<PublishResultsModalProps> = ({
  exam,
  submissions,
  onClose,
  onStartWhatsAppBroadcast,
  onUpdateExam
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const isPublished = Boolean(exam.isResultsPublished);
  const examSubs = submissions.filter(s => s.examId === exam.id);

  const handleTogglePortalPublish = async () => {
    setIsUpdating(true);
    try {
      const nextStatus = !isPublished;
      const updatedData: Exam = {
        ...exam,
        isResultsPublished: nextStatus
      };

      // 1. Update IndexedDB
      await db.exams.update(exam.id!, { isResultsPublished: nextStatus });

      // 2. Sync to Hostinger MySQL
      try {
        await fetch('/api/exams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedData)
        });
      } catch (err) {
        console.warn("MySQL sync warning on publish results:", err);
      }

      onUpdateExam(updatedData);

      if (nextStatus) {
        alert(`Results for "${exam.title}" are now PUBLISHED!\n\nStudents can now log in to the Student Portal to view their scorecard.`);
      } else {
        alert(`Results for "${exam.title}" have been UNPUBLISHED.\n\nStudents can no longer see their scorecards until published again.`);
      }
    } catch (err: any) {
      alert(`Failed to update publish status: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 99999,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '20px',
        maxWidth: '560px',
        width: '100%',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        overflow: 'hidden',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#f8fafc'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
              Publish Exam Results
            </h3>
            <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
              {exam.title} ({exam.className}) • {examSubs.length} Submissions
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: '#e2e8f0',
              color: '#475569',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Content Body */}
        <div style={{ padding: '24px' }}>
          
          {/* Current Status Pill */}
          <div style={{
            background: isPublished ? '#f0fdf4' : '#fff7ed',
            border: `1px solid ${isPublished ? '#bbf7d0' : '#fed7aa'}`,
            borderRadius: '12px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '24px'
          }}>
            {isPublished ? (
              <CheckCircle2 size={24} color="#16a34a" />
            ) : (
              <Lock size={24} color="#ea580c" />
            )}
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: isPublished ? '#166534' : '#c2410c' }}>
                {isPublished ? 'Results are Currently PUBLISHED' : 'Results are NOT Published Yet'}
              </div>
              <div style={{ fontSize: '0.78rem', color: isPublished ? '#15803d' : '#9a3412', marginTop: '2px' }}>
                {isPublished 
                  ? 'Students can view their scorecard in their Student Portal.'
                  : 'Students cannot see their exam report cards until published.'}
              </div>
            </div>
          </div>

          <h4 style={{ margin: '0 0 14px 0', fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Choose Publishing Channels:
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* OPTION 1: PUBLISH TO STUDENT PORTAL */}
            <div style={{
              background: '#ffffff',
              border: '1.5px solid #e2e8f0',
              borderRadius: '14px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              transition: 'border-color 0.2s'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: '#eff6ff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Globe size={22} />
                </div>
                <div>
                  <h5 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                    1. Publish to Student Portal
                  </h5>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#64748b', lineHeight: 1.4 }}>
                    Makes scorecards and detailed question analysis visible to students when they log into their student dashboard.
                  </p>
                </div>
              </div>

              <button
                onClick={handleTogglePortalPublish}
                disabled={isUpdating}
                style={{
                  width: '100%',
                  background: isPublished ? '#ef4444' : '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
                }}
              >
                {isUpdating ? (
                  <>
                    <RefreshCw size={16} className="spin" /> Updating...
                  </>
                ) : isPublished ? (
                  <>
                    <Lock size={16} /> Unpublish from Student Portal
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} /> Publish to Student Portal
                  </>
                )}
              </button>
            </div>

            {/* OPTION 2: PUBLISH TO WHATSAPP BROADCAST */}
            <div style={{
              background: '#ffffff',
              border: '1.5px solid #e2e8f0',
              borderRadius: '14px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: '#f0fdf4',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Send size={22} />
                </div>
                <div>
                  <h5 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                    2. Publish via WhatsApp Broadcast
                  </h5>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#64748b', lineHeight: 1.4 }}>
                    Sends automated WhatsApp messages containing individual student report links to all parents / students.
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  onClose();
                  onStartWhatsAppBroadcast();
                }}
                style={{
                  width: '100%',
                  background: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(22, 163, 74, 0.2)'
                }}
              >
                <Send size={16} /> Publish to WhatsApp Broadcast
              </button>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
};

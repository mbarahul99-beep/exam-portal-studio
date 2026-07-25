import React, { useState } from 'react';
import { Copy, Check, Share2, GraduationCap, ArrowLeft } from 'lucide-react';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

interface InviteStudentModalProps {
  onClose: () => void;
}

export const InviteStudentModal: React.FC<InviteStudentModalProps> = ({ onClose }) => {
  const classesList = useLiveQuery(async () => {
    try {
      const all = await db.classes.toArray();
      return all || [];
    } catch {
      return [];
    }
  }, []) || [];

  const [selectedClass, setSelectedClass] = useState<string>('NEET-2026');
  const [copied, setCopied] = useState(false);

  const currentClass = selectedClass || (classesList[0]?.name) || 'NEET-2026';
  const inviteUrl = `${window.location.origin}/?inviteClass=${encodeURIComponent(currentClass)}`;

  const handleCopyLink = () => {
    try {
      navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.warn("Clipboard write failed:", err);
    }
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(
      `🎓 *Student Registration Request - Institute Apex*\n\nPlease click the link below to register your profile for class *${currentClass}*:\n\n👉 ${inviteUrl}\n\n*Note:* After submitting, the Admin will approve your registration.`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 99999,
      background: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Top Header */}
      <div style={{
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #f3f4f6',
        background: '#ffffff'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <ArrowLeft size={22} color="#0f172a" />
          </button>

          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
            Create Student Invite Link
          </h2>
        </div>
      </div>

      {/* Content Container */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '32px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start'
      }}>
        <div style={{
          background: '#ffffff',
          borderRadius: '20px',
          padding: '32px',
          maxWidth: '560px',
          width: '100%',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}>

          {/* Target Class Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#475569', marginBottom: '8px', textTransform: 'uppercase' }}>
              TARGET ENROLLMENT CLASS
            </label>
            <select
              value={currentClass}
              onChange={e => setSelectedClass(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.95rem',
                fontWeight: 700,
                color: '#0f172a',
                background: '#ffffff',
                boxSizing: 'border-box'
              }}
            >
              {classesList.map((c, i) => (
                <option key={`inv-cls-${c.id || i}`} value={c.name}>{c.name}</option>
              ))}
              {!classesList.some(c => c?.name === 'NEET-2026') && <option value="NEET-2026">NEET-2026</option>}
              {!classesList.some(c => c?.name === 'JEE-2026') && <option value="JEE-2026">JEE-2026</option>}
            </select>
          </div>

          {/* Generated Link Field */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#475569', marginBottom: '8px', textTransform: 'uppercase' }}>
              SHAREABLE REGISTRATION URL
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                readOnly
                value={inviteUrl}
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #e2e8f0',
                  background: '#f8fafc',
                  fontSize: '0.88rem',
                  color: '#1e293b',
                  boxSizing: 'border-box'
                }}
              />
              <button
                onClick={handleCopyLink}
                style={{
                  background: copied ? '#16a34a' : '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '0 20px',
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)'
                }}
              >
                {copied ? <><Check size={18} /> Copied</> : <><Copy size={18} /> Copy</>}
              </button>
            </div>
          </div>

          {/* QR Code Section */}
          <div style={{ textAlign: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px' }}>
            <img
              src={`https://quickchart.io/qr?text=${encodeURIComponent(inviteUrl)}&size=200`}
              alt="Scan QR to Register"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
              style={{ width: '160px', height: '160px', borderRadius: '12px', border: '3px solid #ffffff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            />
            <p style={{ margin: '12px 0 0 0', fontSize: '0.85rem', color: '#475569', fontWeight: 700 }}>
              Scan QR code with camera to register for class <strong>{currentClass}</strong>
            </p>
          </div>

          {/* Notice Banner */}
          <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '12px', padding: '14px', fontSize: '0.85rem', color: '#92400e', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <GraduationCap size={22} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Admin Approval Required:</strong> When students register via this link, they will appear in your <strong>Pending Approvals</strong> queue before being added to class <strong>{currentClass}</strong>.
            </div>
          </div>

          <button
            onClick={handleWhatsAppShare}
            style={{
              width: '100%',
              background: '#16a34a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              padding: '14px',
              fontSize: '0.95rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)'
            }}
          >
            <Share2 size={18} /> Share Invite Link via WhatsApp
          </button>

        </div>
      </div>

    </div>
  );
};

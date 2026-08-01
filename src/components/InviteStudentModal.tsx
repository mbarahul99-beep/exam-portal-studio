import React, { useState } from 'react';
import { Copy, Check, Share2, GraduationCap, ArrowLeft, Smartphone, ExternalLink, Info } from 'lucide-react';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

interface InviteStudentModalProps {
  onClose: () => void;
}

export const InviteStudentModal: React.FC<InviteStudentModalProps> = ({ onClose }) => {
  // 1. Live query for active classes
  const classesList = useLiveQuery(() => db.classes.toArray()) || [];

  // 2. Declare all useState hooks at the absolute top of the component
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [copiedReg, setCopiedReg] = useState(false);
  const [copiedPortal, setCopiedPortal] = useState(false);

  // 3. Derive current links and constants
  const currentClass = selectedClass || (classesList.length > 0 ? classesList[0].name : 'NEET-2026');
  const inviteUrl = `${window.location.origin}/?inviteClass=${encodeURIComponent(currentClass)}`;
  const portalUrl = `${window.location.origin}/?app=student`;

  // 4. Clipboard & Sharing Actions
  const handleCopyReg = () => {
    try {
      navigator.clipboard.writeText(inviteUrl);
      setCopiedReg(true);
      setTimeout(() => setCopiedReg(false), 2000);
    } catch (err) {
      console.warn("Clipboard write failed:", err);
    }
  };

  const handleCopyPortal = () => {
    try {
      navigator.clipboard.writeText(portalUrl);
      setCopiedPortal(true);
      setTimeout(() => setCopiedPortal(false), 2000);
    } catch (err) {
      console.warn("Clipboard write failed:", err);
    }
  };

  const handleWhatsAppShareReg = () => {
    const text = encodeURIComponent(
      `🎓 *Student Registration - Apex*\n\nRegister for class *${currentClass}*:\n👉 ${inviteUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const handleWhatsAppSharePortal = () => {
    const text = encodeURIComponent(
      `📲 *Student Portal - Apex*\n\nAccess score reports, online exams & scanned OMR sheets:\n👉 ${portalUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  return (
    <div 
      className="invite-modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999999,
        background: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflowY: 'auto',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      {/* Scoped CSS Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        .invite-header {
          padding: 14px 20px;
          display: flex;
          align-items: center;
          border-bottom: 1px solid #e2e8f0;
          background: #ffffff;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .invite-container {
          width: 100%;
          max-width: 900px;
          margin: 0 auto;
          padding: 20px 20px 80px 20px;
          box-sizing: border-box;
        }
        .invite-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-top: 16px;
        }
        .invite-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .card-header-title {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 600;
          color: #0f172a;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .invite-input-group {
          display: flex;
          gap: 6px;
        }
        .invite-input {
          flex: 1;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          font-size: 0.82rem;
          color: #334155;
          font-family: monospace;
          background: #f8fafc;
          outline: none;
          min-width: 0;
        }
        .btn-invite-icon {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #475569;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
          flex-shrink: 0;
        }
        .btn-invite-icon:hover {
          background: #f1f5f9;
        }
        .btn-invite-icon.success {
          background: #059669;
          color: #ffffff;
          border-color: #059669;
        }
        .btn-invite-icon.whatsapp {
          background: #25d366;
          color: #ffffff;
          border-color: #25d366;
        }
        .btn-invite-icon.whatsapp:hover {
          background: #20ba5a;
        }
        .qr-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 14px;
        }
        .qr-img {
          width: 140px;
          height: 140px;
          border-radius: 6px;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        
        @media (max-width: 768px) {
          .invite-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .invite-container {
            padding: 10px 10px 80px 10px;
          }
          .invite-card {
            padding: 16px;
          }
        }
      `}} />

      {/* Top Header */}
      <div className="invite-header">
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            marginRight: '12px'
          }}
        >
          <ArrowLeft size={22} color="#0f172a" />
        </button>
        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
          Onboarding & Portal Invites
        </h2>
      </div>

      {/* Main Container */}
      <div className="invite-container">
        
        {/* Class Selection Dropdown */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '16px 20px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
        }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
            Target Class / Course (For Registration)
          </label>
          <select
            value={currentClass}
            onChange={e => setSelectedClass(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.9rem',
              fontWeight: 600,
              color: '#0f172a',
              background: '#ffffff',
              boxSizing: 'border-box',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            {classesList.filter(c => c && c.name).map((c, i) => (
              <option key={`inv-cls-${c.id || i}`} value={c.name}>{c.name}</option>
            ))}
            {!classesList.some(c => c?.name === 'NEET-2026') && <option value="NEET-2026">NEET-2026</option>}
            {!classesList.some(c => c?.name === 'JEE-2026') && <option value="JEE-2026">JEE-2026</option>}
          </select>
        </div>

        <div className="invite-grid">
          
          {/* Card 1: Registration Link */}
          <div className="invite-card">
            <h3 className="card-header-title">
              <GraduationCap size={18} color="#0d9488" />
              <span>Registration Link ({currentClass})</span>
            </h3>

            <div className="invite-input-group">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="invite-input"
              />
              <button
                onClick={handleCopyReg}
                className={`btn-invite-icon ${copiedReg ? 'success' : ''}`}
                title="Copy Link"
              >
                {copiedReg ? <Check size={16} /> : <Copy size={16} />}
              </button>
              <button
                onClick={handleWhatsAppShareReg}
                className="btn-invite-icon whatsapp"
                title="Share via WhatsApp"
              >
                <Share2 size={16} />
              </button>
              <a
                href={inviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-invite-icon"
                title="Open Link"
              >
                <ExternalLink size={16} />
              </a>
            </div>

            <div className="qr-wrapper">
              <img
                src={`https://quickchart.io/qr?text=${encodeURIComponent(inviteUrl)}&size=200`}
                alt="Registration QR"
                className="qr-img"
              />
              <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '10px', fontWeight: 600 }}>
                Scan to Register
              </span>
            </div>
            
            <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', padding: '10px 12px', fontSize: '0.75rem', color: '#92400e', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <Info size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>Registration submissions will require your approval under <strong>Pending Approvals</strong> context.</span>
            </div>
          </div>

          {/* Card 2: Student Portal Link */}
          <div className="invite-card">
            <h3 className="card-header-title">
              <Smartphone size={18} color="#0d9488" />
              <span>Student Portal Login Link</span>
            </h3>

            <div className="invite-input-group">
              <input
                type="text"
                readOnly
                value={portalUrl}
                className="invite-input"
              />
              <button
                onClick={handleCopyPortal}
                className={`btn-invite-icon ${copiedPortal ? 'success' : ''}`}
                title="Copy Link"
              >
                {copiedPortal ? <Check size={16} /> : <Copy size={16} />}
              </button>
              <button
                onClick={handleWhatsAppSharePortal}
                className="btn-invite-icon whatsapp"
                title="Share via WhatsApp"
              >
                <Share2 size={16} />
              </button>
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-invite-icon"
                title="Open Link"
              >
                <ExternalLink size={16} />
              </a>
            </div>

            <div className="qr-wrapper">
              <img
                src={`https://quickchart.io/qr?text=${encodeURIComponent(portalUrl)}&size=200`}
                alt="Student Portal QR"
                className="qr-img"
              />
              <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '10px', fontWeight: 600 }}>
                Scan to Log In
              </span>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};

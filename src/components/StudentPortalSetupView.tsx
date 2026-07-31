import React, { useState } from 'react';
import { Share2, Copy, ExternalLink, QrCode, Smartphone, Monitor, Check, BookOpen, Apple } from 'lucide-react';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

export const StudentPortalSetupView: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [selectedInviteClass, setSelectedInviteClass] = useState<string>('');

  // Fetch list of active classes to populate direct class invitation links
  const classes = useLiveQuery(() => db.classes.toArray()) || [];

  const originUrl = window.location.origin;
  const baseStudentPortalUrl = `${originUrl}/?app=student`;
  const shareUrl = selectedInviteClass 
    ? `${baseStudentPortalUrl}&inviteClass=${encodeURIComponent(selectedInviteClass)}`
    : baseStudentPortalUrl;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(shareUrl)}`;

  return (
    <div className="portal-container">
      {/* Scoped CSS for responsiveness */}
      <style dangerouslySetInnerHTML={{__html: `
        .portal-container {
          padding: 16px;
          max-width: 900px;
          margin: 0 auto;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .portal-grid {
          display: grid;
          grid-template-columns: 1fr 280px;
          gap: 20px;
        }
        .portal-card {
          background: #ffffff;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          padding: 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .portal-title {
          margin: 0 0 16px 0;
          font-size: 1.1rem;
          color: #1e293b;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .input-group {
          display: flex;
          gap: 8px;
          margin-top: 8px;
        }
        .url-input {
          flex: 1;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          color: #334155;
          font-size: 0.85rem;
          font-family: monospace;
          outline: none;
          min-width: 0;
        }
        .btn-action {
          padding: 0 16px;
          border-radius: 8px;
          border: none;
          background: #0d9488;
          color: #ffffff;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .btn-action.copied {
          background: #059669;
        }
        .btn-icon {
          padding: 0 12px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #475569;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .guide-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .guide-item {
          padding: 12px 14px;
          background: #f8fafc;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }
        .guide-item-title {
          margin: 0 0 8px 0;
          font-size: 0.85rem;
          color: #0f172a;
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 600;
        }
        .guide-list {
          margin: 0;
          padding-left: 16px;
          font-size: 0.78rem;
          color: #475569;
          line-height: 1.5;
        }
        .guide-span-2 {
          grid-column: span 2;
        }
        .qr-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .qr-image-wrapper {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 12px;
          margin: 12px 0;
        }
        .qr-image {
          width: 140px;
          height: 140px;
          display: block;
        }
        
        @media (max-width: 768px) {
          .portal-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .guide-grid {
            grid-template-columns: 1fr;
            gap: 8px;
          }
          .guide-span-2 {
            grid-column: span 1;
          }
          .portal-container {
            padding: 8px;
          }
          .portal-card {
            padding: 16px;
          }
        }
      `}} />

      <div className="portal-grid">
        
        {/* Left Column: Link sharing & settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Card 1: Share Link Setup */}
          <div className="portal-card">
            <h2 className="portal-title">
              <Share2 size={18} color="#0d9488" /> Share Student Portal
            </h2>

            {/* Optional Invite Class Selector */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                <BookOpen size={14} color="#64748b" />
                <span>Default Registration Class (Optional)</span>
              </div>
              <select
                value={selectedInviteClass}
                onChange={(e) => setSelectedInviteClass(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#1e293b',
                  fontSize: '0.85rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="">All Classes (Generic Link)</option>
                {classes.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* URL Input Box */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div className="input-group">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="url-input"
                />
                <button
                  onClick={handleCopyLink}
                  className={`btn-action ${copied ? 'copied' : ''}`}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-icon"
                  title="Test Link"
                >
                  <ExternalLink size={16} />
                </a>
              </div>
            </div>
          </div>

          {/* Card 2: Standalone Download / Installation Guide */}
          <div className="portal-card">
            <h2 className="portal-title">
              <Smartphone size={18} color="#0d9488" /> Standalone App Download Guide
            </h2>

            <div className="guide-grid">
              
              {/* iOS Card */}
              <div className="guide-item">
                <h3 className="guide-item-title">
                  <Apple size={14} color="#475569" /> iOS (Safari)
                </h3>
                <ol className="guide-list">
                  <li>Open link in <strong>Safari</strong></li>
                  <li>Tap <strong>Share</strong> icon</li>
                  <li>Tap <strong>Add to Home Screen</strong></li>
                </ol>
              </div>

              {/* Android Card */}
              <div className="guide-item">
                <h3 className="guide-item-title">
                  <Smartphone size={14} color="#475569" /> Android (Chrome)
                </h3>
                <ol className="guide-list">
                  <li>Open link in <strong>Chrome</strong></li>
                  <li>Tap <strong>Menu (3 dots)</strong></li>
                  <li>Tap <strong>Install App</strong></li>
                </ol>
              </div>

              {/* Desktop Card */}
              <div className="guide-item guide-span-2">
                <h3 className="guide-item-title">
                  <Monitor size={14} color="#475569" /> Desktop (Chrome / Edge)
                </h3>
                <ul className="guide-list" style={{ listStyleType: 'disc' }}>
                  <li>Click <strong>Install App</strong> monitor icon on the address bar</li>
                </ul>
              </div>

            </div>
          </div>

        </div>

        {/* Right Column: QR Code */}
        <div className="portal-card qr-card">
          <h2 className="portal-title" style={{ marginBottom: '8px' }}>
            <QrCode size={18} color="#0d9488" /> Scan to Download
          </h2>
          
          <div className="qr-image-wrapper">
            <img 
              src={qrCodeUrl} 
              alt="Scan Student Portal QR" 
              className="qr-image"
            />
          </div>
          
          <span style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: '1.4' }}>
            Scan with phone camera to open and download the student portal.
          </span>
        </div>

      </div>

    </div>
  );
};

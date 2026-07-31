import React, { useState } from 'react';
import { Share2, Copy, ExternalLink, QrCode, Smartphone, Laptop, Check, Info } from 'lucide-react';
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
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
        borderRadius: '16px',
        padding: '32px',
        color: '#ffffff',
        marginBottom: '28px',
        boxShadow: '0 10px 25px -5px rgba(13, 148, 136, 0.15)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
          <Smartphone size={32} />
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Student Portal Gateway</h1>
        </div>
        <p style={{ margin: 0, fontSize: '0.98rem', color: '#ccfbf1', maxWidth: '680px', lineHeight: '1.5' }}>
          Distribute and share access to the dedicated standalone candidate app. Students can use this portal to view OMR reports, check schedules, print scoresheets, and practice online exams.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '28px', alignItems: 'start' }}>
        
        {/* Left Column: Link sharing & settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Card 1: Share Link Setup */}
          <div style={{
            background: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            padding: '24px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)'
          }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: '#1e293b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Share2 size={20} color="#0d9488" /> Generate Shareable Link
            </h2>

            {/* Optional Invite Class Selector */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>
                Pre-Select Class / Invitation Context (Optional)
              </label>
              <select
                value={selectedInviteClass}
                onChange={(e) => setSelectedInviteClass(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#1e293b',
                  fontSize: '0.9rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="">-- Generic Student Portal (All Classes) --</option>
                {classes.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginTop: '6px', lineHeight: '1.4' }}>
                Selecting a class generates a direct registration invite link. When students open this link, the registration screen will automatically target the selected class.
              </span>
            </div>

            {/* URL Input Box */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>
                Student Portal URL
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  style={{
                    flex: 1,
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#f1f5f9',
                    color: '#334155',
                    fontSize: '0.88rem',
                    fontFamily: 'monospace',
                    outline: 'none'
                  }}
                />
                <button
                  onClick={handleCopyLink}
                  style={{
                    padding: '0 18px',
                    borderRadius: '8px',
                    border: 'none',
                    background: copied ? '#059669' : '#0d9488',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s'
                  }}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '0 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                  title="Test Portal View"
                >
                  <ExternalLink size={18} />
                </a>
              </div>
            </div>
          </div>

          {/* Card 2: Standalone Download / Installation Guide */}
          <div style={{
            background: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            padding: '24px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)'
          }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: '#1e293b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Smartphone size={20} color="#0d9488" /> Separate App Installation Guide
            </h2>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.88rem', color: '#475569', lineHeight: '1.5' }}>
              The Student Portal runs as an independent Progressive Web App (PWA). Since it is optimized as a lightweight standalone web app, students do not need to visit an App Store. They can download it directly onto their device via their browser.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              
              {/* iOS Card */}
              <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '0.92rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  <Smartphone size={16} color="#0d9488" /> iOS (iPhone / iPad)
                </h3>
                <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem', color: '#475569', lineHeight: '1.6' }}>
                  <li>Open the shared portal link in <strong>Safari browser</strong>.</li>
                  <li>Tap the <strong>Share</strong> button (up-arrow box icon) in the bottom navigation bar.</li>
                  <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                  <li>Tap <strong>Add</strong> in the top right to download.</li>
                </ol>
              </div>

              {/* Android Card */}
              <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '0.92rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  <Smartphone size={16} color="#0d9488" /> Android Mobile
                </h3>
                <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem', color: '#475569', lineHeight: '1.6' }}>
                  <li>Open the shared portal link in <strong>Google Chrome</strong>.</li>
                  <li>Tap the <strong>three dots (menu)</strong> in the top-right corner.</li>
                  <li>Tap <strong>Install App</strong> or <strong>Add to Home screen</strong>.</li>
                  <li>Confirm the install prompt to download the standalone student icon.</li>
                </ol>
              </div>

              {/* Desktop Card */}
              <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9', gridColumn: 'span 2' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '0.92rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  <Laptop size={16} color="#0d9488" /> Desktop (Chrome / Edge)
                </h3>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem', color: '#475569', lineHeight: '1.6' }}>
                  <li>Open the link. Click the <strong>Install App</strong> monitor icon in the right side of the address bar.</li>
                  <li>Or open the browser menu and select <strong>Save and share &gt; Install page as app</strong> to download.</li>
                </ul>
              </div>

            </div>
          </div>

        </div>

        {/* Right Column: QR Code & Printable Flyer */}
        <div style={{
          background: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          padding: '24px',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center'
        }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#1e293b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <QrCode size={18} color="#0d9488" /> QR Code Share
          </h2>
          <p style={{ margin: '0 0 20px 0', fontSize: '0.78rem', color: '#64748b', lineHeight: '1.4' }}>
            Candidates can scan this code using their phone camera to instantly load and download the student portal app.
          </p>

          {/* QR Image Container */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '20px',
            display: 'inline-block'
          }}>
            <img 
              src={qrCodeUrl} 
              alt="Scan OMR Student Portal" 
              style={{ width: '180px', height: '180px', display: 'block' }}
            />
          </div>

          <div style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            textAlign: 'left'
          }}>
            <Info size={16} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span style={{ fontSize: '0.76rem', color: '#1e3a8a', lineHeight: '1.4' }}>
              <strong>Tip:</strong> Right-click the QR code image to copy, download, or insert it into student invitation newsletters.
            </span>
          </div>
        </div>

      </div>

    </div>
  );
};

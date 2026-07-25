import React, { useState } from 'react';
import { X, Copy, Check, Share2, Link, GraduationCap } from 'lucide-react';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

interface InviteStudentModalProps {
  onClose: () => void;
}

export const InviteStudentModal: React.FC<InviteStudentModalProps> = ({ onClose }) => {
  const classesList = useLiveQuery(() => db.classes.toArray(), []) || [];
  const [selectedClass, setSelectedClass] = useState(classesList[0]?.name || 'NEET-2026');
  const [copied, setCopied] = useState(false);

  const inviteUrl = `${window.location.origin}/?inviteClass=${encodeURIComponent(selectedClass)}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(
      `🎓 *Student Registration Request - Institute Apex*\n\nPlease click the link below to register your profile for class *${selectedClass}*:\n\n👉 ${inviteUrl}\n\n*Note:* After submitting, the Admin will approve your registration.`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="modal-content animate-scale-up" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', borderRadius: '16px' }}>
        
        {/* Modal Header */}
        <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '10px', background: '#eff6ff', color: '#2563eb' }}>
              <Link size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Create Student Invite Link</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Generate registration link for self-enrollment</p>
            </div>
          </div>
          <button className="btn-close-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Target Class Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
              SELECT TARGET CLASS FOR INVITATION
            </label>
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.9rem',
                fontWeight: 700,
                color: '#0f172a'
              }}
            >
              {classesList.map(c => (
                <option key={`inv-cls-${c.id}`} value={c.name}>{c.name}</option>
              ))}
              {!classesList.some(c => c.name === 'NEET-2026') && <option value="NEET-2026">NEET-2026</option>}
              {!classesList.some(c => c.name === 'JEE-2026') && <option value="JEE-2026">JEE-2026</option>}
            </select>
          </div>

          {/* Generated Link Field */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
              SHAREABLE INVITATION URL
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                readOnly
                value={inviteUrl}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #e2e8f0',
                  background: '#f8fafc',
                  fontSize: '0.85rem',
                  color: '#1e293b'
                }}
              />
              <button
                onClick={handleCopyLink}
                style={{
                  background: copied ? '#16a34a' : '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0 16px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease'
                }}
              >
                {copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy</>}
              </button>
            </div>
          </div>

          {/* Notice Banner */}
          <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '10px', padding: '12px', fontSize: '0.8rem', color: '#92400e', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <GraduationCap size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Admin Approval Requirement:</strong> When students register through this link, they will appear in your <strong>Pending Approvals</strong> queue. They will only be added to class <strong>{selectedClass}</strong> after you approve them.
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="modal-footer" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px', justifyContent: 'space-between' }}>
          <button
            onClick={handleWhatsAppShare}
            style={{
              background: '#16a34a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Share2 size={16} /> Share via WhatsApp
          </button>

          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>

      </div>
    </div>
  );
};

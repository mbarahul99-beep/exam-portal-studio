import React, { useState } from 'react';
import { X, Check, Trash2, UserCheck, Clock, CheckCheck } from 'lucide-react';
import { db, type PendingRegistration } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

interface PendingApprovalsModalProps {
  onClose: () => void;
}

export const PendingApprovalsModal: React.FC<PendingApprovalsModalProps> = ({ onClose }) => {
  const pendingList = useLiveQuery(
    () => db.pendingRegistrations.where('status').equals('pending').toArray(),
    []
  ) || [];

  const [processingId, setProcessingId] = useState<number | null>(null);

  const handleApprove = async (reg: PendingRegistration) => {
    setProcessingId(reg.id!);
    try {
      // 1. Add student to db.students roster
      await db.students.add({
        studentNum: reg.studentNum,
        name: reg.name,
        className: reg.className,
        email: reg.email,
        phone: reg.phone,
        whatsappNumber: reg.whatsappNumber
      });

      // 2. Mark pending status as approved
      await db.pendingRegistrations.update(reg.id!, { status: 'approved' });

      // 3. Try syncing to Hostinger MySQL
      try {
        await fetch('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentNum: reg.studentNum,
            name: reg.name,
            className: reg.className,
            email: reg.email,
            phone: reg.phone,
            whatsappNumber: reg.whatsappNumber
          })
        });
      } catch (err) {
        console.warn("MySQL sync optional fallback:", err);
      }

    } catch (err: any) {
      alert(`Approval error: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: number) => {
    if (!confirm("Are you sure you want to reject this registration request?")) return;
    try {
      await db.pendingRegistrations.update(id, { status: 'rejected' });
    } catch (err: any) {
      alert(`Rejection error: ${err.message}`);
    }
  };

  const handleApproveAll = async () => {
    if (pendingList.length === 0) return;
    if (!confirm(`Approve all ${pendingList.length} pending registrations?`)) return;

    for (const reg of pendingList) {
      await handleApprove(reg);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="modal-content animate-scale-up" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px', borderRadius: '16px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header */}
        <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '10px', background: '#fef3c7', color: '#d97706' }}>
              <Clock size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Pending Student Registrations</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Approve or reject student self-registration requests</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {pendingList.length > 0 && (
              <button
                onClick={handleApproveAll}
                style={{
                  background: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <CheckCheck size={14} /> Approve All ({pendingList.length})
              </button>
            )}
            <button className="btn-close-icon" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* List Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {pendingList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
              <UserCheck size={48} style={{ opacity: 0.4, marginBottom: '10px' }} />
              <h4 style={{ margin: '0 0 4px 0', color: '#334155' }}>No Pending Registrations</h4>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>All student registration requests have been processed.</p>
            </div>
          ) : (
            pendingList.map(reg => (
              <div
                key={`pending-reg-${reg.id}`}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>{reg.name}</span>
                    <span style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px' }}>
                      Class: {reg.className}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', gap: '12px' }}>
                    <span>Roll No: <strong>{reg.studentNum}</strong></span>
                    {reg.whatsappNumber && <span>📱 {reg.whatsappNumber}</span>}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleApprove(reg)}
                    disabled={processingId === reg.id}
                    style={{
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Check size={14} /> Approve
                  </button>

                  <button
                    onClick={() => handleReject(reg.id!)}
                    style={{
                      background: '#fef2f2',
                      color: '#dc2626',
                      border: '1px solid #fecaca',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Trash2 size={14} /> Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>

      </div>
    </div>
  );
};

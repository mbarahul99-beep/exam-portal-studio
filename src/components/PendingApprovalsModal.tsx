import React, { useState } from 'react';
import { Check, Trash2, UserCheck, CheckCheck, ArrowLeft } from 'lucide-react';
import { db, type PendingRegistration } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

interface PendingApprovalsModalProps {
  onClose: () => void;
}

export const PendingApprovalsModal: React.FC<PendingApprovalsModalProps> = ({ onClose }) => {
  const pendingList = useLiveQuery(async () => {
    try {
      if (!db.pendingRegistrations) return [];
      const list = await db.pendingRegistrations.where('status').equals('pending').toArray();
      return list || [];
    } catch {
      return [];
    }
  }, []) || [];

  const [processingId, setProcessingId] = useState<number | null>(null);

  const handleApprove = async (reg: PendingRegistration) => {
    if (!reg.id) return;
    setProcessingId(reg.id);
    try {
      // 1. Add student to db.students roster
      await db.students.add({
        studentNum: reg.studentNum,
        name: reg.name,
        fatherName: reg.fatherName,
        className: reg.className,
        email: reg.email,
        phone: reg.phone,
        whatsappNumber: reg.whatsappNumber
      });

      // 2. Mark pending status as approved
      await db.pendingRegistrations.update(reg.id, { status: 'approved' });

      // 3. Try syncing to Hostinger MySQL
      try {
        await fetch('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentNum: reg.studentNum,
            name: reg.name,
            fatherName: reg.fatherName,
            className: reg.className,
            email: reg.email,
            phone: reg.phone,
            whatsappNumber: reg.whatsappNumber
          })
        });

        // Delete the pending registration request from Hostinger MySQL server as it is approved
        await fetch(`/api/pending-registrations/${reg.id}`, {
          method: 'DELETE'
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
      await fetch(`/api/pending-registrations/${id}`, { method: 'DELETE' });
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
        justifyContent: 'space-between',
        alignItems: 'center',
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

          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              Pending Student Approvals
            </h2>
          </div>
        </div>

        {pendingList.length > 0 && (
          <button
            onClick={handleApproveAll}
            style={{
              background: '#16a34a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <CheckCheck size={16} /> Approve All ({pendingList.length})
          </button>
        )}
      </div>

      {/* Main Full-Screen Grid Body */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 32px',
        boxSizing: 'border-box'
      }}>
        {pendingList.length === 0 ? (
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '60px 20px',
            textAlign: 'center',
            maxWidth: '480px',
            margin: '40px auto',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            <UserCheck size={56} style={{ color: '#16a34a', marginBottom: '12px' }} />
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              All Registrations Processed!
            </h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>
              There are currently no pending student self-registration requests.
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px'
          }}>
            {pendingList.map(reg => (
              <div
                key={`pending-card-${reg.id}`}
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ margin: '0 0 2px 0', fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                      {reg.name}
                    </h4>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                      Roll No: <strong>{reg.studentNum}</strong>
                    </span>
                  </div>
                  <span style={{
                    background: '#e0f2fe',
                    color: '#0369a1',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: '8px'
                  }}>
                    {reg.className}
                  </span>
                </div>

                <div style={{ fontSize: '0.82rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px' }}>
                  {reg.whatsappNumber && <div>📱 <strong>Mobile:</strong> {reg.whatsappNumber}</div>}
                  {reg.email && <div style={{ wordBreak: 'break-all' }}>✉️ <strong>Email:</strong> {reg.email}</div>}
                  <div>📅 <strong>Submitted:</strong> {new Date(reg.createdAt).toLocaleDateString()}</div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button
                    onClick={() => handleApprove(reg)}
                    disabled={processingId === reg.id}
                    style={{
                      flex: 1,
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '10px',
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)'
                    }}
                  >
                    <Check size={16} /> Approve
                  </button>

                  <button
                    onClick={() => handleReject(reg.id!)}
                    style={{
                      background: '#fef2f2',
                      color: '#dc2626',
                      border: '1px solid #fecaca',
                      borderRadius: '10px',
                      padding: '10px 16px',
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Trash2 size={16} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '16px 32px',
        display: 'flex',
        justifyContent: 'flex-end'
      }}>
        <button
          onClick={onClose}
          style={{
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            padding: '12px 28px',
            fontSize: '0.95rem',
            fontWeight: 700,
            color: '#334155',
            cursor: 'pointer'
          }}
        >
          Close & Return to Dashboard
        </button>
      </div>

    </div>
  );
};

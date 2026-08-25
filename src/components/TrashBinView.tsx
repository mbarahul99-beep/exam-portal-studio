import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type TrashItem } from '../db';
import { 
  pullCloudUpdatesToIndexedDB,
  syncClassToCloud,
  syncExamToCloud,
  syncStudentToCloud,
  syncSubmissionToCloud
} from '../utils/cloudSync';
import {
  Trash2,
  RotateCcw,
  Users,
  FileText,
  User,
  Search,
  AlertCircle
} from 'lucide-react';

export const TrashBinView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState<number | null>(null);

  // Load items from IndexedDB sorted by deletion date descending
  const trashItems = useLiveQuery(() => db.trash.orderBy('deletedAt').reverse().toArray()) || [];

  const filteredItems = trashItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRestore = async (item: TrashItem) => {
    if (!item.id) return;
    setIsProcessing(item.id);
    try {
      const data = JSON.parse(item.data);

      if (item.type === 'class') {
        // 1. Remove from sync_deleted_classes queue in localStorage
        const deletedClasses: string[] = JSON.parse(localStorage.getItem('sync_deleted_classes') || '[]');
        const nextDeleted = deletedClasses.filter(name => name.toLowerCase() !== item.name.toLowerCase());
        localStorage.setItem('sync_deleted_classes', JSON.stringify(nextDeleted));

        // 2. Restore class entity
        try {
          await db.classes.add({
            ...data.classObj,
            syncState: 'pending' // Force sync back to cloud
          });
        } catch (e) {
          console.warn("Class restore warning:", e);
        }

        // 3. Restore exams
        if (data.exams && Array.isArray(data.exams)) {
          const deletedExams: number[] = JSON.parse(localStorage.getItem('sync_deleted_exams') || '[]');
          const examIds = data.exams.map((ex: any) => ex.id).filter(Boolean);
          const nextDeletedEx = deletedExams.filter(id => !examIds.includes(id));
          localStorage.setItem('sync_deleted_exams', JSON.stringify(nextDeletedEx));

          for (const ex of data.exams) {
            try {
              await db.exams.add({
                ...ex,
                syncState: 'pending'
              });
            } catch {}
          }
        }

        // 4. Restore questions
        if (data.questions && Array.isArray(data.questions)) {
          for (const q of data.questions) {
            try {
              await db.questions.add({
                ...q,
                syncState: 'pending'
              });
            } catch {}
          }
        }

        // 5. Restore students
        if (data.students && Array.isArray(data.students)) {
          const deletedStudents: number[] = JSON.parse(localStorage.getItem('sync_deleted_students') || '[]');
          const studentIds = data.students.map((s: any) => s.id).filter(Boolean);
          const nextDeletedSt = deletedStudents.filter(id => !studentIds.includes(id));
          localStorage.setItem('sync_deleted_students', JSON.stringify(nextDeletedSt));

          for (const s of data.students) {
            try {
              await db.students.add({
                ...s,
                syncState: 'pending'
              });
            } catch {}
          }
        }

        // 6. Restore submissions
        if (data.submissions && Array.isArray(data.submissions)) {
          const deletedSubs: number[] = JSON.parse(localStorage.getItem('sync_deleted_submissions') || '[]');
          const subIds = data.submissions.map((sub: any) => sub.id).filter(Boolean);
          const nextDeletedSu = deletedSubs.filter(id => !subIds.includes(id));
          localStorage.setItem('sync_deleted_submissions', JSON.stringify(nextDeletedSu));

          for (const sub of data.submissions) {
            try {
              await db.submissions.add({
                ...sub,
                syncState: 'pending'
              });
            } catch {}
          }
        }

        // PUSH RESTORED DATA TO CLOUD IMMEDIATELY!
        try {
          // 1. Push class
          await syncClassToCloud(data.classObj);
          
          // 2. Push exams
          if (data.exams && Array.isArray(data.exams)) {
            for (const ex of data.exams) {
              await syncExamToCloud(ex);
            }
          }

          // 3. Push questions
          if (data.questions && Array.isArray(data.questions)) {
            const questionsByExam: Record<number, any[]> = {};
            for (const q of data.questions) {
              if (!questionsByExam[q.examId]) questionsByExam[q.examId] = [];
              const { syncState, ...qFields } = q;
              questionsByExam[q.examId].push(qFields);
            }

            for (const examIdStr of Object.keys(questionsByExam)) {
              const examId = Number(examIdStr);
              const qRes = await fetch('/api/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ examId, questions: questionsByExam[examId] })
              });
              if (qRes.ok) {
                const qIds = data.questions.filter((q: any) => q.examId === examId && q.id).map((q: any) => q.id);
                if (qIds.length > 0) {
                  await db.questions.where('id').anyOf(qIds).modify({ syncState: 'synced' });
                }
              }
            }
          }

          // 4. Push students
          if (data.students && Array.isArray(data.students)) {
            for (const s of data.students) {
              await syncStudentToCloud(s);
            }
          }

          // 5. Push submissions
          if (data.submissions && Array.isArray(data.submissions)) {
            for (const sub of data.submissions) {
              await syncSubmissionToCloud(sub);
            }
          }
        } catch (pushErr) {
          console.warn("Failed to push restored class data to cloud:", pushErr);
        }

      } else if (item.type === 'exam') {
        // 1. Remove from sync_deleted_exams
        const deletedExams: number[] = JSON.parse(localStorage.getItem('sync_deleted_exams') || '[]');
        const nextDeletedEx = deletedExams.filter(id => Number(id) !== Number(item.originalId));
        localStorage.setItem('sync_deleted_exams', JSON.stringify(nextDeletedEx));

        // 2. Restore exam entity
        try {
          await db.exams.add({
            ...data.examObj,
            syncState: 'pending'
          });
        } catch {}

        // 3. Restore questions
        if (data.questions && Array.isArray(data.questions)) {
          for (const q of data.questions) {
            try {
              await db.questions.add({
                ...q,
                syncState: 'pending'
              });
            } catch {}
          }
        }

        // 4. Restore submissions
        if (data.submissions && Array.isArray(data.submissions)) {
          const deletedSubs: number[] = JSON.parse(localStorage.getItem('sync_deleted_submissions') || '[]');
          const subIds = data.submissions.map((sub: any) => sub.id).filter(Boolean);
          const nextDeletedSu = deletedSubs.filter(id => !subIds.includes(id));
          localStorage.setItem('sync_deleted_submissions', JSON.stringify(nextDeletedSu));

          for (const sub of data.submissions) {
            try {
              await db.submissions.add({
                ...sub,
                syncState: 'pending'
              });
            } catch {}
          }
        }

        // PUSH RESTORED DATA TO CLOUD IMMEDIATELY!
        try {
          // 1. Push exam
          await syncExamToCloud(data.examObj);

          // 2. Push questions
          if (data.questions && Array.isArray(data.questions)) {
            const cleanQs = data.questions.map(({ syncState, ...qFields }: any) => qFields);
            const qRes = await fetch('/api/questions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ examId: data.examObj.id, questions: cleanQs })
            });
            if (qRes.ok) {
              const qIds = data.questions.map((q: any) => q.id).filter(Boolean);
              if (qIds.length > 0) {
                await db.questions.where('id').anyOf(qIds).modify({ syncState: 'synced' });
              }
            }
          }

          // 3. Push submissions
          if (data.submissions && Array.isArray(data.submissions)) {
            for (const sub of data.submissions) {
              await syncSubmissionToCloud(sub);
            }
          }
        } catch (pushErr) {
          console.warn("Failed to push restored exam data to cloud:", pushErr);
        }

      } else if (item.type === 'student') {
        // 1. Remove from sync_deleted_students
        const deletedStudents: number[] = JSON.parse(localStorage.getItem('sync_deleted_students') || '[]');
        const nextDeletedSt = deletedStudents.filter(id => Number(id) !== Number(item.originalId));
        localStorage.setItem('sync_deleted_students', JSON.stringify(nextDeletedSt));

        // 2. Restore student entity
        try {
          await db.students.add({
            ...data.studentObj,
            syncState: 'pending'
          });
        } catch {}

        // 3. Restore submissions
        if (data.submissions && Array.isArray(data.submissions)) {
          const deletedSubs: number[] = JSON.parse(localStorage.getItem('sync_deleted_submissions') || '[]');
          const subIds = data.submissions.map((sub: any) => sub.id).filter(Boolean);
          const nextDeletedSu = deletedSubs.filter(id => !subIds.includes(id));
          localStorage.setItem('sync_deleted_submissions', JSON.stringify(nextDeletedSu));

          for (const sub of data.submissions) {
            try {
              await db.submissions.add({
                ...sub,
                syncState: 'pending'
              });
            } catch {}
          }
        }

        // PUSH RESTORED DATA TO CLOUD IMMEDIATELY!
        try {
          // 1. Push student
          await syncStudentToCloud(data.studentObj);

          // 2. Push submissions
          if (data.submissions && Array.isArray(data.submissions)) {
            for (const sub of data.submissions) {
              await syncSubmissionToCloud(sub);
            }
          }
        } catch (pushErr) {
          console.warn("Failed to push restored student data to cloud:", pushErr);
        }
      }

      // Delete from trash
      await db.trash.delete(item.id);
      
      // Trigger cloud push sync to restore on server
      pullCloudUpdatesToIndexedDB();

      const toast = document.createElement('div');
      toast.innerText = `"${item.name}" successfully restored!`;
      toast.style.position = 'fixed';
      toast.style.bottom = '24px';
      toast.style.right = '24px';
      toast.style.background = '#059669';
      toast.style.color = '#fff';
      toast.style.padding = '12px 24px';
      toast.style.borderRadius = '8px';
      toast.style.zIndex = '9999';
      toast.style.fontFamily = 'sans-serif';
      toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    } catch (err: any) {
      alert(`Failed to restore item: ${err.message}`);
    } finally {
      setIsProcessing(null);
    }
  };

  const handlePermanentDelete = async (item: TrashItem) => {
    if (!item.id) return;
    if (confirm(`Are you sure you want to permanently delete "${item.name}"? This action cannot be undone.`)) {
      try {
        await db.trash.delete(item.id);
      } catch (err: any) {
        alert(`Failed to delete item: ${err.message}`);
      }
    }
  };

  const handleEmptyTrash = async () => {
    if (trashItems.length === 0) return;
    if (confirm("Are you sure you want to permanently delete all items in the Trash Bin? This action is irreversible.")) {
      try {
        await db.trash.clear();
      } catch (err: any) {
        alert(`Failed to empty trash: ${err.message}`);
      }
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'class':
        return <Users size={18} color="#64748b" />;
      case 'exam':
        return <FileText size={18} color="#64748b" />;
      case 'student':
        return <User size={18} color="#64748b" />;
      default:
        return <AlertCircle size={18} color="#64748b" />;
    }
  };

  return (
    <div className="trash-bin-portal animate-fade-in" style={{ padding: '16px', paddingBottom: '90px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`
        .trash-header-banner {
          background: #ffffff;
          padding: 16px 20px;
          border-radius: 14px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 2px 10px rgba(0,0,0,0.03);
          margin-bottom: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
        }
        .trash-list-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
          overflow: hidden;
        }
        .trash-search-wrapper {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 8px 12px;
          flex: 1;
          max-width: 400px;
        }
        .trash-search-input {
          border: none;
          background: transparent;
          outline: none;
          font-size: 0.88rem;
          width: 100%;
          font-weight: 500;
          color: #0f172a;
        }
        .trash-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        .trash-table th {
          background: #f8fafc;
          padding: 12px 16px;
          font-size: 0.78rem;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid #e2e8f0;
        }
        .trash-table td {
          padding: 14px 16px;
          font-size: 0.88rem;
          color: #334155;
          border-bottom: 1px solid #f1f5f9;
        }
        .trash-item-row:hover {
          background: #f8fafc;
        }
        .btn-action-restore {
          background: #ecfdf5;
          color: #059669;
          border: 1px solid #a7f3d0;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: all 0.2s;
        }
        .btn-action-restore:hover:not(:disabled) {
          background: #d1fae5;
          border-color: #34d399;
        }
        .btn-action-delete {
          background: #fef2f2;
          color: #dc2626;
          border: 1px solid #fca5a5;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: all 0.2s;
        }
        .btn-action-delete:hover:not(:disabled) {
          background: #fee2e2;
          border-color: #f87171;
        }
        .badge-type {
          display: inline-flex;
          padding: 2px 8px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: capitalize;
        }
        .badge-type.class { background: #e0f2fe; color: #0369a1; }
        .badge-type.exam { background: #e0e7ff; color: #4338ca; }
        .badge-type.student { background: #f3e8ff; color: #6b21a8; }
        
        @media (max-width: 640px) {
          .trash-header-banner {
            flex-direction: column;
            align-items: stretch;
            text-align: center;
          }
          .trash-header-buttons {
            display: flex;
            gap: 10px;
          }
          .trash-header-buttons button {
            flex: 1;
            justify-content: center;
          }
        }
      `}</style>

      {/* Header Banner */}
      <div className="trash-header-banner">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trash2 size={22} color="#dc2626" />
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              Trash Bin (Soft Deletes)
            </h2>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
            View, restore, or permanently delete soft-deleted Classes, Exams, and Students.
          </p>
        </div>

        <div className="trash-header-buttons">
          <button
            type="button"
            disabled={trashItems.length === 0}
            onClick={handleEmptyTrash}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #fca5a5',
              background: trashItems.length === 0 ? '#f8fafc' : '#fef2f2',
              color: trashItems.length === 0 ? '#94a3b8' : '#dc2626',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: trashItems.length === 0 ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: trashItems.length === 0 ? 0.6 : 1
            }}
          >
            <Trash2 size={15} /> Empty Trash
          </button>
        </div>
      </div>

      {/* Search Bar & Stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div className="trash-search-wrapper">
          <Search size={16} color="#64748b" />
          <input
            type="text"
            className="trash-search-input"
            placeholder="Search deleted items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
          Total Items: {trashItems.length}
        </div>
      </div>

      {/* List Card */}
      <div className="trash-list-card">
        {filteredItems.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
            <Trash2 size={40} color="#cbd5e1" style={{ marginBottom: '12px' }} />
            <p style={{ margin: 0, fontSize: '0.92rem', fontWeight: 600 }}>Trash Bin is empty.</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>Deleted classes, exams, and students will appear here.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="trash-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Item Name</th>
                  <th>Type</th>
                  <th>Date Deleted</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => (
                  <tr key={`trash-row-${item.id}`} className="trash-item-row">
                    <td>{getTypeIcon(item.type)}</td>
                    <td>
                      <strong style={{ color: '#0f172a' }}>{item.name}</strong>
                    </td>
                    <td>
                      <span className={`badge-type ${item.type}`}>
                        {item.type}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {new Date(item.deletedAt).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button
                          className="btn-action-restore"
                          disabled={isProcessing !== null}
                          onClick={() => handleRestore(item)}
                        >
                          <RotateCcw size={13} /> Restore
                        </button>
                        <button
                          className="btn-action-delete"
                          disabled={isProcessing !== null}
                          onClick={() => handlePermanentDelete(item)}
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

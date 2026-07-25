import React, { useState } from 'react';
import { X, UserPlus, Trash2, Edit2, Key, Check, Shield, Search, MoreVertical, Phone, Mail } from 'lucide-react';
import { db, type Teacher } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

interface TeacherManagementModalProps {
  onClose: () => void;
}

export const TeacherManagementModal: React.FC<TeacherManagementModalProps> = ({ onClose }) => {
  const teachers = useLiveQuery(() => db.teachers.toArray()) || [];

  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const [editingTeacherId, setEditingTeacherId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeMenuTeacherId, setActiveMenuTeacherId] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim() || !password.trim() || !name.trim()) {
      alert("User ID, Password, and Full Name are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Check if User ID is unique when adding new teacher
      const exists = await db.teachers.where('userId').equals(userId.trim()).first();
      if (exists && exists.id !== editingTeacherId) {
        alert(`Teacher User ID "${userId}" is already taken.`);
        setIsSubmitting(false);
        return;
      }

      let savedId = editingTeacherId;
      if (editingTeacherId) {
        await db.teachers.update(editingTeacherId, {
          userId: userId.trim(),
          password: password.trim(),
          name: name.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined
        });
      } else {
        savedId = await db.teachers.add({
          userId: userId.trim(),
          password: password.trim(),
          name: name.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          createdAt: new Date()
        });
      }

      // Sync with Hostinger MySQL
      try {
        await fetch('/api/teachers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: savedId,
            userId: userId.trim(),
            password: password.trim(),
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim()
          })
        });
      } catch (err) {
        console.warn("MySQL teacher sync warning:", err);
      }

      setEditingTeacherId(null);
      setUserId('');
      setPassword('');
      setName('');
      setPhone('');
      setEmail('');
      alert(editingTeacherId ? "Teacher details updated!" : "Teacher account created successfully!");
    } catch (err: any) {
      alert(`Error saving teacher: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (t: Teacher) => {
    setEditingTeacherId(t.id!);
    setUserId(t.userId);
    setPassword(t.password);
    setName(t.name);
    setPhone(t.phone || '');
    setEmail(t.email || '');
    setActiveMenuTeacherId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (t: Teacher) => {
    setActiveMenuTeacherId(null);
    if (confirm(`Are you sure you want to delete teacher "${t.name}" (${t.userId})?`)) {
      try {
        await db.teachers.delete(t.id!);
        await fetch(`/api/teachers/${t.id!}`, { method: 'DELETE' });
      } catch (err: any) {
        alert(`Failed to delete teacher: ${err.message}`);
      }
    }
  };

  const filteredTeachers = teachers.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.userId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1100, padding: 0 }}>
      <style>{`
        .teacher-modal-container {
          max-width: 850px;
          width: 95%;
          max-height: 90vh;
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.2);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-sizing: border-box;
        }

        .teacher-form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
        }

        .teacher-desktop-table {
          display: table;
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
        }

        .teacher-mobile-cards {
          display: none;
          flex-direction: column;
          gap: 12px;
        }

        @media (max-width: 640px) {
          .teacher-modal-container {
            width: 100% !important;
            height: 100% !important;
            max-height: 100dvh !important;
            border-radius: 0 !important;
          }
          
          .teacher-form-grid {
            grid-template-columns: 1fr !important;
          }

          .teacher-desktop-table {
            display: none !important;
          }

          .teacher-mobile-cards {
            display: flex !important;
          }

          .teacher-modal-body {
            padding: 16px !important;
          }
        }
      `}</style>

      <div 
        className="teacher-modal-container animate-scale-up" 
        onClick={(e) => e.stopPropagation()} 
      >
        {/* Header */}
        <header style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={24} color="#2563eb" />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                Teacher Accounts Management
              </h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                Register teachers and manage access credentials
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '6px' }}
          >
            <X size={22} color="#64748b" />
          </button>
        </header>

        {/* Content Body */}
        <div className="teacher-modal-body" style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Create / Edit Form Card */}
          <div style={{ background: '#f1f5f9', borderRadius: '12px', padding: '18px', border: '1px solid #cbd5e1' }}>
            <h4 style={{ margin: '0 0 14px 0', fontSize: '1rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserPlus size={18} color="#2563eb" />
              {editingTeacherId ? 'Edit Teacher Credentials' : 'Register New Teacher'}
            </h4>

            <form onSubmit={handleSubmit} className="teacher-form-grid">
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>USER ID *</label>
                <input 
                  type="text" 
                  required
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="e.g. teacher_sharma"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none', background: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>PASSWORD *</label>
                <input 
                  type="text" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter login password"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none', background: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>FULL NAME *</label>
                <input 
                  type="text" 
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Prof. R. K. Sharma"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none', background: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>PHONE NO (OPTIONAL)</label>
                <input 
                  type="tel" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none', background: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>EMAIL ID (OPTIONAL)</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. sharma@apex.in"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none', background: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  style={{ 
                    flex: 1, 
                    padding: '12px', 
                    borderRadius: '8px', 
                    background: '#2563eb', 
                    color: '#ffffff', 
                    border: 'none', 
                    fontWeight: 700, 
                    fontSize: '16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Check size={18} /> {editingTeacherId ? 'Update Credentials' : 'Add Teacher'}
                </button>

                {editingTeacherId && (
                  <button 
                    type="button"
                    onClick={() => {
                      setEditingTeacherId(null);
                      setUserId('');
                      setPassword('');
                      setName('');
                      setPhone('');
                      setEmail('');
                    }}
                    style={{ padding: '12px 16px', borderRadius: '8px', background: '#e2e8f0', color: '#475569', border: 'none', fontWeight: 700, fontSize: '16px', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Teacher Roster Listing Header */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                Registered Teachers ({teachers.length})
              </h4>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f1f5f9', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', flex: '1 1 200px', maxWidth: '300px' }}>
                <Search size={16} color="#64748b" />
                <input 
                  type="text" 
                  placeholder="Search teachers..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '16px', width: '100%' }}
                />
              </div>
            </div>

            {filteredTeachers.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', color: '#64748b', fontSize: '0.9rem' }}>
                No teachers registered yet. Use the form above to create teacher credentials.
              </div>
            ) : (
              <>
                {/* Desktop View Table */}
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                  <table className="teacher-desktop-table">
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569', fontWeight: 700 }}>
                        <th style={{ padding: '12px 16px' }}>Teacher Name</th>
                        <th style={{ padding: '12px 16px' }}>User ID</th>
                        <th style={{ padding: '12px 16px' }}>Password</th>
                        <th style={{ padding: '12px 16px' }}>Contact</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTeachers.map(t => (
                        <tr key={`t-row-${t.id}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a' }}>{t.name}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <code style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                              {t.userId}
                            </code>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#475569' }}>
                              <Key size={14} color="#64748b" /> {t.password}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '0.85rem' }}>
                            {t.phone || t.email ? (
                              <div>
                                {t.phone && <div>📞 {t.phone}</div>}
                                {t.email && <div>✉️ {t.email}</div>}
                              </div>
                            ) : '-'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button 
                              onClick={() => handleEdit(t)}
                              title="Edit Credentials"
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#2563eb', marginRight: '12px' }}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => handleDelete(t)}
                              title="Delete Teacher"
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#dc2626' }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View Cards List (Matching Students List UI) */}
                <div className="teacher-mobile-cards">
                  {filteredTeachers.map(t => {
                    const initial = t.name ? t.name.charAt(0).toUpperCase() : 'T';
                    const isMenuOpen = activeMenuTeacherId === t.id;

                    return (
                      <div 
                        key={`m-tcard-${t.id}`}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          padding: '16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                          position: 'relative'
                        }}
                      >
                        {/* Tapping anywhere on the card opens edit mode */}
                        <div 
                          onClick={() => handleEdit(t)}
                          style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, cursor: 'pointer' }}
                        >
                          {/* Circular Initial Avatar */}
                          <div style={{
                            width: '46px',
                            height: '46px',
                            borderRadius: '50%',
                            background: '#eff6ff',
                            color: '#2563eb',
                            fontSize: '1.2rem',
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            border: '1px solid #bfdbfe'
                          }}>
                            {initial}
                          </div>

                          {/* Details Column */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                              {t.name}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <code style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                                ID: {t.userId}
                              </code>
                              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Key size={12} color="#64748b" /> {t.password}
                              </span>
                            </div>

                            {(t.phone || t.email) && (
                              <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '2px' }}>
                                {t.phone && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={12} /> {t.phone}</span>}
                                {t.email && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={12} /> {t.email}</span>}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Three Dots Menu Button */}
                        <div style={{ position: 'relative', marginLeft: '8px' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuTeacherId(isMenuOpen ? null : t.id!);
                            }}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex' }}
                          >
                            <MoreVertical size={20} color="#2563eb" />
                          </button>

                          {/* Action Dropdown Menu */}
                          {isMenuOpen && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                position: 'absolute',
                                right: 0,
                                top: '32px',
                                background: '#ffffff',
                                borderRadius: '10px',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                                border: '1px solid #e2e8f0',
                                zIndex: 999,
                                minWidth: '150px',
                                overflow: 'hidden',
                                padding: '4px 0'
                              }}
                            >
                              <button
                                onClick={() => handleEdit(t)}
                                style={{
                                  width: '100%',
                                  padding: '10px 14px',
                                  textAlign: 'left',
                                  background: 'transparent',
                                  border: 'none',
                                  fontSize: '0.85rem',
                                  fontWeight: 600,
                                  color: '#2563eb',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px'
                                }}
                              >
                                <Edit2 size={16} /> Edit Credentials
                              </button>
                              <button
                                onClick={() => handleDelete(t)}
                                style={{
                                  width: '100%',
                                  padding: '10px 14px',
                                  textAlign: 'left',
                                  background: 'transparent',
                                  border: 'none',
                                  fontSize: '0.85rem',
                                  fontWeight: 600,
                                  color: '#dc2626',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  borderTop: '1px solid #f1f5f9'
                                }}
                              >
                                <Trash2 size={16} /> Delete Account
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

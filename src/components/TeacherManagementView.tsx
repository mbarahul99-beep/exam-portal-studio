import React, { useState } from 'react';
import { X, Trash2, Edit2, Key, Check, Shield, Search, MoreVertical, Phone, FileSpreadsheet } from 'lucide-react';
import { db, type Teacher } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

export const TeacherManagementView: React.FC = () => {
  const teachers = useLiveQuery(() => db.teachers.toArray()) || [];

  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [editingTeacherId, setEditingTeacherId] = useState<number | null>(null);

  // Drawer Form States
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeMenuTeacherId, setActiveMenuTeacherId] = useState<number | null>(null);

  const handleOpenAddDrawer = () => {
    setEditingTeacherId(null);
    setUserId('');
    setPassword('');
    setName('');
    setPhone('');
    setEmail('');
    setShowAddDrawer(true);
  };

  const handleEdit = (t: Teacher) => {
    setEditingTeacherId(t.id!);
    setUserId(t.userId);
    setPassword(t.password);
    setName(t.name);
    setPhone(t.phone || '');
    setEmail(t.email || '');
    setActiveMenuTeacherId(null);
    setShowAddDrawer(true);
  };

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
      setShowAddDrawer(false);
      alert(editingTeacherId ? "Teacher details updated!" : "Teacher registered successfully!");
    } catch (err: any) {
      alert(`Error saving teacher: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
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
    <div className="tab-pane animate-fade-in" style={{ padding: '0', background: '#ffffff', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ background: '#ffffff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Top Header Bar matching Students/Classes screen */}
        <div style={{
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #f1f5f9',
          background: '#ffffff'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
              Teachers
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Registered Teachers ({teachers.length})
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={() => {
                if (teachers.length === 0) return alert('No teachers to export.');
                const csvRows = ['User ID,Password,Name,Phone,Email'];
                teachers.forEach(t => {
                  csvRows.push(`"${t.userId}","${t.password}","${t.name}","${t.phone || ''}","${t.email || ''}"`);
                });
                const blob = new Blob([csvRows.join('\n')], { type: 'type/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `teachers_list_${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
              title="Export Teachers CSV"
            >
              <FileSpreadsheet size={22} color="#2563eb" />
            </button>

            <button
              onClick={handleOpenAddDrawer}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#2563eb',
                fontSize: '1.05rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              + Add Teacher
            </button>
          </div>
        </div>

        {/* Search Bar Row */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', background: '#ffffff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <Search size={18} color="#64748b" />
            <input 
              type="text" 
              placeholder="Search by teacher name or user id..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '16px', width: '100%', color: '#0f172a' }}
            />
          </div>
        </div>

        {/* Teachers List View (All-White Background) */}
        <div style={{ flex: 1, background: '#ffffff' }}>
          {filteredTeachers.length === 0 ? (
            <div style={{ padding: '80px 20px', textAlign: 'center', color: '#64748b' }}>
              <Shield size={42} color="#94a3b8" style={{ marginBottom: '12px' }} />
              <p style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 600 }}>No teachers found.</p>
              <button
                onClick={handleOpenAddDrawer}
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 20px',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                + Add Teacher
              </button>
            </div>
          ) : (
            filteredTeachers.map(t => {
              const initial = t.name ? t.name.trim().charAt(0).toUpperCase() : 'T';
              const isMenuOpen = activeMenuTeacherId === t.id;

              return (
                <div
                  key={`teacher-item-${t.id}`}
                  style={{
                    padding: '14px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #f1f5f9',
                    background: '#ffffff',
                    position: 'relative'
                  }}
                >
                  {/* Tapping anywhere on teacher card opens profile/edit drawer */}
                  <div
                    onClick={() => handleEdit(t)}
                    style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, cursor: 'pointer' }}
                  >
                    {/* Blue Initial Avatar */}
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      background: '#e0f2fe',
                      color: '#0284c7',
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {initial}
                    </div>

                    {/* Teacher Details */}
                    <div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '2px' }}>
                        {t.name}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.85rem', color: '#475569', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <code style={{ background: '#f1f5f9', color: '#0284c7', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', fontWeight: 700 }}>
                            {t.userId}
                          </code>
                        </div>

                        <div style={{ width: '1px', height: '12px', background: '#cbd5e1' }} />

                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Key size={14} color="#64748b" />
                          <span>{t.password}</span>
                        </div>

                        {t.phone && (
                          <>
                            <div style={{ width: '1px', height: '12px', background: '#cbd5e1' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Phone size={14} color="#64748b" />
                              <span>{t.phone}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Action Menu Button */}
                  <div style={{ position: 'relative', marginLeft: '12px' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuTeacherId(isMenuOpen ? null : t.id!);
                      }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}
                    >
                      <MoreVertical size={20} color="#2563eb" />
                    </button>

                    {/* Popover Action Menu */}
                    {isMenuOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: '28px',
                          background: '#ffffff',
                          borderRadius: '10px',
                          boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                          border: '1px solid #e2e8f0',
                          zIndex: 999,
                          minWidth: '160px',
                          overflow: 'hidden',
                          padding: '4px 0'
                        }}
                      >
                        <button
                          onClick={() => handleEdit(t)}
                          style={{
                            width: '100%',
                            padding: '10px 16px',
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
                          <Edit2 size={16} /> Edit Details
                        </button>

                        <button
                          onClick={() => handleDelete(t)}
                          style={{
                            width: '100%',
                            padding: '10px 16px',
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
                          <Trash2 size={16} /> Delete Teacher
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Slide-out Drawer for Add/Edit Teacher (Matching Add Student Drawer) */}
      {showAddDrawer && (
        <div 
          onClick={() => setShowAddDrawer(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(4px)',
            zIndex: 1100,
            display: 'flex',
            justifyContent: 'flex-end'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '450px',
              height: '100%',
              background: '#ffffff',
              boxShadow: '-10px 0 30px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              animation: 'slideLeft 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {/* Drawer Header */}
            <div style={{
              padding: '20px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                  {editingTeacherId ? 'Edit Teacher Credentials' : 'Add New Teacher'}
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Assign User ID & Password for portal login
                </span>
              </div>

              <button
                onClick={() => setShowAddDrawer(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}
              >
                <X size={22} color="#64748b" />
              </button>
            </div>

            {/* Drawer Form Body */}
            <form onSubmit={handleSubmit} style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>USER ID *</label>
                <input 
                  type="text" 
                  required
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="e.g. teacher_sharma"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>PORTAL PASSWORD *</label>
                <input 
                  type="text" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter login password"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>TEACHER FULL NAME *</label>
                <input 
                  type="text" 
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Prof. R. K. Sharma"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>MOBILE PHONE NUMBER (OPTIONAL)</label>
                <input 
                  type="tel" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>EMAIL ADDRESS (OPTIONAL)</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. sharma@apex.in"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginTop: 'auto', paddingTop: '16px', display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddDrawer(false)}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', background: '#f1f5f9', color: '#475569', border: 'none', fontWeight: 700, fontSize: '16px', cursor: 'pointer' }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{ flex: 2, padding: '12px', borderRadius: '8px', background: '#2563eb', color: '#ffffff', border: 'none', fontWeight: 700, fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <Check size={18} /> {editingTeacherId ? 'Update Credentials' : 'Save Teacher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

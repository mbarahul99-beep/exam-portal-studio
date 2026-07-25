import React, { useState, useEffect } from 'react';
import { X, User, Key, Check } from 'lucide-react';
import { db, type Teacher } from '../db';

interface TeacherProfileModalProps {
  teacherId: number;
  onClose: () => void;
}

export const TeacherProfileModal: React.FC<TeacherProfileModalProps> = ({ teacherId, onClose }) => {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadTeacher = async () => {
      const t = await db.teachers.get(teacherId);
      if (t) {
        setTeacher(t);
        setName(t.name);
        setPhone(t.phone || '');
        setEmail(t.email || '');
      }
    };
    loadTeacher();
  }, [teacherId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacher) return;

    if (!name.trim()) {
      alert("Full Name cannot be blank.");
      return;
    }

    let updatedPassword = teacher.password;
    if (newPassword.trim()) {
      if (currentPassword !== teacher.password) {
        alert("Current password verification failed. Please enter your correct current password.");
        return;
      }
      if (newPassword.trim().length < 4) {
        alert("New password must be at least 4 characters.");
        return;
      }
      if (newPassword !== confirmPassword) {
        alert("New password and confirm password do not match.");
        return;
      }
      updatedPassword = newPassword.trim();
    }

    setIsSubmitting(true);
    try {
      await db.teachers.update(teacherId, {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        password: updatedPassword
      });

      // Sync to Hostinger MySQL
      try {
        await fetch('/api/teachers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: teacherId,
            userId: teacher.userId,
            password: updatedPassword,
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim()
          })
        });
      } catch (err) {
        console.warn("Server sync warning:", err);
      }

      alert("Profile details updated successfully!");
      onClose();
    } catch (err: any) {
      alert(`Failed to update profile: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!teacher) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div 
        className="modal-content animate-scale-up" 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          maxWidth: '480px', 
          width: '95%', 
          background: '#ffffff', 
          borderRadius: '16px', 
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          padding: '24px',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <User size={24} color="#2563eb" />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                My Teacher Profile
              </h3>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>User ID: <strong style={{ color: '#2563eb' }}>{teacher.userId}</strong></span>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px' }}>
            <X size={20} color="#64748b" />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>FULL NAME *</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>PHONE NUMBER</label>
            <input 
              type="tel" 
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Enter mobile phone number"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>EMAIL ADDRESS</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email address"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', boxSizing: 'border-box' }}
            />
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '8px 0' }} />

          <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Key size={16} color="#64748b" /> Change Password (Optional)
          </h4>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>CURRENT PASSWORD</label>
            <input 
              type="password" 
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Required to change password"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>NEW PASSWORD</label>
              <input 
                type="password" 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>CONFIRM NEW PASSWORD</label>
              <input 
                type="password" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 20px', borderRadius: '8px', background: '#e2e8f0', color: '#475569', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={isSubmitting} style={{ padding: '10px 24px', borderRadius: '8px', background: '#2563eb', color: '#ffffff', border: 'none', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Check size={16} /> Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

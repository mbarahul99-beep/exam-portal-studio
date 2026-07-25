import React, { useState } from 'react';
import { Shield, Users, Lock, Sparkles, BookOpen } from 'lucide-react';
import { db } from '../db';
import { pullCloudUpdatesToIndexedDB } from '../utils/cloudSync';

interface UnifiedLoginPortalProps {
  onLoginSuccess: (role: 'admin' | 'teacher' | 'student', studentId?: number, teacherId?: number) => void;
  onRegisterClick?: () => void;
}

export const UnifiedLoginPortal: React.FC<UnifiedLoginPortalProps> = ({ onLoginSuccess, onRegisterClick }) => {
  const [activeTab, setActiveTab] = useState<'student' | 'admin' | 'teacher'>('student');

  // Student form states
  const [rollNo, setRollNo] = useState('');
  const [phone, setPhone] = useState('');

  // Admin / Teacher form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rollNo.trim() || !phone.trim()) {
      alert('Please fill in both fields.');
      return;
    }

    setLoading(true);
    try {
      let matched = await db.students.where('studentNum').equals(rollNo.trim()).first();

      // Dynamic demo fallback seeder
      if (!matched && rollNo.trim() === '1000000001' && phone.trim() === '9876543210') {
        await db.students.add({
          studentNum: '1000000001',
          name: 'Aarav Sharma',
          className: 'NEET',
          phone: '9876543210',
          email: 'aarav@appexjind.in'
        });
        matched = await db.students.where('studentNum').equals('1000000001').first();
      } else if (!matched && rollNo.trim() === '1000000002' && phone.trim() === '9876543211') {
        await db.students.add({
          studentNum: '1000000002',
          name: 'Diya Patel',
          className: 'NEET',
          phone: '9876543211',
          email: 'diya@appexjind.in'
        });
        matched = await db.students.where('studentNum').equals('1000000002').first();
      }

      if (matched && !matched.phone && phone.trim()) {
        await db.students.update(matched.id!, { phone: phone.trim() });
        matched.phone = phone.trim();
      }

      if (!matched || matched.phone !== phone.trim()) {
        alert('Authentication Failed: No registered candidate found with this Roll Number and Mobile combination.\n\nRegistered Demo Student Roll No: 1000000001 (Phone: 9876543210).\nMake sure to run Mock Data populate on Admin dashboard first.');
        setLoading(false);
        return;
      }

      onLoginSuccess('student', matched.id);
    } catch (err: any) {
      alert(`Login failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      alert('Please fill in all fields.');
      return;
    }

    if ((username.trim() === 'admin' || username.trim() === 'apex_admin') && (password.trim() === 'admin123' || password.trim() === '2026@Apex')) {
      onLoginSuccess('admin');
    } else {
      alert('Authentication Failed: Incorrect Master Admin username or password.');
    }
  };

  const handleTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      alert('Please fill in both User ID and Password.');
      return;
    }

    setLoading(true);
    try {
      // 1. Check local Dexie DB teachers table
      let matched = await db.teachers.where('userId').equals(username.trim()).first();
      if (matched && matched.password === password.trim()) {
        onLoginSuccess('teacher', undefined, matched.id);
        return;
      }

      // 2. Check Hostinger MySQL backend endpoint
      try {
        const res = await fetch('/api/teacher-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: username.trim(), password: password.trim() })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.teacher) {
            await pullCloudUpdatesToIndexedDB();
            let teacherId = data.teacher.id;
            const localTeacher = await db.teachers.where('userId').equals(username.trim()).first();
            if (localTeacher) {
              teacherId = localTeacher.id!;
            }
            onLoginSuccess('teacher', undefined, teacherId);
            return;
          }
        }
      } catch (err) {
        console.warn("Backend teacher login attempt failed:", err);
      }

      alert('Authentication Failed: Invalid Teacher User ID or Password.');
    } catch (err: any) {
      alert(`Teacher Login Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', width: '100vw', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f0f4f8', padding: '20px', boxSizing: 'border-box', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '32px', maxWidth: '440px', width: '100%', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', boxSizing: 'border-box' }}>
        
        {/* Logo/Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '1.8rem', animation: 'pulse 2s infinite' }}>⚡</span>
            <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#1a202c', letterSpacing: '-0.05em' }}>Appex</span>
          </div>
          <h2 style={{ margin: '0 0 4px 0', fontSize: '1.15rem', fontWeight: 800, color: '#2d3748' }}>Single Sign-On Gateway</h2>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#718096' }}>Access test score reports or management portals.</p>
        </div>

        {/* 3 Tab selection buttons */}
        <div style={{ display: 'flex', background: '#edf2f7', padding: '4px', borderRadius: '8px', marginBottom: '24px', gap: '4px' }}>
          <button
            onClick={() => setActiveTab('student')}
            style={{
              flex: 1,
              padding: '8px 4px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.75rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: activeTab === 'student' ? '#fff' : 'transparent',
              color: activeTab === 'student' ? '#2b6cb0' : '#4a5568',
              boxShadow: activeTab === 'student' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <Users size={14} /> Student
          </button>
          <button
            onClick={() => setActiveTab('teacher')}
            style={{
              flex: 1,
              padding: '8px 4px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.75rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: activeTab === 'teacher' ? '#fff' : 'transparent',
              color: activeTab === 'teacher' ? '#2b6cb0' : '#4a5568',
              boxShadow: activeTab === 'teacher' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <Lock size={14} /> Teacher
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            style={{
              flex: 1,
              padding: '8px 4px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.75rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: activeTab === 'admin' ? '#fff' : 'transparent',
              color: activeTab === 'admin' ? '#2b6cb0' : '#4a5568',
              boxShadow: activeTab === 'admin' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <Shield size={14} /> Master Admin
          </button>
        </div>

        {/* Tab content panel */}
        {activeTab === 'student' ? (
          <form onSubmit={handleStudentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#4a5568' }}>Candidate Roll Number</label>
              <input
                type="text"
                placeholder="e.g. 1000000001"
                value={rollNo}
                onChange={e => setRollNo(e.target.value)}
                style={{ padding: '10px 12px', border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '16px', outline: 'none', background: '#fff', color: '#1a202c' }}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#4a5568' }}>Mobile Phone Number</label>
              <input
                type="tel"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                style={{ padding: '10px 12px', border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '16px', outline: 'none', background: '#fff', color: '#1a202c' }}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                background: '#2b6cb0',
                color: '#fff',
                fontWeight: 'bold',
                fontSize: '0.85rem',
                padding: '12px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                marginTop: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 6px -1px rgba(43,108,176,0.2)'
              }}
            >
              <BookOpen size={16} /> {loading ? 'Verifying...' : 'Verify & Enter Student Portal'}
            </button>

            {onRegisterClick && (
              <div style={{ marginTop: '16px', textAlign: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                <span style={{ fontSize: '0.8rem', color: '#718096' }}>New Student / Got an invite? </span>
                <button
                  type="button"
                  onClick={onRegisterClick}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2b6cb0',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Register Here
                </button>
              </div>
            )}
          </form>
        ) : activeTab === 'teacher' ? (
          <form onSubmit={handleTeacherSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#4a5568' }}>Teacher User ID</label>
              <input
                type="text"
                placeholder="Enter User ID assigned by Master Admin"
                value={username}
                onChange={e => setUsername(e.target.value)}
                style={{ padding: '10px 12px', border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '16px', outline: 'none', background: '#fff', color: '#1a202c' }}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#4a5568' }}>Password</label>
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ padding: '10px 12px', border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '16px', outline: 'none', background: '#fff', color: '#1a202c' }}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                background: '#2563eb',
                color: '#fff',
                fontWeight: 'bold',
                fontSize: '0.85rem',
                padding: '12px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                marginTop: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 6px -1px rgba(37,99,235,0.2)'
              }}
            >
              <Lock size={16} /> {loading ? 'Verifying...' : 'Login to Teacher Portal'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleAdminSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#4a5568' }}>Master Admin Username</label>
              <input
                type="text"
                placeholder="Enter Master Admin username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                style={{ padding: '10px 12px', border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '16px', outline: 'none', background: '#fff', color: '#1a202c' }}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#4a5568' }}>Master Admin Password</label>
              <input
                type="password"
                placeholder="Enter Master Admin password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ padding: '10px 12px', border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '16px', outline: 'none', background: '#fff', color: '#1a202c' }}
                required
              />
            </div>

            <button
              type="submit"
              style={{
                background: '#2d3748',
                color: '#fff',
                fontWeight: 'bold',
                fontSize: '0.85rem',
                padding: '12px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                marginTop: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 6px -1px rgba(45,55,72,0.2)'
              }}
            >
              <Shield size={16} /> Open Master Admin Dashboard
            </button>
          </form>
        )}

        {/* Demo Credentials Helpers */}
        <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '8px', padding: '12px', marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#2b6cb0', fontWeight: 'bold' }}>
            <Sparkles size={14} />
            <span>Login Access Credentials:</span>
          </div>
          <span style={{ fontSize: '0.7rem', color: '#4a5568' }}>
            ● <strong>Student</strong>: Roll No <code>1000000001</code> | Mobile <code>9876543210</code>
          </span>
          <span style={{ fontSize: '0.7rem', color: '#4a5568' }}>
            ● <strong>Master Admin</strong>: Username <code>admin</code> | Password <code>2026@Apex</code>
          </span>
        </div>

      </div>
    </div>
  );
};

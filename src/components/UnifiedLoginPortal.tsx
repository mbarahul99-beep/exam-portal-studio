import React, { useState, useEffect } from 'react';
import { Shield, Lock, BookOpen } from 'lucide-react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '1085333589967-googleplaceholder.apps.googleusercontent.com';
import { db } from '../db';

interface UnifiedLoginPortalProps {
  onLoginSuccess: (role: 'admin' | 'teacher' | 'student', studentId?: number, teacherId?: number) => void;
}

export const UnifiedLoginPortal: React.FC<UnifiedLoginPortalProps> = ({ onLoginSuccess }) => {
  // Synchronize and lock PWA mode instantly
  if (window.location.search.includes('app=student')) {
    localStorage.setItem('apex_pwa_mode', 'student');
  } else if (window.location.search.includes('app=staff')) {
    localStorage.setItem('apex_pwa_mode', 'staff');
  }
  
  const isStudentApp = localStorage.getItem('apex_pwa_mode') === 'student';
  const [activeTab, setActiveTab] = useState<'student' | 'admin' | 'teacher'>(isStudentApp ? 'student' : 'teacher');

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(() => {
    const dismissed = localStorage.getItem('apex_student_app_promo_dismissed');
    return dismissed !== 'true';
  });
  const [showInstructions, setShowInstructions] = useState(false);

  // Dynamic branding heights loader
  const storedJson = localStorage.getItem('omr_custom_settings');
  let userLogoHeight = 42;
  let userLogoNameHeight = 38; // Default is now 38
  if (storedJson) {
    try {
      const parsed = JSON.parse(storedJson);
      if (parsed.logoHeight) userLogoHeight = parsed.logoHeight;
      if (parsed.logoNameHeight) userLogoNameHeight = parsed.logoNameHeight;
    } catch (e) {}
  }
  const loginLogoHeight = Math.round(70 * (userLogoHeight / 42));
  const loginLogoNameHeight = Math.round(40 * (userLogoNameHeight / 26));

  const isStandalone = 
    window.matchMedia('(display-mode: standalone)').matches || 
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as any).standalone;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  const isInstallable = !!deferredPrompt || isIOS;

  React.useEffect(() => {
    // Read the globally captured prompt if already fired on page load
    if ((window as any).deferredAppInstallPrompt) {
      setDeferredPrompt((window as any).deferredAppInstallPrompt);
    }

    // Listen to custom event in case it fires during active session
    const handlePromptAvailable = (e: any) => {
      setDeferredPrompt(e.detail);
    };

    window.addEventListener('pwa-prompt-available', handlePromptAvailable);
    return () => {
      window.removeEventListener('pwa-prompt-available', handlePromptAvailable);
    };
  }, []);

  // Student form states
  const [rollNo, setRollNo] = useState('');
  const [phone, setPhone] = useState('');
  const [classesList, setClassesList] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');

  React.useEffect(() => {
    db.classes.toArray().then((list) => {
      const names = list.map(c => c.name);
      setClassesList(names);
      if (names.length > 0) {
        setSelectedClass(names[0]);
      }
    });
  }, []);

  const [loading, setLoading] = useState(false);

  // Google Sign-In Callback handler
  const handleGoogleLoginCallback = async (response: any) => {
    const idToken = response.credential;
    if (!idToken) return;

    setLoading(true);
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, clientId: GOOGLE_CLIENT_ID })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Google Authentication failed');
      }

      if (data.role === 'admin') {
        onLoginSuccess('admin');
      } else if (data.role === 'teacher') {
        onLoginSuccess('teacher', undefined, data.teacher?.id);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Dynamically initialize Google Sign-In and render buttons based on active tab
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).google && (activeTab === 'teacher' || activeTab === 'admin')) {
      try {
        const google = (window as any).google;
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleLoginCallback
        });
        
        if (activeTab === 'teacher') {
          setTimeout(() => {
            const container = document.getElementById('google-teacher-signin-btn');
            if (container) {
              google.accounts.id.renderButton(container, {
                theme: 'outline',
                size: 'large',
                width: 320,
                text: 'signin_with',
                shape: 'rectangular'
              });
            }
          }, 100);
        }

        if (activeTab === 'admin') {
          setTimeout(() => {
            const container = document.getElementById('google-admin-signin-btn');
            if (container) {
              google.accounts.id.renderButton(container, {
                theme: 'outline',
                size: 'large',
                width: 320,
                text: 'signin_with',
                shape: 'rectangular'
              });
            }
          }, 100);
        }
      } catch (err) {
        console.warn("Failed to initialize Google Sign-in:", err);
      }
    }
  }, [activeTab]);

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rollNo.trim() || !phone.trim()) {
      alert('Please fill in both fields.');
      return;
    }

    setLoading(true);
    try {
      let matched = await db.students
        .where('[studentNum+className]')
        .equals([rollNo.trim(), selectedClass || 'NEET'])
        .first();

      // Dynamic demo fallback seeder
      if (!matched && rollNo.trim() === '1000000001' && phone.trim() === '9876543210' && (selectedClass === 'NEET' || !selectedClass)) {
        await db.students.add({
          studentNum: '1000000001',
          name: 'Aarav Sharma',
          className: 'NEET',
          phone: '9876543210',
          email: 'aarav@appexjind.in'
        });
        matched = await db.students.where('[studentNum+className]').equals(['1000000001', 'NEET']).first();
      } else if (!matched && rollNo.trim() === '1000000002' && phone.trim() === '9876543211' && (selectedClass === 'NEET' || !selectedClass)) {
        await db.students.add({
          studentNum: '1000000002',
          name: 'Diya Patel',
          className: 'NEET',
          phone: '9876543211',
          email: 'diya@appexjind.in'
        });
        matched = await db.students.where('[studentNum+className]').equals(['1000000002', 'NEET']).first();
      }

      if (matched && !matched.phone && phone.trim()) {
        await db.students.update(matched.id!, { phone: phone.trim() });
        matched.phone = phone.trim();
      }

      if (!matched || matched.phone !== phone.trim()) {
        alert('Authentication Failed: No registered candidate found with this Roll Number and Mobile combination.');
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



  return (
    <div style={{ minHeight: '100vh', width: '100vw', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f0f4f8', padding: '20px', boxSizing: 'border-box', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '32px', maxWidth: '440px', width: '100%', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', boxSizing: 'border-box' }}>
        
        {/* Dynamic PWA Student/Staff App Install Banner before login */}
        {!isStandalone && showBanner && isInstallable && (
          <div style={{
            background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '24px',
            color: '#fff',
            position: 'relative',
            boxShadow: '0 4px 12px rgba(4, 120, 87, 0.15)'
          }}>
            <button 
              onClick={() => {
                setShowBanner(false);
                localStorage.setItem('apex_student_app_promo_dismissed', 'true');
              }}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '1rem',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '1.8rem' }}>📱</span>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '0.88rem', fontWeight: 800 }}>
                  {isStudentApp ? 'APEX Student App' : 'APEX Staff App'}
                </h3>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.9)', lineHeight: '1.4' }}>
                  {isStudentApp 
                    ? 'Download our app for direct notifications and faster offline score card access.' 
                    : 'Download our app for direct notifications and secure dashboard access.'}
                </p>
              </div>
            </div>
            
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {deferredPrompt ? (
                <button
                  onClick={() => {
                    deferredPrompt.prompt();
                    deferredPrompt.userChoice.then((choice: any) => {
                      if (choice.outcome === 'accepted') {
                        setShowBanner(false);
                      }
                    });
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#fff',
                    color: '#065f46',
                    fontWeight: 'bold',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                >
                  Download & Install App
                </button>
              ) : (
                <button
                  onClick={() => setShowInstructions(!showInstructions)}
                  style={{
                    width: '100%',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    background: 'transparent',
                    color: '#fff',
                    fontWeight: 'bold',
                    fontSize: '0.78rem',
                    cursor: 'pointer'
                  }}
                >
                  {showInstructions ? 'Hide Instructions' : 'How to Download'}
                </button>
              )}

              {showInstructions && (
                <div style={{
                  background: 'rgba(0,0,0,0.15)',
                  borderRadius: '6px',
                  padding: '10px',
                  fontSize: '0.7rem',
                  color: 'rgba(255,255,255,0.9)',
                  lineHeight: '1.4',
                  textAlign: 'left'
                }}>
                  <p style={{ margin: '0 0 4px 0', fontWeight: 'bold' }}>iOS Safari:</p>
                  <p style={{ margin: '0 0 8px 0' }}>Tap Share button at bottom, select 'Add to Home Screen'.</p>
                  <p style={{ margin: '0 0 4px 0', fontWeight: 'bold' }}>Android / Chrome:</p>
                  <p style={{ margin: 0 }}>Tap three dots in top-right, select 'Install App'.</p>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Logo/Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <img src="/logo.png" alt="APEX" style={{ height: `${loginLogoHeight}px`, width: 'auto', objectFit: 'contain' }} />
            <img src="/logo_name.png" alt="Institute APEX" style={{ height: `${loginLogoNameHeight}px`, width: 'auto', objectFit: 'contain' }} />
          </div>
          <h2 style={{ margin: '0 0 4px 0', fontSize: '1.15rem', fontWeight: 800, color: '#2d3748' }}>
            {isStudentApp ? 'Student Results Portal' : 'Single Sign-On Gateway'}
          </h2>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#718096' }}>
            {isStudentApp ? 'Enter your Roll Number and Mobile to view score reports.' : 'Access test score reports or management portals.'}
          </p>
        </div>

        {/* 3 Tab selection buttons */}
        {!isStudentApp && (
          <div style={{ display: 'flex', background: '#edf2f7', padding: '4px', borderRadius: '8px', marginBottom: '24px', gap: '4px' }}>
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
        )}

        {/* Tab content panel */}
        {activeTab === 'student' ? (
          <form onSubmit={handleStudentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {classesList.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#4a5568' }}>Select Class / Course</label>
                <select
                  value={selectedClass}
                  onChange={e => setSelectedClass(e.target.value)}
                  style={{ padding: '10px 12px', border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '16px', outline: 'none', background: '#fff', color: '#1a202c' }}
                  required
                >
                  {classesList.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}

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
          </form>
        ) : activeTab === 'teacher' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '12px 0' }}>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#4a5568', textAlign: 'center', lineHeight: '1.4' }}>
              Sign in securely to your Teacher workspace using your registered Google Workspace account.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: '8px' }}>
              <div id="google-teacher-signin-btn"></div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '12px 0' }}>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#4a5568', textAlign: 'center', lineHeight: '1.4' }}>
              Sign in securely to the Master Admin control center using your authorized Google account.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: '8px' }}>
              <div id="google-admin-signin-btn"></div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

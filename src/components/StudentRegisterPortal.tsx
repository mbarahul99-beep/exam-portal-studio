import React, { useState } from 'react';
import { CheckCircle2, ArrowRight, GraduationCap } from 'lucide-react';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

interface StudentRegisterPortalProps {
  initialClassName?: string;
  onDone?: () => void;
}

export const StudentRegisterPortal: React.FC<StudentRegisterPortalProps> = ({
  initialClassName,
  onDone
}) => {
  const classesList = useLiveQuery(() => db.classes.toArray(), []) || [];
  
  const [name, setName] = useState('');
  const [studentNum, setStudentNum] = useState('');
  const [className, setClassName] = useState(initialClassName || '');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert("Please enter your full name.");
      return;
    }
    if (!className) {
      alert("Please select your class.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Auto-generate Roll No if blank
      const rollNo = studentNum.trim() || String(Math.floor(10000 + Math.random() * 90000));
      const cleanPhone = phone.trim() ? (phone.startsWith('91') ? phone.trim() : `91${phone.trim()}`) : '';

      // Save to Dexie Pending Registrations
      await db.pendingRegistrations.add({
        name: name.trim(),
        studentNum: rollNo,
        className,
        phone: phone.trim(),
        whatsappNumber: cleanPhone,
        email: email.trim(),
        createdAt: new Date(),
        status: 'pending'
      });

      // Try syncing to Hostinger MySQL
      try {
        await fetch('/api/register-student', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            studentNum: rollNo,
            className,
            phone: phone.trim(),
            whatsappNumber: cleanPhone,
            email: email.trim()
          })
        });
      } catch (err) {
        console.warn("MySQL sync optional fallback:", err);
      }

      setSubmitted(true);
    } catch (err: any) {
      alert(`Registration error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        background: '#ffffff',
        width: '100%',
        maxWidth: '480px',
        borderRadius: '20px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
        padding: '32px 24px',
        textAlign: 'center',
        boxSizing: 'border-box',
        animation: 'fadeIn 0.3s ease-out'
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          margin: '0 auto 16px',
          boxShadow: '0 8px 16px rgba(37, 99, 235, 0.25)'
        }}>
          <GraduationCap size={36} color="#ffffff" />
        </div>

        <h2 style={{ margin: '0 0 6px 0', fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
          Student Registration Portal
        </h2>
        <p style={{ margin: '0 0 24px 0', fontSize: '0.88rem', color: '#64748b' }}>
          Register your profile for Institute Apex Exam & Attendance Portal
        </p>

        {submitted ? (
          <div style={{
            background: '#f0fdf4',
            border: '1.5px solid #bbf7d0',
            borderRadius: '16px',
            padding: '24px 16px',
            textAlign: 'center'
          }}>
            <CheckCircle2 size={48} color="#16a34a" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ margin: '0 0 8px 0', color: '#166534', fontSize: '1.15rem', fontWeight: 800 }}>
              Application Submitted!
            </h3>
            <p style={{ margin: '0 0 16px 0', color: '#15803d', fontSize: '0.88rem', lineHeight: 1.5 }}>
              Your registration request for class <strong>{className}</strong> has been sent to the Admin.
            </p>
            <div style={{
              background: '#ffffff',
              padding: '12px',
              borderRadius: '10px',
              fontSize: '0.82rem',
              color: '#334155',
              border: '1px solid #dcfce7',
              marginBottom: '20px'
            }}>
              <strong>Status:</strong> ⏳ Pending Admin Approval<br />
              Once approved, you will be enrolled into your class automatically.
            </div>

            {onDone && (
              <button
                onClick={onDone}
                style={{
                  width: '100%',
                  background: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Go to Portal
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
            
            {/* Student Name */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
                FULL NAME *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Rahul Kumar"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Target Class */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                TARGET CLASS *
              </label>
              <select
                required
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                  background: '#ffffff'
                }}
              >
                <option value="">Select your class...</option>
                {classesList.map(c => (
                  <option key={`cls-opt-${c.id}`} value={c.name}>{c.name}</option>
                ))}
                {!classesList.some(c => c.name === 'NEET-2026') && <option value="NEET-2026">NEET-2026</option>}
                {!classesList.some(c => c.name === 'JEE-2026') && <option value="JEE-2026">JEE-2026</option>}
              </select>
            </div>

            {/* Student Roll Number / ID */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                ROLL NUMBER / STUDENT ID (OPTIONAL)
              </label>
              <input
                type="text"
                placeholder="e.g. 00105 (leave blank to auto-assign)"
                value={studentNum}
                onChange={(e) => setStudentNum(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Mobile / WhatsApp Number */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                WHATSAPP / MOBILE NUMBER (OPTIONAL)
              </label>
              <input
                type="tel"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Email Address */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                EMAIL ADDRESS (OPTIONAL)
              </label>
              <input
                type="email"
                placeholder="e.g. student@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                padding: '14px',
                fontSize: '0.95rem',
                fontWeight: 800,
                cursor: 'pointer',
                marginTop: '8px',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {isSubmitting ? 'Submitting...' : <>Submit Registration Request <ArrowRight size={18} /></>}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

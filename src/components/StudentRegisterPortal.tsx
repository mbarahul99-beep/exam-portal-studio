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
  const [fatherName, setFatherName] = useState('');
  const [studentNum, setStudentNum] = useState('');
  const [className, setClassName] = useState(initialClassName || '');
  const [phone, setPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [isSameWhatsApp, setIsSameWhatsApp] = useState(true);
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
      const rawWa = isSameWhatsApp ? phone : whatsappNumber;
      const cleanWa = rawWa.trim() ? (rawWa.startsWith('91') ? rawWa.trim() : `91${rawWa.trim()}`) : '';

      // Check if student is already in roster
      const existing = await db.students.where('studentNum').equals(rollNo).first();
      if (existing) {
        alert(`You are already registered! Name: ${existing.name}, Roll No: ${existing.studentNum}. You can directly log in using your Roll Number.`);
        setIsSubmitting(false);
        if (onDone) onDone();
        return;
      }

      // Save to Dexie Pending Registrations
      await db.pendingRegistrations.add({
        name: name.trim(),
        fatherName: fatherName.trim() || undefined,
        studentNum: rollNo,
        className,
        phone: phone.trim(),
        whatsappNumber: cleanWa,
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
            fatherName: fatherName.trim() || undefined,
            studentNum: rollNo,
            className,
            phone: phone.trim(),
            whatsappNumber: cleanWa,
            email: email.trim()
          })
        });
      } catch (e) {
        console.warn("Server sync warning:", e);
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
      minHeight: '100dvh',
      width: '100vw',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '16px 12px',
      boxSizing: 'border-box',
      overflowY: 'auto'
    }}>
      <style>{`
        .student-reg-card {
          width: 100%;
          max-width: 480px;
          background: #ffffff;
          border-radius: 20px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          padding: 28px 20px;
          text-align: center;
          box-sizing: border-box;
          margin: auto;
        }

        .student-reg-input {
          width: 100%;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1.5px solid #cbd5e1;
          font-size: 16px !important; /* Prevents auto-zoom on mobile iOS/Android */
          box-sizing: border-box;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          background: #ffffff;
        }

        .student-reg-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        }

        @media (max-width: 480px) {
          .student-reg-card {
            padding: 20px 16px;
            border-radius: 16px;
            box-shadow: none;
          }
          .student-reg-title {
            font-size: 1.25rem !important;
          }
          .student-reg-subtitle {
            font-size: 0.82rem !important;
            margin-bottom: 18px !important;
          }
        }
      `}</style>

      <div className="student-reg-card">
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          margin: '0 auto 14px',
          boxShadow: '0 8px 16px rgba(37, 99, 235, 0.25)'
        }}>
          <GraduationCap size={32} color="#ffffff" />
        </div>

        <h2 className="student-reg-title" style={{ margin: '0 0 6px 0', fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
          Student Registration Portal
        </h2>
        <p className="student-reg-subtitle" style={{ margin: '0 0 24px 0', fontSize: '0.88rem', color: '#64748b' }}>
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
                  padding: '14px',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  minHeight: '48px'
                }}
              >
                Go to Portal
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left' }}>
            
            {/* Student Name */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                FULL NAME *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Rahul Kumar"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="student-reg-input"
              />
            </div>

            {/* Father's Name */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                FATHER'S NAME (OPTIONAL)
              </label>
              <input
                type="text"
                placeholder="e.g. Suresh Kumar"
                value={fatherName}
                onChange={(e) => setFatherName(e.target.value)}
                className="student-reg-input"
              />
            </div>

            {/* Target Class */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                TARGET CLASS *
              </label>
              <select
                required
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                className="student-reg-input"
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
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                ROLL NUMBER / STUDENT ID (OPTIONAL)
              </label>
              <input
                type="text"
                placeholder="e.g. 00105 (leave blank to auto-assign)"
                value={studentNum}
                onChange={(e) => setStudentNum(e.target.value)}
                className="student-reg-input"
              />
            </div>

            {/* Mobile / WhatsApp Number */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                MOBILE NUMBER *
              </label>
              <input
                type="tel"
                required
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => {
                  const val = e.target.value;
                  setPhone(val);
                  if (isSameWhatsApp) setWhatsappNumber(val);
                }}
                className="student-reg-input"
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', cursor: 'pointer', fontSize: '0.88rem', color: '#2563eb', fontWeight: 600, userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={isSameWhatsApp}
                  onChange={(e) => {
                    setIsSameWhatsApp(e.target.checked);
                    if (e.target.checked) setWhatsappNumber(phone);
                  }}
                  style={{ width: '18px', height: '18px', accentColor: '#2563eb' }}
                />
                <span>Is the above number your WhatsApp number?</span>
              </label>
            </div>

            {!isSameWhatsApp && (
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  WHATSAPP NUMBER
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  className="student-reg-input"
                />
              </div>
            )}

            {/* Email Address */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                EMAIL ADDRESS (OPTIONAL)
              </label>
              <input
                type="email"
                placeholder="e.g. student@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="student-reg-input"
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
                borderRadius: '12px',
                padding: '14px',
                fontSize: '1rem',
                fontWeight: 800,
                cursor: 'pointer',
                marginTop: '10px',
                minHeight: '50px',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {isSubmitting ? 'Submitting...' : <>Submit Registration Request <ArrowRight size={18} /></>}
            </button>

            {onDone && (
              <div style={{ textAlign: 'center', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={onDone}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: '8px'
                  }}
                >
                  Already registered? Go to Login Gateway
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
};

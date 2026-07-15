import React, { useState } from 'react';
import { db, type Student, type ClassEntity, type AttendanceRecord } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Calendar, Users, Check, X, Clock, Download, CheckSquare } from 'lucide-react';

interface AttendancePortalProps {
  classes: ClassEntity[];
  students: Student[];
}

export const AttendancePortal: React.FC<AttendancePortalProps> = ({ classes, students }) => {
  // Current local date in YYYY-MM-DD format
  const getTodayString = () => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const [selectedClass, setSelectedClass] = useState<string>(classes[0]?.name || 'NEET');

  // Load existing attendance records for the selected class and date
  const attendanceRecords = useLiveQuery(
    () => db.attendance.where('date').equals(selectedDate).and(r => r.className === selectedClass).toArray(),
    [selectedDate, selectedClass]
  ) || [];

  // Filter students based on selected class
  const classStudents = students.filter(s => s.className === selectedClass);

  // Map student ID to attendance record for fast lookups
  const attendanceMap = new Map<number, AttendanceRecord>(
    attendanceRecords.map(r => [r.studentId, r])
  );

  // Calculate statistics
  const totalCount = classStudents.length;
  const presentCount = attendanceRecords.filter(r => r.status === 'Present').length;
  const absentCount = attendanceRecords.filter(r => r.status === 'Absent').length;
  const lateCount = attendanceRecords.filter(r => r.status === 'Late').length;
  const attendanceRate = totalCount > 0 ? Math.round(((presentCount + lateCount) / totalCount) * 100) : 0;

  // Handler to toggle individual attendance status
  const handleSetStatus = async (studentId: number, status: 'Present' | 'Absent' | 'Late') => {
    const existing = attendanceMap.get(studentId);
    try {
      if (existing) {
        if (existing.status === status) {
          // If clicked the same status, remove it (make unmarked)
          await db.attendance.delete(existing.id!);
        } else {
          // Otherwise, update status
          await db.attendance.update(existing.id!, { status });
        }
      } else {
        // Create new record
        await db.attendance.add({
          date: selectedDate,
          studentId,
          className: selectedClass,
          status,
          createdAt: new Date()
        });
      }
    } catch (err: any) {
      console.error("Failed to save attendance:", err);
    }
  };

  // Batch actions
  const handleMarkAll = async (status: 'Present' | 'Absent') => {
    try {
      for (const student of classStudents) {
        const existing = attendanceMap.get(student.id!);
        if (existing) {
          await db.attendance.update(existing.id!, { status });
        } else {
          await db.attendance.add({
            date: selectedDate,
            studentId: student.id!,
            className: selectedClass,
            status,
            createdAt: new Date()
          });
        }
      }
    } catch (err) {
      console.error("Batch attendance update failed:", err);
    }
  };

  // Export CSV Action
  const handleExportCSV = () => {
    if (classStudents.length === 0) return;
    
    let csvContent = 'Roll ID,Name,Class,Status,Checked-In Date,Created At\n';
    classStudents.forEach(s => {
      const record = attendanceMap.get(s.id!);
      const statusStr = record ? record.status : 'Unmarked';
      const createdStr = record ? record.createdAt.toLocaleTimeString() : 'N/A';
      csvContent += `"${s.studentNum}","${s.name}","${s.className}","${statusStr}","${selectedDate}","${createdStr}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Attendance_${selectedClass}_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="attendance-portal animate-fade-in">
      {/* Tab Header */}
      <header className="pane-header">
        <div>
          <h2>Daily Attendance</h2>
          <p className="subtitle">Track and review student roll calls, check-in histories, and daily attendance logs.</p>
        </div>
        
        {/* Date and Class Selectors */}
        <div className="attendance-selectors">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ffffff', border: '1px solid var(--border-color)', padding: '6px 12px', borderRadius: '8px' }}>
            <Calendar size={16} style={{ color: 'var(--text-secondary)' }} />
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontSize: '0.9rem', outline: 'none', color: 'var(--text-primary)' }}
            />
          </div>

          <select 
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#ffffff', fontSize: '0.9rem', outline: 'none' }}
          >
            {classes.map(c => (
              <option key={`att-cls-${c.id}`} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
      </header>

      {/* Analytics widgets row */}
      <div className="attendance-stats-grid mb-4">
        <div className="glass-card flex-between-stat">
          <div>
            <span className="box-label">Enrolled Students</span>
            <span className="box-val text-indigo">{totalCount}</span>
          </div>
          <Users size={28} style={{ opacity: 0.2 }} />
        </div>

        <div className="glass-card flex-between-stat">
          <div>
            <span className="box-label">Check-in Status</span>
            <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
              <span style={{ fontSize: '0.85rem' }}><Check size={14} style={{ color: '#48bb78', verticalAlign: 'middle', marginRight: '2px' }} />Present: <strong>{presentCount}</strong></span>
              <span style={{ fontSize: '0.85rem' }}><Clock size={14} style={{ color: '#ecc94b', verticalAlign: 'middle', marginRight: '2px' }} />Late: <strong>{lateCount}</strong></span>
              <span style={{ fontSize: '0.85rem' }}><X size={14} style={{ color: '#f56565', verticalAlign: 'middle', marginRight: '2px' }} />Absent: <strong>{absentCount}</strong></span>
            </div>
          </div>
        </div>

        <div className="glass-card flex-between-stat">
          <div>
            <span className="box-label">Attendance Rate</span>
            <span className={`box-val ${attendanceRate >= 75 ? 'text-success' : attendanceRate >= 50 ? 'text-warning' : 'text-danger'}`}>
              {attendanceRate}%
            </span>
          </div>
          <CheckSquare size={28} style={{ opacity: 0.2 }} />
        </div>
      </div>

      {/* Control panel and table */}
      <div className="glass-card">
        {/* Roster Controls */}
        <div className="roster-header mb-4" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button 
              className="btn-secondary" 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.85rem', color: '#48bb78', borderColor: 'rgba(72,187,120,0.2)', background: 'rgba(72,187,120,0.05)' }} 
              onClick={() => handleMarkAll('Present')}
              disabled={classStudents.length === 0}
            >
              <Check size={14} /> Mark All Present
            </button>
            <button 
              className="btn-secondary" 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.85rem', color: '#f56565', borderColor: 'rgba(245,101,101,0.2)', background: 'rgba(245,101,101,0.05)' }} 
              onClick={() => handleMarkAll('Absent')}
              disabled={classStudents.length === 0}
            >
              <X size={14} /> Mark All Absent
            </button>
          </div>

          <button 
            className="btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', fontSize: '0.85rem' }}
            onClick={handleExportCSV}
            disabled={classStudents.length === 0}
          >
            <Download size={14} /> Export CSV
          </button>
        </div>

        {/* Student List Grid */}
        {classStudents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            <Users size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <p>No students enrolled in Class {selectedClass} yet.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="attendance-desktop-table-view" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
              <table className="app-table">
                <thead>
                  <tr>
                    <th style={{ width: '120px' }}>Roll ID</th>
                    <th>Student Name</th>
                    <th style={{ width: '150px' }}>Current Status</th>
                    <th style={{ width: '300px', textAlign: 'right' }}>Attendance Triggers</th>
                  </tr>
                </thead>
                <tbody>
                  {classStudents.map(student => {
                    const record = attendanceMap.get(student.id!);
                    const currentStatus = record ? record.status : 'Unmarked';
                    
                    return (
                      <tr key={`att-row-${student.id}`} className="hover-row">
                        <td><code>{student.studentNum}</code></td>
                        <td><strong>{student.name}</strong></td>
                        <td>
                          <span className={`status-badge ${
                            currentStatus === 'Present' ? 'success' :
                            currentStatus === 'Late' ? 'warning' :
                            currentStatus === 'Absent' ? 'fail' : 'loading'
                          }`} style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                            {currentStatus}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="attendance-btn-group" style={{ display: 'inline-flex', gap: '6px' }}>
                            <button 
                              className={`btn-att btn-present ${currentStatus === 'Present' ? 'active' : ''}`}
                              onClick={() => handleSetStatus(student.id!, 'Present')}
                              title="Mark Present"
                            >
                              <Check size={14} /> Present
                            </button>
                            <button 
                              className={`btn-att btn-late ${currentStatus === 'Late' ? 'active' : ''}`}
                              onClick={() => handleSetStatus(student.id!, 'Late')}
                              title="Mark Late"
                            >
                              <Clock size={14} /> Late
                            </button>
                            <button 
                              className={`btn-att btn-absent ${currentStatus === 'Absent' ? 'active' : ''}`}
                              onClick={() => handleSetStatus(student.id!, 'Absent')}
                              title="Mark Absent"
                            >
                              <X size={14} /> Absent
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="attendance-mobile-cards-view">
              {classStudents.map(student => {
                const record = attendanceMap.get(student.id!);
                const currentStatus = record ? record.status : 'Unmarked';
                
                return (
                  <div key={`att-card-${student.id}`} className="attendance-mobile-card glass-card mb-3" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{student.name}</h4>
                        <code style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Roll ID: {student.studentNum}</code>
                      </div>
                      <span className={`status-badge ${
                        currentStatus === 'Present' ? 'success' :
                        currentStatus === 'Late' ? 'warning' :
                        currentStatus === 'Absent' ? 'fail' : 'loading'
                      }`} style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                        {currentStatus}
                      </span>
                    </div>
                    
                    <div className="attendance-btn-group" style={{ display: 'flex', gap: '8px', width: '100%' }}>
                      <button 
                        className={`btn-att btn-present ${currentStatus === 'Present' ? 'active' : ''}`}
                        onClick={() => handleSetStatus(student.id!, 'Present')}
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        <Check size={14} /> Present
                      </button>
                      <button 
                        className={`btn-att btn-late ${currentStatus === 'Late' ? 'active' : ''}`}
                        onClick={() => handleSetStatus(student.id!, 'Late')}
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        <Clock size={14} /> Late
                      </button>
                      <button 
                        className={`btn-att btn-absent ${currentStatus === 'Absent' ? 'active' : ''}`}
                        onClick={() => handleSetStatus(student.id!, 'Absent')}
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        <X size={14} /> Absent
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

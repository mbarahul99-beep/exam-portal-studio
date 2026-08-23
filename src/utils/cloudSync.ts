import { db, type Student, type Exam, type ExamSubmission, type PendingRegistration, type ClassEntity, type QuestionBank, type BankQuestion, type AttendanceRecord } from '../db';

export async function syncAttendanceToCloud(record: AttendanceRecord) {
  try {
    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
    if (res.ok && record.id) {
      await db.attendance.update(record.id, { syncState: 'synced' });
    }
  } catch (err) {
    console.warn("Cloud sync attendance failed:", err);
  }
}

/**
 * Cloud Sync helper for synchronizing IndexedDB data with Hostinger MySQL Database
 */

export async function syncExamToCloud(exam: Exam) {
  try {
    const res = await fetch('/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exam)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.id && Number(data.id) !== Number(exam.id)) {
        const oldId = exam.id!;
        const newId = Number(data.id);
        
        await db.transaction('rw', [db.exams, db.questions, db.submissions], async () => {
          const examObj = await db.exams.get(oldId);
          if (examObj) {
            await db.exams.delete(oldId);
            await db.exams.add({ ...examObj, id: newId, syncState: 'synced' });
          }
          
          const qs = await db.questions.where('examId').equals(oldId).toArray();
          for (const q of qs) {
            if (q.id) {
              await db.questions.delete(q.id);
              const { id, ...qFields } = q;
              await db.questions.add({ ...qFields, examId: newId });
            }
          }

          const subs = await db.submissions.where('examId').equals(oldId).toArray();
          for (const sub of subs) {
            if (sub.id) {
              await db.submissions.update(sub.id, { examId: newId });
            }
          }
        });
      } else {
        await db.exams.update(exam.id!, { syncState: 'synced' });
      }
    }
  } catch (err) {
    console.warn("Cloud sync exam failed:", err);
  }
}

export async function syncStudentToCloud(student: Student) {
  try {
    const res = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(student)
    });
    if (res.ok && student.id) {
      await db.students.update(student.id, { syncState: 'synced' });
    }
  } catch (err) {
    console.warn("Cloud sync student failed:", err);
  }
}

export async function syncSubmissionToCloud(sub: ExamSubmission) {
  if (sub.studentId < 0) return; // Skip temporary placeholders for unknown candidates
  try {
    const res = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub)
    });
    if (res.ok && sub.id) {
      await db.submissions.update(sub.id, { syncState: 'synced' });
    }
  } catch (err) {
    console.warn("Cloud sync submission failed:", err);
  }
}

export async function syncClassToCloud(cls: ClassEntity) {
  try {
    const res = await fetch('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cls)
    });
    if (res.ok && cls.id) {
      await db.classes.update(cls.id, { syncState: 'synced' });
    }
  } catch (err) {
    console.warn("Cloud sync class failed:", err);
  }
}

export async function syncPendingRegistrationToCloud(reg: PendingRegistration) {
  try {
    const res = await fetch('/api/register-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reg)
    });
    if (res.ok && reg.id) {
      await db.pendingRegistrations.update(reg.id, { syncState: 'synced' });
    }
  } catch (err) {
    console.warn("Cloud sync pending registration failed:", err);
  }
}

export async function deleteStudentFromCloud(idOrNum: number | string) {
  try {
    await fetch(`/api/students/${idOrNum}`, { method: 'DELETE' });
  } catch (err) {
    console.warn("Delete student cloud sync failed:", err);
  }
}

export async function deleteExamFromCloud(id: number) {
  try {
    await fetch(`/api/exams/${id}`, { method: 'DELETE' });
  } catch (err) {
    console.warn("Delete exam cloud sync failed:", err);
  }
}

export async function deleteClassFromCloud(name: string) {
  try {
    await fetch(`/api/classes/${encodeURIComponent(name)}`, { method: 'DELETE' });
  } catch (err) {
    console.warn("Delete class cloud sync failed:", err);
  }
}

export async function renameClassOnCloud(oldName: string, newName: string) {
  try {
    await fetch('/api/classes/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName, newName })
    });
  } catch (err) {
    console.warn("Rename class cloud sync failed:", err);
  }
}

export async function deleteSubmissionFromCloud(id: number) {
  try {
    await fetch(`/api/submissions/${id}`, { method: 'DELETE' });
  } catch (err) {
    console.warn("Delete submission cloud sync failed:", err);
  }
}

export async function deleteTeacherFromCloud(idOrUserId: number | string) {
  try {
    await fetch(`/api/teachers/${idOrUserId}`, { method: 'DELETE' });
  } catch (err) {
    console.warn("Delete teacher cloud sync failed:", err);
  }
}

export async function syncQuestionBankToCloud(bank: QuestionBank) {
  try {
    const res = await fetch('/api/question-banks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bank)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.id && Number(data.id) !== Number(bank.id)) {
        const oldId = bank.id!;
        const newId = Number(data.id);
        
        await db.transaction('rw', [db.questionBanks, db.questionBank], async () => {
          const bankObj = await db.questionBanks.get(oldId);
          if (bankObj) {
            await db.questionBanks.delete(oldId);
            await db.questionBanks.add({ ...bankObj, id: newId, syncState: 'synced' });
          }
          
          const allQs = await db.questionBank.toArray();
          const qs = allQs.filter((q: any) => Number(q.bankId) === Number(oldId));
          for (const q of qs) {
            if (q.id) {
              await db.questionBank.delete(q.id);
              const { id, ...qFields } = q;
              await db.questionBank.add({ ...qFields, bankId: newId });
            }
          }
        });
      } else {
        await db.questionBanks.update(bank.id!, { syncState: 'synced' });
      }
    }
  } catch (err) {
    console.warn("Cloud sync question bank failed:", err);
  }
}

export async function deleteQuestionBankFromCloud(id: number) {
  try {
    await fetch(`/api/question-banks/${id}`, { method: 'DELETE' });
  } catch (err) {
    console.warn("Delete question bank cloud sync failed:", err);
  }
}

export async function syncBankQuestionToCloud(q: BankQuestion) {
  try {
    const res = await fetch('/api/bank-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(q)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.id && Number(data.id) !== Number(q.id)) {
        const oldId = q.id!;
        const newId = Number(data.id);
        
        const qObj = await db.questionBank.get(oldId);
        if (qObj) {
          await db.questionBank.delete(oldId);
          await db.questionBank.add({ ...qObj, id: newId, syncState: 'synced' });
        }
      } else {
        await db.questionBank.update(q.id!, { syncState: 'synced' });
      }
    }
  } catch (err) {
    console.warn("Cloud sync bank question failed:", err);
  }
}

export async function syncBankQuestionsBulkToCloud(questions: BankQuestion[]) {
  if (questions.length === 0) return;
  try {
    const payload = questions.map(q => {
      const { syncState, ...fields } = q;
      return {
        ...fields,
        id: q.syncState === 'synced' ? q.id : null
      };
    });

    const res = await fetch('/api/bank-questions/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: payload })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.results)) {
        await db.transaction('rw', db.questionBank, async () => {
          for (const resObj of data.results) {
            const localId = Number(resObj.localId);
            const serverId = Number(resObj.serverId);
            const qObj = await db.questionBank.get(localId);
            if (qObj) {
              await db.questionBank.delete(localId);
              await db.questionBank.add({ ...qObj, id: serverId, syncState: 'synced' });
            }
          }
        });
      }
    }
  } catch (err) {
    console.warn("Cloud bulk sync bank questions failed:", err);
  }
}

export async function deleteBankQuestionFromCloud(id: number) {
  try {
    await fetch(`/api/bank-questions/${id}`, { method: 'DELETE' });
  } catch (err) {
    console.warn("Delete bank question cloud sync failed:", err);
  }
}

export async function deletePendingRegistrationFromCloud(id: number) {
  try {
    await fetch(`/api/pending-registrations/${id}`, { method: 'DELETE' });
  } catch (err) {
    console.warn("Delete pending registration cloud sync failed:", err);
  }
}

function isRecordEqual(local: any, server: any): boolean {
  if (!local) return false;
  for (const key of Object.keys(server)) {
    if (key === 'id' || key === 'createdAt' || key === 'updatedAt') continue;
    let localVal = local[key];
    let serverVal = server[key];

    // Normalize null/undefined/empty string to null to prevent false inequality positives
    if (localVal === undefined || localVal === null || localVal === '') localVal = null;
    if (serverVal === undefined || serverVal === null || serverVal === '') serverVal = null;

    // Normalize TypedArrays (like Float32Array face descriptors) to standard Arrays
    if (localVal && typeof localVal === 'object' && 'buffer' in localVal && ArrayBuffer.isView(localVal)) {
      localVal = Array.from(localVal as any);
    }
    if (serverVal && typeof serverVal === 'object' && 'buffer' in serverVal && ArrayBuffer.isView(serverVal)) {
      serverVal = Array.from(serverVal as any);
    }

    // Normalize numeric string vs number comparisons
    if (localVal !== null && serverVal !== null) {
      if (typeof localVal === 'number' && typeof serverVal === 'string' && !isNaN(Number(serverVal))) {
        serverVal = Number(serverVal);
      }
      if (typeof serverVal === 'number' && typeof localVal === 'string' && !isNaN(Number(localVal))) {
        localVal = Number(localVal);
      }
    }

    if (JSON.stringify(localVal) !== JSON.stringify(serverVal)) {
      return false;
    }
  }
  return true;
}

let isPullSyncing = false;

export async function pullCloudUpdatesToIndexedDB() {
  if (isPullSyncing) {
    console.log("Sync loop is already running, skipping...");
    return;
  }
  isPullSyncing = true;
  try {
    const res = await fetch('/api/sync/all');
    if (!res.ok) return;
    const data = await res.json();

    // 1. Sync Students (Add/Update & Purge Deleted)
    if (data.students && Array.isArray(data.students)) {
      const serverStudentIds = new Set(data.students.map((s: any) => s.id));
      
      // Delete local students no longer on MySQL server (only if they were already synced)
      const localStudents = await db.students.toArray();
      for (const ls of localStudents) {
        if (ls.id && !serverStudentIds.has(ls.id) && !ls.email?.includes('@appexjind.in') && ls.syncState === 'synced') {
          await db.students.delete(ls.id);
        }
      }

      for (const st of data.students) {
        try {
          st.fatherName = st.fatherName || st.fathername || st.father_name;
          const { id: mysqlId, ...studentFields } = st;
          // Match by server ID
          const existing = await db.students.get(st.id);
          
          if (!existing) {
            // Also clean up any legacy student with the same roll + class to avoid index crashes
            const duplicate = await db.students
              .where('[studentNum+className]')
              .equals([st.studentNum, st.className])
              .first();
            if (duplicate && duplicate.id) {
              await db.students.delete(duplicate.id);
            }
            await db.students.add({ id: st.id, ...studentFields, syncState: 'synced' });
          } else {
            const faceDescriptor = st.faceDescriptor || existing.faceDescriptor;
            const facePhoto = st.facePhoto || existing.facePhoto;
            const merged = { ...studentFields, faceDescriptor, facePhoto };
            if (!isRecordEqual(existing, merged)) {
              await db.students.put({
                id: st.id,
                ...merged,
                syncState: 'synced'
              });
            }
          }
        } catch (err) {
          console.warn("Error syncing student item:", err);
        }
      }
    }

    // 2. Sync Classes (Add/Update & Purge Deleted)
    if (data.classes && Array.isArray(data.classes)) {
      const serverClassNames = new Set(data.classes.map((c: any) => c.name));
      const localClasses = await db.classes.toArray();
      for (const lc of localClasses) {
        if (lc.name && !serverClassNames.has(lc.name) && lc.id && lc.syncState === 'synced') {
          await db.classes.delete(lc.id);
        }
      }

      for (const cls of data.classes) {
        try {
          const { id: mysqlId, ...classFields } = cls;
          const existing = await db.classes.where('name').equalsIgnoreCase(cls.name).first();
          if (!existing) {
            await db.classes.add({ id: cls.id, ...classFields, syncState: 'synced' });
          } else {
            if (!isRecordEqual(existing, classFields)) {
              await db.classes.update(existing.id!, { ...classFields, syncState: 'synced' });
            }
          }
        } catch (err) {
          console.warn("Error syncing class item:", err);
        }
      }
    }

    // Auto-create any class in IndexedDB that exists on student records
    if (data.students && Array.isArray(data.students)) {
      const studentClassNames = Array.from(new Set(data.students.map((s: any) => s.className).filter(Boolean)));
      for (const clsName of studentClassNames) {
        try {
          const existing = await db.classes.where('name').equalsIgnoreCase(clsName as string).first();
          if (!existing) {
            await db.classes.add({ name: clsName as string, state: 'Synced', createdAt: new Date(), syncState: 'synced' });
          }
        } catch {}
      }
    }

    // 3. Sync Exams (Add/Update & Purge Deleted)
    if (data.exams && Array.isArray(data.exams)) {
      const serverExamIds = new Set(data.exams.map((e: any) => Number(e.id)));
      const serverExamTitles = new Set(data.exams.map((e: any) => e.title));
      
      const localClasses = await db.classes.toArray();
      const activeClassNames = new Set(localClasses.map(c => c.name.toLowerCase()));
      
      const localExams = await db.exams.toArray();
      for (const le of localExams) {
        const isOrphanClass = le.className && !activeClassNames.has(le.className.toLowerCase());
        if (le.id && (!serverExamIds.has(le.id) || isOrphanClass) && le.syncState === 'synced') {
          await db.exams.delete(le.id);
          await db.submissions.where('examId').equals(le.id).delete();
          await db.questions.where('examId').equals(le.id).delete();
        } else if (!serverExamTitles.has(le.title) && le.title.includes('NEET Practice Test 1') && le.id && le.syncState === 'synced') {
          await db.exams.delete(le.id);
          await db.submissions.where('examId').equals(le.id).delete();
          await db.questions.where('examId').equals(le.id).delete();
        }
      }
      for (const ex of data.exams) {
        try {
          const examFields = { ...ex };
          if (examFields.answerKey && typeof examFields.answerKey === 'string') {
            examFields.answerKey = JSON.parse(examFields.answerKey);
          }
          if (examFields.answerKeys && typeof examFields.answerKeys === 'string') {
            examFields.answerKeys = JSON.parse(examFields.answerKeys);
          }
          if (examFields.sections && typeof examFields.sections === 'string') {
            examFields.sections = JSON.parse(examFields.sections);
          }
          if (examFields.subjects && typeof examFields.subjects === 'string') {
            examFields.subjects = JSON.parse(examFields.subjects);
          }
          if (examFields.sectionsMarking && typeof examFields.sectionsMarking === 'string') {
            examFields.sectionsMarking = JSON.parse(examFields.sectionsMarking);
          }
          if (examFields.difficulties && typeof examFields.difficulties === 'string') {
            examFields.difficulties = JSON.parse(examFields.difficulties);
          }
          examFields.isResultsPublished = Boolean(examFields.isResultsPublished);

          // Auto-heal numQuestions if it was accidentally wiped to 0 or is smaller than answerKey entries count or sections qCount total
          const totalQsFromSections = examFields.sections && Array.isArray(examFields.sections)
            ? examFields.sections.reduce((acc: number, sec: any) => acc + (Number(sec.qCount) || 0), 0)
            : 0;
          
          let needsHeal = false;
          if (totalQsFromSections > 0 && (Number(examFields.numQuestions) || 0) < totalQsFromSections) {
            examFields.numQuestions = totalQsFromSections;
            needsHeal = true;
          }

          if (examFields.answerKey && typeof examFields.answerKey === 'object') {
            const keyCount = Object.keys(examFields.answerKey).length;
            const currentCount = Number(examFields.numQuestions) || 0;
            if (keyCount > currentCount) {
              examFields.numQuestions = keyCount;
              needsHeal = true;
            }
          }

          if (needsHeal) {
            // Fill missing answer keys in A with default 'A'
            if (!examFields.answerKey || typeof examFields.answerKey !== 'object') {
              examFields.answerKey = {};
            }
            for (let q = 1; q <= examFields.numQuestions; q++) {
              if (!examFields.answerKey[q]) {
                examFields.answerKey[q] = 'A';
              }
            }

            // Also fill missing answerKeys sets
            const setsCount = examFields.examSetsCount || 1;
            const setNames = Array.from({ length: setsCount }).map((_, i) => String.fromCharCode(65 + i));
            if (!examFields.answerKeys || typeof examFields.answerKeys !== 'object') {
              examFields.answerKeys = {};
            }
            setNames.forEach(setName => {
              if (!examFields.answerKeys[setName]) {
                examFields.answerKeys[setName] = {};
              }
              for (let q = 1; q <= examFields.numQuestions; q++) {
                if (!examFields.answerKeys[setName][q]) {
                  examFields.answerKeys[setName][q] = 'A';
                }
              }
            });

            // Sync back corrected exam to server
            syncExamToCloud({ ...examFields, id: Number(ex.id) } as Exam).catch(console.warn);
          }

          const existing = await db.exams.get(Number(ex.id));
          if (!existing) {
            await db.exams.add({
              ...examFields,
              id: Number(ex.id),
              syncState: 'synced'
            });
          } else {
            if (!isRecordEqual(existing, examFields)) {
              await db.exams.update(Number(ex.id), { ...examFields, syncState: 'synced' });
            }
          }
        } catch (err) {
          console.warn("Error syncing exam item:", err);
        }
      }
    }

    // 4. Sync Submissions
    if (data.submissions && Array.isArray(data.submissions)) {
      const serverSubIds = new Set(data.submissions.map((s: any) => s.id));
      const localSubs = await db.submissions.toArray();
      for (const ls of localSubs) {
        if (ls.id && !serverSubIds.has(ls.id) && ls.syncState === 'synced') {
          await db.submissions.delete(ls.id);
        }
      }

      for (const sub of data.submissions) {
        try {
          const { id: mysqlId, ...subFields } = sub;

          // Self-heal: If local record exists by server ID but examId is mismatched, align it
          const existingById = await db.submissions.get(sub.id);
          if (existingById && Number(existingById.examId) !== Number(sub.examId)) {
            await db.submissions.update(sub.id, { examId: sub.examId });
          }

          const matchingSubs = await db.submissions
            .where('[examId+studentId]')
            .equals([sub.examId, sub.studentId])
            .toArray();

          if (matchingSubs.length === 0) {
            await db.submissions.add({ id: sub.id, ...subFields, syncState: 'synced' });
          } else {
            // Update the primary submission record & remove any duplicate local rows
            if (matchingSubs[0].id && !isRecordEqual(matchingSubs[0], subFields)) {
              await db.submissions.update(matchingSubs[0].id, { ...subFields, syncState: 'synced' });
            }
            for (let i = 1; i < matchingSubs.length; i++) {
              if (matchingSubs[i].id) {
                await db.submissions.delete(matchingSubs[i].id);
              }
            }
          }
        } catch (err) {
          console.warn("Error syncing submission item:", err);
        }
      }
    }

    // Purge local orphaned submissions for deleted exams
    try {
      const activeExams = await db.exams.toArray();
      const activeExamIds = new Set(activeExams.map(e => e.id).filter(Boolean));
      const allSubmissions = await db.submissions.toArray();
      for (const sub of allSubmissions) {
        if (!activeExamIds.has(sub.examId) && sub.id && sub.syncState === 'synced') {
          await db.submissions.delete(sub.id);
          try {
            await fetch(`/api/submissions/${sub.id}`, { method: 'DELETE' });
          } catch {}
        }
      }
    } catch {}

    // 5. Sync Questions
    if (data.questions && Array.isArray(data.questions)) {
      const serverExamIds = new Set<number>(data.exams ? data.exams.map((e: any) => Number(e.id)) : []);
      
      try {
        await db.transaction('rw', db.questions, async () => {
          // Delete local questions for all exams that are synced from server to prevent duplicates
          // BUT only if we don't have any locally pending additions for that exam!
          for (const examId of serverExamIds) {
            const pendingCount = await db.questions.where('examId').equals(examId).filter(q => q.syncState === 'pending').count();
            if (pendingCount === 0) {
              await db.questions.where('examId').equals(examId).delete();
            }
          }

          // Prepare clean questions list for bulkAdd
          const qListToAdd: any[] = [];
          for (const q of data.questions) {
            const { id: mysqlId, ...qFields } = q;
            qFields.examId = Number(qFields.examId);
            qFields.correctOptionIdx = Number(qFields.correctOptionIdx);
            
            const existingQ = await db.questions.where('examId').equals(qFields.examId)
              .and(localQ => localQ.questionText === qFields.questionText).first();
            
            if (!existingQ) {
              qListToAdd.push({ ...qFields, syncState: 'synced' });
            } else {
              await db.questions.update(existingQ.id!, { ...qFields, syncState: 'synced' });
            }
          }
          
          if (qListToAdd.length > 0) {
            await db.questions.bulkAdd(qListToAdd);
          }
        });
      } catch (err) {
        console.warn("Error running sync questions transaction:", err);
      }
    }

    // 6. Sync Teachers
    if (data.teachers && Array.isArray(data.teachers)) {
      const serverTeacherUserIds = new Set(data.teachers.map((t: any) => t.userId));
      const localTeachers = await db.teachers.toArray();
      for (const lt of localTeachers) {
        if (lt.userId && !serverTeacherUserIds.has(lt.userId) && lt.id && lt.syncState === 'synced') {
          await db.teachers.delete(lt.id);
        }
      }

      for (const t of data.teachers) {
        try {
          const { id: mysqlId, ...tFields } = t;
          const existing = await db.teachers.where('userId').equals(t.userId).first();
          if (!existing) {
            await db.teachers.add({ id: t.id, ...tFields, syncState: 'synced' });
          } else {
            await db.teachers.update(existing.id!, { ...tFields, syncState: 'synced' });
          }
        } catch (err) {
          console.warn("Error syncing teacher item:", err);
        }
      }
    }

    // 6.5. Sync Daily Attendance Records
    if (data.attendance && Array.isArray(data.attendance)) {
      const serverAttendanceIds = new Set(data.attendance.map((a: any) => a.id));
      const localAttendance = await db.attendance.toArray();
      for (const la of localAttendance) {
        if (la.id && !serverAttendanceIds.has(la.id) && la.syncState === 'synced') {
          await db.attendance.delete(la.id);
        }
      }

      for (const att of data.attendance) {
        try {
          const { id: mysqlId, ...attFields } = att;
          const existing = await db.attendance.get(att.id) || await db.attendance.where('[date+studentId]').equals([att.date, att.studentId]).first();
          if (!existing) {
            await db.attendance.add({ id: att.id, ...attFields, syncState: 'synced' });
          } else {
            if (!isRecordEqual(existing, attFields)) {
              await db.attendance.update(existing.id!, { ...attFields, syncState: 'synced' });
            }
          }
        } catch (err) {
          console.warn("Error syncing attendance record:", err);
        }
      }
    }

    // 7. Sync Pending Registrations
    try {
      const pendingRes = await fetch('/api/pending-registrations');
      if (pendingRes.ok) {
        const pendingData = await pendingRes.json();
        if (Array.isArray(pendingData)) {
          const serverIds = new Set(pendingData.map(r => r.id));

          // Delete local pending registrations that are no longer pending on the server (only if synced)
          const localPending = await db.pendingRegistrations.where('status').equals('pending').toArray();
          for (const localReg of localPending) {
            if (localReg.id && !serverIds.has(localReg.id) && localReg.syncState === 'synced') {
              await db.pendingRegistrations.delete(localReg.id);
            }
          }

          for (const reg of pendingData) {
            try {
              reg.fatherName = reg.fatherName || reg.fathername || reg.father_name;
              const existing = await db.pendingRegistrations.get(reg.id);
              if (!existing) {
                await db.pendingRegistrations.add({ ...reg, syncState: 'synced' });
              } else {
                await db.pendingRegistrations.put({ ...reg, syncState: 'synced' });
              }
            } catch {}
          }
        }
      }
    } catch {
      // Ignore secondary pull failure
    }

    // 8. Sync App Settings
    if (data.settings && typeof data.settings === 'object') {
      for (const key of Object.keys(data.settings)) {
        try {
          const val = data.settings[key];
          const existing = await db.settings.where('key').equals(key).first();
          if (!existing) {
            await db.settings.add({ key, value: val });
            if (key === 'omr_custom_settings') {
              localStorage.setItem('omr_custom_settings', val);
              window.dispatchEvent(new Event('omr_settings_updated'));
            }
          } else {
            if (existing.value !== val) {
              await db.settings.update(existing.id!, { value: val });
              if (key === 'omr_custom_settings') {
                localStorage.setItem('omr_custom_settings', val);
                window.dispatchEvent(new Event('omr_settings_updated'));
              }
            }
          }
        } catch (err) {
          console.warn("Error syncing app settings item:", err);
        }
      }
    }

    // 9. Sync Question Banks
    if (data.questionBanks && Array.isArray(data.questionBanks)) {
      const serverBankIds = new Set(data.questionBanks.map((b: any) => b.id));
      const localBanks = await db.questionBanks.toArray();
      for (const lb of localBanks) {
        const isNew = lb.createdAt && (new Date().getTime() - new Date(lb.createdAt).getTime() < 300000);
        if (lb.id && !serverBankIds.has(lb.id) && lb.name !== "NEET / JEE - Core Library: Mixed Topics" && !isNew && lb.syncState === 'synced') {
          await db.questionBanks.delete(lb.id);
        }
      }
      for (const b of data.questionBanks) {
        try {
          const existing = await db.questionBanks.get(b.id);
          const incoming = {
            name: b.name,
            targetExam: b.targetExam,
            subject: b.subject,
            topic: b.topic
          };
          if (!existing) {
            await db.questionBanks.add({
              id: b.id,
              name: b.name,
              targetExam: b.targetExam,
              subject: b.subject,
              topic: b.topic,
              createdAt: new Date(b.createdAt),
              syncState: 'synced'
            });
          } else {
            if (!isRecordEqual(existing, incoming)) {
              await db.questionBanks.put({
                id: b.id,
                name: b.name,
                targetExam: b.targetExam,
                subject: b.subject,
                topic: b.topic,
                createdAt: new Date(b.createdAt),
                syncState: 'synced'
              });
            }
          }
        } catch (err) {
          console.warn("Error syncing question bank item:", err);
        }
      }
    }

    // 10. Sync Bank Questions (db.questionBank table)
    if (data.bankQuestions && Array.isArray(data.bankQuestions)) {
      const serverQIds = new Set(data.bankQuestions.map((q: any) => q.id));
      const localBanksListForDefault = await db.questionBanks.toArray();
      const defaultBank = localBanksListForDefault.find(b => b.name === "NEET / JEE - Core Library: Mixed Topics");
      const defaultBankId = defaultBank?.id;
      
      const localQs = await db.questionBank.toArray();
      for (const lq of localQs) {
        const isNew = lq.createdAt && (new Date().getTime() - new Date(lq.createdAt).getTime() < 300000);
        if (lq.id && !serverQIds.has(lq.id) && lq.bankId !== defaultBankId && !isNew && lq.syncState === 'synced') {
          await db.questionBank.delete(lq.id);
        }
      }
      for (const q of data.bankQuestions) {
        try {
          const existing = await db.questionBank.get(q.id);
          const incoming = {
            bankId: q.bankId,
            questionText: q.questionText,
            options: q.options,
            correctOptionIdx: q.correctOptionIdx,
            difficulty: q.difficulty,
            explanation: q.explanation || undefined,
            questionImage: q.questionImage || undefined
          };
          if (!existing) {
            await db.questionBank.add({
              id: q.id,
              bankId: q.bankId,
              questionText: q.questionText,
              options: q.options,
              correctOptionIdx: q.correctOptionIdx,
              difficulty: q.difficulty,
              explanation: q.explanation || undefined,
              questionImage: q.questionImage || undefined,
              createdAt: new Date(q.createdAt),
              syncState: 'synced'
            });
          } else {
            if (!isRecordEqual(existing, incoming)) {
              await db.questionBank.put({
                id: q.id,
                bankId: q.bankId,
                questionText: q.questionText,
                options: q.options,
                correctOptionIdx: q.correctOptionIdx,
                difficulty: q.difficulty,
                explanation: q.explanation || undefined,
                questionImage: q.questionImage || undefined,
                createdAt: new Date(q.createdAt),
                syncState: 'synced'
              });
            }
          }
        } catch (err) {
          console.warn("Error syncing bank question item:", err);
        }
      }
    }

    // 11. Run self-healing check on all exams
    try {
      const allExams = await db.exams.toArray();
      for (const exam of allExams) {
        if (!exam.id) continue;
        const dbQs = await db.questions.where('examId').equals(exam.id).toArray();
        const nonPlaceholders = dbQs.filter(q => q.questionText && q.questionText.trim() !== '');
        if (nonPlaceholders.length === 0) continue;

        let qCursor = 1;
        const sectionsWithRanges = (exam.sections || []).map(sec => {
          const start = qCursor;
          const end = qCursor + sec.qCount - 1;
          qCursor = end + 1;
          return { ...sec, qStart: start, qEnd: end };
        });

        const totalQuestions = sectionsWithRanges.reduce((acc, sec) => acc + sec.qCount, 0) || exam.numQuestions || 180;

        // Check if they are misaligned
        const sectionCounters: Record<string, number> = {};
        let wasRealigned = false;
        nonPlaceholders.forEach((qVal) => {
          const subName = qVal.subjectName || 'Subject 1';
          const secName = qVal.sectionName || 'Section 1';
          const key = `${subName.toLowerCase().trim()}|${secName.toLowerCase().trim()}`;
          
          const secConfig = sectionsWithRanges.find(sec => 
            sec.subjectName.toLowerCase().trim() === subName.toLowerCase().trim() &&
            sec.sectionName.toLowerCase().trim() === secName.toLowerCase().trim()
          );

          if (secConfig) {
            const counter = sectionCounters[key] || 0;
            const qNum = secConfig.qStart + counter;
            const targetIdx = qNum - 1;
            const origIdxInDb = dbQs.findIndex(x => x.id === qVal.id);
            if (origIdxInDb !== targetIdx) {
              wasRealigned = true;
            }
            sectionCounters[key] = counter + 1;
          }
        });

        if (wasRealigned || dbQs.length !== totalQuestions) {
          console.log(`[Self-Healer] Realignment needed for Exam: ${exam.title} (ID: ${exam.id})`);
          
          // Re-build healed list
          const healedList: any[] = [];
          sectionsWithRanges.forEach(sec => {
            for (let i = 0; i < sec.qCount; i++) {
              const qNum = sec.qStart + i;
              healedList.push({
                examId: exam.id!,
                qNum,
                sectionName: sec.sectionName,
                subjectName: sec.subjectName,
                questionText: '',
                options: sec.questionType === '5 option' ? ['', '', '', '', ''] : ['', '', '', ''],
                correctOptionIdx: 0,
                explanation: '',
                questionImage: '',
                difficulty: 'Easy' as const
              });
            }
          });

          const sectionCounters2: Record<string, number> = {};
          nonPlaceholders.forEach((qVal) => {
            const subName = qVal.subjectName || 'Subject 1';
            const secName = qVal.sectionName || 'Section 1';
            const key = `${subName.toLowerCase().trim()}|${secName.toLowerCase().trim()}`;
            
            const secConfig = sectionsWithRanges.find(sec => 
              sec.subjectName.toLowerCase().trim() === subName.toLowerCase().trim() &&
              sec.sectionName.toLowerCase().trim() === secName.toLowerCase().trim()
            );

            if (secConfig) {
              const counter = sectionCounters2[key] || 0;
              const qNum = secConfig.qStart + counter;
              if (qNum <= secConfig.qEnd) {
                const targetIdx = qNum - 1;
                healedList[targetIdx] = {
                  ...healedList[targetIdx],
                  id: qVal.id,
                  questionText: qVal.questionText,
                  options: qVal.options,
                  correctOptionIdx: qVal.correctOptionIdx,
                  explanation: qVal.explanation || '',
                  questionImage: qVal.questionImage || '',
                  difficulty: qVal.difficulty || 'Easy'
                };
                sectionCounters2[key] = counter + 1;
              }
            }
          });

          // Save healed questions to local IndexedDB
          const cleanQuestions = healedList.map(q => ({
            examId: exam.id!,
            subjectName: q.subjectName,
            sectionName: q.sectionName,
            questionText: (q.questionText || '').trim(),
            options: q.options ? q.options.map((o: string) => (o || '').trim()) : ['', '', '', ''],
            correctOptionIdx: Number(q.correctOptionIdx || 0),
            explanation: (q.explanation || '').trim(),
            questionImage: q.questionImage || undefined,
            difficulty: q.difficulty || 'Easy',
            syncState: 'pending' as const
          }));

          await db.questions.where('examId').equals(exam.id).delete();
          await db.questions.bulkAdd(cleanQuestions);
          const reloaded = await db.questions.where('examId').equals(exam.id).toArray();

          // Save healed answerKey to local IndexedDB
          const newAnswerKey: Record<number, string> = {};
          reloaded.forEach((q, index) => {
            newAnswerKey[index + 1] = ['A', 'B', 'C', 'D', 'E'][q.correctOptionIdx] || 'A';
          });

          const updatedAnswerKeys: Record<string, Record<number, string>> = {};
          const setsCount = exam.examSetsCount || 1;
          const setNames = Array.from({ length: setsCount }).map((_, i) => String.fromCharCode(65 + i));
          setNames.forEach(setName => {
            const existingSetKey = exam.answerKeys?.[setName] || (setName === 'A' ? exam.answerKey : {}) || {};
            const newSetKey: Record<number, string> = {};
            for (let qNum = 1; qNum <= reloaded.length; qNum++) {
              if (setName === 'A') {
                newSetKey[qNum] = newAnswerKey[qNum] || 'A';
              } else {
                newSetKey[qNum] = existingSetKey[qNum] || 'A';
              }
            }
            updatedAnswerKeys[setName] = newSetKey;
          });

          await db.exams.update(exam.id, {
            numQuestions: reloaded.length,
            answerKey: newAnswerKey,
            answerKeys: updatedAnswerKeys,
            syncState: 'pending'
          });

          // Sync to cloud MySQL DB
          try {
            const syncRes = await fetch('/api/questions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ examId: exam.id, questions: cleanQuestions.map(({ syncState, ...qFields }) => qFields) })
            });
            if (syncRes.ok) {
              await db.transaction('rw', db.questions, async () => {
                for (const eq of reloaded) {
                  if (eq.id) {
                    await db.questions.update(eq.id, { syncState: 'synced' });
                  }
                }
              });
            }
          } catch {}

          try {
            const freshExam = await db.exams.get(exam.id);
            if (freshExam) {
              await syncExamToCloud(freshExam);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.warn("Background self-healer check failed:", err);
    }

    console.log("✅ Cloud sync from Hostinger MySQL completed successfully.");
  } catch (err) {
    console.warn("Cloud sync pull failed:", err);
  } finally {
    isPullSyncing = false;
  }
}

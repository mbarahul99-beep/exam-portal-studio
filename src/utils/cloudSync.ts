import { db, type Student, type Exam, type ExamSubmission, type PendingRegistration, type ClassEntity, type QuestionBank, type BankQuestion, type AttendanceRecord } from '../db';

export async function syncAttendanceToCloud(record: AttendanceRecord) {
  try {
    await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
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
            await db.exams.add({ ...examObj, id: newId });
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
      }
    }
  } catch (err) {
    console.warn("Cloud sync exam failed:", err);
  }
}

export async function syncStudentToCloud(student: Student) {
  try {
    await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(student)
    });
  } catch (err) {
    console.warn("Cloud sync student failed:", err);
  }
}

export async function syncSubmissionToCloud(sub: ExamSubmission) {
  if (sub.studentId < 0) return; // Skip temporary placeholders for unknown candidates
  try {
    await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub)
    });
  } catch (err) {
    console.warn("Cloud sync submission failed:", err);
  }
}

export async function syncClassToCloud(cls: ClassEntity) {
  try {
    await fetch('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cls)
    });
  } catch (err) {
    console.warn("Cloud sync class failed:", err);
  }
}

export async function syncPendingRegistrationToCloud(reg: PendingRegistration) {
  try {
    await fetch('/api/register-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reg)
    });
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
            await db.questionBanks.add({ ...bankObj, id: newId });
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
          await db.questionBank.add({ ...qObj, id: newId });
        }
      }
    }
  } catch (err) {
    console.warn("Cloud sync bank question failed:", err);
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
      
      // Delete local students no longer on MySQL server
      const localStudents = await db.students.toArray();
      for (const ls of localStudents) {
        if (ls.id && !serverStudentIds.has(ls.id) && !ls.email?.includes('@appexjind.in')) {
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
            await db.students.add({ id: st.id, ...studentFields });
          } else {
            const faceDescriptor = st.faceDescriptor || existing.faceDescriptor;
            const facePhoto = st.facePhoto || existing.facePhoto;
            const merged = { ...studentFields, faceDescriptor, facePhoto };
            if (!isRecordEqual(existing, merged)) {
              await db.students.put({
                id: st.id,
                ...merged
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
        if (lc.name && !serverClassNames.has(lc.name) && lc.id) {
          await db.classes.delete(lc.id);
        }
      }

      for (const cls of data.classes) {
        try {
          const { id: mysqlId, ...classFields } = cls;
          const existing = await db.classes.where('name').equalsIgnoreCase(cls.name).first();
          if (!existing) {
            await db.classes.add({ id: cls.id, ...classFields });
          } else {
            if (!isRecordEqual(existing, classFields)) {
              await db.classes.update(existing.id!, classFields);
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
            await db.classes.add({ name: clsName as string, state: 'Synced', createdAt: new Date() });
          }
        } catch {}
      }
    }

    // 3. Sync Exams (Add/Update & Purge Deleted)
    if (data.exams && Array.isArray(data.exams)) {
      const serverExamIds = new Set(data.exams.map((e: any) => Number(e.id)));
      const serverExamTitles = new Set(data.exams.map((e: any) => e.title));
      const localExams = await db.exams.toArray();
      for (const le of localExams) {
        if (le.id && !serverExamIds.has(le.id)) {
          await db.exams.delete(le.id);
        } else if (!serverExamTitles.has(le.title) && le.title.includes('NEET Practice Test 1') && le.id) {
          await db.exams.delete(le.id);
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
              id: Number(ex.id)
            });
          } else {
            if (!isRecordEqual(existing, examFields)) {
              await db.exams.update(Number(ex.id), examFields);
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
        if (ls.id && !serverSubIds.has(ls.id)) {
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
            await db.submissions.add({ id: sub.id, ...subFields });
          } else {
            // Update the primary submission record & remove any duplicate local rows
            if (matchingSubs[0].id && !isRecordEqual(matchingSubs[0], subFields)) {
              await db.submissions.update(matchingSubs[0].id, subFields);
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
        if (!activeExamIds.has(sub.examId) && sub.id) {
          await db.submissions.delete(sub.id);
          try {
            await fetch(`/api/submissions/${sub.id}`, { method: 'DELETE' });
          } catch {}
        }
      }
    } catch {}

    // 5. Sync Questions
    if (data.questions && Array.isArray(data.questions)) {
      // Find all unique examIds present in the incoming exams list
      const serverExamIds = new Set<number>(data.exams ? data.exams.map((e: any) => Number(e.id)) : []);
      
      try {
        await db.transaction('rw', db.questions, async () => {
          // Delete local questions for all exams that are synced from server to prevent duplicates
          for (const examId of serverExamIds) {
            await db.questions.where('examId').equals(examId).delete();
          }

          // Prepare clean questions list for bulkAdd
          const qListToAdd: any[] = [];
          for (const q of data.questions) {
            const { id: mysqlId, ...qFields } = q;
            qFields.examId = Number(qFields.examId);
            qFields.correctOptionIdx = Number(qFields.correctOptionIdx);
            qListToAdd.push(qFields);
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
        if (lt.userId && !serverTeacherUserIds.has(lt.userId) && lt.id) {
          await db.teachers.delete(lt.id);
        }
      }

      for (const t of data.teachers) {
        try {
          const { id: mysqlId, ...tFields } = t;
          const existing = await db.teachers.where('userId').equals(t.userId).first();
          if (!existing) {
            await db.teachers.add({ id: t.id, ...tFields });
          } else {
            await db.teachers.update(existing.id!, tFields);
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
        if (la.id && !serverAttendanceIds.has(la.id)) {
          await db.attendance.delete(la.id);
        }
      }

      for (const att of data.attendance) {
        try {
          const { id: mysqlId, ...attFields } = att;
          // Find existing by ID or composite key [date+studentId]
          const existing = await db.attendance.get(att.id) || await db.attendance.where('[date+studentId]').equals([att.date, att.studentId]).first();
          if (!existing) {
            await db.attendance.add({ id: att.id, ...attFields });
          } else {
            if (!isRecordEqual(existing, attFields)) {
              await db.attendance.update(existing.id!, attFields);
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

          // Delete local pending registrations that are no longer pending on the server
          const localPending = await db.pendingRegistrations.where('status').equals('pending').toArray();
          for (const localReg of localPending) {
            if (localReg.id && !serverIds.has(localReg.id)) {
              await db.pendingRegistrations.delete(localReg.id);
            }
          }

          for (const reg of pendingData) {
            try {
              reg.fatherName = reg.fatherName || reg.fathername || reg.father_name;
              const existing = await db.pendingRegistrations.get(reg.id);
              if (!existing) {
                await db.pendingRegistrations.add(reg);
              } else {
                await db.pendingRegistrations.put(reg);
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
        const isNew = lb.createdAt && (new Date().getTime() - new Date(lb.createdAt).getTime() < 8000);
        if (lb.id && !serverBankIds.has(lb.id) && lb.name !== "NEET / JEE - Core Library: Mixed Topics" && !isNew) {
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
              createdAt: new Date(b.createdAt)
            });
          } else {
            if (!isRecordEqual(existing, incoming)) {
              await db.questionBanks.put({
                id: b.id,
                name: b.name,
                targetExam: b.targetExam,
                subject: b.subject,
                topic: b.topic,
                createdAt: new Date(b.createdAt)
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
        const isNew = lq.createdAt && (new Date().getTime() - new Date(lq.createdAt).getTime() < 8000);
        if (lq.id && !serverQIds.has(lq.id) && lq.bankId !== defaultBankId && !isNew) {
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
              createdAt: new Date(q.createdAt)
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
                createdAt: new Date(q.createdAt)
              });
            }
          }
        } catch (err) {
          console.warn("Error syncing bank question item:", err);
        }
      }
    }

    console.log("✅ Cloud sync from Hostinger MySQL completed successfully.");
  } catch (err) {
    console.warn("Cloud sync pull failed:", err);
  } finally {
    isPullSyncing = false;
  }
}

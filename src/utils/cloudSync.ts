import { db, type Student, type Exam, type ExamSubmission, type PendingRegistration, type ClassEntity, type QuestionBank, type BankQuestion } from '../db';

/**
 * Cloud Sync helper for synchronizing IndexedDB data with Hostinger MySQL Database
 */

export async function syncExamToCloud(exam: Exam) {
  try {
    await fetch('/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exam)
    });
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
    await fetch('/api/question-banks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bank)
    });
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
    await fetch('/api/bank-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(q)
    });
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

export async function pullCloudUpdatesToIndexedDB() {
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
          await db.students.delete(ls.id!);
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
            if (duplicate) {
              await db.students.delete(duplicate.id!);
            }
            await db.students.add({ id: st.id, ...studentFields });
          } else {
            const faceDescriptor = st.faceDescriptor || existing.faceDescriptor;
            const facePhoto = st.facePhoto || existing.facePhoto;
            await db.students.put({
              id: st.id,
              ...studentFields,
              faceDescriptor,
              facePhoto
            });
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
        if (!serverClassNames.has(lc.name) && ['JEE', 'Grade 12-A'].includes(lc.name)) {
          await db.classes.delete(lc.id!);
        }
      }

      for (const cls of data.classes) {
        try {
          const { id: mysqlId, ...classFields } = cls;
          const existing = await db.classes.where('name').equalsIgnoreCase(cls.name).first();
          if (!existing) {
            await db.classes.add(classFields);
          } else {
            await db.classes.update(existing.id!, classFields);
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
      const serverExamTitles = new Set(data.exams.map((e: any) => e.title));
      const localExams = await db.exams.toArray();
      for (const le of localExams) {
        if (!serverExamTitles.has(le.title) && le.title.includes('NEET Practice Test 1')) {
          await db.exams.delete(le.id!);
        }
      }
      for (const ex of data.exams) {
        try {
          const { id: mysqlId, ...examFields } = ex;
          let existing = await db.exams.where('title').equalsIgnoreCase(ex.title).first();
          if (!existing && ex.id) {
            existing = await db.exams.get(ex.id);
          }
          if (!existing) {
            await db.exams.add(examFields);
          } else {
            await db.exams.update(existing.id!, examFields);
          }
        } catch (err) {
          console.warn("Error syncing exam item:", err);
        }
      }
    }

    // 4. Sync Submissions
    if (data.submissions && Array.isArray(data.submissions)) {
      for (const sub of data.submissions) {
        try {
          const { id: mysqlId, ...subFields } = sub;
          const matchingSubs = await db.submissions
            .where('[examId+studentId]')
            .equals([sub.examId, sub.studentId])
            .toArray();

          if (matchingSubs.length === 0) {
            await db.submissions.add(subFields);
          } else {
            // Update the primary submission record & remove any duplicate local rows
            await db.submissions.update(matchingSubs[0].id!, subFields);
            for (let i = 1; i < matchingSubs.length; i++) {
              await db.submissions.delete(matchingSubs[i].id!);
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
        if (!activeExamIds.has(sub.examId)) {
          await db.submissions.delete(sub.id!);
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
      for (const t of data.teachers) {
        try {
          const { id: mysqlId, ...tFields } = t;
          const existing = await db.teachers.where('userId').equals(t.userId).first();
          if (!existing) {
            await db.teachers.add(tFields);
          } else {
            await db.teachers.update(existing.id!, tFields);
          }
        } catch (err) {
          console.warn("Error syncing teacher item:", err);
        }
      }
    }

    // 7. Sync Pending Registrations
    try {
      const pendingRes = await fetch('/api/pending-registrations');
      if (pendingRes.ok) {
        const pendingData = await pendingRes.json();
        if (Array.isArray(pendingData)) {
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
          } else {
            await db.settings.update(existing.id!, { value: val });
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
        if (lb.id && !serverBankIds.has(lb.id)) {
          await db.questionBanks.delete(lb.id);
        }
      }
      for (const b of data.questionBanks) {
        try {
          const existing = await db.questionBanks.get(b.id);
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
            await db.questionBanks.put({
              id: b.id,
              name: b.name,
              targetExam: b.targetExam,
              subject: b.subject,
              topic: b.topic,
              createdAt: new Date(b.createdAt)
            });
          }
        } catch (err) {
          console.warn("Error syncing question bank item:", err);
        }
      }
    }

    // 10. Sync Bank Questions (db.questionBank table)
    if (data.bankQuestions && Array.isArray(data.bankQuestions)) {
      const serverQIds = new Set(data.bankQuestions.map((q: any) => q.id));
      const localQs = await db.questionBank.toArray();
      for (const lq of localQs) {
        if (lq.id && !serverQIds.has(lq.id)) {
          await db.questionBank.delete(lq.id);
        }
      }
      for (const q of data.bankQuestions) {
        try {
          const existing = await db.questionBank.get(q.id);
          if (!existing) {
            await db.questionBank.add({
              id: q.id,
              bankId: q.bankId,
              questionText: q.questionText,
              options: q.options,
              correctOptionIdx: q.correctOptionIdx,
              difficulty: q.difficulty,
              explanation: q.explanation || undefined,
              createdAt: new Date(q.createdAt)
            });
          } else {
            await db.questionBank.put({
              id: q.id,
              bankId: q.bankId,
              questionText: q.questionText,
              options: q.options,
              correctOptionIdx: q.correctOptionIdx,
              difficulty: q.difficulty,
              explanation: q.explanation || undefined,
              createdAt: new Date(q.createdAt)
            });
          }
        } catch (err) {
          console.warn("Error syncing bank question item:", err);
        }
      }
    }

    console.log("✅ Cloud sync from Hostinger MySQL completed successfully.");
  } catch (err) {
    console.warn("Cloud sync pull failed:", err);
  }
}

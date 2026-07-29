import { db, type Student, type Exam, type ExamSubmission, type PendingRegistration, type ClassEntity } from '../db';

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
      const serverStudentNums = new Set(data.students.map((s: any) => s.studentNum));
      
      // Delete local students no longer on MySQL server
      const localStudents = await db.students.toArray();
      for (const ls of localStudents) {
        if (!serverStudentNums.has(ls.studentNum) && !ls.email?.includes('@appexjind.in')) {
          await db.students.delete(ls.id!);
        }
      }

      for (const st of data.students) {
        try {
          const { id: mysqlId, ...studentFields } = st;
          const existing = await db.students.where('studentNum').equals(st.studentNum).first();
          if (!existing) {
            await db.students.add(studentFields);
          } else {
            const faceDescriptor = st.faceDescriptor || existing.faceDescriptor;
            const facePhoto = st.facePhoto || existing.facePhoto;
            await db.students.update(existing.id!, {
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
      for (const q of data.questions) {
        try {
          const { id: mysqlId, ...qFields } = q;
          const existing = await db.questions.get(q.id);
          if (!existing) {
            await db.questions.add(qFields);
          } else {
            await db.questions.update(existing.id!, qFields);
          }
        } catch (err) {
          console.warn("Error syncing question item:", err);
        }
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
              const { id: mysqlId, ...regFields } = reg;
              const existing = await db.pendingRegistrations.get(reg.id);
              if (!existing) {
                await db.pendingRegistrations.add(regFields);
              } else {
                await db.pendingRegistrations.update(existing.id!, regFields);
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

    console.log("✅ Cloud sync from Hostinger MySQL completed successfully.");
  } catch (err) {
    console.warn("Cloud sync pull failed:", err);
  }
}

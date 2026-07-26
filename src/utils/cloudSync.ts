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

export async function pullCloudUpdatesToIndexedDB() {
  try {
    const res = await fetch('/api/sync/all');
    if (!res.ok) return;
    const data = await res.json();

    if (data.students && Array.isArray(data.students)) {
      for (const st of data.students) {
        const existing = await db.students.where('studentNum').equals(st.studentNum).first();
        if (!existing) {
          await db.students.add(st);
        } else {
          const faceDescriptor = st.faceDescriptor || existing.faceDescriptor;
          const facePhoto = st.facePhoto || existing.facePhoto;
          await db.students.update(existing.id!, {
            ...st,
            faceDescriptor,
            facePhoto
          });
        }
      }
    }

    if (data.classes && Array.isArray(data.classes)) {
      for (const cls of data.classes) {
        const existing = await db.classes.where('name').equalsIgnoreCase(cls.name).first();
        if (!existing) {
          await db.classes.add(cls);
        }
      }
    }

    if (data.exams && Array.isArray(data.exams)) {
      for (const ex of data.exams) {
        let existing = await db.exams.get(ex.id);
        if (!existing) {
          existing = await db.exams.where('title').equalsIgnoreCase(ex.title).first();
        }
        if (!existing) {
          await db.exams.add(ex);
        } else {
          await db.exams.update(existing.id!, ex);
        }
      }
    }

    if (data.submissions && Array.isArray(data.submissions)) {
      for (const sub of data.submissions) {
        const existing = await db.submissions
          .where('[examId+studentId]')
          .equals([sub.examId, sub.studentId])
          .first();

        if (!existing) {
          await db.submissions.add(sub);
        } else {
          await db.submissions.update(existing.id!, sub);
        }
      }
    }

    if (data.questions && Array.isArray(data.questions)) {
      for (const q of data.questions) {
        const existing = await db.questions.get(q.id);
        if (!existing) {
          await db.questions.add(q);
        } else {
          await db.questions.update(q.id, q);
        }
      }
    }

    if (data.teachers && Array.isArray(data.teachers)) {
      for (const t of data.teachers) {
        const existing = await db.teachers.where('userId').equals(t.userId).first();
        if (!existing) {
          await db.teachers.add(t);
        } else {
          await db.teachers.update(existing.id!, t);
        }
      }
    }

    // Pull pending registrations from MySQL
    try {
      const pendingRes = await fetch('/api/pending-registrations');
      if (pendingRes.ok) {
        const pendingData = await pendingRes.json();
        if (Array.isArray(pendingData)) {
          for (const reg of pendingData) {
            const existing = await db.pendingRegistrations.get(reg.id);
            if (!existing) {
              await db.pendingRegistrations.add(reg);
            } else {
              await db.pendingRegistrations.update(reg.id, reg);
            }
          }
        }
      }
    } catch {
      // Ignore secondary pull failure
    }

    console.log("✅ Cloud sync from Hostinger MySQL completed successfully.");
  } catch (err) {
    console.warn("Cloud sync pull failed:", err);
  }
}

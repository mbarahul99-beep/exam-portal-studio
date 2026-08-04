async function main() {
  const res = await fetch("https://app.instituteapex.in/api/sync/all");
  const data = await res.json();
  const subs = data.submissions.filter(s => s.studentId === 45);
  console.log("SUBMISSIONS FOR STUDENT 45:");
  subs.forEach(s => {
    console.log(`- ExamID: ${s.examId}, Score: ${s.score}, Answers Length: ${Object.keys(s.answers || {}).length}, scannedAt: ${s.scannedAt}`);
  });
}

main().catch(console.error);

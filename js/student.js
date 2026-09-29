// js/student.js - ระบบฝั่งนักศึกษา (Student Check-in & Quiz)

let courseRosterData = {};
const targetCourseId = "969-042G4"; // รหัสวิชาหลัก

document.addEventListener("DOMContentLoaded", () => {
  loadCourseRoster();
});

// ดึงฐานข้อมูลรายชื่อนักศึกษา (roster) จาก Firebase ของแอดมิน
function loadCourseRoster() {
  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}courses/${targetCourseId}/roster.json`)
    .then(r => r.json())
    .then(roster => {
      if (roster) {
        courseRosterData = roster;
      }
    })
    .catch(err => {
      console.warn("Could not load roster data:", err);
    });
}

// ตรวจสอบและแสดงชื่ออัตโนมัติเมื่อนักศึกษากรอกรหัส
function previewStudentName() {
  const idInput = document.getElementById('studentIdInput');
  const nameInput = document.getElementById('studentNameInput');
  if (!idInput || !nameInput) return;

  const stId = idInput.value.trim();

  if (stId.length >= 8) {
    if (courseRosterData[stId]) {
      nameInput.value = courseRosterData[stId];
      nameInput.style.color = "#059669";
    } else {
      nameInput.value = "ไม่พบรหัสนักศึกษาในระบบรายวิชา";
      nameInput.style.color = "#DC2626";
    }
  } else {
    nameInput.value = "";
    nameInput.style.color = "#0F172A";
  }
}

function verifyAndCheckIn() {
  const stId = document.getElementById('studentIdInput').value.trim();
  const stName = document.getElementById('studentNameInput').value.trim();
  const pin = document.getElementById('pinInput').value.trim();

  if (!stId || stId.length < 8) {
    return alert("กรุณากรอกรหัสนักศึกษาให้ถูกต้อง");
  }
  if (!stName || stName.includes("ไม่พบ")) {
    return alert("ไม่พบชื่อนักศึกษาในระบบ กรุณาตรวจสอบรหัสอีกครั้ง");
  }
  if (!pin || pin.length < 4) {
    return alert("กรุณากรอกรหัส PIN 4 หลัก");
  }

  document.getElementById('checkinSection').style.display = 'none';
  document.getElementById('resultBox').style.display = 'block';
  document.getElementById('resultDetails').innerText = `ยินดีต้อนรับคุณ ${stName} (${stId}) บันทึกการเข้าเรียนเรียบร้อยแล้ว`;
}

function submitAnswer(choice) {
  alert(`ส่งคำตอบตัวเลือก ${choice} เรียบร้อยแล้ว!`);
}
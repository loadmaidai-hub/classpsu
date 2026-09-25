// js/submit.js - ระบบส่งการบ้าน ดึงข้อมูล Week 2 และโฟลเดอร์ที่บันทึกไว้แน่นอน

let lockedCourseId = '969-042G4';
let activeSession = "Week 2 (23 ก.ย. 2569)"; // ตั้งค่าเริ่มต้นเป็น Week 2
let activeRoster = {};
let currentAssignmentConfig = null;
let timerInterval = null;
let selectedFile = null;

document.addEventListener("DOMContentLoaded", () => {
  initSubmitApp();
});

function initSubmitApp() {
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  // 1. อ่านรหัสวิชา และสัปดาห์จาก URL Parameter (ถ้ามี)
  const urlParams = new URLSearchParams(window.location.search);
  const paramCourse = urlParams.get('course');
  const paramSession = urlParams.get('session');
  const cachedCourse = localStorage.getItem('lockedCourseId') || localStorage.getItem('lastSelectedCourse');
  
  lockedCourseId = paramCourse || cachedCourse || '969-042G4';

  // 2. ดึงสัปดาห์เรียนจริงจาก Firebase
  fetch(`${baseUrl}current_session.json`)
    .then(r => r.json())
    .then(session => {
      // ถ้ามีการส่ง paramSession หรือดึงค่าได้ ให้ตั้งค่าตามนั้น
      if (paramSession) {
        activeSession = paramSession;
      } else if (session) {
        activeSession = session;
      } else if (CONFIG && CONFIG.SESSIONS && CONFIG.SESSIONS.length > 1) {
        activeSession = CONFIG.SESSIONS[1]; // ค่าสำรอง: Week 2
      }

      // แสดงชื่อสัปดาห์บนมุมขวาบน
      updateWeekBadgeUI();

      return fetch(`${baseUrl}courses/${lockedCourseId}.json`);
    })
    .then(r => r.json())
    .then(course => {
      if (course) {
        activeRoster = course.roster || {};
      }
      loadAssignmentConfig();
    })
    .catch(() => {
      updateWeekBadgeUI();
      loadAssignmentConfig();
    });
}

function updateWeekBadgeUI() {
  const weekBadge = document.getElementById('currentWeekBadge');
  if (weekBadge) {
    weekBadge.innerText = activeSession;
  }
}

// ตรวจสอบรหัสนักศึกษาและแสดงชื่อ
function checkSubmitStudentId() {
  const stId = document.getElementById('submitStudentId').value.trim();
  const nameInput = document.getElementById('submitStudentName');

  if (activeRoster[stId]) {
    nameInput.value = activeRoster[stId];
    nameInput.style.color = '#059669';
  } else if (stId.length >= 4) {
    nameInput.value = "❌ ไม่พบรายชื่อในระบบ";
    nameInput.style.color = '#DC2626';
  } else {
    nameInput.value = "";
  }
}

// ฟังก์ชันแปลง Key ให้ตรงกับ Path ของ Firebase
function getSafeSessionKey(sess) {
  if (typeof sanitizeKey === 'function') {
    return sanitizeKey(sess);
  }
  return encodeURIComponent(sess).replace(/\./g, '%2E');
}

// โหลดการตั้งค่าการบ้านของ Week 2
function loadAssignmentConfig() {
  const safeSession = getSafeSessionKey(activeSession);
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}session_settings/${lockedCourseId}/${safeSession}/assignmentConfig.json`)
    .then(r => r.json())
    .then(cfg => {
      // หากของ Week ปัจจุบันไม่มี ให้ลองเช็คว่าถ้าสัปดาห์เป็น Week 2 จะมีไหม
      if (!cfg && !activeSession.includes("Week 2") && CONFIG.SESSIONS && CONFIG.SESSIONS[1]) {
        const altSafe = getSafeSessionKey(CONFIG.SESSIONS[1]);
        return fetch(`${baseUrl}session_settings/${lockedCourseId}/${altSafe}/assignmentConfig.json`)
          .then(r => r.json())
          .then(altCfg => {
            if (altCfg && altCfg.folderUrl) {
              activeSession = CONFIG.SESSIONS[1];
              updateWeekBadgeUI();
              currentAssignmentConfig = altCfg;
              startCountdown();
            } else {
              currentAssignmentConfig = null;
              startCountdown();
            }
          });
      }

      currentAssignmentConfig = cfg;
      startCountdown();
    })
    .catch(() => {
      startCountdown();
    });
}

// นับเวลาถอยหลัง / แจ้งสถานะการเปิดรับงาน
function startCountdown() {
  if (timerInterval) clearInterval(timerInterval);
  const badge = document.getElementById('countdownBadge');
  const btn = document.getElementById('btnSubmitHomework');

  if (!badge) return;

  if (!currentAssignmentConfig || !currentAssignmentConfig.folderUrl) {
    badge.innerText = "⚠️ ยังไม่เปิดรับการบ้าน (ไม่มีลิงก์โฟลเดอร์)";
    badge.style.background = "#FEE2E2";
    badge.style.borderColor = "#FECACA";
    badge.style.color = "#DC2626";
    if (btn) btn.disabled = true;
    return;
  }

  if (!currentAssignmentConfig.deadline) {
    badge.innerText = "ไม่ได้กำหนดเวลาปิดรับ";
    badge.style.background = "#ECFDF5";
    badge.style.borderColor = "#A7F3D0";
    badge.style.color = "#059669";
    if (btn) btn.disabled = false;
    return;
  }

  const deadlineTime = new Date(currentAssignmentConfig.deadline).getTime();

  timerInterval = setInterval(() => {
    const now = new Date().getTime();
    const distance = deadlineTime - now;

    if (distance < 0) {
      clearInterval(timerInterval);
      badge.innerText = "🔒 ปิดรับส่งการบ้านแล้ว (หมดเวลา)";
      badge.style.background = "#FEE2E2";
      badge.style.borderColor = "#FECACA";
      badge.style.color = "#DC2626";
      if (btn) btn.disabled = true;
    } else {
      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60)) / 1000);
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      badge.innerText = `⏳ เหลือเวลาส่ง: ${days}วัน ${hours}ชม. ${minutes}นาที ${seconds}วินาที`;
      badge.style.background = "#FEF3C7";
      badge.style.borderColor = "#FCD34D";
      badge.style.color = "#92400E";
      if (btn) btn.disabled = false;
    }
  }, 1000);
}

// จัดการเลือกไฟล์
function handleFileSelect(e) {
  if (e.target.files && e.target.files[0]) {
    selectedFile = e.target.files[0];
    const dropText = document.getElementById('dropzoneText');
    if (dropText) {
      dropText.innerText = `✅ ไฟล์ที่เลือก: ${selectedFile.name} (${formatBytes(selectedFile.size)})`;
    }
  }
}

// อัปโหลดไฟล์ส่งการบ้าน
function uploadHomeworkFile() {
  const stId = document.getElementById('submitStudentId').value.trim();

  if (!activeRoster[stId]) return alert("กรุณากรอกรหัสนักศึกษาให้ถูกต้อง");
  if (!selectedFile) return alert("กรุณาเลือกไฟล์ชิ้นงานที่ต้องการส่ง");
  if (!currentAssignmentConfig || !currentAssignmentConfig.folderUrl) return alert("ยังไม่ได้เปิดรับส่งการบ้านสำหรับสัปดาห์นี้");

  const btn = document.getElementById('btnSubmitHomework');
  if (btn) {
    btn.innerText = "กำลังอัปโหลดเข้า Google Drive...";
    btn.disabled = true;
  }

  const reader = new FileReader();
  reader.readAsDataURL(selectedFile);
  reader.onload = function () {
    const base64Data = reader.result.split(',')[1];
    const fileExt = selectedFile.name.split('.').pop();
    const cleanStudentName = activeRoster[stId].replace(/\s+/g, '_');
    const newFileName = `${stId}_${cleanStudentName}_${activeSession}.${fileExt}`;

    const payload = {
      folderUrl: currentAssignmentConfig.folderUrl,
      fileName: newFileName,
      fileData: base64Data,
      mimeType: selectedFile.type || "application/octet-stream"
    };

    fetch(CONFIG.SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(res => {
      if (res.status === "success") {
        return recordHomeworkSubmission(stId, res.fileUrl, formatBytes(selectedFile.size));
      } else {
        throw new Error(res.message || "การอัปโหลดไฟล์ล้มเหลว");
      }
    })
    .then(() => {
      alert(`✓ ส่งการบ้านวิชา [${lockedCourseId}] ประจำ [${activeSession}] เรียบร้อยแล้ว!`);
      location.reload();
    })
    .catch(err => {
      alert("❌ " + err.message);
      if (btn) {
        btn.innerText = "🚀 อัปโหลดส่งการบ้านเดี๋ยวนี้";
        btn.disabled = false;
      }
    });
  };
}

// บันทึกผลส่งงาน
function recordHomeworkSubmission(stId, fileUrl, fileSize) {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const safeSession = getSafeSessionKey(activeSession);
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  return fetch(`${baseUrl}attendance/${lockedCourseId}/${safeSession}/${stId}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileUrl: fileUrl,
      fileSize: fileSize,
      submittedTime: timeStr,
      status: "PRESENT",
      score: 100
    })
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// js/submit.js - ล็อกวิชาและสัปดาห์ส่งงานตรงตาม Firebase เสมอ

let lockedCourseId = null;
let activeSession = (typeof CONFIG !== 'undefined' && CONFIG.SESSIONS) ? CONFIG.SESSIONS[0] : "Week 2";
let activeRoster = {};
let currentAssignmentConfig = null;
let timerInterval = null;

document.addEventListener("DOMContentLoaded", () => {
  initSubmitApp();
});

function initSubmitApp() {
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  // 1. ดึงสัปดาห์เรียนปัจจุบันจริงจาก Firebase
  fetch(`${baseUrl}current_session.json`)
    .then(r => r.json())
    .then(session => {
      if (session) {
        activeSession = session;
      }
      
      const sessionDisplay = document.querySelector('.projector-title, #submitSessionText, [id*="Session"]');
      if (sessionDisplay) {
        sessionDisplay.innerText = `${activeSession}`;
      }
      
      // อัปเดตข้อความสัปดาห์มุมขวาบน
      const topWeekLabel = document.querySelector('.right-header, .submit-counter, [class*="week"]');
      
      return fetch(`${baseUrl}courses.json`);
    })
    .then(r => r.json())
    .then(courses => {
      const allCourses = courses || {};
      const urlParams = new URLSearchParams(window.location.search);
      const paramCourse = urlParams.get('course');
      const cachedCourse = localStorage.getItem('lockedCourseId') || localStorage.getItem('lastSelectedCourse');

      lockedCourseId = paramCourse || cachedCourse || Object.keys(allCourses)[0];
      localStorage.setItem('lockedCourseId', lockedCourseId);

      const course = allCourses[lockedCourseId];
      if (course) {
        activeRoster = course.roster || {};
        const badge = document.getElementById('lockedCourseBadge');
        if (badge) badge.innerText = `📚 วิชา: [${course.courseId}] ${course.courseName}`;
        
        const backLink = document.getElementById('backToCheckinLink');
        if (backLink) backLink.href = `index.html?course=${encodeURIComponent(lockedCourseId)}`;
      }

      loadAssignmentConfig();
    })
    .catch(() => {
      loadAssignmentConfig();
    });
}

function checkSubmitStudentId() {
  const stId = document.getElementById('submitStudentId').value.trim();
  const nameBox = document.getElementById('submitStudentName');
  if (!nameBox) return;

  if (activeRoster[stId]) {
    nameBox.innerText = `👤 ${activeRoster[stId]}`;
    nameBox.style.color = '#059669';
  } else if (stId.length >= 4) {
    nameBox.innerText = `❌ ไม่พบรหัสในวิชานี้`;
    nameBox.style.color = '#DC2626';
  } else {
    nameBox.innerText = '';
  }
}

function loadAssignmentConfig() {
  const safeSession = sanitizeKey(activeSession);
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}session_settings/${lockedCourseId}/${safeSession}/assignmentConfig.json`)
    .then(r => r.json())
    .then(cfg => {
      currentAssignmentConfig = cfg;
      startCountdown();
    });
}

function startCountdown() {
  if (timerInterval) clearInterval(timerInterval);
  const badge = document.getElementById('countdownBadge');
  const btn = document.getElementById('btnSubmitHomework');

  if (!badge) return;

  if (!currentAssignmentConfig || !currentAssignmentConfig.folderUrl) {
    badge.innerText = "⚠️ สัปดาห์นี้ยังไม่เปิดรับการบ้าน (ไม่มีลิงก์โฟลเดอร์)";
    badge.style.background = "#FEE2E2";
    badge.style.borderColor = "#FECACA";
    badge.style.color = "#DC2626";
    if (btn) btn.disabled = true;
    return;
  }

  if (!currentAssignmentConfig.deadline) {
    badge.innerText = "ไม่ได้กำหนดเวลาปิดรับ";
    badge.style.background = "#D1FAE5";
    badge.style.borderColor = "#A7F3D0";
    badge.style.color = "#065F46";
    if (btn) btn.disabled = false;
    return;
  }

  const deadlineTime = new Date(currentAssignmentConfig.deadline).getTime();

  timerInterval = setInterval(() => {
    const now = new Date().getTime();
    const distance = deadlineTime - now;

    if (distance < 0) {
      clearInterval(timerInterval);
      badge.innerText = "🔒 ปิดรับส่งการบ้านแล้ว (หมดเวลาส่ง)";
      badge.style.background = "#FEE2E2";
      badge.style.borderColor = "#FECACA";
      badge.style.color = "#DC2626";
      if (btn) btn.disabled = true;
    } else {
      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      badge.innerText = `⏳ เหลือเวลาส่ง: ${days}วัน ${hours}ชม. ${minutes}นาที ${seconds}วินาที`;
      badge.style.background = "#FEF3C7";
      badge.style.borderColor = "#FCD34D";
      badge.style.color = "#92400E";
      if (btn) btn.disabled = false;
    }
  }, 1000);
}

function uploadHomeworkFile() {
  const stId = document.getElementById('submitStudentId').value.trim();
  const fileInput = document.getElementById('homeworkFile');

  if (!activeRoster[stId]) return alert("กรุณาตรวจสอบรหัสนักศึกษา");
  if (!fileInput.files || fileInput.files.length === 0) return alert("กรุณาเลือกไฟล์การบ้าน");

  const file = fileInput.files[0];
  const btn = document.getElementById('btnSubmitHomework');
  if (btn) {
    btn.innerText = "กำลังอัปโหลดเข้า Google Drive...";
    btn.disabled = true;
  }

  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = function () {
    const base64Data = reader.result.split(',')[1];
    const fileExt = file.name.split('.').pop();
    const cleanStudentName = activeRoster[stId].replace(/\s+/g, '_');
    const newFileName = `${stId}_${cleanStudentName}_${activeSession}.${fileExt}`;

    const payload = {
      folderUrl: currentAssignmentConfig.folderUrl,
      fileName: newFileName,
      fileData: base64Data,
      mimeType: file.type || "application/octet-stream"
    };

    fetch(CONFIG.SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(res => {
      if (res.status === "success") {
        return recordHomeworkSubmission(stId, res.fileUrl, formatBytes(file.size));
      } else {
        throw new Error(res.message || "การอัปโหลดไฟล์ล้มเหลว");
      }
    })
    .then(() => {
      alert(`✓ ส่งการบ้านวิชา [${lockedCourseId}] สัปดาห์ [${activeSession}] เรียบร้อยแล้ว!`);
      fileInput.value = '';
    })
    .catch(err => {
      alert("❌ " + err.message);
    })
    .finally(() => {
      if (btn) {
        btn.innerText = "🚀 อัปโหลดส่งการบ้าน";
        btn.disabled = false;
      }
    });
  };
}

function recordHomeworkSubmission(stId, fileUrl, fileSize) {
  const now = new Date();
  const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  const safeSession = sanitizeKey(activeSession);
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  return fetch(`${baseUrl}attendance/${lockedCourseId}/${safeSession}/${stId}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileUrl: fileUrl,
      fileSize: fileSize,
      submittedTime: timeStr
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

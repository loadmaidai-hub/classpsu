// js/submit.js - ระบบอัปโหลดและส่งการบ้าน (รองรับ Drag & Drop และเปลี่ยนชื่อไฟล์อัตโนมัติ)

let currentSession = "Week 1";
let activeCourseId = null;
let currentRoster = {};
let assignmentConfig = null;
let selectedFile = null;

document.addEventListener("DOMContentLoaded", () => {
  initSubmitPage();
  setupDragAndDrop();
});

function initSubmitPage() {
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  // 1. ดึงสัปดาห์ปัจจุบัน
  fetch(`${baseUrl}current_session.json`)
    .then(r => r.json())
    .then(session => {
      if (session) {
        currentSession = session;
        const weekLabel = document.getElementById('currentSessionLabel');
        if (weekLabel) weekLabel.innerText = currentSession;
      }
      return fetch(`${baseUrl}courses.json`);
    })
    .then(r => r.json())
    .then(courses => {
      if (!courses) return;
      const cKeys = Object.keys(courses);
      const savedCourse = localStorage.getItem('lastSelectedCourse');
      activeCourseId = (savedCourse && courses[savedCourse]) ? savedCourse : cKeys[0];

      if (activeCourseId && courses[activeCourseId]) {
        currentRoster = courses[activeCourseId].roster || {};
      }

      loadSessionAssignmentConfig();
    })
    .catch(err => console.error("Init Error:", err));
}

// ตรวจสอบสถานะการเปิดรับงานของอาจารย์
function loadSessionAssignmentConfig() {
  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}session_settings/${activeCourseId}/${safeSession}/assignmentConfig.json`)
    .then(r => r.json())
    .then(cfg => {
      assignmentConfig = cfg;
      updateAssignmentStatusUI();
    })
    .catch(() => {
      assignmentConfig = null;
      updateAssignmentStatusUI();
    });
}

function updateAssignmentStatusUI() {
  const badge = document.getElementById('assignmentStatusBadge');
  const btn = document.getElementById('btnSubmitWork');
  if (!badge || !btn) return;

  if (!assignmentConfig || !assignmentConfig.folderUrl) {
    badge.className = 'badge-status';
    badge.innerText = '⚠️ ยังไม่เปิดรับการบ้าน (ไม่มีลิงก์โฟลเดอร์)';
    btn.disabled = true;
    return;
  }

  // ตรวจสอบ Deadline (ถ้ามีกำหนด)
  if (assignmentConfig.deadline) {
    const deadlineTime = new Date(assignmentConfig.deadline).getTime();
    const now = new Date().getTime();
    if (now > deadlineTime) {
      badge.className = 'badge-status';
      badge.innerText = '❌ ปิดรับการบ้านแล้ว (เลยกำหนดส่ง)';
      btn.disabled = true;
      return;
    }
  }

  badge.className = 'badge-status open';
  badge.innerText = '✅ กำลังเปิดรับการบ้าน';
  btn.disabled = false;
}

// ค้นหารายชื่อนักศึกษาอัตโนมัติจากรหัส 10 หลัก
function lookupStudentName() {
  const idInput = document.getElementById('studentIdInput');
  const nameInput = document.getElementById('studentNameInput');
  const val = idInput.value.trim();

  if (val.length === 10 && currentRoster[val]) {
    nameInput.value = currentRoster[val];
  } else {
    nameInput.value = '';
  }

  // หากเลือกไฟล์ไว้แล้ว ให้รีเฟรชการแสดงชื่อไฟล์ใหม่
  if (selectedFile) updateFilePreview(selectedFile);
}

// ตั้งค่า Drag and Drop และ File Input
function setupDragAndDrop() {
  const dropzone = document.getElementById('dropzoneBox');
  const fileInput = document.getElementById('fileInput');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files[0]) {
      handleFile(dt.files[0]);
    }
  });
}

// จัดการไฟล์และเตรียมระบบเปลี่ยนชื่อไฟล์อัตโนมัติ
function handleFile(file) {
  selectedFile = file;
  updateFilePreview(file);
}

function updateFilePreview(file) {
  const preview = document.getElementById('filePreviewText');
  const stId = document.getElementById('studentIdInput').value.trim();
  const stName = document.getElementById('studentNameInput').value.trim();

  const fileExt = file.name.split('.').pop();
  let targetName = file.name;

  // ฟังก์ชันจัดรูปแบบชื่อไฟล์อัตโนมัติ [รหัส] - [ชื่อ นามสกุล].[นามสกุลเดิม]
  if (stId && stName) {
    targetName = `${stId} - ${stName}.${fileExt}`;
  }

  if (preview) {
    preview.style.display = 'block';
    preview.innerText = `📄 ไฟล์ที่เลือก: ${targetName} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  }
}

// อัปโหลดและบันทึกข้อมูล
function handleAssignmentUpload(e) {
  e.preventDefault();

  const stId = document.getElementById('studentIdInput').value.trim();
  const stName = document.getElementById('studentNameInput').value.trim();

  if (!stId || !stName) {
    return alert("กรุณาระบุรหัสนักศึกษาให้ถูกต้องและครบถ้วน");
  }

  if (!selectedFile) {
    return alert("กรุณาเลือกหรือลากไฟล์ชิ้นงานมาวาง");
  }

  if (!assignmentConfig || !assignmentConfig.folderUrl) {
    return alert("ระบบยังไม่เปิดรับการบ้าน");
  }

  const btn = document.getElementById('btnSubmitWork');
  btn.disabled = true;
  btn.innerText = "⏳ กำลังส่งข้อมูล...";

  const fileExt = selectedFile.name.split('.').pop();
  const finalFileName = `${stId} - ${stName}.${fileExt}`;

  // สร้าง File Object พร้อมชื่อไฟล์ใหม่ที่ถูก format อัตโนมัติ
  const renamedFile = new File([selectedFile], finalFileName, { type: selectedFile.type });

  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const payload = {
    fileUrl: assignmentConfig.folderUrl,
    fileName: finalFileName,
    fileSize: `${(renamedFile.size / 1024 / 1024).toFixed(2)} MB`,
    submittedTime: timeStr,
    timestamp: timeStr
  };

  // บันทึกสถานะส่งงานลง Firebase Attendance
  fetch(`${baseUrl}attendance/${activeCourseId}/${safeSession}/${stId}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(() => {
    alert(`✓ ส่งการบ้านสัปดาห์ [${currentSession}] สำเร็จ!\nชื่อไฟล์: ${finalFileName}`);
    // เปิดพาไปโฟลเดอร์ Google Drive ของอาจารย์ทันที
    window.open(assignmentConfig.folderUrl, '_blank');
    window.location.reload();
  })
  .catch(err => {
    console.error("Upload error:", err);
    alert("เกิดข้อผิดพลาดในการส่งการบ้าน กรุณาลองใหม่อีกครั้ง");
    btn.disabled = false;
    btn.innerText = "🚀 อัปโหลดส่งการบ้านเดี๋ยวนี้";
  });
}
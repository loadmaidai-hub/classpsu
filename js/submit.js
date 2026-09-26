// js/submit.js - ระบบส่งการบ้าน ตรวจสอบชื่อไฟล์ ดาวน์โหลดอัตโนมัติ และอัปโหลดตรงเข้า Google Drive ผ่าน Apps Script

let currentSession = "Week 1";
let activeCourseId = '969-042G4';
let currentRoster = {};
let allCoursesData = {};
let assignmentConfig = null;
let currentUploadFile = null;
let countdownTimerInterval = null;

document.addEventListener("DOMContentLoaded", () => {
  initSubmitPage();
  setupDragAndDrop();
});

function initSubmitPage() {
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

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
      allCoursesData = courses;
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

// แถบเวลานับถอยหลัง (Countdown Timer)
function updateAssignmentStatusUI() {
  const badge = document.getElementById('assignmentStatusBadge');
  const btn = document.getElementById('btnSubmitWork');
  if (!badge || !btn) return;

  if (countdownTimerInterval) {
    clearInterval(countdownTimerInterval);
    countdownTimerInterval = null;
  }

  if (!assignmentConfig || !assignmentConfig.folderUrl) {
    badge.className = 'badge-status';
    badge.innerText = '⚠️ ยังไม่เปิดรับการบ้าน';
    btn.disabled = true;
    return;
  }

  if (assignmentConfig.deadline) {
    const deadlineTime = new Date(assignmentConfig.deadline).getTime();

    const updateCountdown = () => {
      const now = new Date().getTime();
      const diff = deadlineTime - now;

      if (diff <= 0) {
        clearInterval(countdownTimerInterval);
        countdownTimerInterval = null;
        badge.className = 'badge-status';
        badge.innerText = '❌ ปิดรับการบ้านแล้ว';
        btn.disabled = true;
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const hStr = String(hours).padStart(2, '0');
      const mStr = String(minutes).padStart(2, '0');
      const sStr = String(seconds).padStart(2, '0');

      badge.className = 'badge-status open';
      badge.innerText = hours > 0 ? `⏳ เหลือเวลาอีก ${hStr}:${mStr}:${sStr}` : `⏳ เหลือเวลาอีก ${mStr}:${sStr} นาที`;
      btn.disabled = false;
    };

    updateCountdown();
    countdownTimerInterval = setInterval(updateCountdown, 1000);
  } else {
    badge.className = 'badge-status open';
    badge.innerText = '✅ กำลังเปิดรับการบ้าน';
    btn.disabled = false;
  }
}

// ตรวจสอบรหัส ดึงจาก STUDENT_ROSTER ใน config.js และปลดล็อกให้พิมพ์เองได้หากตกหล่น
function lookupStudentName() {
  const idInput = document.getElementById('studentIdInput');
  const nameInput = document.getElementById('studentNameInput');
  const val = idInput.value.trim();

  // 1. ค้นหาจาก STUDENT_ROSTER ใน config.js ก่อน (มีรหัส 1234567890 และรายชื่อทั้งหมด)
  if (typeof STUDENT_ROSTER !== 'undefined' && STUDENT_ROSTER[val]) {
    nameInput.value = STUDENT_ROSTER[val];
    nameInput.readOnly = true;
    nameInput.classList.add('readonly');
    return;
  }

  // 2. ค้นหาจาก Firebase Roster ปัจจุบัน
  if (val.length === 10 && currentRoster[val]) {
    nameInput.value = currentRoster[val];
    nameInput.readOnly = true;
    nameInput.classList.add('readonly');
    return;
  }

  // 3. ค้นหาจากทุกวิชาใน Firebase
  if (val.length === 10 && allCoursesData) {
    for (let cId in allCoursesData) {
      if (allCoursesData[cId].roster && allCoursesData[cId].roster[val]) {
        nameInput.value = allCoursesData[cId].roster[val];
        nameInput.readOnly = true;
        nameInput.classList.add('readonly');
        return;
      }
    }
  }

  // 4. กรณีไม่มีในระบบ ปลดล็อกให้กรอกชื่อ-นามสกุลเองได้
  if (val.length === 10) {
    nameInput.value = '';
    nameInput.readOnly = false;
    nameInput.classList.remove('readonly');
    nameInput.placeholder = "ไม่พบในระบบ กรุณากรอก ชื่อ-นามสกุล ของคุณ";
  } else {
    nameInput.value = '';
    nameInput.readOnly = true;
    nameInput.classList.add('readonly');
    nameInput.placeholder = "ระบบจะแสดงอัตโนมัติ";
  }
}

function setupDragAndDrop() {
  const dropzone = document.getElementById('dropzoneBox');
  const fileInput = document.getElementById('fileInput');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectedFile(e.target.files[0]);
    }
  });

  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedFile(e.dataTransfer.files[0]);
    }
  });
}

function handleSelectedFile(file) {
  const stId = document.getElementById('studentIdInput').value.trim();
  const stName = document.getElementById('studentNameInput').value.trim();

  if (!stId || !stName) {
    alert("⚠️ กรุณากรอกรหัสนักศึกษาให้ถูกต้องก่อนเลือกไฟล์ เพื่อให้ระบบช่วยตั้งชื่อไฟล์ได้ถูกต้อง");
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
    return;
  }

  const dotIdx = file.name.lastIndexOf('.');
  const ext = dotIdx !== -1 ? file.name.substring(dotIdx) : '';
  const standardName = `${stId} - ${stName}${ext}`;

  if (file.name !== standardName) {
    alert(`⚠️ ชื่อไฟล์เดิมไม่ถูกต้อง: "${file.name}"\n\nระบบดำเนินการเปลี่ยนชื่อไฟล์เป็น:\n"${standardName}"\nและได้ดาวน์โหลดไฟล์ที่ถูกต้องลงเครื่องของคุณแล้ว`);

    const blobUrl = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = standardName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);

    currentUploadFile = new File([file], standardName, { type: file.type });
  } else {
    currentUploadFile = file;
  }

  const preview = document.getElementById('filePreviewText');
  if (preview) {
    preview.style.display = 'block';
    preview.innerText = `📄 พร้อมส่ง: ${currentUploadFile.name} (${(currentUploadFile.size / 1024 / 1024).toFixed(2)} MB)`;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = err => reject(err);
  });
}

async function submitHomework() {
  const stId = document.getElementById('studentIdInput').value.trim();
  const stName = document.getElementById('studentNameInput').value.trim();

  if (!stId || !stName) return alert("กรุณากรอกรหัสนักศึกษาและชื่อ-นามสกุลให้ครบถ้วน");
  if (!currentUploadFile) return alert("กรุณาเลือกไฟล์ชิ้นงานที่ต้องการส่ง");
  if (!assignmentConfig || !assignmentConfig.folderUrl) return alert("ไม่พบข้อมูลโฟลเดอร์รับงานของอาจารย์");

  // รองรับทั้ง CONFIG.GAS_UPLOAD_URL และ CONFIG.GOOGLE_SCRIPT_URL
  const scriptUrl = (typeof CONFIG !== 'undefined' && (CONFIG.GAS_UPLOAD_URL || CONFIG.GOOGLE_SCRIPT_URL || CONFIG.UPLOAD_SCRIPT_URL))
    ? (CONFIG.GAS_UPLOAD_URL || CONFIG.GOOGLE_SCRIPT_URL || CONFIG.UPLOAD_SCRIPT_URL)
    : "";

  if (!scriptUrl || !scriptUrl.includes('script.google.com')) {
    return alert("❌ ไม่พบลิงก์ Google Apps Script ใน config.js กรุณาตรวจสอบ");
  }

  const btn = document.getElementById('btnSubmitWork');
  btn.disabled = true;
  btn.innerText = "⏳ กำลังส่งไฟล์ตรงเข้าโฟลเดอร์...";

  try {
    const base64Data = await fileToBase64(currentUploadFile);

    // Payload ตรงตามพารามิเตอร์ของ Code.gs: folderUrl, fileName, fileData, mimeType
    const payload = {
      folderUrl: assignmentConfig.folderUrl,
      fileName: currentUploadFile.name,
      fileData: base64Data,
      mimeType: currentUploadFile.type || "application/octet-stream"
    };

    // ส่งเข้า Apps Script ด้วย POST text/plain เพื่อข้าม CORS
    await fetch(scriptUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    // บันทึกสถานะเข้า Firebase Attendance
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
    const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

    const attendancePayload = {
      fileName: currentUploadFile.name,
      fileSize: `${(currentUploadFile.size / 1024 / 1024).toFixed(2)} MB`,
      submittedTime: timeStr,
      timestamp: timeStr,
      fileUrl: assignmentConfig.folderUrl
    };

    await fetch(`${baseUrl}attendance/${activeCourseId}/${safeSession}/${stId}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attendancePayload)
    });

    alert(`✅ ส่งการบ้านสำเร็จเรียบร้อย!\nไฟล์: ${currentUploadFile.name}\n(ระบบส่งตรงเข้าโฟลเดอร์ Google Drive ของอาจารย์เรียบร้อยแล้ว)`);
    window.location.reload();

  } catch (err) {
    console.error("Submit Error:", err);
    alert("❌ เกิดข้อผิดพลาดในการส่ง กรุณาลองใหม่อีกครั้ง");
    btn.disabled = false;
    btn.innerText = "🚀 ส่งการบ้าน";
  }
}

// js/submit.js - ระบบตรวจสอบชื่อไฟล์ ออโต้รีเนม และอัปโหลดตรงเข้า Google Drive ป้องกันนักศึกษาเข้าโฟลเดอร์

let currentSession = "Week 1";
let activeCourseId = null;
let currentRoster = {};
let assignmentConfig = null;
let readyFileToUpload = null;

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

function lookupStudentName() {
  const idInput = document.getElementById('studentIdInput');
  const nameInput = document.getElementById('studentNameInput');
  const val = idInput.value.trim();

  if (val.length === 10 && currentRoster[val]) {
    nameInput.value = currentRoster[val];
  } else {
    nameInput.value = '';
  }
}

function setupDragAndDrop() {
  const dropzone = document.getElementById('dropzoneBox');
  const fileInput = document.getElementById('fileInput');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
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
      processSelectedFile(dt.files[0]);
    }
  });
}

// ตรวจสอบชื่อไฟล์ บังคับเปลี่ยนชื่อ และดาวน์โหลดไฟล์ใหม่ลงเครื่องให้อัตโนมัติ
function processSelectedFile(file) {
  const stId = document.getElementById('studentIdInput').value.trim();
  const stName = document.getElementById('studentNameInput').value.trim();

  if (!stId || !stName) {
    alert("⚠️ กรุณากรอกรหัสนักศึกษา 10 หลักให้ถูกต้องก่อนเลือกไฟล์ เพื่อให้ระบบช่วยตั้งชื่อไฟล์ได้ถูกต้อง");
    document.getElementById('fileInput').value = '';
    return;
  }

  const fileExt = file.name.substring(file.name.lastIndexOf('.'));
  const correctPattern = `${stId} - ${stName}${fileExt}`;

  // ตรวจว่าชื่อไฟล์ตรงกับระเบียบหรือไม่
  if (file.name !== correctPattern) {
    alert(`⚠️ ชื่อไฟล์เดิมไม่ถูกต้อง: "${file.name}"\n\nระบบจะทำการเปลี่ยนชื่อไฟล์เป็น:\n"${correctPattern}"\nและดาวน์โหลดไฟล์ที่ถูกต้องลงเครื่องของคุณทันที`);

    // สร้าง Blob สำหรับดาวน์โหลดไฟล์ชื่อใหม่ลงเครื่องนักศึกษา
    const blobUrl = URL.createObjectURL(file);
    const downloadLink = document.createElement('a');
    downloadLink.href = blobUrl;
    downloadLink.download = correctPattern;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(blobUrl);

    // บรรจุ File Object ตัวใหม่ที่ชื่อถูกต้องลงในตัวแปรสำหรับเตรียมอัปโหลดตรง
    readyFileToUpload = new File([file], correctPattern, { type: file.type });
  } else {
    readyFileToUpload = file;
  }

  // อัปเดตข้อความบนหน้าจอ
  const preview = document.getElementById('filePreviewText');
  if (preview) {
    preview.style.display = 'block';
    preview.innerText = `📄 ไฟล์ที่พร้อมส่ง: ${readyFileToUpload.name} (${(readyFileToUpload.size / 1024 / 1024).toFixed(2)} MB)`;
  }
}

// แปลงไฟล์เป็น Base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64Data = reader.result.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = error => reject(error);
  });
}

// ดำเนินการอัปโหลดตรงเข้า Drive (ห้ามเปิดหน้าต่าง Drive ออกมา)
async function handleAssignmentUpload(e) {
  e.preventDefault();

  const stId = document.getElementById('studentIdInput').value.trim();
  const stName = document.getElementById('studentNameInput').value.trim();

  if (!stId || !stName) {
    return alert("กรุณาระบุรหัสนักศึกษาให้ถูกต้อง");
  }

  if (!readyFileToUpload) {
    return alert("กรุณาเลือกหรือลากไฟล์ชิ้นงานที่ต้องการส่ง");
  }

  if (!assignmentConfig || !assignmentConfig.folderUrl) {
    return alert("ระบบยังไม่เปิดรับการบ้าน หรือไม่พบลิงก์ปลายทาง");
  }

  const btn = document.getElementById('btnSubmitWork');
  btn.disabled = true;
  btn.innerText = "⏳ กำลังอัปโหลดตรงไปยังคลังของอาจารย์...";

  try {
    const base64File = await fileToBase64(readyFileToUpload);
    const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
    const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // ถ้าลิงก์ที่อาจารย์กรอกไว้เป็น Web App Endpoint ของ Google Script ให้ยิงส่งตรง
    if (assignmentConfig.folderUrl.includes('script.google.com')) {
      await fetch(assignmentConfig.folderUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: readyFileToUpload.name,
          mimeType: readyFileToUpload.type || "application/octet-stream",
          base64: base64File,
          studentId: stId,
          session: currentSession
        })
      });
    }

    // บันทึกประวัติสถานะลง Firebase Attendance โดยไม่เปิด Google Drive ออกมา
    const attendancePayload = {
      fileName: readyFileToUpload.name,
      fileSize: `${(readyFileToUpload.size / 1024 / 1024).toFixed(2)} MB`,
      submittedTime: timeStr,
      timestamp: timeStr,
      fileUrl: assignmentConfig.folderUrl // บันทึกลิงก์อ้างอิงให้ฝั่งอาจารย์ดู
    };

    await fetch(`${baseUrl}attendance/${activeCourseId}/${safeSession}/${stId}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attendancePayload)
    });

    alert(`✅ ส่งการบ้านสำเร็จเรียบร้อย!\nไฟล์: ${readyFileToUpload.name}\n(ส่งตรงเข้าสู่คลังเก็บงานของอาจารย์แล้ว)`);
    window.location.reload();

  } catch (err) {
    console.error("Upload Error:", err);
    alert("❌ เกิดข้อผิดพลาดในการอัปโหลดไฟล์ กรุณาลองใหม่อีกครั้ง");
    btn.disabled = false;
    btn.innerText = "🚀 อัปโหลดส่งการบ้านเดี๋ยวนี้";
  }
}

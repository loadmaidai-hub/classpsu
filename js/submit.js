// js/submit.js - ระบบส่งการบ้านแบบกลุ่ม (Group-based Homework Submission with Google Drive Upload)

let activeCourseId = "969-042G4";
let currentSession = "Week 1";
let activeRoster = {};
let currentAssignmentConfig = null;
let selectedFile = null;
let currentStudentGroup = null;

document.addEventListener("DOMContentLoaded", () => {
  initSubmitPage();
  setupDropzone();
});

async function initSubmitPage() {
  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) {
    updateAssignmentStatus(false);
    return;
  }

  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  try {
    // 1. ดึงสัปดาห์เรียนปัจจุบัน
    const sessRes = await fetch(`${baseUrl}current_session.json`);
    const serverSession = await sessRes.json();
    if (serverSession) {
      currentSession = serverSession;
    }
    const sessLabel = document.getElementById('currentSessionLabel');
    if (sessLabel) sessLabel.innerText = currentSession;

    // 2. ดึงข้อมูลรายวิชาและ Roster
    const courseRes = await fetch(`${baseUrl}courses/${activeCourseId}.json`);
    const courseData = await courseRes.json();
    if (courseData && courseData.roster) {
      activeRoster = courseData.roster;
    }

    // 3. ตรวจสอบการเปิดรับการบ้านประจำสัปดาห์
    const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
    const cfgRes = await fetch(`${baseUrl}session_settings/${activeCourseId}/${safeSession}/assignmentConfig.json`);
    currentAssignmentConfig = await cfgRes.json();

    if (currentAssignmentConfig && currentAssignmentConfig.folderUrl) {
      updateAssignmentStatus(true);
    } else {
      updateAssignmentStatus(false);
    }

  } catch (err) {
    console.error("Init Error:", err);
    updateAssignmentStatus(false);
  }
}

function updateAssignmentStatus(isOpen) {
  const badge = document.getElementById('assignmentStatusBadge');
  const btn = document.getElementById('btnSubmitWork');
  if (!badge || !btn) return;

  if (isOpen) {
    badge.className = 'badge-status open';
    badge.innerText = '🟢 เปิดรับการบ้าน';
    btn.disabled = false;
  } else {
    badge.className = 'badge-status';
    badge.innerText = '⚠️ ยังไม่เปิดรับการบ้านสัปดาห์นี้';
    btn.disabled = true;
  }
}

// ค้นหาชื่อนักศึกษา และตรวจสอบกลุ่มโครงงานแบบเรียลไทม์
async function lookupStudentAndGroup() {
  const idInput = document.getElementById('studentIdInput');
  const nameInput = document.getElementById('studentNameInput');
  const noticeBox = document.getElementById('groupNoticeBox');
  if (!idInput || !nameInput) return;

  const stId = idInput.value.trim();

  // ดึงชื่อนักศึกษาจาก Roster
  if (stId.length >= 8 && activeRoster[stId]) {
    nameInput.value = activeRoster[stId];
    nameInput.style.color = "#059669";
  } else {
    nameInput.value = "";
    nameInput.placeholder = "ไม่พบรหัสนักศึกษา";
    nameInput.style.color = "#DC2626";
    if (noticeBox) noticeBox.style.display = "none";
    currentStudentGroup = null;
    return;
  }

  // ค้นหากลุ่มโครงงานใน Firebase
  if (stId.length >= 8) {
    await checkStudentGroup(stId);
  }
}

async function checkStudentGroup(studentId) {
  const noticeBox = document.getElementById('groupNoticeBox');
  const titleEl = document.getElementById('noticeProjectTitle');
  const listEl = document.getElementById('noticeMembersList');
  if (!noticeBox || !titleEl || !listEl) return;

  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  try {
    const res = await fetch(`${baseUrl}pair_projects/${activeCourseId}.json`);
    const allProjects = await res.json() || {};

    currentStudentGroup = null;

    for (const groupKey in allProjects) {
      const p = allProjects[groupKey];
      let membersList = [];

      if (p.members && Array.isArray(p.members)) {
        membersList = p.members;
      } else {
        if (p.member1Id) membersList.push({ id: p.member1Id, name: p.member1Name });
        if (p.member2Id) membersList.push({ id: p.member2Id, name: p.member2Name });
      }

      const isMember = membersList.some(m => String(m.id).trim() === String(studentId).trim());
      if (isMember) {
        currentStudentGroup = {
          groupKey: groupKey,
          projectTitle: p.projectTitle || 'โครงงานกลุ่ม',
          members: membersList
        };
        break;
      }
    }

    if (currentStudentGroup) {
      titleEl.innerText = `"${currentStudentGroup.projectTitle}"`;
      listEl.innerHTML = currentStudentGroup.members.map(m => `
        <li><b>${m.id}</b> - ${m.name || activeRoster[m.id] || ''}</li>
      `).join('');
      noticeBox.style.display = "block";
    } else {
      noticeBox.style.display = "none";
    }

  } catch (err) {
    console.error("Group check error:", err);
    noticeBox.style.display = "none";
  }
}

// Drag & Drop File
function setupDropzone() {
  const zone = document.getElementById('dropzoneBox');
  if (!zone) return;

  ['dragenter', 'dragover'].forEach(name => {
    zone.addEventListener(name, (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    zone.addEventListener(name, (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
    });
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files);
    }
  });
}

function handleFileSelected(files) {
  if (!files || files.length === 0) return;
  selectedFile = files[0];

  const preview = document.getElementById('filePreviewText');
  const mainText = document.getElementById('dropzoneMainText');

  if (preview && mainText) {
    preview.innerText = `📎 ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)`;
    preview.style.display = 'block';
    mainText.innerText = 'เลือกไฟล์เรียบร้อยแล้ว';
  }
}

// แปลงไฟล์เป็น Base64 String
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

// ฟังก์ชันส่งการบ้าน: อัปโหลดเข้า Google Drive ผ่าน Apps Script เดิมของอาจารย์
async function submitHomework() {
  const stId = document.getElementById('studentIdInput').value.trim();
  const stName = document.getElementById('studentNameInput').value.trim();

  if (!stId || !stName || stName.includes("ไม่พบ")) {
    return alert("กรุณากรอกรหัสนักศึกษาที่ถูกต้อง");
  }

  if (!selectedFile) {
    return alert("กรุณาเลือกไฟล์ชิ้นงานที่ต้องการส่ง");
  }

  if (!currentAssignmentConfig || !currentAssignmentConfig.folderUrl) {
    return alert("อาจารย์ยังไม่ได้ตั้งค่าโฟลเดอร์สำหรับรับงานสัปดาห์นี้");
  }

  if (!CONFIG.GOOGLE_DRIVE_UPLOAD_URL) {
    return alert("กรุณาระบุ CONFIG.GOOGLE_DRIVE_UPLOAD_URL ในไฟล์ js/config.js");
  }

  const btn = document.getElementById('btnSubmitWork');
  btn.disabled = true;
  btn.innerText = "⏳ กำลังส่งไฟล์เข้า Google Drive...";

  try {
    // 1. แปลงไฟล์เป็น Base64
    const base64Content = await fileToBase64(selectedFile);

    // 2. จัดโครงสร้าง Payload ให้ตรงกับตัวแปรที่ doPost ใน Apps Script รอรับ (folderUrl, fileName, fileData, mimeType)
    const uploadPayload = {
      folderUrl: currentAssignmentConfig.folderUrl,
      fileName: `${stId} - ${stName}_${selectedFile.name}`,
      fileData: base64Content,
      mimeType: selectedFile.type || "application/octet-stream"
    };

    // ส่งคำขอแบบ text/plain เพื่อป้องกันเบราว์เซอร์ส่ง OPTIONS Preflight ติด CORS
    const uploadRes = await fetch(CONFIG.GOOGLE_DRIVE_UPLOAD_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(uploadPayload)
    });

    const uploadResult = await uploadRes.json();
    if (uploadResult.status !== "success" || !uploadResult.fileUrl) {
      throw new Error(uploadResult.message || "อัปโหลดเข้า Folder  ไม่สำเร็จ");
    }

    const driveDirectUrl = uploadResult.fileUrl; // ได้รับ URL ตรงของไฟล์ที่สร้างใน Drive สำเร็จ

    // 3. บันทึกสถานะและลิงก์ตรงของไฟล์ลง Firebase ของสมาชิกทุกคนในกลุ่ม
    btn.innerText = "⏳ กำลังบันทึกสถานะลงระบบ...";

    const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';
    const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
    const now = new Date();
    const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let targetMembers = [{ id: stId, name: stName }];
    if (currentStudentGroup && currentStudentGroup.members && currentStudentGroup.members.length > 0) {
      targetMembers = currentStudentGroup.members;
    }

    const payload = {
      fileUrl: driveDirectUrl,
      fileName: selectedFile.name,
      fileSize: `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`,
      submittedTime: timeString,
      submittedBy: stId,
      isGroupSubmission: targetMembers.length > 1
    };

    const tasks = targetMembers.map(m => {
      return fetch(`${baseUrl}attendance/${activeCourseId}/${safeSession}/${m.id}.json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    });

    await Promise.all(tasks);

    if (targetMembers.length > 1) {
      alert(`✅ ส่งการบ้านกลุ่มสำเร็จ!\n\nไฟล์ถูกบันทึกเข้า Folder  ของอาจารย์แล้ว\nโครงงาน: "${currentStudentGroup.projectTitle}"\nระบบได้อัปเดตสถานะ "ส่งแล้ว" ให้สมาชิกทั้ง ${targetMembers.length} คนเรียบร้อย`);
    } else {
      alert("✅ ส่งการบ้านสำเร็จ! ไฟล์ถูกบันทึกเข้า Folder ของอาจารย์เรียบร้อยแล้ว");
    }

    // รีเซ็ตหน้าฟอร์ม
    document.getElementById('studentIdInput').value = '';
    document.getElementById('studentNameInput').value = '';
    document.getElementById('filePreviewText').style.display = 'none';
    document.getElementById('dropzoneMainText').innerText = 'คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่';
    document.getElementById('groupNoticeBox').style.display = 'none';
    selectedFile = null;
    currentStudentGroup = null;

  } catch (err) {
    console.error("Submit error:", err);
    alert(`❌ เกิดข้อผิดพลาดในการส่งไฟล์: ${err.message || err}`);
  } finally {
    btn.disabled = false;
    btn.innerText = "🚀 ส่งการบ้าน";
  }
}

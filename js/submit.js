let targetDeadline = null;
let currentSession = CONFIG.SESSIONS[0];
let selectedFile = null;
let currentFolderUrl = null;
let isDeadlinePassed = false;

function init() {
  // รับรหัสผ่าน URL กรณีส่งต่อมาจากหน้าตอบควิซ (index.html?id=...)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('id')) {
    document.getElementById('stuId').value = urlParams.get('id');
  }

  fetch(`${CONFIG.FIREBASE_DB_URL}current_session.json`)
    .then(r => r.json())
    .then(s => {
      if (s) currentSession = s;
      document.getElementById('sessionLabel').innerText = currentSession;
      previewName();
      loadAssignmentSettings();
    });
    setupDragAndDrop();
}

function loadAssignmentSettings() {
  const safe = sanitizeKey(currentSession);
  fetch(`${CONFIG.FIREBASE_DB_URL}session_settings/${safe}/assignmentConfig.json`)
    .then(r => r.json())
    .then(cfg => {
      currentFolderUrl = cfg ? cfg.folderUrl : null;

      if (cfg && cfg.deadline) {
        targetDeadline = new Date(cfg.deadline).getTime();
        checkDeadline();
        setInterval(checkDeadline, 1000);
      } else {
        document.getElementById('countdownBadge').innerText = "ไม่ได้กำหนดเวลาปิดรับ";
      }
    });
}

function checkDeadline() {
  if (!targetDeadline) return;
  const now = new Date().getTime();
  const diff = targetDeadline - now;
  const cd = document.getElementById('countdownBadge');
  const btn = document.getElementById('btnUpload');

  if (diff <= 0) {
    isDeadlinePassed = true;
    cd.innerText = "⛔ หมดเวลาส่งงาน";
    cd.className = "tag tag-absent";
    if (btn) {
      btn.disabled = true;
      btn.className = "btn-action btn-disabled";
    }
    const lockNotice = document.getElementById('lockNotice');
    if (lockNotice) lockNotice.style.display = "block";
  } else {
    isDeadlinePassed = false;
    
    // คำนวณ วัน, ชั่วโมง, นาที, วินาที
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    // ถ้ามีวันเหลือให้แสดงจำนวนวันนำหน้า เช่น "⏳ เหลือเวลา: 6วัน 10ชม. 8น. 47วิ."
    if (days > 0) {
      cd.innerText = `⏳ เหลือเวลา: ${days}วัน ${hours}ชม. ${minutes}น. ${seconds}วิ.`;
    } else {
      cd.innerText = `⏳ เหลือเวลา: ${hours}ชม. ${minutes}น. ${seconds}วิ.`;
    }
  }
}

function previewName() {
  const id = document.getElementById('stuId').value.trim();
  document.getElementById('stuName').value = STUDENT_ROSTER[id] || "";
  validateCurrentFile();
}

function handleFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;
  selectedFile = file;
  document.getElementById('fileUploadPrompt').innerText = `📄 ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
  validateCurrentFile();
}

function validateCurrentFile() {
  if (!selectedFile) return;

  const id = document.getElementById('stuId').value.trim();
  const studentName = STUDENT_ROSTER[id];
  const valBox = document.getElementById('validationBox');
  const btn = document.getElementById('btnUpload');

  valBox.style.display = 'block';

  if (!studentName) {
    valBox.className = "validation-status status-error";
    valBox.innerHTML = `⚠️ กรุณากรอกรหัสนักศึกษา 10 หลักให้ถูกต้องก่อนเลือกไฟล์`;
    btn.disabled = true;
    btn.className = "btn-action btn-disabled";
    return;
  }

  const extIndex = selectedFile.name.lastIndexOf('.');
  const ext = extIndex !== -1 ? selectedFile.name.substring(extIndex) : '';
  const currentFileNameWithoutExt = extIndex !== -1 ? selectedFile.name.substring(0, extIndex) : selectedFile.name;

  const expectedNameClean = `${id}-${studentName}`.replace(/\s+/g, '');
  const actualNameClean = currentFileNameWithoutExt.replace(/\s+/g, '');

  if (actualNameClean === expectedNameClean) {
    valBox.className = "validation-status status-success";
    valBox.innerHTML = `✓ ชื่อไฟล์ถูกต้อง: <strong>${selectedFile.name}</strong> พร้อมส่ง`;
    if (!isDeadlinePassed) {
      btn.disabled = false;
      btn.className = "btn-action";
      btn.style.background = "#4338CA";
      btn.style.color = "white";
    }
  } else {
    const properFullName = `${id} - ${studentName}${ext}`;
    valBox.className = "validation-status status-error";
    valBox.innerHTML = `
      ❌ <strong>ชื่อไฟล์ไม่ถูกต้องตามรูปแบบ!</strong><br>
      ชื่อปัจจุบัน: <span style="font-family:monospace;">${selectedFile.name}</span><br>
      ชื่อที่ถูกต้อง: <span style="font-family:monospace; font-weight:700;">${properFullName}</span>
      <div style="margin-top:0.6rem;">
        <button type="button" onclick="downloadCorrectlyNamedFile('${properFullName}')" style="background:#4338CA; color:white; border:none; padding:0.4rem 0.8rem; border-radius:8px; font-size:0.8rem; font-weight:700; cursor:pointer;">
          ⚡ แก้ชื่อไฟล์และดาวน์โหลดใหม่ให้ตรง
        </button>
      </div>
    `;
    btn.disabled = true;
    btn.className = "btn-action btn-disabled";
  }
}

function setupDragAndDrop() {
  const dropZone = document.getElementById('dropZone');
  if (!dropZone) return;

  // ป้องกันค่าเริ่มต้นของเบราว์เซอร์ไม่ให้เปิดไฟล์ขึ้นมาตรงๆ
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  // ใส่เอฟเฟกต์สีกล่องเมื่อลากไฟล์เข้ามา
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.add('drag-over');
    }, false);
  });

  // เอฟเฟกต์กลับคืนเมื่อลากไฟล์ออกไป หรือปล่อยไฟล์แล้ว
  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.remove('drag-over');
    }, false);
  });

  // ดักจับไฟล์เมื่อผู้ใช้ปล่อยไฟล์ลงในกล่อง
  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files && files.length > 0) {
      selectedFile = files[0];
      document.getElementById('fileUploadPrompt').innerText = `📄 ${selectedFile.name} (${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)`;
      validateCurrentFile();
    }
  }, false);
}

function downloadCorrectlyNamedFile(properName) {
  if (!selectedFile) return;
  const newFileBlob = new Blob([selectedFile], { type: selectedFile.type });
  const downloadUrl = URL.createObjectURL(newFileBlob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = properName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
  alert(`ระบบดาวน์โหลดไฟล์ "${properName}" ให้แล้ว โปรดเลือกไฟล์นี้เพื่อส่งอีกครั้ง`);
}

// อ่านไฟล์เป็น Base64 แล้วยิงตรงไปยัง Google Apps Script
function uploadToGoogleDrive() {
  if (isDeadlinePassed) return alert("หมดเวลาส่งงาน ไม่สามารถอัปโหลดได้");
  if (!currentFolderUrl) return alert("อาจารย์ยังไม่ได้ผูกโฟลเดอร์ส่งงานประจำสัปดาห์นี้");

  const id = document.getElementById('stuId').value.trim();
  const name = STUDENT_ROSTER[id];
  const btn = document.getElementById('btnUpload');
  const loading = document.getElementById('loadingStatus');

  btn.disabled = true;
  btn.style.display = "none";
  loading.style.display = "block";

  const reader = new FileReader();
  reader.readAsDataURL(selectedFile);
  reader.onload = function () {
    const base64Data = reader.result.split(',')[1];
    
    const payload = {
      folderUrl: currentFolderUrl,
      fileName: selectedFile.name,
      fileData: base64Data,
      mimeType: selectedFile.type || 'application/octet-stream'
    };

    fetch(CONFIG.GAS_UPLOAD_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(res => {
      loading.style.display = "none";

      if (res.status === "success") {
        const safeSession = sanitizeKey(currentSession);
        fetch(`${CONFIG.FIREBASE_DB_URL}attendance/${safeSession}/${id}.json`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: selectedFile.name,
            fileUrl: res.fileUrl,
            fileSize: (selectedFile.size / (1024 * 1024)).toFixed(2) + ' MB',
            submittedTime: new Date().toLocaleTimeString('th-TH')
          })
        }).then(() => {
          alert(`✓ ส่งงานเรียบร้อยแล้ว!\nไฟล์ "${selectedFile.name}" ถูกบันทึกเข้าโฟลเดอร์ของอาจารย์แล้ว`);
          location.reload();
        });
      } else {
        alert("เกิดข้อผิดพลาดจาก Google Drive: " + res.message);
        btn.disabled = false;
        btn.style.display = "block";
      }
    })
    .catch(err => {
      loading.style.display = "none";
      btn.disabled = false;
      btn.style.display = "block";
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ: " + err.message);
    });
  };
}

init();
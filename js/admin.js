// js/admin.js - ระบบบริหารจัดการหลังบ้านอาจารย์ (Admin Control Center)

let coursesData = {};
let activeCourseId = null;
let currentSession = localStorage.getItem('adminSelectedSession') || (typeof CONFIG !== 'undefined' && CONFIG.SESSIONS ? CONFIG.SESSIONS[0] : "Week 1");
let activeRoster = {};
let sessionAttendance = {};
let allAttendance = {};
let currentAssignmentConfig = null;
let tableFilter = 'ALL';
let currentEditingStudentId = null;

document.addEventListener("DOMContentLoaded", () => {
  if (sessionStorage.getItem("adminAuthenticated") === "true") {
    initAdminDashboard();
  }
  setupKeyboardShortcuts();
});

// ตรวจจับปุ่ม Esc และ Enter สำหรับทุก Modal
function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    // 1. ปุ่ม Escape: สั่งปิด Modal ที่เปิดอยู่ทั้งหมด
    if (e.key === "Escape" || e.key === "Esc") {
      closeStatusModal();
      if (typeof closeSettingsModal === 'function') closeSettingsModal();
      if (typeof closeOverviewModal === 'function') closeOverviewModal();
      return;
    }

    // 2. ปุ่ม Enter: ยืนยันการทำงานตาม Modal ที่กำลังเปิดอยู่
    if (e.key === "Enter") {
      const statusModal = document.getElementById('attendanceStatusModal');
      const settingsModal = document.getElementById('settingsModal');

      // ถ้าเปิด Modal ปรับสถานะอยู่
      if (statusModal && statusModal.style.display === 'flex') {
        e.preventDefault();
        confirmSaveStatus();
        return;
      }

      // ถ้าเปิด Modal ตั้งค่าห้องเรียนอยู่ และกำลังโฟกัสในช่องกรอกเพิ่มนักศึกษา
      if (settingsModal && settingsModal.style.display === 'flex') {
        const idInput = document.getElementById('newStudentId');
        const nameInput = document.getElementById('newStudentName');
        if (document.activeElement === idInput || document.activeElement === nameInput) {
          e.preventDefault();
          addSingleStudent();
        }
      }
    }
  });
}

function initAdminDashboard() {
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}current_session.json`)
    .then(r => r.json())
    .then(serverSession => {
      const saved = localStorage.getItem('adminSelectedSession');
      if (saved) {
        currentSession = saved;
      } else if (serverSession) {
        currentSession = serverSession;
        localStorage.setItem('adminSelectedSession', currentSession);
      }
      initSessionDropdown();
      return fetch(`${baseUrl}courses.json`);
    })
    .then(r => r.json())
    .then(courses => {
      coursesData = courses || {};
      const courseIds = Object.keys(coursesData);
      const sel = document.getElementById('adminCourseSelect');

      if (courseIds.length === 0) return;

      if (sel) {
        sel.innerHTML = courseIds.map(cid => `
          <option value="${cid}">${cid} - ${coursesData[cid].courseName || ''}</option>
        `).join('');
      }

      const savedCourse = localStorage.getItem('lastSelectedCourse');
      activeCourseId = (savedCourse && coursesData[savedCourse]) ? savedCourse : courseIds[0];
      if (sel) sel.value = activeCourseId;

      onAdminCourseChange();
    })
    .catch(err => {
      console.error("Init Error:", err);
      initSessionDropdown();
    });
}

function initSessionDropdown() {
  const sel = document.getElementById('sessionSelect');
  if (sel && CONFIG && CONFIG.SESSIONS) {
    sel.innerHTML = CONFIG.SESSIONS.map(s => `<option value="${s}">📅 ${s}</option>`).join('');
    sel.value = currentSession;
  }
}

function onAdminCourseChange() {
  const sel = document.getElementById('adminCourseSelect');
  if (sel) activeCourseId = sel.value;
  localStorage.setItem('lastSelectedCourse', activeCourseId);

  const course = coursesData[activeCourseId];
  if (course) {
    activeRoster = course.roster || {};
    const subEl = document.getElementById('adminCourseSubtitle');
    if (subEl) {
      subEl.innerText = `${course.courseId} ${course.courseName}`;
    }

    const secInput = document.getElementById('courseSectionInput');
    const roomInput = document.getElementById('courseRoomInput');
    const daySelect = document.getElementById('courseDaySelect');
    const timeInput = document.getElementById('courseTimeInput');

    if (secInput) secInput.value = (course.section || '').replace(/Sec\s*/i, '');
    if (roomInput) roomInput.value = (course.room || '').replace(/ห้อง\s*/i, '');

    // แยกวันและเวลาลง Dropdown และช่องกรอก
    if (course.dayTime) {
      const parts = course.dayTime.trim().split(/\s+(.+)/);
      if (daySelect && parts[0]) daySelect.value = parts[0];
      if (timeInput) timeInput.value = parts[1] || '';
    } else {
      if (daySelect && course.day) daySelect.value = course.day;
      if (timeInput) timeInput.value = course.time || '';
    }
  }

  loadSessionData();
  loadAssignmentSettings();
  renderStudentRosterManager();
  loadAllAttendanceForOverview();
}

function onAdminSessionChange() {
  const sel = document.getElementById('sessionSelect');
  if (!sel) return;

  currentSession = sel.value;
  localStorage.setItem('adminSelectedSession', currentSession);

  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';
  fetch(`${baseUrl}current_session.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(currentSession)
  });

  loadSessionData();
  loadAssignmentSettings();
}

// โหลดข้อมูลเข้าเรียน (รองรับข้อมูล Week 1 จากโค้ดเดิมทุกรูปแบบอย่างแท้จริง)
function loadSessionData() {
  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  // 1. ดึงข้อมูลทั้งก้อนของ /attendance.json มาตรวจสอบ
  fetch(`${baseUrl}attendance.json`)
    .then(r => r.json())
    .then(rootAttendance => {
      if (!rootAttendance) {
        sessionAttendance = {};
        renderDashboardUI();
        return;
      }

      let targetData = null;

      // แบบที่ 1 (V.2): อยู่ใต้ Course ID เช่น attendance['969-042G4']['Week 1...']
      if (rootAttendance[activeCourseId]) {
        const courseData = rootAttendance[activeCourseId];
        targetData = courseData[currentSession] || 
                     courseData[safeSession] || 
                     courseData[decodeURIComponent(safeSession)];
        
        if (!targetData) {
          // วนหาคีย์ที่ชื่อคล้ายกันใน Course
          const kMatch = Object.keys(courseData).find(k => 
            k.toLowerCase().includes(currentSession.toLowerCase()) || 
            (currentSession.includes("Week 1") && k.includes("Week 1"))
          );
          if (kMatch) targetData = courseData[kMatch];
        }
      }

      // แบบที่ 2 (V.1 เดิม): อยู่ที่ Root ของ attendance ตรงๆ เช่น attendance['Week 1 (16 ก.ย. 2569)']
      if (!targetData) {
        targetData = rootAttendance[currentSession] || 
                     rootAttendance[safeSession] || 
                     rootAttendance[decodeURIComponent(safeSession)];
      }

      // แบบที่ 3: กวาดหาที่ Root จากทุกคีย์ที่มีคำว่า Week 1 หรือ 16 ก.ย.
      if (!targetData) {
        const rootMatch = Object.keys(rootAttendance).find(k => 
          (currentSession.includes("Week 1") && k.includes("Week 1")) ||
          k.includes("16 ก.ย.") ||
          k.toLowerCase().replace(/[^a-z0-9]/g, '') === currentSession.toLowerCase().replace(/[^a-z0-9]/g, '')
        );
        if (rootMatch && typeof rootAttendance[rootMatch] === 'object') {
          targetData = rootAttendance[rootMatch];
        }
      }

      // นำข้อมูลที่เจอมาใช้งาน
      sessionAttendance = targetData || {};
      
      console.log("Loaded Attendance Data for", currentSession, ":", sessionAttendance);
      renderDashboardUI();
    })
    .catch(err => {
      console.error("Error loading session data:", err);
      sessionAttendance = {};
      renderDashboardUI();
    });
}

function renderDashboardUI() {
  const rosterIds = Object.keys(activeRoster);
  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;
  let leaveCount = 0;
  let submittedCount = 0;

  let rankedList = [];

  rosterIds.forEach(id => {
    const rec = sessionAttendance[id] || {};
    const isPresent = rec.status === 'PRESENT';
    const isLate = rec.status === 'LATE';
    const isLeave = rec.status === 'LEAVE';
    const hasFile = !!rec.fileUrl;

    if (isPresent) presentCount++;
    else if (isLate) lateCount++;
    else if (isLeave) leaveCount++;
    else absentCount++;

    if (hasFile) submittedCount++;

    rankedList.push({
      id,
      name: activeRoster[id],
      score: rec.score !== undefined ? Number(rec.score) : -1,
      rec
    });
  });

  // อัปเดตการ์ด 4 สถิติ
  const totalStudents = rosterIds.length;
  document.getElementById('statTotalStudents').innerText = totalStudents;
  document.getElementById('statPresent').innerText = presentCount;
  document.getElementById('statLate').innerText = lateCount;
  document.getElementById('statSubmitted').innerText = submittedCount;
  document.getElementById('statSubTotal').innerText = totalStudents;
  document.getElementById('countAll').innerText = totalStudents;

  // Render Top 5 Cards
  rankedList.sort((a, b) => b.score - a.score);
  const topGrid = document.getElementById('topRankGrid');
  if (topGrid) {
    topGrid.innerHTML = '';
    const medals = ['🥇', '🥈', '🥉', '#4', '#5'];
    for (let i = 0; i < 5; i++) {
      const st = rankedList[i];
      if (st) {
        topGrid.innerHTML += `
          <div class="top-card">
            <div class="top-card-rank">${medals[i]}</div>
            <div class="top-card-name" title="${st.name}">${st.name}</div>
            <div class="top-card-id">${st.id}</div>
            <div class="top-card-score">${st.score > -1 ? st.score + ' แต้ม' : 'ยังไม่มีคะแนน'}</div>
          </div>
        `;
      } else {
        topGrid.innerHTML += `
          <div class="top-card" style="opacity: 0.4;">
            <div class="top-card-rank">${medals[i]}</div>
            <div class="top-card-name">-</div>
            <div class="top-card-id">-</div>
            <div class="top-card-score">-</div>
          </div>
        `;
      }
    }
  }

  renderTableRows(rankedList);
}

function setTableFilter(flt, btn) {
  tableFilter = flt;
  document.querySelectorAll('.f-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderDashboardUI();
}

function renderTableRows(rankedList) {
  const tbody = document.getElementById('adminTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  rankedList.forEach((st, idx) => {
    const rec = st.rec;
    const isPresent = rec.status === 'PRESENT';
    const isLate = rec.status === 'LATE';
    const isLeave = rec.status === 'LEAVE';
    const hasFile = !!rec.fileUrl;

    if (tableFilter === 'NOT_SUBMITTED' && hasFile) return;
    if (tableFilter === 'ABSENT' && (isPresent || isLate || isLeave)) return;
    if (tableFilter === 'LEAVE' && !isLeave) return;

    let statusBadge = `<span class="tag tag-absent" onclick="openStatusModal('${st.id}')">ขาดเรียน</span>`;
    if (isLeave) statusBadge = `<span class="tag tag-leave" onclick="openStatusModal('${st.id}')" title="${rec.leaveReason || ''}">ลาเรียน</span>`;
    else if (isPresent) statusBadge = `<span class="tag tag-present" onclick="openStatusModal('${st.id}')">เข้าห้องแล้ว</span>`;
    else if (isLate) statusBadge = `<span class="tag tag-late" onclick="openStatusModal('${st.id}')">มาสาย</span>`;

    let fileDisplay = '<span class="tag tag-waiting">ยังไม่ส่ง</span>';
    if (hasFile) {
      fileDisplay = `<a href="${rec.fileUrl}" target="_blank" style="color:#4338CA; font-weight:700; text-decoration:none;">📄 ดูไฟล์ (${rec.fileSize || 'งาน'})</a>`;
    }

    const ipDisplay = rec.ip || rec.ipAddress || '-';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:700; color:#64748B;">#${idx + 1}</td>
      <td style="font-weight:700; color:#1E1B4B;">${st.id}</td>
      <td>${st.name}</td>
      <td>${statusBadge}</td>
      <td>${rec.timestamp || rec.submittedTime || '-'}</td>
      <td style="font-weight:700; color:#4338CA;">${st.score > -1 ? st.score : '-'}</td>
      <td><span class="${hasFile ? 'tag tag-submitted' : 'tag tag-waiting'}">${hasFile ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}</span></td>
      <td>${fileDisplay}</td>
      <td style="font-family: var(--font-main); font-size: 0.8rem; color: #64748B;">${ipDisplay}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Modal ปรับสถานะการเข้าเรียน
function openStatusModal(stId) {
  currentEditingStudentId = stId;
  const studentName = activeRoster[stId] || '';
  const rec = sessionAttendance[stId] || {};
  const currentSt = rec.status || 'ABSENT';

  const nameEl = document.getElementById('modalStudentName');
  const selEl = document.getElementById('modalStatusSelect');
  if (nameEl) nameEl.innerText = `${stId} - ${studentName}`;
  if (selEl) {
    selEl.value = currentSt;
    setTimeout(() => selEl.focus(), 50); // โฟกัส Dropdown ทันทีเพื่อให้กด Enter ได้ทันที
  }

  const modal = document.getElementById('attendanceStatusModal');
  if (modal) modal.style.display = 'flex';
}

function closeStatusModal() {
  currentEditingStudentId = null;
  const modal = document.getElementById('attendanceStatusModal');
  if (modal) modal.style.display = 'none';
}

function confirmSaveStatus() {
  if (!currentEditingStudentId) return;

  const stId = currentEditingStudentId;
  const newStatus = document.getElementById('modalStatusSelect').value;
  const rec = sessionAttendance[stId] || {};

  let leaveReason = rec.leaveReason || null;
  if (newStatus === 'LEAVE') {
    leaveReason = prompt("ระบุเหตุผลการลา (ถ้ามี):", leaveReason || "ลาเรียน") || "ลาเรียน";
  }

  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const updatePayload = {
    status: newStatus,
    leaveReason: newStatus === 'LEAVE' ? leaveReason : null,
    timestamp: rec.timestamp || (newStatus !== 'ABSENT' ? timeStr : null)
  };

  fetch(`${baseUrl}attendance/${activeCourseId}/${safeSession}/${stId}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatePayload)
  }).then(() => {
    sessionAttendance[stId] = Object.assign(sessionAttendance[stId] || {}, updatePayload);
    closeStatusModal();
    renderDashboardUI();
  });
}

function loadAssignmentSettings() {
  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}session_settings/${activeCourseId}/${safeSession}/assignmentConfig.json`)
    .then(r => r.json())
    .then(cfg => {
      if (cfg) {
        applyAssignmentConfig(cfg);
      } else {
        const rawKey = encodeURIComponent(currentSession);
        fetch(`${baseUrl}session_settings/${activeCourseId}/${rawKey}/assignmentConfig.json`)
          .then(r => r.json())
          .then(legacyCfg => applyAssignmentConfig(legacyCfg))
          .catch(() => resetAssignmentInputs());
      }
    })
    .catch(() => resetAssignmentInputs());
}

function applyAssignmentConfig(cfg) {
  currentAssignmentConfig = cfg;
  const fInput = document.getElementById('hwFolderUrl');
  const dInput = document.getElementById('hwDeadline');
  if (cfg) {
    if (fInput) fInput.value = cfg.folderUrl || '';
    if (dInput) dInput.value = cfg.deadline || '';
  } else {
    resetAssignmentInputs();
  }
}

function saveAssignmentSettings() {
  const folderUrl = document.getElementById('hwFolderUrl').value.trim();
  const deadline = document.getElementById('hwDeadline').value;

  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  const configData = {
    folderUrl: folderUrl,
    deadline: deadline,
    updatedAt: new Date().toISOString()
  };

  fetch(`${baseUrl}session_settings/${activeCourseId}/${safeSession}/assignmentConfig.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(configData)
  }).then(() => {
    alert(`✓ บันทึกการตั้งค่าโฟลเดอร์สำหรับ [${currentSession}] สำเร็จ`);
  });
}

function resetAssignmentInputs() {
  const fInput = document.getElementById('hwFolderUrl');
  const dInput = document.getElementById('hwDeadline');
  if (fInput) fInput.value = '';
  if (dInput) dInput.value = '';
}

function saveCutoffTime() {
  const time = document.getElementById('cutoffTimeInput').value;
  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}session_settings/${activeCourseId}/${safeSession}/cutoffTime.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(time)
  });
}

function renderStudentRosterManager() {
  const container = document.getElementById('rosterListContainer');
  if (!container) return;
  const rosterIds = Object.keys(activeRoster);
  container.innerHTML = '';

  rosterIds.forEach(id => {
    container.innerHTML += `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0.6rem; border-bottom:1px solid #F1F5F9; font-size:0.85rem;">
        <div><strong>${id}</strong> - ${activeRoster[id]}</div>
        <button onclick="removeStudentFromRoster('${id}')" style="background:#FEE2E2; color:#DC2626; border:none; padding:0.2rem 0.5rem; border-radius:6px; cursor:pointer;">ลบ</button>
      </div>
    `;
  });
}

function addSingleStudent() {
  const id = document.getElementById('newStudentId').value.trim();
  const name = document.getElementById('newStudentName').value.trim();
  if (!id || !name) return alert("กรุณากรอกรหัสและชื่อ");

  activeRoster[id] = name;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';
  fetch(`${baseUrl}courses/${activeCourseId}/roster.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(activeRoster)
  }).then(() => {
    document.getElementById('newStudentId').value = '';
    document.getElementById('newStudentName').value = '';
    renderStudentRosterManager();
    renderDashboardUI();
  });
}

function removeStudentFromRoster(id) {
  if (!confirm(`ลบ ${id} ใช่หรือไม่?`)) return;
  delete activeRoster[id];
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';
  fetch(`${baseUrl}courses/${activeCourseId}/roster.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(activeRoster)
  }).then(() => {
    renderStudentRosterManager();
    renderDashboardUI();
  });
}

function saveCourseMetadata() {
  const secVal = document.getElementById('courseSectionInput').value.trim();
  const roomVal = document.getElementById('courseRoomInput').value.trim();
  const dayVal = document.getElementById('courseDaySelect').value;
  const timeVal = document.getElementById('courseTimeInput').value.trim();

  const combinedDayTime = `${dayVal} ${timeVal}`.trim();

  const patchData = {
    section: secVal ? `Sec ${secVal}` : '',
    room: roomVal ? `ห้อง ${roomVal}` : '',
    dayTime: combinedDayTime,
    day: dayVal,
    time: timeVal
  };

  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';
  fetch(`${baseUrl}courses/${activeCourseId}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patchData)
  }).then(() => {
    alert("✓ บันทึกข้อมูลห้องเรียนเรียบร้อยแล้ว");
  });
}

function loadAllAttendanceForOverview() {
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';
  fetch(`${baseUrl}attendance/${activeCourseId}.json`)
    .then(r => r.json())
    .then(data => {
      allAttendance = data || {};
      renderTermOverviewTable();
    })
    .catch(() => { allAttendance = {}; });
}

function renderTermOverviewTable() {
  const container = document.getElementById('termOverviewTableContainer');
  if (!container || !CONFIG.SESSIONS) return;

  const rosterIds = Object.keys(activeRoster);
  let html = `<table class="main-table" style="font-size:0.82rem;"><thead><tr><th>รหัสนักศึกษา</th><th>ชื่อ - นามสกุล</th>`;
  CONFIG.SESSIONS.forEach((s, idx) => { html += `<th style="text-align:center;">W${idx+1}</th>`; });
  html += `<th style="text-align:center;">รวมคะแนน</th></tr></thead><tbody>`;

  rosterIds.forEach(id => {
    let sum = 0;
    html += `<tr><td><strong>${id}</strong></td><td>${activeRoster[id]}</td>`;
    CONFIG.SESSIONS.forEach(sess => {
      const safe = (typeof sanitizeKey === 'function') ? sanitizeKey(sess) : sess;
      const rec = (allAttendance[safe] && allAttendance[safe][id]) || (allAttendance[sess] && allAttendance[sess][id]);
      let icon = '-';
      if (rec) {
        if (rec.status === 'PRESENT') icon = '✅';
        else if (rec.status === 'LATE') icon = '🟡';
        else if (rec.status === 'LEAVE') icon = '🔵';
        if (rec.score) sum += Number(rec.score);
      }
      html += `<td style="text-align:center;">${icon}</td>`;
    });
    html += `<td style="text-align:center; font-weight:800; color:#4338CA;">${sum}</td></tr>`;
  });
  html += `</tbody></table>`;
  container.innerHTML = html;
}

function exportAttendanceToCSV() {
  const rosterIds = Object.keys(activeRoster);
  if (rosterIds.length === 0) return alert("ไม่มีข้อมูลสำหรับ Export");

  let csv = "\uFEFFอันดับ,รหัสนักศึกษา,ชื่อ - นามสกุล,สถานะเช็คชื่อ,เวลาเข้าเรียน,คะแนน,สถานะการบ้าน,ลิงก์ไฟล์,IP Address\n";
  rosterIds.forEach((id, idx) => {
    const rec = sessionAttendance[id] || {};
    let st = "ขาดเรียน";
    if (rec.status === "PRESENT") st = "เข้าห้องแล้ว";
    else if (rec.status === "LATE") st = "มาสาย";
    else if (rec.status === "LEAVE") st = "ลาเรียน";

    const ip = rec.ip || rec.ipAddress || '-';

    csv += [
      idx + 1,
      `"${id}"`,
      `"${activeRoster[id]}"`,
      `"${st}"`,
      `"${rec.timestamp || '-'}"`,
      rec.score !== undefined ? rec.score : 0,
      rec.fileUrl ? "ส่งแล้ว" : "ยังไม่ส่ง",
      `"${rec.fileUrl || '-'}"`,
      `"${ip}"`
    ].join(",") + "\n";
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Attendance_${activeCourseId}_${currentSession}.csv`;
  a.click();
}

function logoutAdmin() {
  // เคลียร์สิทธิ์การเข้าใช้งาน Admin
  sessionStorage.removeItem("adminAuthenticated");
  
  // สั่งให้กลับไปหน้าจอผู้สอน (teacher.html)
  window.location.href = "teacher.html";
}
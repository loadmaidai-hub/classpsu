// js/admin.js - แผงควบคุมอาจารย์ผู้สอน (Admin Dashboard)

let currentSession = CONFIG.SESSIONS[0];
let realtimeData = {};
let currentFilter = 'ALL';
let currentEditStudentId = null;

// ตารางตัดรอบสัปดาห์ใหม่ ทุกวันจันทร์ (เริ่ม 00:00 น. หลังปิดรับงานคืนวันอาทิตย์)
const SESSION_DATES = [
  new Date(2026, 8, 14, 0, 0, 0), // Week 1: เริ่มจันทร์ 14 ก.ย. 2569
  new Date(2026, 8, 21, 0, 0, 0), // Week 2: เริ่มจันทร์ 21 ก.ย. 2569
  new Date(2026, 8, 28, 0, 0, 0), // Week 3: เริ่มจันทร์ 28 ก.ย. 2569
  new Date(2026, 9, 5, 0, 0, 0),  // Week 4: เริ่มจันทร์ 5 ต.ค. 2569
  new Date(2026, 9, 12, 0, 0, 0), // Week 5: เริ่มจันทร์ 12 ต.ค. 2569
  new Date(2026, 9, 19, 0, 0, 0), // Week 6: เริ่มจันทร์ 19 ต.ค. 2569
  new Date(2026, 9, 26, 0, 0, 0), // Week 7: เริ่มจันทร์ 26 ต.ค. 2569
  new Date(2026, 10, 2, 0, 0, 0), // Week 8: เริ่มจันทร์ 2 พ.ย. 2569
  new Date(2026, 10, 9, 0, 0, 0), // Week 9: เริ่มจันทร์ 9 พ.ย. 2569
  new Date(2026, 10, 16, 0, 0, 0),// Week 10: เริ่มจันทร์ 16 พ.ย. 2569
  new Date(2026, 10, 23, 0, 0, 0) // Week 11: เริ่มจันทร์ 23 พ.ย. 2569
];

document.addEventListener("DOMContentLoaded", () => {
  const isAuth = sessionStorage.getItem("adminAuthenticated");
  if (isAuth === "true") {
    unlockAdminDashboard();
  }
});

// 1. ระบบยืนยันรหัสผ่านเข้าแดชบอร์ด
function verifyAdminPassword() {
  const inputPass = document.getElementById('adminPasswordInput').value;
  const errorMsg = document.getElementById('authErrorMsg');

  if (inputPass === CONFIG.TEACHER_PASSWORD) {
    sessionStorage.setItem("adminAuthenticated", "true");
    unlockAdminDashboard();
  } else {
    errorMsg.style.display = 'block';
    document.getElementById('adminPasswordInput').value = '';
    document.getElementById('adminPasswordInput').focus();
  }
}

function unlockAdminDashboard() {
  document.getElementById('authGate').style.display = 'none';
  document.getElementById('adminContent').style.display = 'block';
  init();
}

function logoutAdmin() {
  sessionStorage.removeItem("adminAuthenticated");
  location.reload();
}

// 2. คำนวณหาสัปดาห์ปัจจุบันตามปฏิทินจริง (ทุกวันจันทร์)
function getAutoCalculatedSession() {
  const today = new Date();
  let matchedIndex = 0;
  for (let i = 0; i < SESSION_DATES.length; i++) {
    if (today >= SESSION_DATES[i]) {
      matchedIndex = i;
    }
  }
  return CONFIG.SESSIONS[matchedIndex];
}

// 3. ฟังก์ชันเริ่มต้นทำงาน (Init)
function init() {
  const sel = document.getElementById('sessionSelect');
  sel.innerHTML = CONFIG.SESSIONS.map(s => `<option value="${s}">📅 ${s}</option>`).join('') +
                  `<option value="SUMMARY">📊 [สรุปภาพรวม 11 สัปดาห์สะสม]</option>`;

  fetch(`${CONFIG.FIREBASE_DB_URL}current_session.json`)
    .then(r => r.json())
    .then(serverSession => {
      const autoSession = getAutoCalculatedSession();
      currentSession = serverSession || autoSession;
      sel.value = currentSession;
      loadCutoff();
      loadAssignmentConfig();
      fetchData();
    })
    .catch(() => {
      currentSession = getAutoCalculatedSession();
      sel.value = currentSession;
      loadCutoff();
      loadAssignmentConfig();
      fetchData();
    });
}

// 4. จัดการเวลาตัดสาย (Cutoff Time)
function saveCutoff() {
  const time = document.getElementById('cutoffTime').value;
  const safe = sanitizeKey(currentSession);
  localStorage.setItem(`cutoff_${safe}`, time);
  fetch(`${CONFIG.FIREBASE_DB_URL}session_settings/${safe}/cutoffTime.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(time)
  });
  render();
}

function loadCutoff() {
  const safe = sanitizeKey(currentSession);
  document.getElementById('cutoffTime').value = localStorage.getItem(`cutoff_${safe}`) || "10:45";
}

// 5. บันทึกและรีเซ็ตการตั้งค่าโฟลเดอร์ Google Drive & กำหนดส่ง
function saveAssignmentConfig() {
  if (currentSession === 'SUMMARY') return alert("กรุณาเลือกสัปดาห์ที่ต้องการตั้งค่า");

  const folder = document.getElementById('folderUrlInput').value.trim();
  const deadline = document.getElementById('deadlineInput').value;
  const safe = sanitizeKey(currentSession);

  fetch(`${CONFIG.FIREBASE_DB_URL}session_settings/${safe}/assignmentConfig.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderUrl: folder, deadline: deadline })
  }).then(() => {
    alert(`✓ บันทึกการตั้งค่าส่งงานของ "${currentSession}" เรียบร้อยแล้ว`);
  }).catch(err => {
    alert("เกิดข้อผิดพลาดในการบันทึก: " + err.message);
  });
}

function resetAssignmentConfig() {
  if (currentSession === 'SUMMARY') return;
  if (!confirm(`ต้องการล้างลิงก์โฟลเดอร์และเวลาปิดรับของ "${currentSession}" ใช่หรือไม่?`)) return;

  const safe = sanitizeKey(currentSession);

  fetch(`${CONFIG.FIREBASE_DB_URL}session_settings/${safe}/assignmentConfig.json`, {
    method: "DELETE"
  }).then(() => {
    document.getElementById('folderUrlInput').value = "";
    document.getElementById('deadlineInput').value = "";
    alert(`✓ รีเซ็ตการตั้งค่าส่งงานของ "${currentSession}" เรียบร้อยแล้ว`);
  }).catch(err => {
    alert("เกิดข้อผิดพลาดในการรีเซ็ต: " + err.message);
  });
}

function loadAssignmentConfig() {
  const safe = sanitizeKey(currentSession);
  fetch(`${CONFIG.FIREBASE_DB_URL}session_settings/${safe}/assignmentConfig.json`)
    .then(r => r.json())
    .then(data => {
      document.getElementById('folderUrlInput').value = (data && data.folderUrl) || "";
      document.getElementById('deadlineInput').value = (data && data.deadline) || "";
    });
}

// เปลี่ยนสัปดาห์เพื่อดูข้อมูลย้อนหลัง
function changeAdminSession() {
  currentSession = document.getElementById('sessionSelect').value;
  
  const btnLive = document.getElementById('btnSetLiveSession');
  if (btnLive) {
    btnLive.style.display = (currentSession === 'SUMMARY') ? 'none' : 'inline-block';
  }

  loadCutoff();
  loadAssignmentConfig();
  render();
}

// สั่งตั้งสัปดาห์ที่เลือกให้เป็นคาบสอนสดสำหรับเด็กทั้งหมด
function setAsLiveClassSession() {
  if (currentSession === 'SUMMARY') return;
  if (!confirm(`ต้องการตั้ง "${currentSession}" ให้เป็นสัปดาห์สอนสดสำหรับห้องเรียนและนักศึกษาทั้งหมดใช่หรือไม่?`)) return;

  fetch(`${CONFIG.FIREBASE_DB_URL}current_session.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(currentSession)
  }).then(() => {
    alert(`✓ ตั้งค่า "${currentSession}" เป็นคาบสดของระบบเรียบร้อยแล้ว`);
  });
}

// 6. ดึงข้อมูลบันทึกแบบ Realtime จาก Firebase
function fetchData() {
  fetch(`${CONFIG.FIREBASE_DB_URL}attendance.json`)
    .then(r => r.json())
    .then(d => {
      realtimeData = d || {};
      render();
    });
}

// 7. แถบฟิลเตอร์คัดกรองด่วน
function setAdminFilter(filterType) {
  currentFilter = filterType;
  ['filterAll', 'filterNoHw', 'filterAbsent', 'filterLeave'].forEach(btnId => {
    const el = document.getElementById(btnId);
    if (el) { el.style.background = 'white'; el.style.color = 'var(--dark)'; }
  });
  const activeMap = { 'ALL': 'filterAll', 'NO_HW': 'filterNoHw', 'ABSENT': 'filterAbsent', 'LEAVE': 'filterLeave' };
  const curBtn = document.getElementById(activeMap[filterType]);
  if (curBtn) { curBtn.style.background = '#1E1B4B'; curBtn.style.color = 'white'; }

  render();
}

// 8. ระบบ Modal ปรับสถานะการเข้าเรียนรายบุคคล & บันทึกเหตุผลการลา
function openStatusModal(studentId) {
  currentEditStudentId = studentId;
  const safe = sanitizeKey(currentSession);
  const rec = (realtimeData[safe] && realtimeData[safe][studentId]) || null;
  const cutoff = document.getElementById('cutoffTime').value;

  document.getElementById('modalTargetStudent').innerText = `${studentId} - ${STUDENT_ROSTER[studentId]}`;

  const select = document.getElementById('statusSelect');
  const reasonInput = document.getElementById('leaveReasonInput');

  if (!rec) {
    select.value = "ABSENT";
    reasonInput.value = "";
  } else if (rec.status === 'LEAVE') {
    select.value = "LEAVE";
    reasonInput.value = rec.leaveReason || "";
  } else if (rec.timestamp && rec.timestamp <= cutoff) {
    select.value = "PRESENT";
    reasonInput.value = "";
  } else if (rec.timestamp && rec.timestamp > cutoff) {
    select.value = "LATE";
    reasonInput.value = "";
  } else {
    select.value = "PRESENT";
    reasonInput.value = "";
  }

  handleStatusSelectChange();
  document.getElementById('statusModal').style.display = 'flex';
}

function closeStatusModal() {
  document.getElementById('statusModal').style.display = 'none';
  currentEditStudentId = null;
}

function handleStatusSelectChange() {
  const select = document.getElementById('statusSelect');
  const reasonBox = document.getElementById('leaveReasonBox');
  if (select.value === 'LEAVE') {
    reasonBox.style.display = 'block';
    document.getElementById('leaveReasonInput').focus();
  } else {
    reasonBox.style.display = 'none';
  }
}

function saveStudentStatus() {
  if (!currentEditStudentId) return;

  const safe = sanitizeKey(currentSession);
  const selectedStatus = document.getElementById('statusSelect').value;
  const reason = document.getElementById('leaveReasonInput').value.trim();
  const existingRec = (realtimeData[safe] && realtimeData[safe][currentEditStudentId]) || {};
  const cutoff = document.getElementById('cutoffTime').value;

  if (selectedStatus === 'ABSENT') {
    if (existingRec.fileUrl) {
      fetch(`${CONFIG.FIREBASE_DB_URL}attendance/${safe}/${currentEditStudentId}.json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timestamp: null, status: "ABSENT", score: 0 })
      }).then(() => { closeStatusModal(); fetchData(); });
    } else {
      fetch(`${CONFIG.FIREBASE_DB_URL}attendance/${safe}/${currentEditStudentId}.json`, {
        method: "DELETE"
      }).then(() => { closeStatusModal(); fetchData(); });
    }
  } else if (selectedStatus === 'LEAVE') {
    const payload = {
      ...existingRec,
      id: currentEditStudentId,
      name: STUDENT_ROSTER[currentEditStudentId],
      status: "LEAVE",
      leaveReason: reason || "ไม่ได้ระบุเหตุผล",
      timestamp: "ลา",
      score: existingRec.score || 0
    };

    fetch(`${CONFIG.FIREBASE_DB_URL}attendance/${safe}/${currentEditStudentId}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(() => { closeStatusModal(); fetchData(); });

  } else if (selectedStatus === 'PRESENT') {
    const payload = {
      ...existingRec,
      id: currentEditStudentId,
      name: STUDENT_ROSTER[currentEditStudentId],
      status: "PRESENT",
      leaveReason: null,
      timestamp: cutoff ? cutoff : "10:30",
      score: existingRec.score || 100
    };

    fetch(`${CONFIG.FIREBASE_DB_URL}attendance/${safe}/${currentEditStudentId}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(() => { closeStatusModal(); fetchData(); });

  } else if (selectedStatus === 'LATE') {
    const payload = {
      ...existingRec,
      id: currentEditStudentId,
      name: STUDENT_ROSTER[currentEditStudentId],
      status: "LATE",
      leaveReason: null,
      timestamp: "11:15",
      score: existingRec.score || 50
    };

    fetch(`${CONFIG.FIREBASE_DB_URL}attendance/${safe}/${currentEditStudentId}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(() => { closeStatusModal(); fetchData(); });
  }
}

// 9. แสดงผลตารางแดชบอร์ด
function render() {
  const thead = document.getElementById('adminThead');
  const tbody = document.getElementById('adminTbody');
  const cutoff = document.getElementById('cutoffTime').value;

  if (currentSession === 'SUMMARY') {
    document.getElementById('top5Container').style.display = 'none';
    const sessions = Object.keys(realtimeData);
    const total = sessions.length || 1;
    thead.innerHTML = `<tr><th>รหัส</th><th>ชื่อ - นามสกุล</th><th>เข้าเรียน</th><th>% เวลาเรียน</th><th>สิทธิ์สอบ</th></tr>`;
    tbody.innerHTML = '';
    let pass = 0, warn = 0, fail = 0;

    Object.keys(STUDENT_ROSTER).forEach(id => {
      let count = 0;
      sessions.forEach(s => { 
        if (realtimeData[s] && realtimeData[s][id]) {
          if (realtimeData[s][id].status !== 'LEAVE') count++;
        } 
      });
      const pct = Math.round((count / total) * 100);
      let badge = '<span class="tag tag-present">มีสิทธิ์สอบ</span>';
      if (pct < 80 && pct >= 50) { badge = '<span class="tag tag-late">เสี่ยง มส.</span>'; warn++; }
      else if (pct < 50) { badge = '<span class="tag tag-absent">หมดสิทธิ์</span>'; fail++; }
      else pass++;

      tbody.innerHTML += `<tr><td><strong>${id}</strong></td><td>${STUDENT_ROSTER[id]}</td><td>${count}/${total}</td><td>${pct}%</td><td>${badge}</td></tr>`;
    });
    document.getElementById('kpiVal1').innerText = pass;
    document.getElementById('kpiVal2').innerText = warn;
    document.getElementById('kpiVal3').innerText = fail;
  } else {
    document.getElementById('top5Container').style.display = 'grid';
    const safe = sanitizeKey(currentSession);
    const records = realtimeData[safe] || {};

    thead.innerHTML = `
      <tr>
        <th>อันดับ</th>
        <th>รหัส</th>
        <th>ชื่อ - นามสกุล</th>
        <th>สถานะเช็คชื่อ</th>
        <th>เวลาเข้าห้อง</th>
        <th>คะแนนควิซ</th>
        <th style="text-align:center;">สถานะการบ้าน</th>
        <th style="text-align:center;">ไฟล์ชิ้นงาน</th>
        <th>IP Address</th>
      </tr>`;
    tbody.innerHTML = '';
    let present = 0, late = 0, hwCount = 0;

    const ipMap = {};
    Object.values(records).forEach(r => { if (r && r.ip) ipMap[r.ip] = (ipMap[r.ip] || 0) + 1; });

    Object.keys(STUDENT_ROSTER).forEach((id, i) => {
      const rec = records[id];
      const isLeave = rec && rec.status === 'LEAVE';
      const isPresent = rec && rec.timestamp && rec.timestamp <= cutoff && !isLeave;
      const isLate = rec && rec.timestamp && rec.timestamp > cutoff && !isLeave;
      const isAbsent = !rec || (!isPresent && !isLate && !isLeave);
      const hasHw = rec && rec.fileUrl;

      if (isPresent) present++;
      if (isLate) late++;
      if (hasHw) hwCount++;

      if (currentFilter === 'NO_HW' && hasHw) return;
      if (currentFilter === 'ABSENT' && !isAbsent) return;
      if (currentFilter === 'LEAVE' && !isLeave) return;

      let statusText = 'ขาดเรียน';
      let statusClass = 'tag-absent';

      if (isLeave) {
        const reasonText = rec && rec.leaveReason ? `<br><small style="color:#B45309; font-weight:600;">(${rec.leaveReason})</small>` : '';
        statusText = `🏥 ลาเรียน ${reasonText}`;
        statusClass = 'tag-late';
      } else if (isPresent) {
        statusText = 'ตรงเวลา';
        statusClass = 'tag-present';
      } else if (isLate) {
        statusText = 'มาสาย';
        statusClass = 'tag-late';
      }

      const statusBadge = `
        <span class="tag ${statusClass}" style="cursor:pointer; display:inline-block; line-height:1.3;" onclick="openStatusModal('${id}')" title="คลิกเพื่อปรับสถานะ">
          ${statusText} ▾
        </span>
      `;

      let hwBadge = `<span class="tag tag-absent">ยังไม่ส่ง</span>`;
      let fileAction = `<span style="color:#94A3B8;">-</span>`;

      if (hasHw) {
        hwBadge = `<span class="tag tag-present">✓ ส่งแล้ว (${rec.submittedTime || '-'})</span>`;
        fileAction = `
          <a href="${rec.fileUrl}" target="_blank" class="btn-pill" style="display:inline-flex; align-items:center; gap:4px; padding:0.25rem 0.75rem; font-size:0.8rem; background:#EEF2FF; color:#4338CA; border:1px solid #C7D2FE; text-decoration:none;">
            📄 เปิดตรวจ (${rec.fileSize || 'ไฟล์'})
          </a>
        `;
      }

      let ipBadge = rec && rec.ip ? (ipMap[rec.ip] > 1 ? `<span style="color:var(--danger); font-weight:700;">⚠️ ${rec.ip} (ซ้ำ)</span>` : `<small>${rec.ip}</small>`) : '-';

      tbody.innerHTML += `
        <tr>
          <td>#${i+1}</td>
          <td><strong>${id}</strong></td>
          <td>${STUDENT_ROSTER[id]}</td>
          <td>${statusBadge}</td>
          <td>${rec ? rec.timestamp : '-'}</td>
          <td style="color:var(--primary); font-weight:700;">${rec && !isLeave ? rec.score + ' แต้ม' : '-'}</td>
          <td style="text-align:center;">${hwBadge}</td>
          <td style="text-align:center;">${fileAction}</td>
          <td>${ipBadge}</td>
        </tr>`;
    });

    document.getElementById('kpiVal1').innerText = present;
    document.getElementById('kpiVal2').innerText = late;
    document.getElementById('kpiVal3').innerText = `${hwCount}/65`;

    renderTop5(records);
  }
}

// 10. แสดงผล Top 1-5
function renderTop5(records) {
  const container = document.getElementById('top5Container');
  let list = Object.keys(STUDENT_ROSTER).map(id => ({
    id,
    name: STUDENT_ROSTER[id],
    score: records[id] && records[id].status !== 'LEAVE' ? (records[id].score || 0) : -1
  })).sort((a, b) => b.score - a.score);

  const top5 = list.slice(0, 5);
  const medalIcons = ['🥇', '🥈', '🥉', '#4', '#5'];

  container.innerHTML = top5.map((st, i) => {
    const isRanked = st.score > -1;
    return `
      <div class="top5-card rank-${i+1}">
        <div class="top5-badge">${medalIcons[i]}</div>
        <div class="top5-name">${st.name}</div>
        <div class="top5-id">${st.id}</div>
        <div class="top5-score">${isRanked ? st.score + ' แต้ม' : '<span style="color:#94A3B8; font-weight:400; font-size:0.85rem;">ยังไม่มีคะแนน</span>'}</div>
      </div>
    `;
  }).join('');
}

// 11. Modal ตารางคะแนนเต็ม
function openScoreModal() {
  const safe = sanitizeKey(currentSession);
  const records = realtimeData[safe] || {};
  document.getElementById('modalSessionTitle').innerText = `ข้อมูลคะแนนควิซ: ${currentSession}`;

  let list = Object.keys(STUDENT_ROSTER).map(id => ({
    id,
    name: STUDENT_ROSTER[id],
    rec: records[id],
    score: records[id] && records[id].status !== 'LEAVE' ? (records[id].score || 0) : -1
  })).sort((a, b) => b.score - a.score);

  const tbody = document.getElementById('fullScoreboardBody');
  tbody.innerHTML = '';

  const medals = ['🥇', '🥈', '🥉'];
  list.forEach((st, i) => {
    const rankDisplay = i < 3 && st.score > -1 ? medals[i] : `#${i + 1}`;
    tbody.innerHTML += `
      <tr>
        <td style="font-weight:700;">${rankDisplay}</td>
        <td><strong>${st.id}</strong></td>
        <td>${st.name}</td>
        <td style="text-align:right; font-weight:800; color:var(--primary);">
          ${st.score > -1 ? st.score + ' แต้ม' : '<span style="color:#94A3B8; font-weight:400;">-</span>'}
        </td>
      </tr>
    `;
  });

  document.getElementById('scoreModal').style.display = 'flex';
}

function closeScoreModal() {
  document.getElementById('scoreModal').style.display = 'none';
}

// 12. ส่งออกรายงานเป็น CSV
function exportCSV() {
  const safe = sanitizeKey(currentSession);
  const records = realtimeData[safe] || {};
  let csv = "\uFEFFรหัสนักศึกษา,ชื่อ-นามสกุล,สถานะเช็คชื่อ,เหตุผลการลา,เวลา,คะแนนควิซ,สถานะการบ้าน,ลิงก์ไฟล์GoogleDrive\n";

  Object.keys(STUDENT_ROSTER).forEach(id => {
    const rec = records[id];
    let status = 'ขาดเรียน';
    let leaveReason = '-';
    if (rec) {
      if (rec.status === 'LEAVE') {
        status = 'ลาเรียน';
        leaveReason = rec.leaveReason || 'ไม่ได้ระบุเหตุผล';
      } else if (rec.timestamp <= document.getElementById('cutoffTime').value) {
        status = 'ตรงเวลา';
      } else {
        status = 'มาสาย';
      }
    }
    const hwStatus = rec && rec.fileUrl ? 'ส่งแล้ว' : 'ยังไม่ส่ง';
    const fileUrl = rec && rec.fileUrl ? rec.fileUrl : '-';
    csv += `"${id}","${STUDENT_ROSTER[id]}","${status}","${leaveReason}","${rec ? rec.timestamp : '-'}","${rec ? rec.score : 0}","${hwStatus}","${fileUrl}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `attendance_homework_${safe}.csv`;
  a.click();
}
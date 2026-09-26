// js/teacher.js - จัดการหน้าจอสดอาจารย์ ซิงก์ค่าตาม Firebase เสมอ

let secondsLeft = (typeof CONFIG !== 'undefined' && CONFIG.PIN_LIFETIME) ? CONFIG.PIN_LIFETIME : 120;
let timerInterval = null;
let currentSession = (typeof CONFIG !== 'undefined' && CONFIG.SESSIONS) ? CONFIG.SESSIONS[0] : "Week 1";
let currentCourseId = '969-042G4';
let allCoursesData = {};
let currentCourseData = null;
let currentRoster = {};
let realtimeData = {};
let isSpinning = false;

function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const paramCourse = urlParams.get('course');
  const cachedCourse = localStorage.getItem('lastSelectedCourse');
  currentCourseId = paramCourse || cachedCourse || '969-042G4';

  const leftSel = document.getElementById('leftSessionSelect');
  const sideSel = document.getElementById('sideSessionSelect');
  
  if (typeof CONFIG !== 'undefined' && CONFIG.SESSIONS) {
    const optionsHtml = CONFIG.SESSIONS.map(s => `<option value="${s}">📅 ${s}</option>`).join('');
    if (leftSel) leftSel.innerHTML = optionsHtml;
    if (sideSel) sideSel.innerHTML = optionsHtml;
  }

  loadCoursesAndRoster();
  fetchCurrentSession();
  generatePIN();
  startTimer();
  setInterval(fetchData, 3000);
}

// โหลดสัปดาห์เรียนจริงจาก Firebase (ไม่ให้โค้ดเก่าคำนวณทับ)
function fetchCurrentSession() {
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}current_session.json`)
    .then(r => r.json())
    .then(serverSession => {
      if (serverSession) {
        currentSession = serverSession;
      }
      
      const leftSel = document.getElementById('leftSessionSelect');
      const sideSel = document.getElementById('sideSessionSelect');
      if (leftSel) leftSel.value = currentSession;
      if (sideSel) sideSel.value = currentSession;
      
      const titleEl = document.getElementById('sessionTitle');
      if (titleEl) titleEl.innerText = `${currentSession}`;
      
      renderLeaderboard();
    })
    .catch(() => renderLeaderboard());
}

function loadCoursesAndRoster() {
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';
  
  fetch(`${baseUrl}courses.json`)
    .then(r => r.json())
    .then(courses => {
      allCoursesData = courses || {};
      
      if (!allCoursesData[currentCourseId]) {
        currentCourseId = Object.keys(allCoursesData)[0] || '969-042G4';
      }

      localStorage.setItem('lastSelectedCourse', currentCourseId);
      currentCourseData = allCoursesData[currentCourseId];

      if (currentCourseData) {
        currentRoster = currentCourseData.roster || {};

        const titleEl = document.getElementById('sessionTitle');
        if (titleEl) titleEl.innerText = `${currentSession}`;

        const subEl = document.getElementById('sessionSubtitle');
        if (subEl) {
          const time = currentCourseData.dayTime ? `ทุกวัน${currentCourseData.dayTime} น.` : 'ทุกวันพุธ 10.30 - 12.20 น.';
          subEl.innerText = `${currentCourseData.courseId} ${currentCourseData.courseName} | ${time}`;
        }

        const badgeText = document.getElementById('urlBadgeText');
        if (badgeText) {
          badgeText.innerText = `🌐 CLASSROOM: ${currentCourseId}`;
        }

        const slotTitleEl = document.getElementById('slotModalTitle');
        if (slotTitleEl) {
          slotTitleEl.innerText = `⭐ ${currentCourseId} LUCKY DRAW ⭐`;
        }
      }

      updateDynamicQRCode();
      fetchData();
    })
    .catch(() => {
      updateDynamicQRCode();
      fetchData();
    });
}

function updateDynamicQRCode() {
  const qrImg = document.getElementById('qrCodeImg');
  if (!qrImg) return;
  const currentPath = window.location.pathname;
  const basePath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
  const targetUrl = `${window.location.origin}${basePath}index.html?course=${encodeURIComponent(currentCourseId)}`;
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(targetUrl)}`;
}

function generateNewPin() {
  // สุ่มเลข 4 หลัก
  const newPin = Math.floor(1000 + Math.random() * 9000).toString();
  
  // แสดงผลบนหน้าจอทันที
  const pinDisplay = document.getElementById('pinDisplay');
  if (pinDisplay) pinDisplay.innerText = newPin;

  // ส่งขึ้น Firebase เพื่อให้นักเรียนกรอกตรงกัน
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';
  
  fetch(`${baseUrl}current_pin.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newPin)
  })
  .then(() => {
    console.log("PIN synced to Firebase:", newPin);
  })
  .catch(err => {
    console.error("Error syncing PIN:", err);
  });
}

function forceResetPIN() { generatePIN(); }

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    secondsLeft--;
    updateTimerUI();
    if (secondsLeft <= 0) generatePIN();
  }, 1000);
}

function updateTimerUI() {
  const lifetime = (typeof CONFIG !== 'undefined' && CONFIG.PIN_LIFETIME) ? CONFIG.PIN_LIFETIME : 120;
  const pct = Math.max(0, (secondsLeft / lifetime) * 100);
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  const str = `${m}:${s < 10 ? '0' : ''}${s}`;

  const badgeBase = document.getElementById('badgeBase');
  const badgeFill = document.getElementById('badgeFill');
  const pinFillLayer = document.getElementById('pinFillLayer');

  if (badgeBase) badgeBase.innerText = str;
  if (badgeFill) badgeFill.innerText = str;
  if (pinFillLayer) pinFillLayer.style.width = `${pct}%`;
}

function syncFromSideDropdown() {
  const val = document.getElementById('sideSessionSelect').value;
  if (document.getElementById('leftSessionSelect')) document.getElementById('leftSessionSelect').value = val;
  changeSession();
}

function changeSession() {
  const leftSel = document.getElementById('leftSessionSelect');
  if (leftSel) currentSession = leftSel.value;
  if (document.getElementById('sideSessionSelect')) {
    document.getElementById('sideSessionSelect').value = currentSession;
  }
  
  const titleEl = document.getElementById('sessionTitle');
  if (titleEl) titleEl.innerText = `${currentSession}`;
  
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';
  fetch(`${baseUrl}current_session.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(currentSession)
  });

  renderLeaderboard();
}

function fetchData() {
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';
  fetch(`${baseUrl}attendance/${currentCourseId}.json`)
    .then(r => r.json())
    .then(d => {
      realtimeData = d || {};
      renderLeaderboard();
    })
    .catch(() => {});
}

function renderLeaderboard() {
  const safe = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const records = realtimeData[safe] || {};
  const tbody = document.getElementById('sideTableBody');
  if (!tbody) return;

  const rosterIds = Object.keys(currentRoster);
  let list = rosterIds.map(id => ({
    id,
    name: currentRoster[id],
    rec: records[id],
    score: records[id] && records[id].status !== 'LEAVE' ? (records[id].score || 0) : -1
  })).sort((a, b) => b.score - a.score);

  let submitted = 0;
  tbody.innerHTML = '';

  list.forEach((st, i) => {
    const isSubmitted = st.rec && (st.rec.fileUrl || st.rec.status === 'PRESENT');
    if (isSubmitted) submitted++;

    let rankDisplay = `<span class="rank-badge">#${i + 1}</span>`;
    if (isSubmitted) {
      if (i === 0) rankDisplay = `<span style="font-size: 1.25rem;">🥇</span>`;
      else if (i === 1) rankDisplay = `<span style="font-size: 1.25rem;">🥈</span>`;
      else if (i === 2) rankDisplay = `<span style="font-size: 1.25rem;">🥉</span>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="vertical-align: middle;">${rankDisplay}</td>
      <td>
        <div class="student-meta-name">${st.name}</div>
        <div class="student-meta-id">${st.id}</div>
      </td>
      <td style="text-align:center;">
        <span class="${isSubmitted ? 'tag-submitted' : 'tag-waiting'}">${isSubmitted ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}</span>
      </td>
      <td style="text-align:right;">
        <span class="score-text">${st.rec && st.score > -1 ? st.score + ' แต้ม' : '-'}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const submittedCounter = document.getElementById('submittedCount');
  if (submittedCounter) submittedCounter.innerText = submitted;

  const totalEl = document.getElementById('totalStudentsCount');
  if (totalEl) totalEl.innerText = rosterIds.length;
}

function openCourseSwitchModal() {
  const sel = document.getElementById('switchCourseSelect');
  sel.innerHTML = Object.keys(allCoursesData).map(cid => `
    <option value="${cid}" ${cid === currentCourseId ? 'selected' : ''}>${cid} - ${allCoursesData[cid].courseName}</option>
  `).join('');
  document.getElementById('courseSwitchModal').style.display = 'flex';
}

function closeCourseSwitchModal() {
  document.getElementById('courseSwitchModal').style.display = 'none';
}

function confirmCourseSwitch() {
  currentCourseId = document.getElementById('switchCourseSelect').value;
  localStorage.setItem('lastSelectedCourse', currentCourseId);
  closeCourseSwitchModal();
  loadCoursesAndRoster();
}

function openSlotModal() { document.getElementById('slotModal').style.display = 'flex'; }
function closeSlotModal() { document.getElementById('slotModal').style.display = 'none'; }

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" || e.key === "Esc") {
    closeSlotModal();
    closeCourseSwitchModal();
  }
});

function spinLotto() {
  if (isSpinning) return;

  const validIds = Object.keys(currentRoster).filter(id => id !== "0000");
  if (validIds.length === 0) return alert("ไม่มีรายชื่อนักศึกษาในวิชานี้");

  isSpinning = true;
  const r1 = document.getElementById('reel1');
  const r2 = document.getElementById('reel2');
  const r3 = document.getElementById('reel3');
  const nameBox = document.getElementById('winnerName');
  const idBox = document.getElementById('winnerId');
  const btn = document.getElementById('btnSpin');

  btn.disabled = true;
  nameBox.innerText = "กำลังหมุนวงล้อ...";
  idBox.innerText = "รหัสนักศึกษา: ???";

  let counter = 0;
  const spinInt = setInterval(() => {
    r1.innerText = Math.floor(Math.random() * 10);
    r2.innerText = Math.floor(Math.random() * 10);
    r3.innerText = Math.floor(Math.random() * 10);
    counter++;

    if (counter > 25) {
      clearInterval(spinInt);
      
      const winnerId = validIds[Math.floor(Math.random() * validIds.length)];
      const last3 = winnerId.slice(-3);

      r1.innerText = last3[0] || '0';
      r2.innerText = last3[1] || '0';
      r3.innerText = last3[2] || '0';

      nameBox.innerText = `🎉 ${currentRoster[winnerId]}`;
      idBox.innerText = `รหัสนักศึกษา: ${winnerId}`;
      isSpinning = false;
      btn.disabled = false;
    }
  }, 70);
}

document.addEventListener("DOMContentLoaded", init);

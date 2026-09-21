// js/teacher.js - ตรรกะหน้าจอสดห้องเรียน (อาจารย์)

let secondsLeft = CONFIG.PIN_LIFETIME;
let timerInterval = null;
let currentSession = CONFIG.SESSIONS[0];
let realtimeData = {};

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

function checkAndAutoSetSession() {
  fetch(`${CONFIG.FIREBASE_DB_URL}current_session.json`)
    .then(r => r.json())
    .then(serverSession => {
      const today = new Date();
      
      // หา Week ล่าสุดตามวันจันทร์ที่ผ่านมาถึง
      let autoIndex = 0;
      for (let i = 0; i < SESSION_DATES.length; i++) {
        if (today >= SESSION_DATES[i]) {
          autoIndex = i;
        }
      }
      const calculatedSession = CONFIG.SESSIONS[autoIndex];

      if (!serverSession) {
        currentSession = calculatedSession;
        document.getElementById('leftSessionSelect').value = currentSession;
        changeSession();
      } else {
        currentSession = serverSession;
        document.getElementById('leftSessionSelect').value = currentSession;
        if (document.getElementById('sideSessionSelect')) {
          document.getElementById('sideSessionSelect').value = currentSession;
        }
        document.getElementById('sessionTitle').innerText = `${currentSession} (ห้อง 6310)`;
      }
      renderLeaderboard();
    })
    .catch(() => {
      renderLeaderboard();
    });
}

function init() {
  const leftSel = document.getElementById('leftSessionSelect');
  const sideSel = document.getElementById('sideSessionSelect');
  
  const optionsHtml = CONFIG.SESSIONS.map(s => `<option value="${s}">📅 ${s}</option>`).join('');
  if (leftSel) leftSel.innerHTML = optionsHtml;
  if (sideSel) sideSel.innerHTML = optionsHtml;

  // ตรวจสอบและตั้งสัปดาห์แบบ Hybrid (รีเซ็ตตามวันพุธอัตโนมัติ + รองรับอาจารย์ปรับเอง)
  checkAndAutoSetSession();

  generatePIN();
  startTimer();
  fetchData();
  setInterval(fetchData, 3000);
}

// 1. ตรวจสอบสัปดาห์อัตโนมัติตามวันพุธ และซิงก์กับ Firebase
function checkAndAutoSetSession() {
  fetch(`${CONFIG.FIREBASE_DB_URL}current_session.json`)
    .then(r => r.json())
    .then(serverSession => {
      const today = new Date();
      
      // หา Week ล่าสุดตามวันที่จริง
      let autoIndex = 0;
      for (let i = 0; i < SESSION_DATES.length; i++) {
        if (today >= SESSION_DATES[i]) {
          autoIndex = i;
        }
      }
      const calculatedSession = CONFIG.SESSIONS[autoIndex];

      // ถ้าเซิร์ฟเวอร์ยังไม่มีค่า หรือสัปดาห์ในปฏิทินขยับขึ้นสัปดาห์ใหม่
      if (!serverSession) {
        currentSession = calculatedSession;
        document.getElementById('leftSessionSelect').value = currentSession;
        changeSession();
      } else {
        currentSession = serverSession;
        document.getElementById('leftSessionSelect').value = currentSession;
        if (document.getElementById('sideSessionSelect')) {
          document.getElementById('sideSessionSelect').value = currentSession;
        }
        document.getElementById('sessionTitle').innerText = `${currentSession} (ห้อง 6310)`;
      }
      renderLeaderboard();
    })
    .catch(() => {
      renderLeaderboard();
    });
}

// 2. สุ่ม PIN 4 หลัก และอัปเดตลง Firebase
function generatePIN() {
  const pin = Math.floor(1000 + Math.random() * 9000).toString();
  document.getElementById('pinBase').innerText = pin;
  document.getElementById('pinFill').innerText = pin;
  secondsLeft = CONFIG.PIN_LIFETIME;
  updateTimerUI();

  fetch(`${CONFIG.FIREBASE_DB_URL}current_pin.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pin)
  });
}

function forceResetPIN() { 
  generatePIN(); 
}

// 3. ตัวนับเวลาถอยหลัง 2 นาที (120 วินาที)
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    secondsLeft--;
    updateTimerUI();
    if (secondsLeft <= 0) generatePIN();
  }, 1000);
}

function updateTimerUI() {
  const pct = Math.max(0, (secondsLeft / CONFIG.PIN_LIFETIME) * 100);
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  const str = `${m}:${s < 10 ? '0' : ''}${s}`;

  document.getElementById('badgeBase').innerText = str;
  document.getElementById('badgeFill').innerText = str;
  document.getElementById('pinFillLayer').style.width = `${pct}%`;
}

// 4. สลับสัปดาห์เมื่ออาจารย์เลือกเปลี่ยนเอง (Manual Override)
function syncFromSideDropdown() {
  const val = document.getElementById('sideSessionSelect').value;
  document.getElementById('leftSessionSelect').value = val;
  changeSession();
}

function changeSession() {
  currentSession = document.getElementById('leftSessionSelect').value;
  if (document.getElementById('sideSessionSelect')) {
    document.getElementById('sideSessionSelect').value = currentSession;
  }
  document.getElementById('sessionTitle').innerText = `${currentSession} (ห้อง 6310)`;
  
  // บันทึกทับลง Firebase เมื่ออาจารย์เลือกเปลี่ยนสัปดาห์
  fetch(`${CONFIG.FIREBASE_DB_URL}current_session.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(currentSession)
  });

  renderLeaderboard();
}

// 5. ดึงข้อมูลบันทึกคะแนนและการเข้าเรียนแบบ Real-time
function fetchData() {
  fetch(`${CONFIG.FIREBASE_DB_URL}attendance.json`)
    .then(r => r.json())
    .then(d => {
      realtimeData = d || {};
      renderLeaderboard();
    });
}

// 6. แสดงผลตารางอันดับสด (Leaderboard) ทางขวามือ
function renderLeaderboard() {
  const safe = sanitizeKey(currentSession);
  const records = realtimeData[safe] || {};
  const tbody = document.getElementById('sideTableBody');
  if (!tbody) return;

  let list = Object.keys(STUDENT_ROSTER).map(id => ({
    id,
    name: STUDENT_ROSTER[id],
    rec: records[id],
    score: records[id] && records[id].status !== 'LEAVE' ? (records[id].score || 0) : -1
  })).sort((a, b) => b.score - a.score);

  let submitted = 0;
  tbody.innerHTML = '';

  list.forEach((st, i) => {
    let rankBadge = `<span class="rank-badge">#${i + 1}</span>`;
    if (st.rec) {
      submitted++;
      if (i === 0) rankBadge = '🥇';
      if (i === 1) rankBadge = '🥈';
      if (i === 2) rankBadge = '🥉';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${rankBadge}</td>
      <td>
        <div class="student-meta-name">${st.name}</div>
        <div class="student-meta-id">${st.id}</div>
      </td>
      <td style="text-align:center;">
        <span class="${st.rec ? 'tag-submitted' : 'tag-waiting'}">${st.rec ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}</span>
      </td>
      <td style="text-align:right;">
        <span class="score-text">${st.rec ? (st.score > -1 ? st.score + ' แต้ม' : '-') : '-'}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const submittedCounter = document.getElementById('submittedCount');
  if (submittedCounter) {
    submittedCounter.innerText = submitted;
  }
}

// เริ่มต้นการทำงาน
init();
const TARGET_LAT = 7.8938;
const TARGET_LNG = 98.3529;
const MAX_ALLOWABLE_DISTANCE_METERS = 250;

let currentDistance = 9999;
let activeSessionKey = CONFIG.SESSIONS[0];
let currentPinOnServer = "";
let studentIp = "Unknown";
let quizTimeLeft = 15;
let quizTimer = null;

function initStudent() {
  getDeviceIP();
  requestGPS();
  syncCurrentSession();
}

function getDeviceIP() {
  fetch('https://api.ipify.org?format=json')
    .then(r => r.json())
    .then(d => { studentIp = d.ip; })
    .catch(() => { studentIp = "Local/Cellular"; });
}

function getDeviceFingerprint() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');
  let renderer = 'no-gl';
  if (gl) {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'gl-unknown';
  }
  const rawString = [
    navigator.userAgent,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    renderer
  ].join('###');

  let hash = 0;
  for (let i = 0; i < rawString.length; i++) {
    hash = ((hash << 5) - hash) + rawString.charCodeAt(i);
    hash |= 0;
  }
  return 'DEV-' + Math.abs(hash).toString(16).toUpperCase();
}

function requestGPS() {
  const badge = document.getElementById('gpsStatusBadge');
  if (!navigator.geolocation) {
    badge.innerText = "⚠️ อุปกรณ์ไม่รองรับ GPS";
    badge.className = "tag tag-absent";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      currentDistance = Math.round(calculateDistance(lat, lng, TARGET_LAT, TARGET_LNG));
      
      if (currentDistance <= MAX_ALLOWABLE_DISTANCE_METERS) {
        badge.innerText = `📍 อยู่ในห้อง (${currentDistance} ม.)`;
        badge.className = "tag tag-present";
      } else {
        badge.innerText = `⚠️ อยู่นอกห้อง (${currentDistance} ม.)`;
        badge.className = "tag tag-late";
      }
    },
    (err) => {
      badge.innerText = "❌ กรุณาเปิด GPS";
      badge.className = "tag tag-absent";
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function syncCurrentSession() {
  fetch(`${CONFIG.FIREBASE_DB_URL}current_session.json`)
    .then(r => r.json())
    .then(s => {
      if (s) {
        activeSessionKey = s;
        document.getElementById('sessionBadge').innerText = s;
      }
    });

  fetch(`${CONFIG.FIREBASE_DB_URL}current_pin.json`)
    .then(r => r.json())
    .then(pin => { currentPinOnServer = pin ? pin.toString().trim() : ""; });
}

function previewStudentName() {
  const id = document.getElementById('studentIdInput').value.trim();
  document.getElementById('studentNameInput').value = STUDENT_ROSTER[id] || "";
}

function verifyAndCheckIn() {
  const id = document.getElementById('studentIdInput').value.trim();
  const name = STUDENT_ROSTER[id];
  const pinEntered = document.getElementById('pinInput').value.trim();

  if (!name) return alert("กรุณากรอกรหัสนักศึกษาให้ถูกต้อง");
  if (currentDistance > MAX_ALLOWABLE_DISTANCE_METERS) {
    return alert(`คุณอยู่นอกพื้นที่ห้องเรียน (ห่าง ${currentDistance} เมตร) ไม่สามารถเช็คชื่อได้`);
  }

  fetch(`${CONFIG.FIREBASE_DB_URL}current_pin.json`)
    .then(r => r.json())
    .then(latestPin => {
      currentPinOnServer = latestPin ? latestPin.toString().trim() : "";
      
      if (pinEntered !== currentPinOnServer) {
        return alert("รหัส PIN ไม่ถูกต้องหรือรหัสหมดอายุแล้ว โปรดดูรหัสใหม่บนจอหน้าห้อง");
      }

      document.getElementById('checkinSection').style.display = 'none';
      document.getElementById('quizSection').style.display = 'block';
      startQuizTimer();
    });
}

function startQuizTimer() {
  quizTimeLeft = 15;
  const badge = document.getElementById('quizTimerBadge');
  quizTimer = setInterval(() => {
    quizTimeLeft--;
    badge.innerText = `⏳ ${quizTimeLeft} วิ`;
    if (quizTimeLeft <= 0) {
      clearInterval(quizTimer);
      submitAnswer('TIMEOUT');
    }
  }, 1000);
}

function submitAnswer(choice) {
  if (quizTimer) clearInterval(quizTimer);

  const id = document.getElementById('studentIdInput').value.trim();
  const name = STUDENT_ROSTER[id];
  const safeSession = sanitizeKey(activeSessionKey);

  let score = choice !== 'TIMEOUT' ? 100 + (quizTimeLeft * 6) : 50;

  const payload = {
    id: id,
    name: name,
    timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
    score: score,
    choice: choice,
    distance: currentDistance,
    ip: studentIp,
    deviceId: getDeviceFingerprint(),
    submittedAt: new Date().toLocaleTimeString('th-TH')
  };

  fetch(`${CONFIG.FIREBASE_DB_URL}attendance/${safeSession}/${id}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(() => {
    document.getElementById('quizSection').style.display = 'none';
    const resBox = document.getElementById('resultBox');
    const resDetails = document.getElementById('resultDetails');
    resDetails.innerText = `คุณ${name} บันทึกสำเร็จ ได้รับ ${score} คะแนน`;
    resBox.style.display = 'block';
  }).catch(err => {
    alert("เกิดข้อผิดพลาดในการบันทึก: " + err);
  });
}

// ข้อ 4: ทางลัดส่งการบ้านโดยแนบรหัสผ่าน URL
function goToSubmitPage() {
  const id = document.getElementById('studentIdInput').value.trim();
  window.location.href = `submit.html?id=${id}`;
}

initStudent();
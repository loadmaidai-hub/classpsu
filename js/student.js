// js/student.js - ระบบฝั่งนักศึกษา ดึงข้อมูลวิชา พิกัด และ Roster จาก Firebase ตาม QR Code

let currentCourseId = "969-042G4"; // ค่าเริ่มต้น
let currentSession = "Week 1";
let courseRosterData = {};
let courseLocationLock = { isEnabled: false, latitude: 0, longitude: 0, radius: 50 };
let studentCurrentCoords = null;
let currentServerPin = "1234";

// ตัวแปรเก็บชุดคำถามควิซของสัปดาห์นั้นๆ
let activeQuizConfig = {
  isActive: false,
  timeLimit: 60,
  totalPoints: 100,
  questions: []
};
let currentStudentAnswers = {};

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const paramCourseId = urlParams.get('courseId') || urlParams.get('course');
  if (paramCourseId) {
    currentCourseId = paramCourseId;
  }

  const sessionBadge = document.getElementById('sessionBadge');
  if (sessionBadge) sessionBadge.innerText = currentCourseId;

  loadCourseDataFromFirebase();
  initStudentGpsCheck();
});

function loadCourseDataFromFirebase() {
  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  // 1. ดึง Current Session ปัจจุบัน
  fetch(`${baseUrl}current_session.json`)
    .then(r => r.json())
    .then(sess => {
      if (sess) currentSession = sess;
    })
    .catch(() => {});

  // 2. ดึง PIN ปัจจุบันจากหน้าจออาจารย์
  fetch(`${baseUrl}current_pin.json`)
    .then(r => r.json())
    .then(pin => {
      if (pin) currentServerPin = String(pin);
    })
    .catch(() => {});

  // 3. ดึงรายชื่อนักศึกษา (Roster)
  fetch(`${baseUrl}courses/${currentCourseId}/roster.json`)
    .then(r => r.json())
    .then(roster => {
      if (roster) courseRosterData = roster;
    })
    .catch(err => console.warn("Load roster error:", err));

  // 4. ดึงข้อมูลพิกัด GPS Lock
  fetch(`${baseUrl}course_settings/${currentCourseId}/locationLock.json`)
    .then(r => r.json())
    .then(locData => {
      if (locData) courseLocationLock = locData;
    })
    .catch(err => console.warn("Load location lock error:", err));
}

// ตรวจจับพิกัด GPS ของนักศึกษา
function initStudentGpsCheck() {
  const gpsBadge = document.getElementById('gpsStatusBadge');
  if (!navigator.geolocation) {
    if (gpsBadge) {
      gpsBadge.className = "tag tag-absent";
      gpsBadge.innerText = "❌ เบราว์เซอร์ไม่รองรับ GPS";
    }
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      studentCurrentCoords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };

      if (gpsBadge) {
        gpsBadge.className = "tag tag-present";
        gpsBadge.innerText = "📡 พิกัด GPS พร้อมใช้งาน";
      }
    },
    (error) => {
      if (gpsBadge) {
        gpsBadge.className = "tag tag-absent";
        gpsBadge.innerText = "⚠️ ไม่สามารถเข้าถึงตำแหน่ง GPS ได้";
      }
      console.warn("GPS Error:", error);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function previewStudentName() {
  const idInput = document.getElementById('studentIdInput');
  const nameInput = document.getElementById('studentNameInput');
  if (!idInput || !nameInput) return;

  const stId = idInput.value.trim();

  if (stId.length >= 8) {
    if (courseRosterData[stId]) {
      nameInput.value = courseRosterData[stId];
      nameInput.style.color = "#059669";
    } else {
      nameInput.value = "ไม่พบรหัสนักศึกษาในรายวิชานี้";
      nameInput.style.color = "#DC2626";
    }
  } else {
    nameInput.value = "";
    nameInput.style.color = "#0F172A";
  }
}

// ตรวจสอบและยืนยันการเข้าเรียน พร้อมเด้งไปหน้าควิซ
function verifyAndCheckIn() {
  const stId = document.getElementById('studentIdInput').value.trim();
  const stName = document.getElementById('studentNameInput').value.trim();
  const pin = document.getElementById('pinInput').value.trim();

  if (!stId || stId.length < 8) {
    return alert("กรุณากรอกรหัสนักศึกษาให้ถูกต้อง");
  }
  if (!stName || stName.includes("ไม่พบ")) {
    return alert("ไม่พบชื่อนักศึกษาในระบบ กรุณาตรวจสอบรหัสอีกครั้ง");
  }
  if (!pin || pin.length < 4) {
    return alert("กรุณากรอกรหัส PIN 4 หลักจากจอหน้าห้อง");
  }

  // ตรวจสอบ PIN (เทียบกับรหัสปัจจุบันจากเซิร์ฟเวอร์)
  if (currentServerPin && pin !== currentServerPin) {
    return alert("❌ รหัส PIN ไม่ถูกต้อง หรือหมดอายุแล้ว กรุณาดูรหัสใหม่จากจอหน้าห้อง");
  }

  // ตรวจสอบ GPS Lock
  if (courseLocationLock.isEnabled) {
    if (!studentCurrentCoords) {
      return alert("❌ ระบบกำลังรอพิกัด GPS ของคุณ กรุณาเปิดใช้งาน Location บนมือถือแล้วลองใหม่อีกครั้ง");
    }

    const distance = calculateDistance(
      studentCurrentCoords.latitude,
      studentCurrentCoords.longitude,
      courseLocationLock.latitude,
      courseLocationLock.longitude
    );

    if (distance > courseLocationLock.radius) {
      return alert(`❌ คุณอยู่นอกเขตห้องเรียน!\n(ระยะห่างประมาณ ${Math.round(distance)} เมตร จากจุดเช็คชื่อ กำหนดรัศมีไม่เกิน ${courseLocationLock.radius} เมตร)`);
    }
  }

  // บันทึกการเช็คชื่อลง Firebase ทันที
  saveAttendanceToFirebase(stId, stName);

  //ซ่อนฟอร์มกรอก และแสดงผลสำเร็จ พร้อมเปิดหน้าควิซ
  document.getElementById('checkinSection').style.display = 'none';
  document.getElementById('resultBox').style.display = 'block';
  document.getElementById('resultDetails').innerText = `ยินดีต้อนรับคุณ ${stName} (${stId}) บันทึกการเข้าเรียนเรียบร้อยแล้ว`;

  // โหลดข้อมูลควิซและแสดงส่วนทำควิซต่อทันที
  loadQuizForStudent();
}

function saveAttendanceToFirebase(stId, stName) {
  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';
  
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const payload = {
    status: 'PRESENT',
    studentName: stName,
    attendanceScore: 100,
    checkInTime: timeStr,
    timestamp: timeStr,
    ip: '127.0.0.1'
  };

  fetch(`${baseUrl}attendance/${currentCourseId}/${safeSession}/${stId}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).catch(err => console.error("Save attendance error:", err));
}

// โหลดชุดคำถามควิซของสัปดาห์นี้
function loadQuizForStudent() {
  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}quiz_settings/${currentCourseId}/${safeSession}.json`)
    .then(r => r.json())
    .then(quizData => {
      if (quizData && quizData.questions && quizData.questions.length > 0) {
        activeQuizConfig = quizData;
        
        // แสดงส่วนควิซ
        const quizSec = document.getElementById('quizSection');
        if (quizSec) {
          quizSec.style.display = 'block';
          renderStudentQuizQuestion(0);
        }
      } else {
        // กรณีไม่มีควิซในสัปดาห์นี้
        const quizSec = document.getElementById('quizSection');
        if (quizSec) {
          quizSec.style.display = 'block';
          quizSec.innerHTML = `<div style="text-align:center; padding:1rem; color:#059669; font-weight:700;">✅ เช็คชื่อสำเร็จเรียบร้อย (สัปดาห์นี้ยังไม่มีควิซสด)</div>`;
        }
      }
    })
    .catch(() => {});
}

let currentQuizIndex = 0;
function renderStudentQuizQuestion(qIdx) {
  currentQuizIndex = qIdx;
  const questions = activeQuizConfig.questions || [];
  const q = questions[qIdx];
  
  const quizSec = document.getElementById('quizSection');
  if (!quizSec || !q) return;

  const choiceLabels = ['A', 'B', 'C', 'D'];
  let choicesHtml = '';
  
  if (q.choices) {
    q.choices.forEach((cText, cIdx) => {
      choicesHtml += `<button class="btn-opt" onclick="submitAnswer(${qIdx}, ${cIdx})">${choiceLabels[cIdx]}: ${cText}</button>`;
    });
  }

  quizSec.innerHTML = `
    <div class="quiz-head-row">
      <span class="quiz-title-txt">คำถามข้อที่ ${qIdx + 1} จาก ${questions.length}</span>
      <span id="quizTimerBadge" class="quiz-timer-txt">⏱️ ${activeQuizConfig.timeLimit || 60}s</span>
    </div>
    <p style="font-size:1rem; font-weight:700; color:#1E1B4B; margin: 0.6rem 0;">${q.prompt || ''}</p>
    <div class="quiz-options-grid">
      ${choicesHtml}
    </div>
  `;
}

function submitAnswer(qIdx, choiceIdx) {
  const stId = document.getElementById('studentIdInput').value.trim();
  currentStudentAnswers[qIdx] = choiceIdx;

  const questions = activeQuizConfig.questions || [];
  if (qIdx < questions.length - 1) {
    // ไปข้อถัดไป
    renderStudentQuizQuestion(qIdx + 1);
  } else {
    // ทำครบทุกข้อแล้ว คำนวณคะแนนและส่งบันทึก
    let correctCount = 0;
    questions.forEach((q, idx) => {
      if (currentStudentAnswers[idx] === q.correctIndex) {
        correctCount++;
      }
    });

    const totalQ = questions.length;
    const finalQuizScore = totalQ > 0 ? Math.round((correctCount / totalQ) * (activeQuizConfig.totalPoints || 100)) : 0;

    // ส่งคะแนนควิซขึ้น Firebase
    saveQuizScoreToFirebase(stId, finalQuizScore, currentStudentAnswers);

    const quizSec = document.getElementById('quizSection');
    if (quizSec) {
      quizSec.innerHTML = `
        <div style="text-align:center; padding:1.5rem; background:#ECFDF5; border-radius:14px; border:1px solid #A7F3D0;">
          <h3 style="color:#065F46; font-size:1.15rem; font-weight:800;">🎉 ส่งคำตอบครบทุกข้อแล้ว!</h3>
          <p style="color:#047857; margin-top:0.4rem; font-size:0.95rem;">คุณตอบถูก ${correctCount}/${totalQ} ข้อ (ได้คะแนนควิซ ${finalQuizScore} แต้ม)</p>
        </div>
      `;
    }
  }
}

function saveQuizScoreToFirebase(stId, score, answers) {
  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  const submissionPayload = {
    score: score,
    answers: answers,
    submittedAt: new Date().toISOString(),
    ip: '127.0.0.1'
  };

  // 1. บันทึกลงตารางผลควิซรายบุคคล
  fetch(`${baseUrl}quiz_submissions/${currentCourseId}/${safeSession}/${stId}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(submissionPayload)
  }).catch(err => console.error("Save quiz submission error:", err));

  // 2. อัปเดตคะแนนควิซลงในตาราง attendance เพื่อให้หน้าจออาจารย์รวมคะแนนแบบเรียลไทม์
  fetch(`${baseUrl}attendance/${currentCourseId}/${safeSession}/${stId}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quizScore: score, score: score })
  }).catch(err => console.error("Update attendance quiz score error:", err));
}
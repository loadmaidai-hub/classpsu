// js/student.js - ระบบฝั่งนักศึกษา ดึงข้อมูลวิชา พิกัด และ Roster จาก Firebase ตาม QR Code

let currentCourseId = "969-042G4"; // ค่าเริ่มต้น
let courseRosterData = {};
let courseLocationLock = { isEnabled: false, latitude: 0, longitude: 0, radius: 50 };
let studentCurrentCoords = null;

document.addEventListener("DOMContentLoaded", () => {
  // อ่านรหัสวิชาจาก URL พารามิเตอร์ (เช่น index.html?courseId=969-042G4)
  const urlParams = new URLSearchParams(window.location.search);
  const paramCourseId = urlParams.get('courseId');
  if (paramCourseId) {
    currentCourseId = paramCourseId;
  }

  // แสดงรหัสวิชาที่แบดจ์ด้านบน
  const sessionBadge = document.getElementById('sessionBadge');
  if (sessionBadge) sessionBadge.innerText = currentCourseId;

  // โหลดข้อมูลวิชา พิกัด และรายชื่อจาก Firebase
  loadCourseDataFromFirebase();
  
  // ตรวจสอบพิกัด GPS ของนักศึกษาทันที
  initStudentGpsCheck();
});

function loadCourseDataFromFirebase() {
  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  // 1. ดึงรายชื่อนักศึกษา (Roster)
  fetch(`${baseUrl}courses/${currentCourseId}/roster.json`)
    .then(r => r.json())
    .then(roster => {
      if (roster) courseRosterData = roster;
    })
    .catch(err => console.warn("Load roster error:", err));

  // 2. ดึงข้อมูลพิกัด GPS Lock ที่แอดมินตั้งค่าไว้
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

// คำนวณระยะห่างระหว่างพิกัด 2 จุด (Haversine Formula) เป็นเมตร
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // รัศมีโลกเป็นเมตร
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// แสดงชื่ออัตโนมัติเมื่อกรอกรหัส
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

// ตรวจสอบและยืนยันการเข้าเรียน
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

  // หากเปิดใช้งาน GPS Lock ให้ตรวจสอบระยะห่าง
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

  // จำลองเช็คชื่อสำเร็จ
  document.getElementById('checkinSection').style.display = 'none';
  document.getElementById('resultBox').style.display = 'block';
  document.getElementById('resultDetails').innerText = `ยินดีต้อนรับคุณ ${stName} (${stId}) บันทึกการเข้าเรียนและพิกัดเรียบร้อยแล้ว`;
}

function submitAnswer(choice) {
  alert(`ส่งคำตอบตัวเลือก ${choice} เรียบร้อยแล้ว!`);
}
// js/admin.js - ระบบบริหารจัดการหลังบ้านอาจารย์ (Admin Control Center)

let coursesData = {
  "969-042G4": {
    "courseId": "969-042G4",
    "courseName": "USES OF ARTIFICIAL INTELLIGENCE IN DAILY LIFE",
    "section": "Sec 01",
    "room": "5304",
    "day": "วันอังคาร",
    "time": "13:30 - 16:30",
    "dayTime": "วันอังคาร 13:30 - 16:30",
    "roster": {}
  }
};

let activeCourseId = "969-042G4";
let currentSession = localStorage.getItem('adminSelectedSession') || (typeof CONFIG !== 'undefined' && CONFIG.SESSIONS ? CONFIG.SESSIONS[0] : "Week 1");
let activeRoster = {};
let sessionAttendance = {};
let allAttendance = {};
let currentAssignmentConfig = null;
let tableFilter = 'ALL';
let currentEditingStudentId = null;

let currentQuizConfig = {
  isActive: false,
  timeLimit: 60,
  totalPoints: 100,
  questions: []
};
let currentQuizSubmissions = {};

// ข้อมูลตำแหน่ง GPS Lock
let currentLocationLockConfig = {
  isEnabled: false,
  latitude: 0,
  longitude: 0,
  radius: 50
};

// ข้อมูลแคชของโปรเจกต์กลุ่ม
let currentProjectsData = {};

document.addEventListener("DOMContentLoaded", () => {
  if (!sessionStorage.getItem("adminAuthenticated")) {
    sessionStorage.setItem("adminAuthenticated", "true");
  }

  initAdminDashboard();
  setupKeyboardShortcuts();
  setupExcelDragDrop();
  setupNetworkWatcher();
  initProjectMembersForm(); // เริ่มต้นฟอร์มสมาชิก 2 ช่อง
});

// ฟังก์ชันสลับแท็บหลัก
function switchMainTab(tabId, navBtn) {
  document.querySelectorAll('.main-tab-content').forEach(el => el.classList.remove('active-tab'));
  document.querySelectorAll('.sidebar-scroll .nav-link').forEach(el => el.classList.remove('active'));

  if (navBtn) navBtn.classList.add('active');

  const titleEl = document.getElementById('topPageTitle');

  if (tabId === 'quizManager') {
    const qTab = document.getElementById('tabQuizView');
    if (qTab) qTab.classList.add('active-tab');
    if (titleEl) titleEl.innerText = 'จัดการควิซ & คลังหลักฐาน';
    loadQuizSettings();
    loadQuizSubmissions();
  } else if (tabId === 'locationManager') {
    const lTab = document.getElementById('tabLocationView');
    if (lTab) lTab.classList.add('active-tab');
    if (titleEl) titleEl.innerText = 'จัดการตำแหน่ง (GPS Lock)';
    loadLocationLockSettings();
  } else if (tabId === 'pairProjectManager') {
    const pTab = document.getElementById('tabPairProjectView');
    if (pTab) pTab.classList.add('active-tab');
    if (titleEl) titleEl.innerText = 'จัดการโครงงานกลุ่ม (Project Management)';
    loadPairProjectsData();
  } else if (tabId === 'classManager') {
    const cTab = document.getElementById('tabClassManagerView');
    if (cTab) cTab.classList.add('active-tab');
    if (titleEl) titleEl.innerText = 'ชั้นเรียน & บันทึกคะแนน';
  } else {
    const dTab = document.getElementById('tabDashboardView');
    if (dTab) dTab.classList.add('active-tab');
    if (titleEl) titleEl.innerText = 'หน้าหลัก';
  }

  if (window.innerWidth <= 992) {
    toggleSidebar(false);
  }
}

function setSystemStatus(isOnline) {
  const pill = document.getElementById('systemStatusPill');
  const text = document.getElementById('systemStatusText');
  if (!pill || !text) return;

  if (isOnline) {
    pill.className = 'status-indicator-pill pill-online';
    text.innerText = 'Online';
  } else {
    pill.className = 'status-indicator-pill pill-offline';
    text.innerText = 'Offline';
  }
}

function setupNetworkWatcher() {
  window.addEventListener('online', () => setSystemStatus(true));
  window.addEventListener('offline', () => setSystemStatus(false));
  setSystemStatus(navigator.onLine);
}

function toggleSidebar(forceState) {
  const sidebar = document.getElementById('sidebarMenu');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar || !backdrop) return;

  if (typeof forceState === 'boolean') {
    if (forceState) {
      sidebar.classList.add('show-sidebar');
      backdrop.classList.add('show-backdrop');
    } else {
      sidebar.classList.remove('show-sidebar');
      backdrop.classList.remove('show-backdrop');
    }
  } else {
    sidebar.classList.toggle('show-sidebar');
    backdrop.classList.toggle('show-backdrop');
  }
}

function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Esc") {
      closeStatusModal();
      closeSettingsModal();
      closeOverviewModal();
      closeQuizEvidenceModal();
      toggleSidebar(false);
      return;
    }

    if (e.key === "Enter") {
      const statusModal = document.getElementById('attendanceStatusModal');
      const settingsModal = document.getElementById('settingsModal');

      if (statusModal && statusModal.style.display === 'flex') {
        e.preventDefault();
        confirmSaveStatus();
        return;
      }

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
  initSessionDropdown();
  populateCourseDropdowns();
  onAdminCourseChange();

  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) {
    setSystemStatus(false);
    return;
  }

  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}current_session.json`)
    .then(r => {
      if (!r.ok) throw new Error("Firebase HTTP Error");
      return r.json();
    })
    .then(serverSession => {
      setSystemStatus(true);
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
      setSystemStatus(true);
      if (courses && Object.keys(courses).length > 0) {
        coursesData = courses;
      }
      populateCourseDropdowns();

      const savedCourse = localStorage.getItem('lastSelectedCourse');
      if (savedCourse && coursesData[savedCourse]) {
        activeCourseId = savedCourse;
      } else if (coursesData["969-042G4"]) {
        activeCourseId = "969-042G4";
      } else {
        activeCourseId = Object.keys(coursesData)[0];
      }
      
      syncCourseSelection(activeCourseId);
    })
    .catch(err => {
      console.warn("Firebase Course Load Note (using default roster/course):", err);
      setSystemStatus(false);
      populateCourseDropdowns();
      syncCourseSelection(activeCourseId);
    });
}

function initSessionDropdown() {
  const sel = document.getElementById('sessionSelect');
  if (sel && typeof CONFIG !== 'undefined' && CONFIG.SESSIONS) {
    sel.innerHTML = CONFIG.SESSIONS.map(s => `<option value="${s}">📅 ${s}</option>`).join('');
    sel.value = currentSession;
  }
  updateQuizActiveWeekLabel();
}

function updateQuizActiveWeekLabel() {
  const lbl = document.getElementById('quizActiveWeekLabel');
  if (lbl) lbl.innerText = currentSession;
}

function populateCourseDropdowns() {
  const courseIds = Object.keys(coursesData);
  const selMain = document.getElementById('adminCourseSelect');

  if (courseIds.length === 0 || !selMain) return;

  selMain.innerHTML = courseIds.map(cid => `
    <option value="${cid}">${cid} - ${coursesData[cid].courseName || ''}</option>
  `).join('');
}

function syncCourseSelection(courseId) {
  activeCourseId = courseId;
  localStorage.setItem('lastSelectedCourse', activeCourseId);

  const selMain = document.getElementById('adminCourseSelect');
  if (selMain && selMain.value !== courseId) {
    selMain.value = courseId;
  }

  onAdminCourseChange();
}

function onAdminCourseChange() {
  const course = coursesData[activeCourseId] || {
    courseId: activeCourseId,
    courseName: "USES OF ARTIFICIAL INTELLIGENCE IN DAILY LIFE",
    section: "Sec 01",
    room: "5304",
    dayTime: "วันอังคาร 13:30 - 16:30"
  };

  activeRoster = course.roster || {};

  const subEl = document.getElementById('adminCourseSubtitle');
  if (subEl) {
    subEl.innerText = `${course.courseId || activeCourseId} | ${course.section || 'Sec 01'} (ห้อง ${course.room || '-'})`;
  }

  const courseSubCardName = document.getElementById('cardSubCourseName');
  if (courseSubCardName) {
    courseSubCardName.innerText = `${course.courseId || activeCourseId} (${course.section || 'Sec 01'})`;
  }

  const secInput = document.getElementById('courseSectionInput');
  const roomInput = document.getElementById('courseRoomInput');
  const daySelect = document.getElementById('courseDaySelect');
  const timeInput = document.getElementById('courseTimeInput');

  if (secInput) secInput.value = (course.section || '').replace(/Sec\s*/i, '');
  if (roomInput) roomInput.value = (course.room || '').replace(/ห้อง\s*/i, '');

  if (course.dayTime) {
    const parts = course.dayTime.trim().split(/\s+(.+)/);
    if (daySelect && parts[0]) daySelect.value = parts[0];
    if (timeInput) timeInput.value = parts[1] || '';
  } else {
    if (daySelect && course.day) daySelect.value = course.day;
    if (timeInput) timeInput.value = course.time || '';
  }

  loadSessionData();
  loadAssignmentSettings();
  loadLateThresholdTime();
  loadQuizSettings();
  loadQuizSubmissions();
  loadLocationLockSettings();
  loadPairProjectsData();
  renderStudentRosterManager();
  loadAllAttendanceForOverview();
}

function onAdminSessionChange() {
  const sel = document.getElementById('sessionSelect');
  if (!sel) return;

  currentSession = sel.value;
  localStorage.setItem('adminSelectedSession', currentSession);

  updateQuizActiveWeekLabel();
  loadSessionData();
  loadAssignmentSettings();
  loadLateThresholdTime();
  loadQuizSettings();
  loadQuizSubmissions();
}

function loadLateThresholdTime() {
  const input = document.getElementById('lateThresholdInput');
  if (!input) return;

  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}session_settings/${activeCourseId}/${safeSession}/lateThreshold.json`)
    .then(r => r.json())
    .then(timeVal => {
      if (timeVal) {
        input.value = timeVal;
      }
    })
    .catch(() => {});
}

function saveLateThresholdTime(timeVal) {
  if (!timeVal) return;

  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}session_settings/${activeCourseId}/${safeSession}/lateThreshold.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(timeVal)
  }).then(() => {
    setSystemStatus(true);
  }).catch(err => {
    console.error("Save late threshold error:", err);
    setSystemStatus(false);
  });
}

// -------------------------------------------------------------
// --- LOCATION LOCK LOGIC (จัดการตำแหน่ง GPS) ---
// -------------------------------------------------------------

function loadLocationLockSettings() {
  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}course_settings/${activeCourseId}/locationLock.json`)
    .then(r => r.json())
    .then(locData => {
      if (locData) {
        currentLocationLockConfig = locData;
      } else {
        currentLocationLockConfig = {
          isEnabled: false,
          latitude: 0,
          longitude: 0,
          radius: 50
        };
      }
      applyLocationLockConfigToUI();
    })
    .catch(err => {
      console.warn("Could not load location lock config:", err);
      applyLocationLockConfigToUI();
    });
}

function applyLocationLockConfigToUI() {
  const toggle = document.getElementById('locActiveToggle');
  const latInput = document.getElementById('locLatitude');
  const lngInput = document.getElementById('locLongitude');
  const radInput = document.getElementById('locRadius');

  if (toggle) toggle.checked = !!currentLocationLockConfig.isEnabled;
  if (latInput) latInput.value = currentLocationLockConfig.latitude || '';
  if (lngInput) lngInput.value = currentLocationLockConfig.longitude || '';
  if (radInput) radInput.value = currentLocationLockConfig.radius || 50;

  updateLocationToggleLabel(currentLocationLockConfig.isEnabled);
}

function updateLocationToggleLabel(isEnabled) {
  const lbl = document.getElementById('locToggleLabel');
  if (lbl) {
    lbl.innerHTML = isEnabled 
      ? `สถานะ: <strong style="color:#059669;">🟢 เปิดล็อกพิกัดอยู่</strong>`
      : `สถานะ: <strong style="color:#64748B;">⚪ ปิดล็อกพิกัด</strong>`;
  }
}

function toggleLocationLockState(isChecked) {
  currentLocationLockConfig.isEnabled = isChecked;
  updateLocationToggleLabel(isChecked);

  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}course_settings/${activeCourseId}/locationLock/isEnabled.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(isChecked)
  }).then(() => setSystemStatus(true))
    .catch(() => setSystemStatus(false));
}

function getCurrentGpsLocation() {
  if (!navigator.geolocation) {
    return alert("❌ เบราว์เซอร์ของคุณไม่รองรับการระบุตำแหน่ง GPS");
  }

  alert("กำลังดึงตำแหน่ง GPS ของคุณ... กรุณากดยอมรับการอนุญาตเข้าถึงตำแหน่งบนเบราว์เซอร์");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      document.getElementById('locLatitude').value = lat;
      document.getElementById('locLongitude').value = lng;

      alert(`✅ ดึงพิกัดสำเร็จ!\nLatitude: ${lat}\nLongitude: ${lng}`);
    },
    (error) => {
      alert(`❌ ไม่สามารถดึงพิกัดได้: ${error.message}`);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function saveLocationLockSettings() {
  const latInput = document.getElementById('locLatitude').value;
  const lngInput = document.getElementById('locLongitude').value;
  const radInput = document.getElementById('locRadius').value;

  currentLocationLockConfig.latitude = latInput !== '' ? Number(latInput) : 0;
  currentLocationLockConfig.longitude = lngInput !== '' ? Number(lngInput) : 0;
  currentLocationLockConfig.radius = radInput !== '' ? Number(radInput) : 50;
  currentLocationLockConfig.updatedAt = new Date().toISOString();

  alert("✓ บันทึกตั้งค่าพิกัดห้องเรียน (GPS Lock) เรียบร้อยแล้ว");

  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}course_settings/${activeCourseId}/locationLock.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(currentLocationLockConfig)
  }).then(() => setSystemStatus(true))
    .catch(() => setSystemStatus(false));
}

// -------------------------------------------------------------
// --- DYNAMIC PROJECT MEMBERS LOGIC (จัดการโครงงานกลุ่ม) ---
// -------------------------------------------------------------

function initProjectMembersForm() {
  const container = document.getElementById('projectMembersContainer');
  if (!container) return;
  container.innerHTML = '';
  // สร้างสมาชิกเริ่มต้น 2 ช่อง
  addProjectMemberField();
  addProjectMemberField();
}

function addProjectMemberField(stId = '', stName = '') {
  const container = document.getElementById('projectMembersContainer');
  if (!container) return;

  const memberIndex = container.children.length + 1;
  const box = document.createElement('div');
  box.className = 'project-member-field-box';
  box.style.cssText = 'background: white; padding: 1rem; border-radius: 14px; border: 1.5px solid #E2E8F0; position: relative;';

  box.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.4rem;">
      <label class="member-idx-label" style="font-size: 0.82rem; font-weight: 800; color: #4338CA;">สมาชิกคนที่ ${memberIndex}:</label>
      ${memberIndex > 1 ? `<button type="button" onclick="removeProjectMemberField(this)" style="background:none; border:none; color:#DC2626; font-size:0.78rem; font-weight:700; cursor:pointer;">✕ ลบคนนี้</button>` : ''}
    </div>
    <input type="text" class="custom-input pm-id-input" maxlength="10" placeholder="รหัสนักศึกษา" value="${stId}" oninput="fetchStudentNameForMember(this)" style="margin-bottom: 0.5rem;">
    <input type="text" class="custom-input pm-name-input" readonly placeholder="ชื่อ-นามสกุลอัตโนมัติ" value="${stName}" style="background: #F8FAFC;">
  `;
  container.appendChild(box);

  if (stId && !stName) {
    const idInput = box.querySelector('.pm-id-input');
    fetchStudentNameForMember(idInput);
  }
}

function removeProjectMemberField(btn) {
  const box = btn.closest('.project-member-field-box');
  if (!box) return;
  box.remove();
  // อัปเดตตัวเลขลำดับสมาชิกใหม่
  const container = document.getElementById('projectMembersContainer');
  Array.from(container.children).forEach((el, idx) => {
    const lbl = el.querySelector('.member-idx-label');
    if (lbl) lbl.innerText = `สมาชิกคนที่ ${idx + 1}:`;
  });
}

function fetchStudentNameForMember(inputEl) {
  const box = inputEl.closest('.project-member-field-box');
  if (!box) return;
  const nameInput = box.querySelector('.pm-name-input');
  const stId = inputEl.value.trim();

  if (stId.length >= 8) {
    if (activeRoster && activeRoster[stId]) {
      nameInput.value = activeRoster[stId];
      nameInput.style.color = "#059669";
    } else {
      nameInput.value = "ไม่พบรหัสนักศึกษาในรายวิชา";
      nameInput.style.color = "#DC2626";
    }
  } else {
    nameInput.value = "";
    nameInput.style.color = "#0F172A";
  }
}

function saveProjectGroup() {
  const container = document.getElementById('projectMembersContainer');
  const boxes = container ? container.querySelectorAll('.project-member-field-box') : [];
  const title = document.getElementById('projectTitleInput').value.trim();
  const editingKey = document.getElementById('editingProjectKey').value;

  let members = [];
  let hasInvalid = false;

  boxes.forEach((box, idx) => {
    const idVal = box.querySelector('.pm-id-input').value.trim();
    const nameVal = box.querySelector('.pm-name-input').value.trim();

    if (idVal) {
      if (nameVal.includes("ไม่พบ")) {
        hasInvalid = true;
      } else {
        members.push({ id: idVal, name: nameVal || (activeRoster[idVal] || '') });
      }
    }
  });

  if (hasInvalid) {
    return alert("กรุณาตรวจสอบรหัสนักศึกษาให้ถูกต้อง");
  }

  if (members.length === 0) {
    return alert("กรุณาระบุรหัสนักศึกษาอย่างน้อย 1 คน");
  }

  if (!title) {
    return alert("กรุณากรอกหัวข้อโครงงาน");
  }

  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';
  
  // ใช้ key เดิมถ้ากำลังแก้ไข หรือใช้รหัสนักศึกษาคนแรกเป็น key
  const groupKey = editingKey || (members[0].id + '_' + Date.now().toString().slice(-4));
  
  const payload = {
    groupKey: groupKey,
    members: members,
    projectTitle: title,
    updatedAt: new Date().toISOString()
  };

  fetch(`${baseUrl}pair_projects/${activeCourseId}/${groupKey}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(() => {
    alert("✅ บันทึกข้อมูลโครงงานกลุ่มเรียบร้อยแล้ว");
    cancelEditProject();
    loadPairProjectsData();
  })
  .catch(err => {
    alert("❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    console.error(err);
  });
}

function loadPairProjectsData() {
  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}pair_projects/${activeCourseId}.json`)
    .then(r => r.json())
    .then(data => {
      currentProjectsData = data || {};
      renderProjectsTable(currentProjectsData);
    })
    .catch(() => {
      currentProjectsData = {};
      renderProjectsTable({});
    });
}

function renderProjectsTable(projectsObj) {
  const tbody = document.getElementById('pairTableBody');
  if (!tbody) return;

  const keys = Object.keys(projectsObj);
  tbody.innerHTML = '';

  if (keys.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center; padding: 2rem; color: #94A3B8;">
          ยังไม่มีข้อมูลกลุ่มโครงงานในรายวิชานี้ กรอกฟอร์มด้านบนเพื่อลงทะเบียนกลุ่ม
        </td>
      </tr>
    `;
    const countEl = document.getElementById('totalPairCount');
    if (countEl) countEl.innerText = '0';
    return;
  }

  keys.forEach((key, groupIdx) => {
    const p = projectsObj[key];
    const tr = document.createElement('tr');
    tr.style.borderBottom = "1px solid #F1F5F9";

    // รองรับทั้งโครงสร้าง members array แบบใหม่ และ member1/2 แบบเดิม
    let membersList = [];
    if (p.members && Array.isArray(p.members)) {
      membersList = p.members;
    } else {
      if (p.member1Id) membersList.push({ id: p.member1Id, name: p.member1Name });
      if (p.member2Id) membersList.push({ id: p.member2Id, name: p.member2Name });
    }

    // สร้างตารางย่อยแสดงสมาชิกตามตัวอย่างในภาพ
    let membersHtml = `
      <div style="background: white; border-radius: 10px; border: 1px solid #EDF2F7; overflow: hidden;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
          <thead>
            <tr style="background: #F8FAFC; color: #64748B; border-bottom: 1px solid #EDF2F7;">
              <th style="padding: 0.4rem 0.6rem; font-weight: 700; width: 60px;">อันดับ</th>
              <th style="padding: 0.4rem 0.6rem; font-weight: 700; width: 110px;">รหัส</th>
              <th style="padding: 0.4rem 0.6rem; font-weight: 700;">ชื่อ - นามสกุล</th>
            </tr>
          </thead>
          <tbody>
    `;

    membersList.forEach((m, mIdx) => {
      membersHtml += `
        <tr style="border-bottom: 1px solid #F8FAFC;">
          <td style="padding: 0.45rem 0.6rem; color: #64748B; font-weight: 700;">#${mIdx + 1}</td>
          <td style="padding: 0.45rem 0.6rem; color: #0F172A; font-weight: 800;">${m.id || '-'}</td>
          <td style="padding: 0.45rem 0.6rem; color: #334155; font-weight: 600;">${m.name || (activeRoster[m.id] || '-')}</td>
        </tr>
      `;
    });

    membersHtml += `
          </tbody>
        </table>
      </div>
    `;

    tr.innerHTML = `
      <td style="text-align: center; font-weight: 800; font-size: 1rem; color: var(--primary-blue); vertical-align: middle;">
        กลุ่มที่ ${groupIdx + 1}
      </td>
      <td style="padding: 0.75rem 0.6rem; vertical-align: middle;">
        ${membersHtml}
      </td>
      <td style="vertical-align: middle;">
        <div style="font-weight: 800; color: #1E1B4B; font-size: 0.95rem; margin-bottom: 0.2rem;">${p.projectTitle}</div>
        <small style="color: #94A3B8;">สมาชิกทั้งหมด ${membersList.length} คน</small>
      </td>
      <td style="text-align: center; vertical-align: middle;">
        <div style="display: inline-flex; gap: 0.4rem;">
          <button type="button" style="background:#E0F2FE; color:#0369A1; border:none; padding:0.4rem 0.75rem; border-radius:8px; font-weight:700; font-size:0.8rem; cursor:pointer;" onclick="editProjectGroup('${key}')">✏️ แก้ไข</button>
          <button type="button" style="background:#FEE2E2; color:#DC2626; border:none; padding:0.4rem 0.75rem; border-radius:8px; font-weight:700; font-size:0.8rem; cursor:pointer;" onclick="deleteProjectGroup('${key}')">🗑️ ลบ</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const countEl = document.getElementById('totalPairCount');
  if (countEl) countEl.innerText = keys.length;
}

function editProjectGroup(groupKey) {
  const p = currentProjectsData[groupKey];
  if (!p) return;

  document.getElementById('editingProjectKey').value = groupKey;
  document.getElementById('projectTitleInput').value = p.projectTitle || '';
  document.getElementById('projectFormTitle').innerText = '✏️ แก้ไขข้อมูลโครงงานกลุ่ม';
  document.getElementById('btnSubmitProject').innerText = '💾 บันทึกการเปลี่ยนแปลง';
  document.getElementById('btnCancelEditProject').style.display = 'inline-block';

  // เติมข้อมูลสมาชิกกลับเข้าสู่ฟอร์ม
  const container = document.getElementById('projectMembersContainer');
  container.innerHTML = '';

  let membersList = [];
  if (p.members && Array.isArray(p.members)) {
    membersList = p.members;
  } else {
    if (p.member1Id) membersList.push({ id: p.member1Id, name: p.member1Name });
    if (p.member2Id) membersList.push({ id: p.member2Id, name: p.member2Name });
  }

  if (membersList.length === 0) {
    addProjectMemberField();
    addProjectMemberField();
  } else {
    membersList.forEach(m => {
      addProjectMemberField(m.id, m.name);
    });
  }

  // เลื่อนจอขึ้นมาที่ฟอร์ม
  document.getElementById('projectFormTitle').scrollIntoView({ behavior: 'smooth' });
}

function cancelEditProject() {
  document.getElementById('editingProjectKey').value = '';
  document.getElementById('projectTitleInput').value = '';
  document.getElementById('projectFormTitle').innerText = '✍️ ฟอร์มบันทึกข้อมูลโครงงาน';
  document.getElementById('btnSubmitProject').innerText = '💾 บันทึกข้อมูลโครงงาน 🚀';
  document.getElementById('btnCancelEditProject').style.display = 'none';
  initProjectMembersForm();
}

function deleteProjectGroup(groupKey) {
  if (!confirm("ต้องการลบกลุ่มโครงงานนี้ใช่หรือไม่?")) return;

  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}pair_projects/${activeCourseId}/${groupKey}.json`, {
    method: "DELETE"
  })
  .then(() => {
    if (document.getElementById('editingProjectKey').value === groupKey) {
      cancelEditProject();
    }
    loadPairProjectsData();
  })
  .catch(err => console.error(err));
}

// -------------------------------------------------------------
// --- ATTENDANCE & DASHBOARD LOGIC ---
// -------------------------------------------------------------

function loadSessionData() {
  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) {
    renderDashboardUI();
    return;
  }

  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}attendance.json`)
    .then(r => {
      if (!r.ok) throw new Error("Attendance Load Error");
      return r.json();
    })
    .then(rootAttendance => {
      setSystemStatus(true);
      if (!rootAttendance) {
        sessionAttendance = {};
        renderDashboardUI();
        return;
      }

      let targetData = null;

      if (rootAttendance[activeCourseId]) {
        const courseData = rootAttendance[activeCourseId];
        targetData = courseData[currentSession] || 
                     courseData[safeSession] || 
                     courseData[decodeURIComponent(safeSession)];
        
        if (!targetData) {
          const kMatch = Object.keys(courseData).find(k => 
            k.toLowerCase().includes(currentSession.toLowerCase()) || 
            (currentSession.includes("Week 1") && k.includes("Week 1"))
          );
          if (kMatch) targetData = courseData[kMatch];
        }
      }

      if (!targetData) {
        targetData = rootAttendance[currentSession] || 
                     rootAttendance[safeSession] || 
                     rootAttendance[decodeURIComponent(safeSession)];
      }

      sessionAttendance = targetData || {};
      renderDashboardUI();
    })
    .catch(err => {
      console.warn("Could not reach Firebase attendance, using local cache:", err);
      setSystemStatus(false);
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
    const hasFile = !!(rec.fileUrl || rec.fileName);

    if (isPresent) presentCount++;
    else if (isLate) lateCount++;
    else if (isLeave) leaveCount++;
    else absentCount++;

    if (hasFile) submittedCount++;

    let attScore = rec.attendanceScore !== undefined ? rec.attendanceScore : (isPresent ? 100 : (isLate ? 50 : (isLeave ? 0 : 0)));
    let quizScore = rec.quizScore !== undefined ? rec.quizScore : (rec.score !== undefined ? rec.score : null);
    let hwScore = rec.homeworkScore !== undefined ? rec.homeworkScore : (hasFile ? 100 : null);

    let totalScore = 0;
    let hasAnyScore = false;
    if (attScore !== null && attScore !== undefined && !isNaN(attScore)) { totalScore += Number(attScore); hasAnyScore = true; }
    if (quizScore !== null && quizScore !== undefined && !isNaN(quizScore)) { totalScore += Number(quizScore); hasAnyScore = true; }
    if (hwScore !== null && hwScore !== undefined && !isNaN(hwScore)) { totalScore += Number(hwScore); hasAnyScore = true; }

    rankedList.push({
      id,
      name: activeRoster[id],
      attScore,
      quizScore,
      hwScore,
      totalScore: hasAnyScore ? totalScore : 0,
      rec
    });
  });

  const totalStudents = rosterIds.length;
  
  // อัปเดตข้อมูลบนการ์ดภาพรวม (แสดงตามรายวิชาที่เลือก)
  const cTotal = document.getElementById('cardTotalStudents');
  const cSub = document.getElementById('cardSubmittedCount');
  const cPres = document.getElementById('cardPresentCount');
  const cRisk = document.getElementById('cardAtRiskCount');
  const cAvg = document.getElementById('cardAvgScore');

  if (cTotal) cTotal.innerText = `${totalStudents} คน`;
  if (cSub) cSub.innerText = `${submittedCount}`;
  if (cPres) cPres.innerText = `${presentCount} คน`;
  if (cRisk) cRisk.innerText = `${absentCount + lateCount} คน`;

  let sumAllScores = rankedList.reduce((acc, curr) => acc + curr.totalScore, 0);
  let avgScore = totalStudents > 0 ? (sumAllScores / totalStudents).toFixed(1) : 0;
  if (cAvg) cAvg.innerText = `${avgScore} คะแนน`;

  // อัปเดตแถบความคืบหน้าสถิติห้องเรียน
  const sPres = document.getElementById('statBarPresent');
  const sLate = document.getElementById('statBarLate');
  const sAbs = document.getElementById('statBarAbsent');

  if (sPres) sPres.innerText = `${presentCount} คน`;
  if (sLate) sLate.innerText = `${lateCount} คน`;
  if (sAbs) sAbs.innerText = `${absentCount + leaveCount} คน`;

  const pPres = document.getElementById('progressPresent');
  const pLate = document.getElementById('progressLate');
  const pAbs = document.getElementById('progressAbsent');

  if (totalStudents > 0) {
    if (pPres) pPres.style.width = `${Math.round((presentCount / totalStudents) * 100)}%`;
    if (pLate) pLate.style.width = `${Math.round((lateCount / totalStudents) * 100)}%`;
    if (pAbs) pAbs.style.width = `${Math.round(((absentCount + leaveCount) / totalStudents) * 100)}%`;
  } else {
    if (pPres) pPres.style.width = '0%';
    if (pLate) pLate.style.width = '0%';
    if (pAbs) pAbs.style.width = '0%';
  }

  const countAll = document.getElementById('countAll');
  if (countAll) countAll.innerText = totalStudents;

  rankedList.sort((a, b) => b.totalScore - a.totalScore);

  // เรนเดอร์ 5 อันดับสูงสุดในหน้าหลัก
  const modernContainer = document.getElementById('modernTopRankContainer');
  if (modernContainer) {
    modernContainer.innerHTML = '';
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    for (let i = 0; i < 5; i++) {
      const st = rankedList[i];
      if (st && st.totalScore > 0) {
        modernContainer.innerHTML += `
          <div class="top-student-row">
            <div style="display: flex; align-items: center; gap: 0.8rem;">
              <span style="font-size: 1.3rem;">${medals[i]}</span>
              <div>
                <div style="font-weight: 700; color: #1E1B4B; font-size: 0.92rem;">${st.name}</div>
                <div style="font-size: 0.76rem; color: #64748B;">รหัส: ${st.id}</div>
              </div>
            </div>
            <div style="font-weight: 800; color: #0284C7; font-size: 1rem;">${st.totalScore} คะแนน</div>
          </div>
        `;
      } else {
        modernContainer.innerHTML += `
          <div class="top-student-row" style="opacity: 0.4;">
            <div style="display: flex; align-items: center; gap: 0.8rem;">
              <span style="font-size: 1.3rem;">${medals[i]}</span>
              <div style="font-weight: 700; color: #1E1B4B; font-size: 0.92rem;">-</div>
            </div>
            <div style="font-weight: 800; color: #64748B; font-size: 1rem;">-</div>
          </div>
        `;
      }
    }
  }

  renderTableRows(rankedList);
}

function setTableFilter(flt, btn) {
  tableFilter = flt;
  document.querySelectorAll('.ft-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderDashboardUI();
}

function openFilePreview(fileUrl) {
  if (!fileUrl && currentAssignmentConfig && currentAssignmentConfig.folderUrl) {
    fileUrl = currentAssignmentConfig.folderUrl;
  }
  if (!fileUrl) return;
  window.open(fileUrl, '_blank');
}

function saveSpecificScore(stId, field, inputEl) {
  const val = inputEl.value.trim();
  const scoreNum = val === '' ? null : Number(val);

  if (val !== '' && isNaN(scoreNum)) {
    alert("กรุณากรอกคะแนนเป็นตัวเลข");
    inputEl.value = (sessionAttendance[stId] && sessionAttendance[stId][field] !== undefined) ? sessionAttendance[stId][field] : '';
    return;
  }

  if (!sessionAttendance[stId]) sessionAttendance[stId] = {};
  sessionAttendance[stId][field] = scoreNum;
  if (field === 'quizScore') sessionAttendance[stId].score = scoreNum;

  const rowEl = inputEl.closest('tr');
  if (rowEl) {
    const attVal = Number(rowEl.querySelector('.score-input-att').value) || 0;
    const qVal = Number(rowEl.querySelector('.score-input-quiz').value) || 0;
    const hwVal = Number(rowEl.querySelector('.score-input-hw').value) || 0;
    const totalBadge = rowEl.querySelector('.total-score-badge');
    if (totalBadge) totalBadge.innerText = (attVal + qVal + hwVal);
  }

  inputEl.style.borderColor = '#10B981';
  setTimeout(() => { inputEl.style.borderColor = ''; }, 1000);

  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  const payload = {};
  payload[field] = scoreNum;
  if (field === 'quizScore') payload['score'] = scoreNum;

  fetch(`${baseUrl}attendance/${activeCourseId}/${safeSession}/${stId}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(() => setSystemStatus(true))
    .catch(err => {
      console.error("Save score error:", err);
      setSystemStatus(false);
    });
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
    const hasFile = !!(rec.fileUrl || rec.fileName);

    if (tableFilter === 'NOT_SUBMITTED' && hasFile) return;
    if (tableFilter === 'ABSENT' && (isPresent || isLate || isLeave)) return;
    if (tableFilter === 'LEAVE' && !isLeave) return;

    let statusBadge = `<span class="tag tag-absent" onclick="openStatusModal('${st.id}')">ขาดเรียน</span>`;
    if (isLeave) statusBadge = `<span class="tag tag-leave" onclick="openStatusModal('${st.id}')" title="${rec.leaveReason || ''}">ลาเรียน</span>`;
    else if (isPresent) statusBadge = `<span class="tag tag-present" onclick="openStatusModal('${st.id}')">เข้าห้องแล้ว</span>`;
    else if (isLate) statusBadge = `<span class="tag tag-late" onclick="openStatusModal('${st.id}')">มาสาย</span>`;

    let fileDisplay = '<span class="tag tag-waiting">ยังไม่ส่ง</span>';
    if (hasFile) {
      const targetUrl = rec.fileUrl || (currentAssignmentConfig && currentAssignmentConfig.folderUrl ? currentAssignmentConfig.folderUrl : '');
      fileDisplay = `<span onclick="openFilePreview('${targetUrl}')" class="tag tag-submitted" title="${rec.fileName || 'เปิดดูชิ้นงาน'}">📄 ดูชิ้นงาน</span>`;
    }

    const ipDisplay = rec.ip || rec.ipAddress || '-';
    const attVal = st.attScore !== null && st.attScore !== undefined ? st.attScore : '';
    const quizVal = st.quizScore !== null && st.quizScore !== undefined ? st.quizScore : '';
    const hwVal = st.hwScore !== null && st.hwScore !== undefined ? st.hwScore : '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:700; color:#64748B;">#${idx + 1}</td>
      <td style="font-weight:700; color:#0F172A; cursor:pointer;" onclick="openStatusModal('${st.id}')">${st.id}</td>
      <td style="cursor:pointer;" onclick="openStatusModal('${st.id}')">${st.name}</td>
      <td>${statusBadge}</td>
      <td class="score-box-cell">
        <input type="number" class="score-input-live score-input-att" value="${attVal}" placeholder="0" 
          onblur="saveSpecificScore('${st.id}', 'attendanceScore', this)" 
          onkeydown="if(event.key==='Enter') this.blur();">
      </td>
      <td class="score-box-cell">
        <input type="number" class="score-input-live score-input-quiz" value="${quizVal}" placeholder="-" 
          onblur="saveSpecificScore('${st.id}', 'quizScore', this)" 
          onkeydown="if(event.key==='Enter') this.blur();">
      </td>
      <td class="score-box-cell">
        <input type="number" class="score-input-live score-input-hw" value="${hwVal}" placeholder="-" 
          onblur="saveSpecificScore('${st.id}', 'homeworkScore', this)" 
          onkeydown="if(event.key==='Enter') this.blur();">
      </td>
      <td class="score-box-cell">
        <span class="total-score-badge">${st.totalScore}</span>
      </td>
      <td><span class="${hasFile ? 'tag tag-submitted' : 'tag tag-waiting'}">${hasFile ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}</span></td>
      <td>${fileDisplay}</td>
      <td style="font-size: 0.8rem; color: #64748B;">${ipDisplay}</td>
    `;
    tbody.appendChild(tr);
  });
}

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
    setTimeout(() => selEl.focus(), 50);
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

  if (!sessionAttendance[stId]) {
    sessionAttendance[stId] = {};
  }

  sessionAttendance[stId].status = newStatus;

  if (newStatus === 'PRESENT') {
    sessionAttendance[stId].attendanceScore = 100;
  } else if (newStatus === 'LATE') {
    sessionAttendance[stId].attendanceScore = 50; // บังคับมาสายได้ 50 คะแนนถ้วน
  } else if (newStatus === 'LEAVE') {
    sessionAttendance[stId].attendanceScore = 0;
  } else {
    sessionAttendance[stId].attendanceScore = 0;
  }

  const now = new Date();
  sessionAttendance[stId].checkInTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  closeStatusModal();
  renderDashboardUI();

  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  const payload = {
    status: newStatus,
    attendanceScore: sessionAttendance[stId].attendanceScore,
    checkInTime: sessionAttendance[stId].checkInTime
  };

  fetch(`${baseUrl}attendance/${activeCourseId}/${safeSession}/${stId}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(() => setSystemStatus(true))
    .catch(() => setSystemStatus(false));
}

function confirmResetStudentSubmission() {
  if (!currentEditingStudentId) return;

  const stId = currentEditingStudentId;
  const studentName = activeRoster[stId] || stId;

  if (!confirm(`ต้องการรีเซ็ตการส่งการบ้านของ:\n"${studentName} (${stId})"\nใช่หรือไม่?`)) {
    return;
  }

  if (sessionAttendance[stId]) {
    delete sessionAttendance[stId].fileUrl;
    delete sessionAttendance[stId].fileName;
    delete sessionAttendance[stId].fileSize;
    delete sessionAttendance[stId].submittedTime;
    delete sessionAttendance[stId].homeworkScore;
  }
  alert("✅ รีเซ็ตการส่งการบ้านของนักศึกษาเรียบร้อยแล้ว");
  closeStatusModal();
  renderDashboardUI();

  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  const resetHwPayload = {
    fileUrl: null,
    fileName: null,
    fileSize: null,
    submittedTime: null,
    homeworkScore: null
  };

  fetch(`${baseUrl}attendance/${activeCourseId}/${safeSession}/${stId}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(resetHwPayload)
  }).then(() => setSystemStatus(true))
    .catch(() => setSystemStatus(false));
}

function confirmFullResetStudent() {
  if (!currentEditingStudentId) return;

  const stId = currentEditingStudentId;
  const studentName = activeRoster[stId] || stId;

  if (!confirm(`⚠️ คำเตือน: ต้องการรีเซ็ตข้อมูลทั้งหมดของ:\n"${studentName} (${stId})"\n(รวมถึงสถานะเช็คชื่อ คะแนนเข้าห้อง คะแนนควิซ และ IP Address) ใช่หรือไม่?`)) {
    return;
  }

  if (sessionAttendance[stId]) {
    delete sessionAttendance[stId].status;
    delete sessionAttendance[stId].attendanceScore;
    delete sessionAttendance[stId].checkInTime;
    delete sessionAttendance[stId].timestamp;
    delete sessionAttendance[stId].quizScore;
    delete sessionAttendance[stId].score;
    delete sessionAttendance[stId].homeworkScore;
    delete sessionAttendance[stId].fileUrl;
    delete sessionAttendance[stId].fileName;
    delete sessionAttendance[stId].fileSize;
    delete sessionAttendance[stId].submittedTime;
    delete sessionAttendance[stId].ip;
    delete sessionAttendance[stId].ipAddress;
  }

  alert("✅ ล้างข้อมูลการเช็คชื่อ IP Address และคะแนนทั้งหมดของนักศึกษาเรียบร้อยแล้ว");
  closeStatusModal();
  renderDashboardUI();

  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  const fullResetPayload = {
    status: null,
    attendanceScore: null,
    checkInTime: null,
    timestamp: null,
    quizScore: null,
    score: null,
    homeworkScore: null,
    fileUrl: null,
    fileName: null,
    fileSize: null,
    submittedTime: null,
    ip: null,
    ipAddress: null
  };

  fetch(`${baseUrl}attendance/${activeCourseId}/${safeSession}/${stId}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fullResetPayload)
  }).then(() => setSystemStatus(true))
    .catch(() => setSystemStatus(false));

  fetch(`${baseUrl}quiz_submissions/${activeCourseId}/${safeSession}/${stId}.json`, {
    method: "DELETE"
  }).catch(() => {});
}

function loadAssignmentSettings() {
  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}session_settings/${activeCourseId}/${safeSession}/assignmentConfig.json`)
    .then(r => r.json())
    .then(cfg => {
      if (cfg) {
        applyAssignmentConfig(cfg);
      } else {
        resetAssignmentInputs();
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

  const configData = {
    folderUrl: folderUrl,
    deadline: deadline,
    updatedAt: new Date().toISOString()
  };

  applyAssignmentConfig(configData);
  alert(`✓ บันทึกการตั้งค่าโฟลเดอร์สำหรับ [${currentSession}] สำเร็จ`);

  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}session_settings/${activeCourseId}/${safeSession}/assignmentConfig.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(configData)
  }).then(() => setSystemStatus(true))
    .catch(() => setSystemStatus(false));
}

function resetAssignmentInputs() {
  const fInput = document.getElementById('hwFolderUrl');
  const dInput = document.getElementById('hwDeadline');
  if (fInput) fInput.value = '';
  if (dInput) dInput.value = '';
}

// -------------------------------------------------------------
// --- QUIZ MANAGER LOGIC ---
// -------------------------------------------------------------

function loadQuizSettings() {
  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  updateQuizActiveWeekLabel();

  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) {
    renderQuizQuestions();
    return;
  }

  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}quiz_settings/${activeCourseId}/${safeSession}.json`)
    .then(r => r.json())
    .then(quizData => {
      if (quizData) {
        currentQuizConfig = quizData;
      } else {
        currentQuizConfig = {
          isActive: false,
          timeLimit: 60,
          totalPoints: 100,
          questions: []
        };
      }
      applyQuizConfigToUI();
    })
    .catch(err => {
      console.warn("Could not load quiz config:", err);
      applyQuizConfigToUI();
    });
}

function applyQuizConfigToUI() {
  const toggle = document.getElementById('quizActiveToggle');
  const timeInput = document.getElementById('quizTimeLimit');
  const pointsInput = document.getElementById('quizTotalPoints');

  if (toggle) toggle.checked = !!currentQuizConfig.isActive;
  if (timeInput) timeInput.value = currentQuizConfig.timeLimit || 60;
  if (pointsInput) pointsInput.value = currentQuizConfig.totalPoints || 100;

  updateQuizToggleLabel(currentQuizConfig.isActive);
  renderQuizQuestions();
}

function updateQuizToggleLabel(isActive) {
  const lbl = document.getElementById('quizToggleLabel');
  if (lbl) {
    lbl.innerHTML = isActive 
      ? `สถานะ: <strong style="color:#059669;">🟢 เปิดปล่อยควิซสดอยู่</strong>`
      : `สถานะ: <strong style="color:#64748B;">⚪ ปิดควิซอยู่</strong>`;
  }
}

function toggleQuizActiveState(isChecked) {
  currentQuizConfig.isActive = isChecked;
  updateQuizToggleLabel(isChecked);

  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}quiz_settings/${activeCourseId}/${safeSession}/isActive.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(isChecked)
  }).then(() => setSystemStatus(true))
    .catch(() => setSystemStatus(false));
}

function addNewQuestion() {
  if (!currentQuizConfig.questions) currentQuizConfig.questions = [];

  const newQ = {
    id: 'q_' + Date.now(),
    prompt: '',
    choices: ['', '', '', ''],
    correctIndex: 0
  };

  currentQuizConfig.questions.push(newQ);
  renderQuizQuestions();
}

function removeQuestion(index) {
  if (!confirm("ลบข้อสอบข้อนี้ใช่หรือไม่?")) return;
  currentQuizConfig.questions.splice(index, 1);
  renderQuizQuestions();
}

function renderQuizQuestions() {
  const container = document.getElementById('quizQuestionsContainer');
  if (!container) return;

  if (!currentQuizConfig.questions || currentQuizConfig.questions.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:2rem; background:#F8FAFC; border-radius:12px; border:1px dashed #CBD5E1; color:#64748B;">
        <span style="font-size:1.5rem; display:block; margin-bottom:0.4rem;">📝</span>
        ยังไม่มีข้อสอบในสัปดาห์นี้ กดปุ่ม <strong>"➕ เพิ่มข้อคำถาม"</strong> เพื่อเริ่มสร้างควิซ
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  currentQuizConfig.questions.forEach((q, qIdx) => {
    const card = document.createElement('div');
    card.className = 'question-item-card';

    let choicesHtml = '';
    const choiceLabels = ['ก.', 'ข.', 'ค.', 'ง.'];

    for (let c = 0; c < 4; c++) {
      const isChecked = q.correctIndex === c ? 'checked' : '';
      const cVal = (q.choices && q.choices[c]) ? q.choices[c] : '';
      choicesHtml += `
        <div class="choice-row">
          <input type="radio" name="correct_${qIdx}" value="${c}" ${isChecked} onchange="updateCorrectAnswer(${qIdx}, ${c})">
          <strong style="font-size:0.85rem; color:#64748B;">${choiceLabels[c]}</strong>
          <input type="text" class="choice-text-input" placeholder="ตัวเลือก ${choiceLabels[c]}" value="${cVal}" onchange="updateChoiceText(${qIdx}, ${c}, this.value)">
        </div>
      `;
    }

    card.innerHTML = `
      <div class="q-card-head">
        <span class="q-badge">ข้อที่ ${qIdx + 1}</span>
        <button type="button" class="btn-remove-q" onclick="removeQuestion(${qIdx})">🗑️ ลบข้อนี้</button>
      </div>
      <input type="text" class="custom-input q-input-prompt" placeholder="พิมพ์คำถามข้อที่ ${qIdx + 1}..." value="${q.prompt || ''}" onchange="updateQuestionPrompt(${qIdx}, this.value)">
      <div class="choices-grid">
        ${choicesHtml}
      </div>
    `;
    container.appendChild(card);
  });
}

function updateQuestionPrompt(qIdx, val) {
  if (currentQuizConfig.questions[qIdx]) {
    currentQuizConfig.questions[qIdx].prompt = val;
  }
}

function updateChoiceText(qIdx, choiceIdx, val) {
  if (currentQuizConfig.questions[qIdx]) {
    if (!currentQuizConfig.questions[qIdx].choices) currentQuizConfig.questions[qIdx].choices = ['', '', '', ''];
    currentQuizConfig.questions[qIdx].choices[choiceIdx] = val;
  }
}

function updateCorrectAnswer(qIdx, choiceIdx) {
  if (currentQuizConfig.questions[qIdx]) {
    currentQuizConfig.questions[qIdx].correctIndex = Number(choiceIdx);
  }
}

function saveQuizSettings() {
  const timeInput = document.getElementById('quizTimeLimit');
  const pointsInput = document.getElementById('quizTotalPoints');

  currentQuizConfig.timeLimit = Number(timeInput.value) || 60;
  currentQuizConfig.totalPoints = Number(pointsInput.value) || 100;
  currentQuizConfig.updatedAt = new Date().toISOString();

  alert(`✓ บันทึกชุดคำถามควิซสำหรับ [${currentSession}] เรียบร้อยแล้ว`);

  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}quiz_settings/${activeCourseId}/${safeSession}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(currentQuizConfig)
  }).then(() => setSystemStatus(true))
    .catch(() => setSystemStatus(false));
}

function loadQuizSubmissions() {
  const tbody = document.getElementById('quizSubmissionsTableBody');
  if (!tbody) return;

  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) {
    renderQuizSubmissionsTable();
    return;
  }

  const safeSession = (typeof sanitizeKey === 'function') ? sanitizeKey(currentSession) : currentSession;
  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';

  fetch(`${baseUrl}quiz_submissions/${activeCourseId}/${safeSession}.json`)
    .then(r => r.json())
    .then(data => {
      currentQuizSubmissions = data || {};
      renderQuizSubmissionsTable();
    })
    .catch(err => {
      console.warn("Could not load quiz submissions:", err);
      currentQuizSubmissions = {};
      renderQuizSubmissionsTable();
    });
}

function renderQuizSubmissionsTable() {
  const tbody = document.getElementById('quizSubmissionsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const subIds = Object.keys(currentQuizSubmissions);

  if (subIds.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:1.5rem; color:#64748B;">
          ยังไม่มีข้อมูลการส่งควิซของนักศึกษาใน ${currentSession}
        </td>
      </tr>
    `;
    return;
  }

  subIds.forEach((stId, idx) => {
    const sub = currentQuizSubmissions[stId] || {};
    const stName = activeRoster[stId] || sub.studentName || 'ไม่ระบุชื่อ';
    const scoreDisplay = sub.score !== undefined ? sub.score : '-';
    const timeDisplay = sub.submittedAt ? new Date(sub.submittedAt).toLocaleTimeString('th-TH') : (sub.time || '-');
    const ipDisplay = sub.ip || '-';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:700; color:#64748B;">${idx + 1}</td>
      <td style="font-weight:700; color:#0F172A;">${stId}</td>
      <td>${stName}</td>
      <td style="text-align:center; font-weight:800; color:#0284C7;">${scoreDisplay}</td>
      <td>${timeDisplay}</td>
      <td style="font-size:0.8rem; color:#64748B;">${ipDisplay}</td>
      <td style="text-align:center;">
        <button type="button" class="btn-cyan-gradient" style="padding:0.25rem 0.65rem; font-size:0.75rem;" onclick="openQuizEvidenceModal('${stId}')">
          🔍 ดูคำตอบ
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openQuizEvidenceModal(stId) {
  const sub = currentQuizSubmissions[stId];
  if (!sub) return;

  const modal = document.getElementById('quizEvidenceModal');
  const nameEl = document.getElementById('quizEvidenceStudentName');
  const detailContainer = document.getElementById('quizEvidenceDetailContainer');

  if (nameEl) nameEl.innerText = `${stId} - ${activeRoster[stId] || sub.studentName || ''} (ได้ ${sub.score || 0} แต้ม)`;
  if (!detailContainer) return;

  detailContainer.innerHTML = '';

  const questions = currentQuizConfig.questions || [];
  const studentAnswers = sub.answers || {};

  if (questions.length === 0) {
    detailContainer.innerHTML = '<p style="color:#64748B; text-align:center;">ไม่พบชุดคำถามต้นฉบับ</p>';
  } else {
    const choiceLabels = ['ก.', 'ข.', 'ค.', 'ง.'];
    questions.forEach((q, idx) => {
      const chosenIdx = studentAnswers[idx] !== undefined ? studentAnswers[idx] : studentAnswers[q.id];
      const isCorrect = (chosenIdx === q.correctIndex);

      const card = document.createElement('div');
      card.className = 'evidence-item-card';

      let chosenText = chosenIdx !== undefined && q.choices[chosenIdx] ? `${choiceLabels[chosenIdx]} ${q.choices[chosenIdx]}` : 'ไม่ได้ตอบ';
      let correctText = `${choiceLabels[q.correctIndex]} ${q.choices[q.correctIndex]}`;

      card.innerHTML = `
        <div class="evidence-q-title">ข้อที่ ${idx + 1}: ${q.prompt || 'ไม่มีข้อความคำถาม'}</div>
        <div class="evidence-choice-pill ${isCorrect ? 'choice-correct' : 'choice-wrong'}">
          <span>${isCorrect ? '✔ ถูกต้อง' : '✖ ตอบผิด'}: นักศึกษาตอบ <strong>"${chosenText}"</strong></span>
        </div>
        ${!isCorrect ? `<small style="display:block; margin-top:0.3rem; color:#059669;">เฉลยที่ถูกต้อง: ${correctText}</small>` : ''}
      `;
      detailContainer.appendChild(card);
    });
  }

  if (modal) modal.style.display = 'flex';
}

function closeQuizEvidenceModal() {
  const modal = document.getElementById('quizEvidenceModal');
  if (modal) modal.style.display = 'none';
}

function exportQuizSubmissionsCSV() {
  const subIds = Object.keys(currentQuizSubmissions);
  if (subIds.length === 0) return alert("ไม่มีข้อมูลการส่งควิซสำหรับ Export");

  let csv = "\uFEFFลำดับ,รหัสนักศึกษา,ชื่อ - นามสกุล,คะแนนควิซ,เวลาที่ส่ง,IP Address\n";
  subIds.forEach((stId, idx) => {
    const sub = currentQuizSubmissions[stId] || {};
    const stName = activeRoster[stId] || sub.studentName || '';
    const scoreVal = sub.score !== undefined ? sub.score : 0;
    const timeVal = sub.submittedAt || sub.time || '-';
    const ipVal = sub.ip || '-';

    csv += [
      idx + 1,
      `"${stId}"`,
      `"${stName}"`,
      scoreVal,
      `"${timeVal}"`,
      `"${ipVal}"`
    ].join(",") + "\n";
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Quiz_Evidence_${activeCourseId}_${currentSession}.csv`;
  a.click();
}

// -------------------------------------------------------------
// --- ROSTER & EXCEL MANAGER ---
// -------------------------------------------------------------

function renderStudentRosterManager() {
  const container = document.getElementById('rosterListContainer');
  const rosterCountEl = document.getElementById('rosterCount');
  if (!container) return;
  const rosterIds = Object.keys(activeRoster);
  if (rosterCountEl) rosterCountEl.innerText = rosterIds.length;
  container.innerHTML = '';

  rosterIds.forEach(id => {
    container.innerHTML += `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0.6rem; border-bottom:1px solid #F1F5F9; font-size:0.85rem;">
        <div><strong>${id}</strong> - ${activeRoster[id]}</div>
        <button type="button" onclick="removeStudentFromRoster('${id}')" style="background:#FEE2E2; color:#DC2626; border:none; padding:0.2rem 0.5rem; border-radius:6px; cursor:pointer;">ลบ</button>
      </div>
    `;
  });
}

function addSingleStudent() {
  const id = document.getElementById('newStudentId').value.trim();
  const name = document.getElementById('newStudentName').value.trim();
  if (!id || !name) return alert("กรุณากรอกรหัสและชื่อ");

  activeRoster[id] = name;
  document.getElementById('newStudentId').value = '';
  document.getElementById('newStudentName').value = '';
  renderStudentRosterManager();
  renderDashboardUI();

  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';
  fetch(`${baseUrl}courses/${activeCourseId}/roster.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(activeRoster)
  }).then(() => setSystemStatus(true))
    .catch(() => setSystemStatus(false));
}

function removeStudentFromRoster(id) {
  if (!confirm(`ลบ ${id} ใช่หรือไม่?`)) return;
  delete activeRoster[id];
  renderStudentRosterManager();
  renderDashboardUI();

  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';
  fetch(`${baseUrl}courses/${activeCourseId}/roster.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(activeRoster)
  }).then(() => setSystemStatus(true))
    .catch(() => setSystemStatus(false));
}

function setupExcelDragDrop() {
  const zone = document.getElementById('excelDropZone');
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
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleExcelUpload(e.dataTransfer.files[0]);
    }
  });
}

function handleExcelUpload(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      let addedCount = 0;
      let newRoster = Object.assign({}, activeRoster);

      rows.forEach((row) => {
        if (!row || row.length === 0) return;

        let stId = null;
        let stName = null;

        for (let i = 0; i < row.length; i++) {
          const val = String(row[i] || '').trim();
          if (!stId && /^\d{8,10}$/.test(val)) {
            stId = val;
            continue;
          }
          if (!stName && val.length >= 3 && !/^\d+$/.test(val) && !val.includes('รหัส') && !val.includes('ID')) {
            stName = val;
          }
        }

        if (!stId && row[0] && row[1]) {
          const c0 = String(row[0]).trim();
          const c1 = String(row[1]).trim();
          if (/^\d+$/.test(c0)) {
            stId = c0;
            stName = c1;
          }
        }

        if (stId && stName) {
          newRoster[stId] = stName;
          addedCount++;
        }
      });

      if (addedCount === 0) {
        alert("⚠️ ไม่พบข้อมูลรหัสและชื่อนักศึกษาในไฟล์");
        return;
      }

      if (!confirm(`พบข้อมูลนักศึกษาจำนวน ${addedCount} คน\nต้องการนำเข้ารายชื่อเข้าสู่วิชา [${activeCourseId}] ใช่หรือไม่?`)) {
        return;
      }

      activeRoster = newRoster;
      alert(`✅ นำเข้ารายชื่อนักศึกษาสำเร็จ ${addedCount} คน`);
      renderStudentRosterManager();
      renderDashboardUI();
      loadAllAttendanceForOverview();

      const fileInput = document.getElementById('excelFileInput');
      if (fileInput) fileInput.value = '';

      if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

      const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';
      fetch(`${baseUrl}courses/${activeCourseId}/roster.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activeRoster)
      }).then(() => setSystemStatus(true))
        .catch(() => setSystemStatus(false));

    } catch (err) {
      console.error("Excel Read Error:", err);
      alert("❌ เกิดข้อผิดพลาดในการอ่านไฟล์ Excel");
    }
  };

  reader.readAsArrayBuffer(file);
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

  if (coursesData[activeCourseId]) {
    Object.assign(coursesData[activeCourseId], patchData);
  }
  alert("✓ บันทึกข้อมูลห้องเรียนเรียบร้อยแล้ว");
  onAdminCourseChange();

  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) return;

  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';
  fetch(`${baseUrl}courses/${activeCourseId}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patchData)
  }).then(() => setSystemStatus(true))
    .catch(() => setSystemStatus(false));
}

function openOverviewModal() {
  const modal = document.getElementById('overviewModal');
  if (modal) modal.style.display = 'flex';
}

function closeOverviewModal() {
  const modal = document.getElementById('overviewModal');
  if (modal) modal.style.display = 'none';
}

function openSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.style.display = 'flex';
}

function closeSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.style.display = 'none';
}

function loadAllAttendanceForOverview() {
  if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE_DB_URL) {
    renderTermOverviewTable();
    return;
  }

  const baseUrl = CONFIG.FIREBASE_DB_URL.endsWith('/') ? CONFIG.FIREBASE_DB_URL : CONFIG.FIREBASE_DB_URL + '/';
  fetch(`${baseUrl}attendance/${activeCourseId}.json`)
    .then(r => r.json())
    .then(data => {
      setSystemStatus(true);
      allAttendance = data || {};
      renderTermOverviewTable();
    })
    .catch(() => {
      setSystemStatus(false);
      allAttendance = {};
      renderTermOverviewTable();
    });
}

function renderTermOverviewTable() {
  const container = document.getElementById('termOverviewTableContainer');
  if (!container || typeof CONFIG === 'undefined' || !CONFIG.SESSIONS) return;

  const rosterIds = Object.keys(activeRoster);
  let html = `<table class="data-table" style="font-size:0.82rem;"><thead><tr><th>รหัสนักศึกษา</th><th>ชื่อ - นามสกุล</th>`;
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

        let sTot = 0;
        if (rec.attendanceScore !== undefined) sTot += Number(rec.attendanceScore);
        if (rec.quizScore !== undefined) sTot += Number(rec.quizScore);
        else if (rec.score !== undefined) sTot += Number(rec.score);
        if (rec.homeworkScore !== undefined) sTot += Number(rec.homeworkScore);

        sum += sTot;
      }
      html += `<td style="text-align:center;">${icon}</td>`;
    });
    html += `<td style="text-align:center; font-weight:800; color:#0284C7;">${sum}</td></tr>`;
  });
  html += `</tbody></table>`;
  container.innerHTML = html;
}

function exportAttendanceToCSV() {
  const rosterIds = Object.keys(activeRoster);
  if (rosterIds.length === 0) return alert("ไม่มีข้อมูลสำหรับ Export");

  let csv = "\uFEFFอันดับ,รหัสนักศึกษา,ชื่อ - นามสกุล,สถานะเช็คชื่อ,คะแนนเข้าเรียน,คะแนนควิซ,คะแนนการบ้าน,คะแนนรวม,สถานะการบ้าน,ลิงก์ไฟล์,IP Address\n";
  rosterIds.forEach((id, idx) => {
    const rec = sessionAttendance[id] || {};
    let st = "ขาดเรียน";
    if (rec.status === "PRESENT") st = "เข้าห้องแล้ว";
    else if (rec.status === "LATE") st = "มาสาย";
    else if (rec.status === "LEAVE") st = "ลาเรียน";

    let attS = rec.attendanceScore !== undefined ? rec.attendanceScore : 0;
    let quizS = rec.quizScore !== undefined ? rec.quizScore : (rec.score !== undefined ? rec.score : 0);
    let hwS = rec.homeworkScore !== undefined ? rec.homeworkScore : 0;
    let totalS = Number(attS) + Number(quizS) + Number(hwS);

    const ip = rec.ip || rec.ipAddress || '-';

    csv += [
      idx + 1,
      `"${id}"`,
      `"${activeRoster[id]}"`,
      `"${st}"`,
      attS,
      quizS,
      hwS,
      totalS,
      rec.fileUrl ? "ส่งแล้ว" : "ยังไม่ส่ง",
      `"${rec.fileUrl || '-'}"`,
      `"${ip}"`
    ].join(",") + "\n";
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Grades_${activeCourseId}_${currentSession}.csv`;
  a.click();
}

function filterStudentTable() {
  const q = document.getElementById('adminStudentSearch').value.toLowerCase();
  const rows = document.querySelectorAll('#adminTableBody tr');
  rows.forEach(r => {
    const text = r.innerText.toLowerCase();
    r.style.display = text.includes(q) ? '' : 'none';
  });
}

function logoutAdmin() {
  sessionStorage.removeItem("adminAuthenticated");
  window.location.href = "teacher.html";
}
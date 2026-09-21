let isSpinning = false;
const DIGIT_HEIGHT = 120;

function openSlotModal() {
  document.getElementById('slotModal').style.display = 'flex';
}

function closeSlotModal() {
  if (!isSpinning) {
    document.getElementById('slotModal').style.display = 'none';
  }
}

function setupReel(reelEl, targetDigit, rounds) {
  let html = '';
  for (let r = 0; r < rounds; r++) {
    for (let d = 0; d <= 9; d++) {
      html += `<div class="reel-digit">${d}</div>`;
    }
  }
  html += `<div class="reel-digit">${targetDigit}</div>`;
  reelEl.innerHTML = html;
  reelEl.style.transition = 'none';
  reelEl.style.transform = 'translateY(0px)';
}

function spinLotto() {
  if (isSpinning) return;
  const ids = Object.keys(STUDENT_ROSTER);
  if (ids.length === 0) return alert("ไม่พบข้อมูลนักศึกษาในระบบ");

  isSpinning = true;
  const btn = document.getElementById('btnSpin');
  btn.disabled = true;
  btn.innerText = "🎰 กำลังออกรางวัล...";

  document.getElementById('winnerName').innerText = "กำลังสุ่ม...";
  document.getElementById('winnerId').innerText = "รหัสนักศึกษา: ---";

  const luckyId = ids[Math.floor(Math.random() * ids.length)];
  const last3 = luckyId.slice(-3);
  const d1 = parseInt(last3[0], 10);
  const d2 = parseInt(last3[1], 10);
  const d3 = parseInt(last3[2], 10);

  const r1 = document.getElementById('reel1');
  const r2 = document.getElementById('reel2');
  const r3 = document.getElementById('reel3');

  const rounds1 = 4;
  const rounds2 = 6;
  const rounds3 = 8;

  setupReel(r1, d1, rounds1);
  setupReel(r2, d2, rounds2);
  setupReel(r3, d3, rounds3);

  setTimeout(() => {
    const targetY1 = (rounds1 * 10) * DIGIT_HEIGHT;
    const targetY2 = (rounds2 * 10) * DIGIT_HEIGHT;
    const targetY3 = (rounds3 * 10) * DIGIT_HEIGHT;

    r1.style.transition = 'transform 2.5s cubic-bezier(0.12, 0.8, 0.32, 1)';
    r1.style.transform = `translateY(-${targetY1}px)`;

    r2.style.transition = 'transform 3.2s cubic-bezier(0.12, 0.8, 0.32, 1)';
    r2.style.transform = `translateY(-${targetY2}px)`;

    r3.style.transition = 'transform 4.0s cubic-bezier(0.12, 0.8, 0.32, 1)';
    r3.style.transform = `translateY(-${targetY3}px)`;
  }, 50);

  setTimeout(() => {
    document.getElementById('winnerName').innerText = `🎉 ${STUDENT_ROSTER[luckyId]}`;
    document.getElementById('winnerId').innerText = `รหัสนักศึกษา: ${luckyId} (เลขท้าย: ${last3})`;
    btn.disabled = false;
    btn.innerText = "🎰 หมุนวงล้อสุ่มเดี๋ยวนี้!";
    isSpinning = false;
  }, 4100);
}
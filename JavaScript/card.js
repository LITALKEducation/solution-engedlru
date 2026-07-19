/* ════════════════════════════════════════
   บัตรนักศึกษาดิจิทัล (card.html)
   ใช้ auth.js (Auth0) ร่วมกับหน้าอื่น ๆ ในระบบ
   QR เช็คชื่อใช้ endpoint เดียวกับ checkup.html (POST /checkup/qr)
   แต่สร้าง/ต่ออายุอัตโนมัติตราบใดที่หน้ายังเปิดอยู่
════════════════════════════════════════ */

const QR_CARD_URL = `${API_BASE_URL}/checkup/qr`;
const QR_CLOSED_RETRY_MS = 20000;   // ไม่มีกิจกรรมเปิดอยู่ — ลองใหม่ทุก 20 วิ
const QR_ERROR_RETRY_MS = 15000;    // เชื่อมต่อผิดพลาด — ลองใหม่ทุก 15 วิ

let cardStudentId = '';
let cardDisplayName = '';
let cardEmail = '';

let qrAttemptTimer = null;
let qrCountdownTimer = null;
let qrExpiresAt = null;

function cardEscHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
}

/* ────────────────────────────────────────
   GATE (ยังไม่ล็อกอิน / อีเมลไม่ถูกต้อง)
──────────────────────────────────────── */
function showCardGate(state, email) {
    document.getElementById('cardGate').style.display = 'flex';
    document.getElementById('cardWrap').style.display = 'none';
    stopQrLoop();
    setCardBrightMode(false);

    const title = document.getElementById('cardGateTitle');
    const sub = document.getElementById('cardGateSub');
    const invalidBox = document.getElementById('cardGateInvalidBox');
    const loginBtn = document.getElementById('cardGateLoginBtn');

    if (state === 'invalid') {
        title.textContent = 'อีเมลไม่ถูกต้อง';
        sub.textContent = 'บัญชีที่คุณใช้ล็อกอินไม่ใช่อีเมลนักศึกษาที่ถูกต้อง (ต้องเป็น sb[รหัสนักศึกษา]@lru.ac.th)';
        document.getElementById('cardGateInvalidEmail').textContent = email || '—';
        invalidBox.style.display = 'block';
        loginBtn.style.display = 'none';
    } else {
        title.textContent = 'บัตรนักศึกษาดิจิทัล';
        sub.textContent = 'เข้าสู่ระบบด้วยอีเมลมหาวิทยาลัย (sb[รหัสนักศึกษา]@lru.ac.th) เพื่อดูบัตรของคุณ';
        invalidBox.style.display = 'none';
        loginBtn.style.display = 'flex';
    }
}

/* ────────────────────────────────────────
   แสดงบัตร
──────────────────────────────────────── */
function showCard(studentId, name, email, picture) {
    cardStudentId = studentId;
    cardDisplayName = name;
    cardEmail = email;

    document.getElementById('cardGate').style.display = 'none';
    document.getElementById('cardWrap').style.display = 'block';

    document.getElementById('idCardName').textContent = name || 'นักศึกษา';
    document.getElementById('idCardStudentId').textContent = studentId;
    document.getElementById('idCardEmail').textContent = email || '—';
    document.getElementById('idCardPhoto').src = picture || 'https://s3.ap-southeast-1.amazonaws.com/files.stnetradio.com/logo/ENGEDLOGO.ico';

    setCardBrightMode(true);
    startQrLoop();
}

/* ────────────────────────────────────────
   BRIGHT MODE — บัตรใช้แสดงให้เจ้าหน้าที่สแกน จึงบังคับพื้นหลังสว่าง
   เต็มที่ (ไม่ตามโหมดมืดของเครื่อง) พร้อมกันหน้าจอดับ/หรี่ระหว่างแสดงบัตร
──────────────────────────────────────── */
let cardWakeLock = null;

function setCardBrightMode(on) {
    document.body.classList.toggle('card-bright-mode', on);
    if (on) requestCardWakeLock();
    else releaseCardWakeLock();
}

async function requestCardWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
        cardWakeLock = await navigator.wakeLock.request('screen');
    } catch (err) {
        // ขอไม่สำเร็จ (เช่น แบตเตอรี่ต่ำ) — ปล่อยผ่าน หน้าจอจะดับตามปกติของเครื่อง
        cardWakeLock = null;
    }
}

async function releaseCardWakeLock() {
    if (cardWakeLock) {
        try { await cardWakeLock.release(); } catch (err) { /* no-op */ }
        cardWakeLock = null;
    }
}

// Wake Lock จะถูกปล่อยอัตโนมัติเมื่อสลับแท็บ/ล็อกหน้าจอ — ขอใหม่เมื่อกลับมาที่
// หน้านี้อีกครั้งระหว่างที่ยังแสดงบัตรอยู่
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && document.body.classList.contains('card-bright-mode')) {
        requestCardWakeLock();
    }
});

/* ────────────────────────────────────────
   QR STATE HELPERS
──────────────────────────────────────── */
function setQrState(state) {
    ['qrStateLoading', 'qrStateActive', 'qrStateClosed', 'qrStateError'].forEach((id) => {
        document.getElementById(id).style.display = (id === state) ? 'flex' : 'none';
    });
}

function stopQrLoop() {
    clearTimeout(qrAttemptTimer);
    clearInterval(qrCountdownTimer);
    qrAttemptTimer = null;
    qrCountdownTimer = null;
    qrExpiresAt = null;
}

function scheduleNextAttempt(delayMs) {
    clearTimeout(qrAttemptTimer);
    qrAttemptTimer = setTimeout(attemptGenerateQr, delayMs);
}

function manualRefreshQr() {
    clearTimeout(qrAttemptTimer);
    setQrState('qrStateLoading');
    attemptGenerateQr();
}

function startQrLoop() {
    stopQrLoop();
    setQrState('qrStateLoading');
    attemptGenerateQr();
}

async function attemptGenerateQr() {
    if (!cardStudentId) return;
    try {
        const res = await fetch(QR_CARD_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId: cardStudentId, name: cardDisplayName }),
        });
        const data = await res.json().catch(() => ({}));

        if (data.status === 'success') {
            renderActiveQr(data);
            return;
        }

        const message = data.message || 'ไม่สามารถสร้างรหัส QR ได้';
        if (message.includes('นอกเวลาทำการ')) {
            setQrState('qrStateClosed');
            scheduleNextAttempt(QR_CLOSED_RETRY_MS);
        } else {
            document.getElementById('qrStateErrorMsg').textContent = message;
            setQrState('qrStateError');
            scheduleNextAttempt(QR_ERROR_RETRY_MS);
        }
    } catch (err) {
        document.getElementById('qrStateErrorMsg').textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต';
        setQrState('qrStateError');
        scheduleNextAttempt(QR_ERROR_RETRY_MS);
    }
}

function renderActiveQr(data) {
    if (typeof qrcode === 'undefined') {
        document.getElementById('qrStateErrorMsg').textContent = 'โหลดตัวสร้าง QR ไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ';
        setQrState('qrStateError');
        scheduleNextAttempt(QR_ERROR_RETRY_MS);
        return;
    }
    const qr = qrcode(0, 'M');
    qr.addData(data.code);
    qr.make();
    document.getElementById('qrCardImg').src = qr.createDataURL(8, 4);
    document.getElementById('qrCardCode').textContent = `รหัส: ${data.code}`;
    document.getElementById('qrCardEvent').textContent = data.activityName ? `กิจกรรม: ${data.activityName}` : '';
    setQrState('qrStateActive');

    qrExpiresAt = new Date(data.expiresAt).getTime();
    clearInterval(qrCountdownTimer);
    qrCountdownTimer = setInterval(updateQrCountdown, 1000);
    updateQrCountdown();
}

function updateQrCountdown() {
    if (!qrExpiresAt) return;
    const remainMs = qrExpiresAt - Date.now();
    const remain = Math.max(0, Math.round(remainMs / 1000));
    const m = Math.floor(remain / 60);
    const s = remain % 60;
    document.getElementById('qrCardCountdown').textContent = `หมดอายุใน ${m}:${String(s).padStart(2, '0')}`;

    if (remain <= 0) {
        clearInterval(qrCountdownTimer);
        qrCountdownTimer = null;
        // รหัสหมดอายุ — สร้างรหัสใหม่ให้อัตโนมัติทันที (บัตรยังเปิดหน้าอยู่)
        setQrState('qrStateLoading');
        attemptGenerateQr();
    }
}

/* ────────────────────────────────────────
   AUTH WIRING
──────────────────────────────────────── */
document.addEventListener('authStateChanged', (e) => {
    if (!e.detail.isAuthenticated) {
        showCardGate('login');
        return;
    }

    const email = e.detail.userProfile.email || '';
    const regex = /^sb(\d+)@lru\.ac\.th$/i;
    const match = email.match(regex);

    if (!match) {
        showCardGate('invalid', email);
        return;
    }

    const studentId = match[1];
    const displayName = getCookie('att_name') || e.detail.userProfile.name || e.detail.userProfile.nickname || 'นักศึกษา';
    showCard(studentId, displayName, email, e.detail.userProfile.picture);
});

window.addEventListener('load', () => {
    initAuth();
});

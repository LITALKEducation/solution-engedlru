/* ════════════════════════════════════════
   จุดเช็คชื่อเข้าร่วมกิจกรรม (scan.html) — kiosk เต็มจอสำหรับเจ้าหน้าที่
   ใช้ auth.js (Auth0) ร่วมกับหน้าอื่น ๆ ในระบบ + endpoint เดียวกับ
   หน้า "สแกน QR เช็คชื่อ" ใน admin.html (POST /admin/checkup/qr/scan)
════════════════════════════════════════ */

const RESULT_DISPLAY_MS = 5000;

function scanEscHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
}

/* ────────────────────────────────────────
   SCREEN / STAGE NAVIGATION
──────────────────────────────────────── */
let currentKioskMode = null;
let staffDisplayName = '';

function showScreen(id) {
    ['scanLoginScreen', 'scanModeScreen', 'scanKioskScreen'].forEach((s) => {
        document.getElementById(s).style.display = (s === id) ? 'flex' : 'none';
    });
}

function showStageView(id) {
    document.querySelectorAll('.kiosk-stage-view').forEach((el) => el.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
}

function showFatalError(message) {
    stopCamera();
    showScreen('scanLoginScreen');
    document.getElementById('scanLoginError').textContent = message;
}

/* ────────────────────────────────────────
   AUTH / ADMIN CHECK
──────────────────────────────────────── */
async function checkAdminAndEnter() {
    try {
        const token = await auth0Client.getTokenSilently();
        const res = await fetch(`${API_BASE_URL}/admin/me`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!data.isAdmin) {
            showFatalError('บัญชีนี้ไม่มีสิทธิ์เช็คชื่อ กรุณาติดต่อผู้ดูแลระบบ');
            return;
        }
        staffDisplayName = (userProfile && (userProfile.name || userProfile.nickname)) || data.email || '';
        document.getElementById('scanStaffName').textContent = staffDisplayName ? `— ${staffDisplayName}` : '';
        document.getElementById('scanModeStaffName').textContent = staffDisplayName;
        enterKiosk();
    } catch (err) {
        showFatalError('โหลดข้อมูลบัญชีไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ');
    }
}

function enterKiosk() {
    const savedMode = localStorage.getItem('scan_kiosk_mode');
    if (savedMode && ['desktop', 'ipad', 'phone'].includes(savedMode)) {
        applyKioskMode(savedMode);
    } else {
        showScreen('scanModeScreen');
    }
}

document.addEventListener('authStateChanged', (e) => {
    if (e.detail.isAuthenticated) {
        checkAdminAndEnter();
    } else {
        showScreen('scanLoginScreen');
    }
});

function logoutFromScan() {
    stopCamera();
    logoutUser();
}

/* ────────────────────────────────────────
   DEVICE MODE
──────────────────────────────────────── */
function selectKioskMode(mode) {
    localStorage.setItem('scan_kiosk_mode', mode);
    applyKioskMode(mode);
}

function changeDeviceMode() {
    stopCamera();
    localStorage.removeItem('scan_kiosk_mode');
    currentKioskMode = null;
    delete document.body.dataset.kioskMode;
    showScreen('scanModeScreen');
}

function applyKioskMode(mode) {
    currentKioskMode = mode;
    document.body.dataset.kioskMode = mode;
    showScreen('scanKioskScreen');
    stopCamera();
    document.getElementById('cameraUnavailable').style.display = 'none';

    if (mode === 'desktop') {
        showStageView('stageDesktopWelcome');
        initBarcodeInput();
        initManualForm();
    } else if (mode === 'ipad') {
        showStageView('stageIpadIdle');
    } else if (mode === 'phone') {
        showStageView('stageCamera');
        startCamera('environment');
    }
}

async function attemptDesktopCamera() {
    showStageView('stageCamera');
    const ok = await startCamera();
    if (!ok) {
        document.getElementById('cameraUnavailable').style.display = 'flex';
    }
}

function backToWelcome() {
    stopCamera();
    if (currentKioskMode === 'desktop') showStageView('stageDesktopWelcome');
    else if (currentKioskMode === 'ipad') showStageView('stageIpadIdle');
}

function startIpadScan() {
    showStageView('stageCamera');
    startCamera('user');
}

/* ────────────────────────────────────────
   FEEDBACK — vibration + synthesized beep
──────────────────────────────────────── */
let audioCtx = null;
function getAudioCtx() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    if (!audioCtx) audioCtx = new AudioCtor();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
}

function playTones(frequencies, { duration = 0.12, gap = 0.03, type = 'sine' } = {}) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    let t = ctx.currentTime;
    frequencies.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + duration + 0.02);
        t += duration + gap;
    });
}

function feedbackSuccess() {
    if (navigator.vibrate) navigator.vibrate(80);
    playTones([880, 1320]);
}

function feedbackError() {
    if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
    playTones([320], { duration: 0.22, gap: 0, type: 'square' });
}

/* ────────────────────────────────────────
   RESULT OVERLAY
──────────────────────────────────────── */
let resultResetTimer = null;

function formatResultTime() {
    return new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function showLoadingResult() {
    if (resultResetTimer) { clearTimeout(resultResetTimer); resultResetTimer = null; }
    document.getElementById('scanResultBanner').className = 'scan-result-banner loading';
    document.getElementById('scanResultBadge').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังตรวจสอบ...';
    document.getElementById('scanResultAvatar').textContent = '';
    document.getElementById('scanResultName').textContent = 'กำลังตรวจสอบ...';
    document.getElementById('scanResultId').textContent = '';
    document.getElementById('scanResultTime').textContent = '';
    document.getElementById('scanResult').classList.add('show');
}

function showErrorResult(message) {
    feedbackError();
    document.getElementById('scanResultBanner').className = 'scan-result-banner error';
    document.getElementById('scanResultBadge').innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ไม่สำเร็จ';
    document.getElementById('scanResultAvatar').textContent = '!';
    document.getElementById('scanResultName').textContent = message;
    document.getElementById('scanResultId').textContent = '';
    document.getElementById('scanResultTime').textContent = formatResultTime();
    scheduleResultDismiss();
}

function showSuccessResult(data) {
    feedbackSuccess();
    scanSessionCount++;
    document.getElementById('scanSessionCount').textContent = scanSessionCount;
    document.getElementById('scanResultBanner').className = 'scan-result-banner success';
    document.getElementById('scanResultBadge').innerHTML = '<i class="fa-solid fa-circle-check"></i> เช็คชื่อสำเร็จ';
    document.getElementById('scanResultAvatar').textContent = (data.name || data.studentId || '').trim().charAt(0).toUpperCase();
    document.getElementById('scanResultName').textContent = data.name || data.studentId;
    document.getElementById('scanResultId').textContent = `รหัสนักศึกษา: ${data.studentId}`;
    document.getElementById('scanResultTime').textContent = formatResultTime();
    scheduleResultDismiss();
}

function scheduleResultDismiss() {
    if (resultResetTimer) clearTimeout(resultResetTimer);
    resultResetTimer = setTimeout(returnToIdleAfterResult, RESULT_DISPLAY_MS);
}

function returnToIdleAfterResult() {
    resultResetTimer = null;
    document.getElementById('scanResult').classList.remove('show');
    if (currentKioskMode === 'desktop') {
        stopCamera();
        showStageView('stageDesktopWelcome');
    } else if (currentKioskMode === 'ipad') {
        stopCamera();
        showStageView('stageIpadIdle');
    }
    // Phone mode has no separate idle screen — the camera keeps running.
}

/* ────────────────────────────────────────
   SCAN SUBMISSION (shared by camera / barcode reader / manual entry)
──────────────────────────────────────── */
let scanSessionCount = 0;
let scanBusy = false;
let lastCode = null;
let lastCodeAt = 0;

async function submitScan(rawCode) {
    const code = (rawCode || '').trim();
    if (!code) return;
    const now = Date.now();
    if (scanBusy) return;
    if (code === lastCode && now - lastCodeAt < 4000) return;
    lastCode = code;
    lastCodeAt = now;
    scanBusy = true;

    showLoadingResult();
    try {
        const token = await auth0Client.getTokenSilently();
        const res = await fetch(`${API_BASE_URL}/admin/checkup/qr/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ code }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.status !== 'success') {
            showErrorResult(data.message || data.error || 'สแกนไม่สำเร็จ');
        } else {
            showSuccessResult(data);
        }
    } catch (err) {
        showErrorResult('เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่');
    } finally {
        setTimeout(() => { scanBusy = false; }, 1500);
    }
}

/* ────────────────────────────────────────
   CAMERA QR SCANNING (jsQR)
──────────────────────────────────────── */
let videoStream = null;
let decoding = false;

async function startCamera(facingMode) {
    const video = document.getElementById('scanVideo');
    document.getElementById('cameraUnavailable').style.display = 'none';
    const videoConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };
    if (facingMode) videoConstraints.facingMode = { ideal: facingMode };
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
        video.srcObject = videoStream;
        await video.play();
        requestAnimationFrame(scanLoop);
        return true;
    } catch (err) {
        console.warn('Camera unavailable:', err);
        videoStream = null;
        return false;
    }
}

function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach((t) => t.stop());
        videoStream = null;
    }
    const video = document.getElementById('scanVideo');
    if (video) video.srcObject = null;
}

async function scanLoop() {
    const video = document.getElementById('scanVideo');
    if (videoStream && video.readyState === video.HAVE_ENOUGH_DATA && !scanBusy && !decoding) {
        decoding = true;
        try {
            if (typeof jsQR !== 'undefined') {
                const canvas = document.getElementById('scanCanvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);
                if (code && code.data) submitScan(code.data.trim());
            }
        } catch (err) {
            // Transient decode failures are normal — nothing to surface.
        }
        decoding = false;
    }
    if (videoStream) requestAnimationFrame(scanLoop);
}

/* ────────────────────────────────────────
   BARCODE-READER (keyboard-emulating) + MANUAL ENTRY
──────────────────────────────────────── */
function initBarcodeInput() {
    const input = document.getElementById('scanHiddenInput');
    const refocus = () => {
        if (document.activeElement === document.getElementById('scanManualInput')) return;
        if (document.activeElement !== input) input.focus({ preventScroll: true });
    };
    setInterval(refocus, 500);
    document.addEventListener('click', refocus);
    input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const value = input.value;
        input.value = '';
        if (value.trim()) submitScan(value);
    });
    refocus();
}

function initManualForm() {
    const form = document.getElementById('scanManualForm');
    const input = document.getElementById('scanManualInput');
    if (form.dataset.wired) return;
    form.dataset.wired = '1';
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const val = input.value.trim();
        input.value = '';
        if (val) submitScan(val);
    });
}

/* ────────────────────────────────────────
   ENTRY
──────────────────────────────────────── */
window.addEventListener('load', () => {
    initAuth();
});

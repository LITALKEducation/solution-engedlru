/* ════════════════════════════════════════
   Admin Dashboard — เชื่อมต่อ Cloudflare Worker API
════════════════════════════════════════ */
let currentAdminEmail = null;
let scheduleEditingId = null;
let qrStream = null;
let qrScanning = false;

function escHtmlAdmin(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function adminFetch(path, options = {}) {
    const token = await auth0Client.getTokenSilently();
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
}

function showGate(id) {
    document.getElementById('gateWrap').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    ['loadingScreen', 'authScreen', 'deniedScreen'].forEach(s => {
        document.getElementById(s).style.display = (s === id) ? 'block' : 'none';
    });
}

async function checkAdminAccess() {
    showGate('loadingScreen');
    try {
        const res = await adminFetch('/admin/me');
        const data = await res.json();
        if (data.isAdmin) {
            currentAdminEmail = data.email;
            document.getElementById('gateWrap').classList.add('hidden');
            document.getElementById('mainApp').classList.remove('hidden');
            switchTab('checkin');
        } else {
            document.getElementById('deniedEmail').textContent = data.email || '—';
            showGate('deniedScreen');
        }
    } catch (e) {
        showGate('deniedScreen');
    }
}

document.addEventListener('authStateChanged', (e) => {
    if (e.detail.isAuthenticated) checkAdminAccess();
    else showGate('authScreen');
});

/* ════ TABS ════ */
let currentAdminTab = 'checkin';
function switchTab(tab) {
    if (currentAdminTab === 'qr' && tab !== 'qr') stopQrScan();
    currentAdminTab = tab;

    document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
    if (tab === 'checkin') loadCheckinTab();
    if (tab === 'schedule') loadScheduleTab();
    if (tab === 'tokens') loadTokensTab();
    if (tab === 'admins') loadAdminsTab();
}

document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

/* ════ CHECK-IN LOGS ════ */
async function loadCheckinTab() {
    const res = await adminFetch('/admin/checkup/schedule');
    const schedules = await res.json();
    const sel = document.getElementById('checkinScheduleFilter');
    const prev = sel.value;
    sel.innerHTML = '<option value="">ทุกกิจกรรม</option>' +
        schedules.map(s => `<option value="${s.id}">${escHtmlAdmin(s.name)}</option>`).join('');
    sel.value = prev;
    await refreshCheckinLogs();
}

async function refreshCheckinLogs() {
    const id = document.getElementById('checkinScheduleFilter').value;
    const res = await adminFetch(`/admin/checkup/logs${id ? '?scheduleId=' + encodeURIComponent(id) : ''}`);
    const rows = await res.json();
    const tbody = document.getElementById('checkinTableBody');
    tbody.innerHTML = rows.map(r => `<tr>
        <td>${escHtmlAdmin(r.created_at)}</td>
        <td>${escHtmlAdmin(r.student_id)}</td>
        <td>${escHtmlAdmin(r.name)}</td>
        <td>${escHtmlAdmin(r.schedule_name || '-')}</td>
        <td><span class="admin-pill ${r.method}">${r.method === 'qr' ? 'QR' : 'GPS'}</span></td>
        <td>${r.distance != null ? r.distance + ' ม.' : '-'}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--ink-30)">ไม่มีข้อมูล</td></tr>';
    document.getElementById('checkinCount').textContent = rows.length;
}

document.getElementById('checkinScheduleFilter').addEventListener('change', refreshCheckinLogs);

document.getElementById('exportCheckinCsvBtn').addEventListener('click', async () => {
    const id = document.getElementById('checkinScheduleFilter').value;
    const res = await adminFetch(`/admin/checkup/logs/export.csv${id ? '?scheduleId=' + encodeURIComponent(id) : ''}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'checkin-log.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
});

/* ════ SCHEDULE + COORDINATES ════ */
async function loadScheduleTab() {
    const res = await adminFetch('/admin/checkup/schedule');
    const rows = await res.json();
    window._scheduleRows = rows;
    const tbody = document.getElementById('scheduleTableBody');
    tbody.innerHTML = rows.map(r => `<tr>
        <td>${r.id}</td>
        <td>${escHtmlAdmin(r.name)}</td>
        <td>${escHtmlAdmin(r.open_at)}</td>
        <td>${escHtmlAdmin(r.close_at)}</td>
        <td>${r.lat ?? '-'}, ${r.lng ?? '-'}</td>
        <td>${r.radius_m} ม.</td>
        <td>
            <button class="admin-btn" onclick="editSchedule(${r.id})">แก้ไข</button>
            <button class="admin-btn danger" onclick="deleteScheduleRow(${r.id})">ลบ</button>
        </td>
    </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--ink-30)">ยังไม่มีกิจกรรม</td></tr>';
}

function editSchedule(id) {
    const row = (window._scheduleRows || []).find(r => r.id === id);
    if (!row) return;
    scheduleEditingId = id;
    document.getElementById('schName').value = row.name;
    document.getElementById('schOpen').value = row.open_at.replace(' ', 'T');
    document.getElementById('schClose').value = row.close_at.replace(' ', 'T');
    document.getElementById('schLat').value = row.lat ?? '';
    document.getElementById('schLng').value = row.lng ?? '';
    document.getElementById('schRadius').value = row.radius_m;
    document.getElementById('scheduleFormSubmitBtn').textContent = 'บันทึกการแก้ไข';
    document.getElementById('scheduleFormCancelBtn').style.display = 'inline-block';
    document.getElementById('schName').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelScheduleEdit() {
    scheduleEditingId = null;
    document.getElementById('scheduleForm').reset();
    document.getElementById('schRadius').value = 100;
    document.getElementById('scheduleFormSubmitBtn').textContent = 'เพิ่มกิจกรรม';
    document.getElementById('scheduleFormCancelBtn').style.display = 'none';
}

async function deleteScheduleRow(id) {
    if (!confirm('ยืนยันการลบกิจกรรมนี้? ประวัติเช็คชื่อที่ผูกกับกิจกรรมนี้จะยังคงอยู่')) return;
    await adminFetch(`/admin/checkup/schedule/${id}`, { method: 'DELETE' });
    loadScheduleTab();
}

function useCurrentLocationForSchedule() {
    if (!navigator.geolocation) { alert('อุปกรณ์นี้ไม่รองรับ GPS'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
        document.getElementById('schLat').value = pos.coords.latitude.toFixed(7);
        document.getElementById('schLng').value = pos.coords.longitude.toFixed(7);
    }, () => alert('ไม่สามารถระบุตำแหน่งปัจจุบันได้'));
}

document.getElementById('scheduleForm').addEventListener('submit', async e => {
    e.preventDefault();
    const body = {
        name: document.getElementById('schName').value.trim(),
        open_at: document.getElementById('schOpen').value.trim().replace('T', ' '),
        close_at: document.getElementById('schClose').value.trim().replace('T', ' '),
        lat: document.getElementById('schLat').value || null,
        lng: document.getElementById('schLng').value || null,
        radius_m: document.getElementById('schRadius').value || 100
    };
    const path = scheduleEditingId ? `/admin/checkup/schedule/${scheduleEditingId}` : '/admin/checkup/schedule';
    const method = scheduleEditingId ? 'PUT' : 'POST';
    const res = await adminFetch(path, { method, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.status === 'success') {
        cancelScheduleEdit();
        loadScheduleTab();
    } else {
        alert(data.error || 'เกิดข้อผิดพลาด');
    }
});

document.getElementById('scheduleFormCancelBtn').addEventListener('click', cancelScheduleEdit);

/* ════ TOKEN CSV IMPORT ════ */
async function downloadCsvTemplate() {
    const res = await adminFetch('/admin/tokens/template.csv');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'token-template.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
}

document.getElementById('downloadTemplateBtn').addEventListener('click', downloadCsvTemplate);

document.getElementById('importCsvBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('csvFile');
    const msg = document.getElementById('importResultMsg');
    msg.className = 'admin-msg';
    if (!fileInput.files.length) { alert('กรุณาเลือกไฟล์ CSV'); return; }

    const text = await fileInput.files[0].text();
    const mode = document.getElementById('csvReplaceMode').checked ? 'replace' : 'append';
    const btn = document.getElementById('importCsvBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="loader-mini"></div> กำลังนำเข้า...';
    try {
        const res = await adminFetch('/admin/tokens/import', { method: 'POST', body: JSON.stringify({ csv: text, mode }) });
        const data = await res.json();
        if (data.status === 'success') {
            msg.className = 'admin-msg success show';
            msg.textContent = `นำเข้าสำเร็จ: กิจกรรม ${data.insertedActivities} รายการ, ข้อมูล ${data.insertedRecords} แถว (ข้าม ${data.skipped} แถว)` +
                (data.errors?.length ? ' — ' + data.errors.slice(0, 5).join('; ') : '');
        } else {
            msg.className = 'admin-msg error show';
            msg.textContent = data.error || 'เกิดข้อผิดพลาด';
        }
    } catch (e) {
        msg.className = 'admin-msg error show';
        msg.textContent = 'เกิดข้อผิดพลาด: ' + e.message;
    } finally {
        btn.disabled = false;
        btn.textContent = 'นำเข้าข้อมูล';
        fileInput.value = '';
    }
});

/* ════ TOKEN MANUAL ENTRY + BROWSE/DELETE ════ */
const MAX_TOKEN_PAIRS = 5;

async function loadTokensTab() {
    try {
        const res = await fetch(`${API_BASE_URL}/tokens?action=getActivities`);
        const activities = await res.json();
        document.getElementById('activityDatalist').innerHTML =
            activities.map(a => `<option value="${escHtmlAdmin(a)}">`).join('');
    } catch (e) { /* ไม่ critical ถ้าโหลด datalist ไม่สำเร็จ */ }

    if (!document.getElementById('trPairsWrap').children.length) {
        document.getElementById('trPairsWrap').innerHTML = Array.from({ length: MAX_TOKEN_PAIRS }, (_, i) => `
            <div class="admin-row">
                <span style="width:60px;color:var(--ink-50);font-size:var(--font-size-sm)">คู่ที่ ${i + 1}</span>
                <input class="admin-input" id="trCode${i + 1}" placeholder="รหัสกิจกรรม">
                <input class="admin-input" id="trToken${i + 1}" placeholder="Token Key">
            </div>`).join('');
    }
}

document.getElementById('tokenRecordForm').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = document.getElementById('tokenRecordMsg');
    msg.className = 'admin-msg';

    const activityName = document.getElementById('trActivity').value.trim();
    const studentId = document.getElementById('trStudentId').value.trim();
    const studentName = document.getElementById('trStudentName').value.trim();
    const studentGroup = document.getElementById('trStudentGroup').value.trim();
    const pairs = [];
    for (let i = 1; i <= MAX_TOKEN_PAIRS; i++) {
        const code = document.getElementById(`trCode${i}`).value.trim();
        const token = document.getElementById(`trToken${i}`).value.trim();
        if (code || token) pairs.push({ code, token });
    }

    if (!activityName || !studentId) { alert('กรุณากรอกชื่อกิจกรรมและรหัสนักศึกษา'); return; }
    if (!pairs.length) { alert('กรุณากรอกรหัสหรือ Token อย่างน้อย 1 คู่'); return; }

    try {
        const res = await adminFetch('/admin/tokens/records', {
            method: 'POST',
            body: JSON.stringify({ activityName, studentId, studentName, studentGroup, pairs })
        });
        const data = await res.json();
        if (data.status === 'success') {
            msg.className = 'admin-msg success show';
            msg.textContent = `เพิ่มข้อมูลสำเร็จ ${data.inserted} รายการ`;
            document.getElementById('tokenRecordForm').reset();
            loadTokensTab();
        } else {
            msg.className = 'admin-msg error show';
            msg.textContent = data.error || 'เกิดข้อผิดพลาด';
        }
    } catch (e) {
        msg.className = 'admin-msg error show';
        msg.textContent = 'เกิดข้อผิดพลาด: ' + e.message;
    }
});

async function searchTokenRecords() {
    const activity = document.getElementById('trSearchActivity').value.trim();
    const tbody = document.getElementById('trRecordsBody');
    if (!activity) { tbody.innerHTML = ''; return; }

    const res = await adminFetch(`/admin/tokens/records?activity=${encodeURIComponent(activity)}`);
    const rows = await res.json();
    tbody.innerHTML = rows.map(r => `<tr>
        <td>${escHtmlAdmin(r.student_id)}</td>
        <td>${escHtmlAdmin(r.student_name || '-')}</td>
        <td>${escHtmlAdmin(r.student_group || '-')}</td>
        <td>${escHtmlAdmin(r.code || '-')}</td>
        <td>${escHtmlAdmin(r.token || '-')}</td>
        <td><button class="admin-btn danger" onclick="deleteTokenRecordRow(${r.id})">ลบ</button></td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--ink-30)">ไม่พบข้อมูล</td></tr>';
}

async function deleteTokenRecordRow(id) {
    if (!confirm('ยืนยันการลบรายการนี้?')) return;
    await adminFetch(`/admin/tokens/records/${id}`, { method: 'DELETE' });
    searchTokenRecords();
}

document.getElementById('trSearchBtn').addEventListener('click', searchTokenRecords);

/* ════ QR SCAN (ต่อเนื่อง) ════ */
let qrProcessing = false;
let qrSessionCount = 0;
let qrHistory = [];

async function startQrScan() {
    const video = document.getElementById('qrVideo');
    try {
        qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (e) {
        alert('ไม่สามารถเข้าถึงกล้องได้: ' + e.message);
        return;
    }
    video.srcObject = qrStream;
    await video.play();
    qrScanning = true;
    document.getElementById('startScanBtn').style.display = 'none';
    document.getElementById('stopScanBtn').style.display = 'inline-block';
    document.getElementById('qrLiveBadge').style.display = 'flex';
    requestAnimationFrame(scanQrFrame);
}

function stopQrScan() {
    qrScanning = false;
    qrProcessing = false;
    if (qrStream) { qrStream.getTracks().forEach(t => t.stop()); qrStream = null; }
    document.getElementById('startScanBtn').style.display = 'inline-block';
    document.getElementById('stopScanBtn').style.display = 'none';
    document.getElementById('qrLiveBadge').style.display = 'none';
}

function scanQrFrame() {
    if (!qrScanning) return;
    if (!qrProcessing) {
        const video = document.getElementById('qrVideo');
        const canvas = document.getElementById('qrCanvas');
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code && code.data) {
                qrProcessing = true;
                submitQrCode(code.data.trim()).finally(() => {
                    // หน่วงเล็กน้อยก่อนสแกนรอบต่อไป กันดึงรหัสเดิมซ้ำระหว่างขยับมือถือออก
                    setTimeout(() => { qrProcessing = false; }, 1500);
                });
            }
        }
    }
    requestAnimationFrame(scanQrFrame);
}

document.getElementById('startScanBtn').addEventListener('click', startQrScan);
document.getElementById('stopScanBtn').addEventListener('click', stopQrScan);

document.getElementById('qrManualForm').addEventListener('submit', e => {
    e.preventDefault();
    const input = document.getElementById('qrManualInput');
    const val = input.value.trim();
    if (val) submitQrCode(val);
    input.value = '';
});

function flashVideoWrap(ok) {
    const wrap = document.getElementById('qrVideoWrap');
    wrap.classList.remove('flash-success', 'flash-error');
    wrap.classList.add(ok ? 'flash-success' : 'flash-error');
    setTimeout(() => wrap.classList.remove('flash-success', 'flash-error'), 700);
}

function renderQrHistory() {
    const list = document.getElementById('qrHistoryList');
    if (!qrHistory.length) {
        list.innerHTML = '<div class="qr-history-empty">ยังไม่มีการสแกนในรอบนี้</div>';
        return;
    }
    list.innerHTML = qrHistory.slice(0, 20).map(h => `
        <div class="qr-history-item ${h.ok ? 'success' : 'error'}">
            <i class="fa-solid ${h.ok ? 'fa-circle-check' : 'fa-circle-xmark'} qr-history-icon"></i>
            <div class="qr-history-main">
                <div class="qr-history-name">${escHtmlAdmin(h.title)}</div>
                <div class="qr-history-sub">${escHtmlAdmin(h.sub)}</div>
            </div>
            <div class="qr-history-time">${h.time}</div>
        </div>`).join('');
}

async function submitQrCode(code) {
    const resultBox = document.getElementById('qrResultBox');
    resultBox.innerHTML = '<div class="qr-result-card"><div class="loader-mini"></div> กำลังตรวจสอบ...</div>';
    const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    try {
        const res = await adminFetch('/admin/checkup/qr/scan', { method: 'POST', body: JSON.stringify({ code }) });
        const data = await res.json();
        if (data.status === 'success') {
            flashVideoWrap(true);
            qrSessionCount++;
            document.getElementById('qrSessionCount').textContent = qrSessionCount;
            resultBox.innerHTML = `<div class="qr-result-card success">
                <i class="fa-solid fa-circle-check" style="color:var(--success);font-size:32px"></i>
                <div class="qr-result-code">${escHtmlAdmin(data.code)}</div>
                <div>${escHtmlAdmin(data.name)} (${escHtmlAdmin(data.studentId)})</div>
                <div style="color:var(--success);font-weight:700;margin-top:6px">เช็คชื่อสำเร็จ</div>
            </div>`;
            qrHistory.unshift({ ok: true, title: data.name, sub: `${data.studentId} · รหัส ${data.code}`, time });
        } else {
            flashVideoWrap(false);
            const message = data.message || data.error || 'ไม่สามารถยืนยันได้';
            resultBox.innerHTML = `<div class="qr-result-card error">
                <i class="fa-solid fa-circle-xmark" style="color:var(--error);font-size:32px"></i>
                <div style="margin-top:8px">${escHtmlAdmin(message)}</div>
            </div>`;
            qrHistory.unshift({ ok: false, title: 'ไม่สำเร็จ', sub: `${message} · รหัส ${code}`, time });
        }
    } catch (e) {
        flashVideoWrap(false);
        resultBox.innerHTML = `<div class="qr-result-card error">เกิดข้อผิดพลาด: ${escHtmlAdmin(e.message)}</div>`;
        qrHistory.unshift({ ok: false, title: 'เกิดข้อผิดพลาด', sub: e.message, time });
    }
    renderQrHistory();
}

/* ════ ADMIN EMAIL MANAGEMENT ════ */
async function loadAdminsTab() {
    const res = await adminFetch('/admin/admins');
    const rows = await res.json();
    const tbody = document.getElementById('adminListBody');
    tbody.innerHTML = rows.map(r => `<tr>
        <td>${escHtmlAdmin(r.email)}</td>
        <td>${escHtmlAdmin(r.created_at)}</td>
        <td>${r.email === currentAdminEmail
            ? '<span style="color:var(--ink-30)">คุณ</span>'
            : `<button class="admin-btn danger" onclick="removeAdminRow('${r.email.replace(/'/g, "\\'")}')">ลบ</button>`}</td>
    </tr>`).join('');
}

async function removeAdminRow(email) {
    if (!confirm(`ยืนยันการลบสิทธิ์แอดมิน ${email}?`)) return;
    await adminFetch(`/admin/admins/${encodeURIComponent(email)}`, { method: 'DELETE' });
    loadAdminsTab();
}

document.getElementById('addAdminForm').addEventListener('submit', async e => {
    e.preventDefault();
    const input = document.getElementById('newAdminEmail');
    const email = input.value.trim();
    if (!email) return;
    const res = await adminFetch('/admin/admins', { method: 'POST', body: JSON.stringify({ email }) });
    const data = await res.json();
    if (data.status === 'success') { input.value = ''; loadAdminsTab(); }
    else alert(data.error || 'เกิดข้อผิดพลาด');
});

document.addEventListener('DOMContentLoaded', () => { initAuth(); });

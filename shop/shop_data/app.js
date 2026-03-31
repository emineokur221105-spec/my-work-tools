// === app.js : 主程式與互動邏輯 (多日獨立存檔 + 智慧沿用版) ===

let currentActiveDate = ""; 
let currentDbRef = null;

function formatZeroPadDate(dateStr) {
    if (!dateStr) return "";
    let parts = dateStr.replace(/-/g, '/').split('/');
    if (parts.length === 2) { return parts[0].padStart(2, '0') + '/' + parts[1].padStart(2, '0'); }
    return dateStr;
}

function getTodayDateStr() {
    const d = new Date();
    if (d.getHours() < 11) {
        d.setDate(d.getDate() - 1);
    }
    let m = d.getMonth() + 1;
    let day = d.getDate();
    return formatZeroPadDate(`${m}/${day}`);
}

function getOffsetDateStr(baseDateStr, offset) {
    let parts = baseDateStr.split('/');
    let d = new Date(new Date().getFullYear(), parseInt(parts[0]) - 1, parseInt(parts[1]));
    d.setDate(d.getDate() + offset);
    let m = d.getMonth() + 1; let day = d.getDate();
    return (m < 10 ? '0' + m : m) + '/' + (day < 10 ? '0' + day : day);
}

async function initSchedule() {
    syncStatus.style.background = "orange";
    cleanupOldData();
    try {
        const snap = await db.ref('shop_v8_global_settings').once('value');
        const val = snap.val() || {};
        REGIONS = val.regions || []; 
        roomConfig = val.roomConfig || {}; 
        services = val.services || [];
        regionPrefixes = val.regionPrefixes || {}; 
        
        const openEl = document.getElementById('openHour'); const closeEl = document.getElementById('closeHour');
        if (openEl && val.openHour) openEl.value = val.openHour;
        if (closeEl && val.closeHour) closeEl.value = val.closeHour;
        renderRegionTabs(); renderServices();
        
        const initialDate = localStorage.getItem('lastActiveDate') || getTodayDateStr();
        await switchDate(initialDate);
        
        db.ref('shop_v8_global_settings').on('value', snap => {
            const updatedVal = snap.val() || {};
            REGIONS = updatedVal.regions || []; 
            roomConfig = updatedVal.roomConfig || {}; 
            services = updatedVal.services || [];
            regionPrefixes = updatedVal.regionPrefixes || {}; 
            
            const activeEl = document.activeElement; const isTyping = activeEl && (activeEl.tagName === 'INPUT');
            if(updatedVal.openHour && !isTyping && activeEl.id !== 'openHour') document.getElementById('openHour').value = updatedVal.openHour;
            if(updatedVal.closeHour && !isTyping && activeEl.id !== 'closeHour') document.getElementById('closeHour').value = updatedVal.closeHour;
            renderRegionTabs(); renderServices();
        });
        setInterval(updateTimeLineAndClock, 1000);
        if (typeof rightContent !== 'undefined' && typeof leftContent !== 'undefined' && typeof rulerContainer !== 'undefined') {
            rightContent.addEventListener('scroll', () => { leftContent.scrollTop = rightContent.scrollTop; rulerContainer.scrollLeft = rightContent.scrollLeft; });
        }
        document.body.addEventListener('click', function() { requestNotificationPermission(); }, { once: true });
    } catch (e) { console.error("初始化失敗:", e); syncStatus.style.background = "red"; }
}

function cleanupOldData() {
    const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000); 
    db.ref('shop_v8_daily_schedules').once('value').then(snap => {
        const data = snap.val() || {};
        for (let key in data) {
            let ts = data[key].timestamp;
            if (!ts) { let parts = key.split('-'); if(parts.length === 2) { let d = new Date(new Date().getFullYear(), parseInt(parts[0])-1, parseInt(parts[1])); if (d.getTime() > Date.now() + 86400000) d.setFullYear(d.getFullYear() - 1); ts = d.getTime(); } else { ts = Date.now(); } }
            if (ts < cutoff) { db.ref(`shop_v8_daily_schedules/${key}`).remove(); }
        }
    });
    db.ref('shop_v8_daily_summaries').once('value').then(snap => {
        const data = snap.val() || {};
        for (let key in data) { let ts = data[key].timestamp; if(ts && ts < cutoff) { db.ref(`shop_v8_daily_summaries/${key}`).remove(); } }
    });
}

async function switchDate(newDateStr) {
    if (currentDbRef) currentDbRef.off(); 
    let formattedDate = formatZeroPadDate(newDateStr); currentActiveDate = formattedDate;
    
    document.getElementById('dateInput').value = formattedDate; 
    const navDateDisplay = document.getElementById('navDateDisplay'); if(navDateDisplay) navDateDisplay.innerText = formattedDate;
    const settleDateInput = document.getElementById('settleDateInput'); if(settleDateInput) settleDateInput.value = formattedDate;
    const settleDateDisplay = document.getElementById('settleDateDisplay'); if(settleDateDisplay) settleDateDisplay.innerText = formattedDate;
    
    localStorage.setItem('lastActiveDate', formattedDate);
    const safeDate = formattedDate.replace(/\//g, '-'); currentDbRef = db.ref('shop_v8_daily_schedules/' + safeDate);
    syncStatus.style.background = "orange";
    let snap = await currentDbRef.once('value'); let val = snap.val();
    let isEmpty = false; if (!val || !val.staffData) { isEmpty = true; } else { let arr = Array.isArray(val.staffData) ? val.staffData : Object.values(val.staffData); if (arr.length === 0) isEmpty = true; }
    if (isEmpty) {
        let prevDateStr = getOffsetDateStr(formattedDate, -1); let prevSafeDate = prevDateStr.replace(/\//g, '-'); let prevSnap = await db.ref('shop_v8_daily_schedules/' + prevSafeDate).once('value'); let prevVal = prevSnap.val();
        let newStaffData = []; let prevArr = (prevVal && prevVal.staffData) ? (Array.isArray(prevVal.staffData) ? prevVal.staffData : Object.values(prevVal.staffData)) : [];
        if (prevArr.length > 0) { newStaffData = prevArr.map(s => ({ ...s, content: "", taskStatuses: {}, overrides: {}, manualExpense: 0 })); } 
        else if (staffData && staffData.length > 0) { newStaffData = staffData.map(s => ({ ...s, content: "", taskStatuses: {}, overrides: {}, manualExpense: 0 })); } 
        else { newStaffData = generateEmptyStaffFromConfig(); }
        if (newStaffData.length === 0) { newStaffData = generateEmptyStaffFromConfig(); }
        await currentDbRef.set({ date: formattedDate, isLocked: false, staffData: newStaffData, timestamp: Date.now() });
    }
    currentDbRef.on('value', (snapshot) => {
        const data = snapshot.val() || {}; const activeEl = document.activeElement; const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.getAttribute('contenteditable') === 'true');
        let rawStaffData = data.staffData || []; if (!Array.isArray(rawStaffData) && typeof rawStaffData === 'object') rawStaffData = Object.values(rawStaffData);
        isLocked = data.isLocked || false;
        staffData = rawStaffData.map(s => ({ ...s, taskStatuses: s.taskStatuses || {}, overrides: s.overrides || {}, customConfig: s.customConfig || { enabled: false, comm: {}, cost: {}, work: {} }, region: s.region || (REGIONS.length > 0 ? REGIONS[0] : "未分類"), attendance: s.attendance !== false }));
        if (!isTyping) { renderScheduleAll(); if (document.getElementById('view-settle').classList.contains('active')) { renderSettlementTable(); } } else { requestAnimationFrame(renderTracksOnly); }
        updateLockUI(); syncStatus.style.background = "#2ecc71";
    });
}

function generateEmptyStaffFromConfig() { let newStaff = []; let idCounter = Date.now(); REGIONS.forEach(region => { const rooms = roomConfig[region] || []; rooms.forEach(roomName => { newStaff.push({ id: idCounter++, name: "", roomName: roomName, content: "", height: null, taskStatuses: {}, overrides: {}, customConfig: {enabled: false}, region: region, attendance: true }); }); }); return newStaff; }

function saveScheduleData() {
    syncStatus.style.background = "red"; const openHour = parseInt(document.getElementById('openHour').value) || 12; const closeHour = parseInt(document.getElementById('closeHour').value) || 26;
    db.ref('shop_v8_global_settings').update({ regions: REGIONS, roomConfig: roomConfig, services: services, openHour: openHour, closeHour: closeHour, regionPrefixes: regionPrefixes });
    
    staffData.sort((a, b) => { let indexA = REGIONS.indexOf(a.region); let indexB = REGIONS.indexOf(b.region); if (indexA === -1) indexA = 999; if (indexB === -1) indexB = 999; if (indexA !== indexB) return indexA - indexB; let rooms = roomConfig[a.region] || []; let roomIdxA = rooms.indexOf(a.roomName); let roomIdxB = rooms.indexOf(b.roomName); if (roomIdxA === -1) roomIdxA = 999; if (roomIdxB === -1) roomIdxB = 999; if (roomIdxA !== roomIdxB) return roomIdxA - roomIdxB; return a.id - b.id; });
    const safeDate = currentActiveDate.replace(/\//g, '-'); const dailyDataToSave = { staffData: staffData, isLocked: isLocked, date: currentActiveDate, timestamp: Date.now() };
    db.ref('shop_v8_daily_schedules/' + safeDate).update(dailyDataToSave).then(() => { syncStatus.style.background = "#2ecc71"; }).catch(error => { console.error("Firebase Save Error:", error); syncStatus.style.background = "#f1c40f"; });
}

function changeDay(offset) { if (!currentActiveDate) return; let newDateStr = getOffsetDateStr(currentActiveDate, offset); switchDate(newDateStr); }
function goToToday() { switchDate(getTodayDateStr()); }
function promptForDate() { const input = prompt("請輸入要跳轉的日期 (格式 MM/DD，例如 03/20)：", currentActiveDate); if (input) { syncDate(input); } }
function syncDate(newDate) { if (!newDate) return; let formatted = formatZeroPadDate(newDate); if(formatted && /^\d{2}\/\d{2}$/.test(formatted)) { switchDate(formatted); } else { alert("格式錯誤，請輸入 MM/DD (例: 03/20)"); } }
function toggleSettleLock() { isLocked = !isLocked; saveScheduleData(); updateLockUI(); if (document.getElementById('view-settle').classList.contains('active')) { renderSettlementTable(); } if (document.getElementById('view-schedule').classList.contains('active')) { renderScheduleAll(); } if (isLocked) { if (typeof pushDailySummary === 'function') { pushDailySummary(); } showToast("🔒 帳單已鎖定，並已同步至周結報表！"); } else { showToast("🔓 帳單已解鎖，可以修改了！(尚未同步)"); } }
function updateLockUI() { const btn = document.getElementById('lockSettleBtn'); const settleDateInput = document.getElementById('settleDateInput'); if (!btn) return; if (isLocked) { btn.innerHTML = "🔒 已鎖定 (點擊解鎖)"; btn.style.background = "#e74c3c"; if(settleDateInput) settleDateInput.disabled = true; } else { btn.innerHTML = "🔓 開放編輯中 (點擊鎖定)"; btn.style.background = "#2ecc71"; if(settleDateInput) settleDateInput.disabled = false; } document.querySelectorAll('.config-panel input').forEach(inp => { inp.disabled = isLocked; inp.style.background = isLocked ? "#f4f6f9" : "#fff"; }); const resetBtn = document.querySelector('.action-btn-reset'); if (resetBtn) { resetBtn.disabled = isLocked; resetBtn.style.opacity = isLocked ? '0.5' : '1'; resetBtn.style.cursor = isLocked ? 'not-allowed' : 'pointer'; } ['openHour', 'closeHour'].forEach(id => { const el = document.getElementById(id); if (el) { el.disabled = isLocked; el.style.background = isLocked ? "#f4f6f9" : "#fff"; } }); }
function switchTab(tabId) { document.querySelectorAll('.view-container').forEach(el => el.classList.remove('active')); document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active')); document.getElementById('view-' + tabId).classList.add('active'); const btns = document.querySelectorAll('.tab-btn'); if(tabId === 'schedule') btns[0].classList.add('active'); else if(tabId === 'settle') btns[1].classList.add('active'); else if(tabId === 'weekly') btns[2].classList.add('active'); renderRegionTabs(); if(tabId === 'schedule') setTimeout(() => { renderScheduleAll(); updateTimeLineAndClock(); }, 50); if(tabId === 'settle') setTimeout(() => { renderSettlementTable(); }, 50); if(tabId === 'weekly') setTimeout(() => { if(typeof loadWeeklyData === 'function') loadWeeklyData(); }, 50); }

function renderRegionTabs() { 
    const scheduleContainer = document.getElementById('scheduleRegionTabs'); 
    const settleContainer = document.getElementById('settleRegionTabs'); 
    const weeklyContainer = document.getElementById('weeklyRegionTabs'); 
    
    // 🌟 升級：多選狀態判斷
    let html = `<button class="region-btn ${currentRegion.includes('All') ? 'active' : ''}" onclick="switchRegion('All')">全部顯示</button>`; 
    
    html += `<button class="region-btn" onclick="toggleWorkingOnly()" style="margin-left: 10px; border: 1px solid #27ae60; color: ${showWorkingOnly ? 'white' : '#27ae60'}; background: ${showWorkingOnly ? '#27ae60' : 'white'};">${showWorkingOnly ? '取消篩選' : '僅顯示上班'}</button>`;

    let weeklyHtml = "";
    if (typeof currentWeeklyRegions !== 'undefined') {
        weeklyHtml += `<button class="region-btn ${currentWeeklyRegions.includes('All') ? 'active' : ''}" onclick="switchWeeklyRegion('All')">全部顯示</button>`; 
    }

    REGIONS.forEach(r => { 
        html += `<button class="region-btn ${currentRegion.includes(r) ? 'active' : ''}" onclick="switchRegion('${r}')">${r}</button>`; 
        if (typeof currentWeeklyRegions !== 'undefined') {
            weeklyHtml += `<button class="region-btn ${currentWeeklyRegions.includes(r) ? 'active' : ''}" onclick="switchWeeklyRegion('${r}')">${r}</button>`; 
        }
    }); 
    
    if(scheduleContainer) scheduleContainer.innerHTML = html; 
    if(settleContainer) settleContainer.innerHTML = html; 
    if(weeklyContainer && weeklyHtml) weeklyContainer.innerHTML = weeklyHtml; 
}

function switchRegion(region) { 
    // 🌟 升級：陣列選取邏輯
    if (region === 'All') {
        currentRegion = ['All']; 
    } else {
        currentRegion = currentRegion.filter(r => r !== 'All'); 
        
        if (currentRegion.includes(region)) {
            currentRegion = currentRegion.filter(r => r !== region); 
        } else {
            currentRegion.push(region); 
        }
        
        if (currentRegion.length === 0) {
            currentRegion = ['All']; 
        }
    }
    
    renderRegionTabs(); 
    const isScheduleActive = document.getElementById('view-schedule').classList.contains('active'); 
    if(isScheduleActive) renderScheduleAll(); 
    else renderSettlementTable(); 
}

window.toggleWorkingOnly = function() {
    showWorkingOnly = !showWorkingOnly;
    renderRegionTabs(); 
    
    if (document.getElementById('view-schedule') && document.getElementById('view-schedule').classList.contains('active')) {
        if (typeof renderScheduleAll === 'function') renderScheduleAll();
    } else if (document.getElementById('view-settle') && document.getElementById('view-settle').classList.contains('active')) {
        if (typeof renderSettlementTable === 'function') renderSettlementTable();
    }
};

window.updateRegionPrefix = function(value) {
    const region = document.getElementById('roomConfigRegionSelect').value;
    if (!region) return;
    regionPrefixes[region] = value;
    saveScheduleData();
    showToast(`✅ ${region} 複製前標已更新！`);
};

function updateStaffName(id, newName) { staffData = staffData.map(staff => staff.id === id ? { ...staff, name: newName } : staff); saveScheduleData(); }
function updateStaffRegion(id, newRegion) { staffData = staffData.map(staff => staff.id === id ? { ...staff, region: newRegion } : staff); saveScheduleData(); renderScheduleAll(); }

let tempModalAttendance = true; 
function openEditModal(staffId) { if (isLocked) return; const staff = staffData.find(s => s.id === staffId); if (!staff) return; currentEditingStaffId = staffId; const titleEl = document.querySelector('#editModal .modal-title'); if (titleEl) titleEl.innerText = staff.name || staff.roomName || "未命名"; tempModalAttendance = staff.attendance !== false; updateModalAttendanceUI(); document.getElementById('modalTextarea').value = staff.content; document.getElementById('editModal').classList.add('active'); document.getElementById('modalTextarea').focus(); }
function toggleModalAttendance() { tempModalAttendance = !tempModalAttendance; updateModalAttendanceUI(); }
function updateModalAttendanceUI() { const btn = document.getElementById('modalAttendanceBtn'); if (!btn) return; if (tempModalAttendance) { btn.className = 'btn-attendance working'; btn.innerText = '🟢 上班'; } else { btn.className = 'btn-attendance leave'; btn.innerText = '🔴 請假'; } }
function closeEditModal() { document.getElementById('editModal').classList.remove('active'); currentEditingStaffId = null; }
function saveModalData() { if (!currentEditingStaffId) return; const newContent = document.getElementById('modalTextarea').value; staffData = staffData.map(staff => { if (staff.id === currentEditingStaffId) return { ...staff, content: newContent, overrides: {}, attendance: tempModalAttendance }; return staff; }); saveScheduleData(); renderScheduleAll(); if (document.getElementById('view-settle').classList.contains('active')) renderSettlementTable(); closeEditModal(); }

function openTimeModal(element, staffId, taskId, content, scheduledStart, scheduledEnd, lineIndex) { currentTaskElement = element; currentTaskInfo = { staffId, taskId, lineIndex }; document.getElementById('scheduledTime').innerText = `${scheduledStart} - ${scheduledEnd}`; document.getElementById('inTimeInput').value = currentTaskElement.dataset.inTime || ''; document.getElementById('outTimeInput').value = currentTaskElement.dataset.outTime || ''; const staff = staffData.find(s => s.id === staffId); let currentAuntDisp = 0; let extractedName = "--"; let revenue = 0; let rawContent = content; if (staff && typeof calculateSettlement === 'function' && lineIndex !== undefined) { const getGlobalVal = (id) => { const el = document.getElementById(id); return el ? (parseInt(el.value) || 0) : 0; }; const globalCommTable = { "40-1": getGlobalVal('base_40_1'), "60-1": getGlobalVal('base_60_1'), "60-2": getGlobalVal('base_60_2'), "120-3": getGlobalVal('base_120_3'), "240-3": getGlobalVal('base_240_3') }; const globalCostTable = { "40-1": getGlobalVal('cost_40_1'), "60-1": getGlobalVal('cost_60_1'), "60-2": getGlobalVal('cost_60_2'), "120-3": getGlobalVal('cost_120_3'), "240-3": getGlobalVal('cost_240_3') }; const globalWorkTable = { "40-1": WORK_UNIT_TABLE[40] || 0, "60-1": WORK_UNIT_TABLE[60] || 0, "60-2": WORK_UNIT_TABLE[60] || 0, "120-3": WORK_UNIT_TABLE[120] || 0, "240-3": WORK_UNIT_TABLE[240] || 0 }; let activeCommTable = globalCommTable; let activeCostTable = globalCostTable; let activeWorkTable = globalWorkTable; if (staff.customConfig && staff.customConfig.enabled) { activeCommTable = { ...globalCommTable, ...staff.customConfig.comm }; activeCostTable = { ...globalCostTable, ...staff.customConfig.cost }; activeWorkTable = { ...globalWorkTable, ...(staff.customConfig.work || {}) }; } const { results } = calculateSettlement(staff, activeCommTable, activeCostTable, activeWorkTable, services); const rowResult = results.find(r => r.index === lineIndex); if (rowResult) { currentAuntDisp = rowResult.aunt_disp; extractedName = rowResult.extractedName || "--"; revenue = rowResult.revenue || 0; rawContent = rowResult.rawLine || content; } } document.getElementById('modalRawContent').innerText = rawContent; document.getElementById('modalExtractedName').innerText = extractedName; document.getElementById('modalRevenue').innerText = revenue; document.getElementById('auntModalInput').value = currentAuntDisp; document.getElementById('timeModal').classList.add('active'); }
function closeTimeModal() { document.getElementById('timeModal').classList.remove('active'); currentTaskElement = null; currentTaskInfo = null; }
function fillCurrentTime(type) { const now = new Date(); let h = now.getHours(); let m = now.getMinutes(); const t = `${h < 10 ? "0"+h : h}:${m < 10 ? "0"+m : m}`; document.getElementById(type === 'in' ? 'inTimeInput' : 'outTimeInput').value = t; }
function saveManualTime() { if (!currentTaskElement || !currentTaskInfo) return; const { staffId, taskId, lineIndex } = currentTaskInfo; const newInTime = document.getElementById('inTimeInput').value.trim(); const newOutTime = document.getElementById('outTimeInput').value.trim(); const timeRegex = /^\d{2}:\d{2}$/; if ((newInTime && !timeRegex.test(newInTime)) || (newOutTime && !timeRegex.test(newOutTime))) { alert("格式錯誤 HH:MM"); return; } const newAuntValStr = document.getElementById('auntModalInput').value; const newAuntVal = parseInt(newAuntValStr) || 0; staffData = staffData.map(staff => { if (staff.id === staffId) { const updatedTaskStatus = {}; if (newInTime) updatedTaskStatus.inTime = newInTime; if (newOutTime) updatedTaskStatus.outTime = newOutTime; const currentOverrides = staff.overrides ? { ...staff.overrides } : {}; if (lineIndex !== undefined) { if (!currentOverrides[lineIndex]) currentOverrides[lineIndex] = {}; currentOverrides[lineIndex].aunt_disp = newAuntVal; } return { ...staff, taskStatuses: { ...(staff.taskStatuses || {}), [taskId]: updatedTaskStatus }, overrides: currentOverrides }; } return staff; }); saveScheduleData(); if (newInTime) currentTaskElement.dataset.inTime = newInTime; else delete currentTaskElement.dataset.inTime; if (newOutTime) currentTaskElement.dataset.outTime = newOutTime; else delete currentTaskElement.dataset.outTime; if (document.getElementById('view-settle').classList.contains('active')) { renderSettlementTable(); } closeTimeModal(); }
function clearManualTime() { if (!currentTaskElement || !currentTaskInfo) return; const { staffId, taskId } = currentTaskInfo; staffData = staffData.map(staff => { if (staff.id === staffId) { const updatedTaskStatuses = { ...(staff.taskStatuses || {}) }; delete updatedTaskStatuses[taskId]; return { ...staff, taskStatuses: updatedTaskStatuses }; } return staff; }); saveScheduleData(); delete currentTaskElement.dataset.inTime; delete currentTaskElement.dataset.outTime; document.getElementById('inTimeInput').value = ''; document.getElementById('outTimeInput').value = ''; closeTimeModal(); }

let isServicePanelExpanded = localStorage.getItem('servicePanelExpanded') !== 'false';
function initServicePanel() { const container = document.getElementById('service_container'); const icon = document.getElementById('serviceToggleIcon'); if (!container || !icon) return; if (isServicePanelExpanded) { container.style.display = 'flex'; icon.innerText = '▼'; } else { container.style.display = 'none'; icon.innerText = '▶'; } }
function toggleServicePanel() { isServicePanelExpanded = !isServicePanelExpanded; localStorage.setItem('servicePanelExpanded', isServicePanelExpanded); initServicePanel(); }
function renderServices() { const container = document.getElementById('service_container'); container.innerHTML = ''; services.forEach((svc, index) => { const div = document.createElement('div'); div.className = 'service-row'; div.innerHTML = `<input type="text" value="${svc.name}" onchange="updateService(${index}, 'name', this.value)" ${isLocked ? 'disabled' : ''}><span>+</span><input type="number" value="${svc.price}" oninput="updateService(${index}, 'price', this.value)" step="100" ${isLocked ? 'disabled' : ''}><button class="btn-circle btn-red" style="width:18px; height:18px; font-size:12px; ${isLocked ? 'display:none;' : ''}" onclick="removeService(${index})">×</button>`; container.appendChild(div); }); initServicePanel(); const addSvcBtn = document.getElementById('addServiceRowBtn'); if(addSvcBtn) addSvcBtn.style.display = isLocked ? 'none' : 'inline-flex'; }
function updateService(index, field, value) { let finalValue = value; if(field === 'price') { const parsed = parseInt(value); finalValue = isNaN(parsed) ? services[index].price : parsed; if (value === "") finalValue = 0; } services = services.map((svc, i) => i === index ? { ...svc, [field]: finalValue } : svc); renderServices(); renderSettlementTable(); saveScheduleData(); }
function addServiceRow() { services.push({name: "新項目", price: 0}); renderServices(); renderSettlementTable(); saveScheduleData(); }
function removeService(index) { services = services.filter((_, i) => i !== index); renderServices(); renderSettlementTable(); saveScheduleData(); }

const BASE_PARAM_KEYS = ["40-1", "60-1", "60-2", "120-3", "240-3"];
function updateStaffSettlement(staffId, field, value) { staffData = staffData.map(s => { if (s.id === staffId) { let val = value; if (field === 'agentRate' || field === 'manualExpense') { val = parseInt(value) || 0; } return { ...s, [field]: val }; } return s; }); saveScheduleData(); renderSettlementTable(); }
function saveOverride(staffId, lineIndex, field, element) { let value = element.innerText; let finalVal; if (field === 'note') { finalVal = value; } else { finalVal = parseInt(value.replace(/[^\d-]/g, '')) || 0; element.innerText = finalVal; element.classList.add('manual-text'); } staffData = staffData.map(s => { if (s.id === staffId) { const currentOverrides = s.overrides || {}; if (!currentOverrides[lineIndex]) currentOverrides[lineIndex] = {}; currentOverrides[lineIndex][field] = finalVal; return { ...s, overrides: currentOverrides }; } return s; }); saveScheduleData(); if (field !== 'note') setTimeout(renderSettlementTable, 50); }
function openStaffParamsModal(staffId) { const staff = staffData.find(s => s.id === staffId); if (!staff) return; currentParamsStaffId = staffId; document.getElementById('staffParamsTitle').innerText = `正在設定: ${staff.name || staff.roomName || '未命名'}`; const custom = staff.customConfig || { enabled: false, comm: {}, cost: {}, work: {} }; const toggle = document.getElementById('useCustomParamsToggle'); const inputsDiv = document.getElementById('paramsInputs'); toggle.checked = custom.enabled; inputsDiv.style.opacity = custom.enabled ? "1" : "0.5"; inputsDiv.style.pointerEvents = custom.enabled ? "auto" : "none"; toggle.onchange = (e) => { inputsDiv.style.opacity = e.target.checked ? "1" : "0.5"; inputsDiv.style.pointerEvents = e.target.checked ? "auto" : "none"; }; const listContainer = document.getElementById('dynamicParamsList'); listContainer.innerHTML = ''; let keysToShow = new Set([...BASE_PARAM_KEYS]); if (custom.comm) Object.keys(custom.comm).forEach(k => keysToShow.add(k)); let sortedKeys = Array.from(keysToShow).sort((a, b) => parseInt(a) - parseInt(b)); let htmlBuffer = ""; sortedKeys.forEach(key => { let elComm = document.getElementById(`base_${key.replace('-', '_')}`); let elCost = document.getElementById(`cost_${key.replace('-', '_')}`); let defaultComm = elComm ? (parseInt(elComm.value) || 0) : 0; let defaultCost = elCost ? (parseInt(elCost.value) || 0) : 0; let defaultWork = WORK_UNIT_TABLE[parseInt(key.split('-')[0])] || 0; let commVal = (custom.comm && custom.comm[key] !== undefined) ? custom.comm[key] : defaultComm; let costVal = (custom.cost && custom.cost[key] !== undefined) ? custom.cost[key] : defaultCost; let workVal = (custom.work && custom.work[key] !== undefined) ? custom.work[key] : defaultWork; let isBase = BASE_PARAM_KEYS.includes(key); htmlBuffer += `<div class="param-row-item" data-key="${key}" style="display: flex; justify-content: space-between; align-items: center; gap: 5px; padding: 6px 0; border-bottom: 1px dashed #eee;"><div style="width: 20%; font-weight: bold; text-align: center; color: #7f8c8d; font-size: 14px;">${key.replace('-', '/')}</div><div style="width: 25%;"><input type="number" class="p-comm" value="${commVal}" style="width: 100%; padding: 4px; border: 1px solid #e0e0e0; border-radius: 4px; text-align: center; font-weight: bold; color: #2ecc71; font-size: 14px;"></div><div style="width: 25%;"><input type="number" class="p-cost" value="${costVal}" style="width: 100%; padding: 4px; border: 1px solid #e0e0e0; border-radius: 4px; text-align: center; font-weight: bold; color: #e74c3c; font-size: 14px;"></div><div style="width: 15%;"><input type="number" class="p-work" value="${workVal}" style="width: 100%; padding: 4px; border: 1px solid #e0e0e0; border-radius: 4px; text-align: center; font-weight: bold; color: #d35400; font-size: 14px;"></div><div style="width: 15%; text-align: center;">${!isBase ? `<button onclick="this.closest('.param-row-item').remove()" style="background:transparent; border:none; color:#e74c3c; font-size:18px; cursor:pointer; font-weight:bold;">×</button>` : `<span style="color:#bdc3c7; font-size:12px;">預設</span>`}</div></div>`; }); listContainer.innerHTML = htmlBuffer; document.getElementById('staffParamsModal').classList.add('active'); }
function addNewParamRow() { const inputStr = prompt("請輸入新增的參數項目\n(格式為：分鐘/次數，例如 50/2 或 90/2)"); if (!inputStr) return; const match = inputStr.match(/^(\d+)[\/-](\d+)$/); if (!match) { alert("⚠️ 格式錯誤！請輸入如 '50/2' 的格式。"); return; } const key = `${match[1]}-${match[2]}`; if (document.querySelector(`.param-row-item[data-key="${key}"]`)) { alert("⚠️ 此項目已經存在列表中！"); return; } const listContainer = document.getElementById('dynamicParamsList'); let rowHtml = `<div class="param-row-item" data-key="${key}" style="display: flex; justify-content: space-between; align-items: center; gap: 5px; padding: 6px 0; border-bottom: 1px dashed #eee;"><div style="width: 20%; font-weight: bold; text-align: center; color: #3498db; font-size: 14px;">${key.replace('-', '/')}</div><div style="width: 25%;"><input type="number" class="p-comm" value="0" style="width: 100%; padding: 4px; border: 1px solid #3498db; border-radius: 4px; text-align: center; font-weight: bold; color: #2ecc71; font-size: 14px;"></div><div style="width: 25%;"><input type="number" class="p-cost" value="0" style="width: 100%; padding: 4px; border: 1px solid #3498db; border-radius: 4px; text-align: center; font-weight: bold; color: #e74c3c; font-size: 14px;"></div><div style="width: 15%;"><input type="number" class="p-work" value="0" style="width: 100%; padding: 4px; border: 1px solid #3498db; border-radius: 4px; text-align: center; font-weight: bold; color: #d35400; font-size: 14px;"></div><div style="width: 15%; text-align: center;"><button onclick="this.closest('.param-row-item').remove()" style="background:transparent; border:none; color:#e74c3c; font-size:18px; cursor:pointer; font-weight:bold;">×</button></div></div>`; listContainer.insertAdjacentHTML('beforeend', rowHtml); listContainer.scrollTop = listContainer.scrollHeight; }
function closeParamsModal() { document.getElementById('staffParamsModal').classList.remove('active'); currentParamsStaffId = null; }
function saveStaffParams() { if (!currentParamsStaffId) return; const enabled = document.getElementById('useCustomParamsToggle').checked; const comm = {}; const cost = {}; const work = {}; document.querySelectorAll('.param-row-item').forEach(row => { const key = row.dataset.key; comm[key] = parseInt(row.querySelector('.p-comm').value) || 0; cost[key] = parseInt(row.querySelector('.p-cost').value) || 0; work[key] = parseInt(row.querySelector('.p-work').value) || 0; }); staffData = staffData.map(s => { if (s.id === currentParamsStaffId) return { ...s, customConfig: { enabled, comm, cost, work } }; return s; }); saveScheduleData(); renderSettlementTable(); closeParamsModal(); }
function clearAllSchedules() { if(confirm("確定要清空這一天所有人的「班表內容」嗎？\n(不會影響別天的資料)")) { staffData = staffData.map(staff => ({ ...staff, content: "", taskStatuses: {}, overrides: {} })); saveScheduleData(); renderScheduleAll(); if (document.getElementById('view-settle').classList.contains('active')) renderSettlementTable(); showToast("✅ 已清空本日班表"); } }
function resetStaffSettings(staffId) { if(confirm("確定要初始化此人的所有設定嗎？\n(包含經紀費率、獨立參數、雜支都會恢復預設)")) { staffData = staffData.map(staff => { if (staff.id === staffId) return { ...staff, customConfig: { enabled: false, comm: {}, cost: {}, work: {} }, agentName: "", agentRate: 300, manualExpense: 0, overrides: {} }; return staff; }); saveScheduleData(); renderSettlementTable(); showToast("✅ 已還原設定"); } }
function addNewRegion() { const input = document.getElementById('newRegionInput'); const newRegion = input.value.trim(); if (!newRegion) { alert("請輸入區域名稱！"); return; } if (REGIONS.includes(newRegion)) { alert("⚠️ 此區域已經存在了！"); return; } REGIONS.push(newRegion); roomConfig[newRegion] = []; input.value = ''; saveScheduleData(); renderRegionTabs(); const select = document.getElementById('roomConfigRegionSelect'); select.innerHTML = REGIONS.map(r => `<option value="${r}">${r}</option>`).join(''); select.value = newRegion; renderRoomConfigUI(); showToast(`✅ 已新增大區域：${newRegion}`); }
function deleteCurrentRegion() { const region = document.getElementById('roomConfigRegionSelect').value; if (!region) return; if (confirm(`確定要刪除大區域「${region}」嗎？\n這會同時刪除該區【所有的房間設定】！`)) { REGIONS = REGIONS.filter(r => r !== region); delete roomConfig[region]; saveScheduleData(); renderRegionTabs(); openRoomConfigModal(); showToast(`🗑️ 已刪除區域：${region}`); } }
function openRoomConfigModal() { 
    const select = document.getElementById('roomConfigRegionSelect'); 
    if (REGIONS.length === 0) select.innerHTML = '<option value="">(空)</option>'; 
    else { 
        select.innerHTML = REGIONS.map(r => `<option value="${r}">${r}</option>`).join(''); 
        // 🌟 升級：讀取陣列的第一個元素
        if (!currentRegion.includes('All') && currentRegion.length > 0 && REGIONS.includes(currentRegion[0])) select.value = currentRegion[0]; 
    } 
    renderRoomConfigUI(); 
    document.getElementById('roomConfigModal').classList.add('active'); 
}
function closeRoomConfigModal() { document.getElementById('roomConfigModal').classList.remove('active'); }

function renderRoomConfigUI() { 
    const region = document.getElementById('roomConfigRegionSelect').value; 
    const listContainer = document.getElementById('roomConfigList'); 
    
    const prefixInput = document.getElementById('regionPrefixInput');
    if (prefixInput) {
        prefixInput.value = regionPrefixes[region] || "";
    }
    
    if (!region || REGIONS.length === 0) { listContainer.innerHTML = '<div style="color:#aaa; text-align:center; padding:10px;">請先在上方【+ 新增區域】</div>'; return; } 
    if (!roomConfig[region]) roomConfig[region] = []; const rooms = roomConfig[region]; 
    if (rooms.length === 0) { listContainer.innerHTML = '<div style="color:#aaa; text-align:center; padding:10px;">尚未設定房間，請在下方新增。</div>'; return; } 
    listContainer.innerHTML = rooms.map((roomName, index) => `<div style="display:flex; justify-content:space-between; align-items:center; background:#f4f6f9; padding:8px 12px; border-radius:6px; border:1px solid #ddd; margin-bottom:5px;"><span style="font-weight:bold; color:#2c3e50;">${roomName}</span><button onclick="removeRoomFromConfig('${region}', ${index})" style="background:transparent; border:none; color:#e74c3c; font-size:18px; cursor:pointer; font-weight:bold;">×</button></div>`).join(''); 
}

function addNewRoomToConfig() { const region = document.getElementById('roomConfigRegionSelect').value; if (!region || REGIONS.length === 0) { alert("請先選擇或新增大區域！"); return; } const input = document.getElementById('newRoomInput'); const newRoomName = input.value.trim(); if (!newRoomName) return; if (!roomConfig[region]) roomConfig[region] = []; roomConfig[region].push(newRoomName); input.value = ''; saveScheduleData(); renderRoomConfigUI(); }
function removeRoomFromConfig(region, index) { if (confirm("確定要刪除這個房間嗎？")) { roomConfig[region].splice(index, 1); saveScheduleData(); renderRoomConfigUI(); } }
function applyRoomTemplate() { const region = document.getElementById('roomConfigRegionSelect').value; if (!region) return; const rooms = roomConfig[region] || []; if (rooms.length === 0) { alert(`⚠️ ${region} 目前沒有設定任何房間！`); return; } if (confirm(`確定要同步「${region}」的配置到【今日班表】嗎？\n(系統會自動補上新房間，並移除設定裡已經刪掉的空房間)`)) { staffData = staffData.filter(s => { if (s.region !== region) return true; return rooms.includes(s.roomName); }); const existingRooms = staffData.filter(s => s.region === region).map(s => s.roomName); let addedCount = 0; rooms.forEach((roomName, index) => { if (!existingRooms.includes(roomName)) { staffData.push({ id: Date.now() + index, name: "", roomName: roomName, content: "", height: null, taskStatuses: {}, overrides: {}, customConfig: {enabled: false}, region: region, attendance: true }); addedCount++; } }); saveScheduleData(); renderScheduleAll(); closeRoomConfigModal(); showToast(`✅ 已同步 ${region} 配置！`); } }

function copySingleAvailability(staffId) { 
    const now = new Date(); let h = now.getHours(); let m = now.getMinutes(); 
    if (h < 11) h += 24; const nowMins = h * 60 + m; 
    const formatTimeDot = (mins) => { 
        let hh = Math.floor(mins / 60); let mm = mins % 60; 
        if (hh >= 24) hh -= 24; let hhStr = hh < 10 ? "0" + hh : hh; 
        return hhStr + "." + (mm < 10 ? "0" + mm : mm); 
    }; 
    
    const staff = staffData.find(s => s.id === staffId); if (!staff) return; 
    const contentLines = (staff.content || "").split('\n'); 
    let tasks = []; 
    let activeBlockDate = currentActiveDate; 

    contentLines.forEach(line => { 
        const trimmedLine = line.trim(); if (!trimmedLine) return; 

        const isDateLine = /^[\d./-]+\s*(?:\([^)]+\))?$/.test(trimmedLine) && trimmedLine.length < 15;
        if (isDateLine) {
            const mMatch = trimmedLine.match(/(\d{1,2})[\/\-\.](\d{1,2})/);
            if (mMatch) activeBlockDate = mMatch[1].padStart(2, '0') + '/' + mMatch[2].padStart(2, '0');
            return;
        }

        if (activeBlockDate !== currentActiveDate) return; 

        const match = trimmedLine.match(/([\d.:]+)\s*(\d+.*)/) || trimmedLine.match(/(\D+)\s*([\d.:]+)\s*(\d+.*)/); 
        if (match) { 
            let timeStr, detailStr; 
            if (match.length === 3) { timeStr = match[1]; detailStr = match[2]; } else { timeStr = match[2]; detailStr = match[3]; } 
            let duration = 60; const numMatch = detailStr.match(/^(\d+)/); 
            if (numMatch) duration = parseInt(numMatch[1]); 
            const start = parseTime(timeStr); 
            if (start !== null) { tasks.push({ start: start, end: start + duration + 10 }); } 
        } 
    }); 
    
    tasks.sort((a, b) => a.start - b.start); 
    let hasValidTasks = tasks.length > 0; let mergedTasks = []; 
    if (hasValidTasks) { 
        let currentTask = tasks[0]; 
        for (let i = 1; i < tasks.length; i++) { 
            let nextTask = tasks[i]; 
            if (nextTask.start - currentTask.end < 40) { currentTask.end = Math.max(currentTask.end, nextTask.end); } 
            else { mergedTasks.push(currentTask); currentTask = nextTask; } 
        } 
        mergedTasks.push(currentTask); 
    } 
    
    let futureTasks = mergedTasks.filter(t => t.end > nowMins); 
    const displayName = staff.name || "未填寫"; 
    
    const prefixText = regionPrefixes[staff.region] ? regionPrefixes[staff.region] : ""; 
    let parts = [prefixText + displayName]; 
    
    if (futureTasks.length === 0) { 
        if (!hasValidTasks) { 
            if ((staff.content || "").trim() === "") parts.push("現走"); 
            else parts.push(`(${(staff.content || "").trim().replace(/\n/g, ' ')})`); 
        } else { parts.push("現走"); } 
    } else { 
        let firstTask = futureTasks[0]; 
        if (firstTask.start - nowMins >= 40) parts.push("現走"); 
        futureTasks.forEach((t, i) => { 
            let startStr = formatTimeDot(t.start); let endStr = formatTimeDot(t.end); 
            if (nowMins >= t.start && nowMins < t.end && i === 0) parts.push(`目前有客`); 
            else parts.push(`${startStr}有客`); parts.push(`${endStr}可約`); 
        }); 
    } 
    const textToCopy = parts.join(" "); 
    if (navigator.clipboard) { 
        navigator.clipboard.writeText(textToCopy).then(() => { showToast(`📋 已複製空檔！`); }).catch(() => { alert("複製失敗，請手動複製:\n\n" + textToCopy); }); 
    } else { alert("瀏覽器不支援自動複製，請手動複製:\n\n" + textToCopy); } 
}

window.toggleTopBar = function() {
    const topBar = document.querySelector('.schedule-top-bar');
    const toggleBtn = document.getElementById('toggleTopBarBtn');
    
    if (topBar) {
        topBar.classList.toggle('collapsed');
        
        if (topBar.classList.contains('collapsed')) {
            toggleBtn.innerText = '🔽';
        } else {
            toggleBtn.innerText = '🔼';
        }
        
        setTimeout(() => {
            if (document.getElementById('view-schedule') && document.getElementById('view-schedule').classList.contains('active')) {
                if (typeof renderTracksOnly === 'function') {
                    renderTracksOnly();
                }
            }
        }, 300);
    }
};

initSchedule();
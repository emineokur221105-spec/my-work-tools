// === schedule.js : 排班視圖邏輯 ===

function renderSidebar() { 
    const leftContent = document.getElementById('leftContent');
    if(!leftContent) return;
    
    leftContent.innerHTML = ''; 
    staffData.forEach((staff, index) => { 
        const staffRegion = staff.region || (REGIONS.length > 0 ? REGIONS[0] : "未分類");
        if (!currentRegion.includes('All') && !currentRegion.includes(staffRegion)) return;
        if (showWorkingOnly && staff.attendance === false) return;

        const regionColor = getRegionColor(staffRegion);
        let regionOptions = "";
        REGIONS.forEach(r => {
            const selected = (staffRegion === r) ? "selected" : "";
            regionOptions += `<option value="${r}" ${selected}>${r}</option>`;
        });

        const div = document.createElement('div'); 
        div.className = 'staff-card'; 
        div.dataset.staffId = staff.id; 
        if (staff.height) div.style.height = staff.height + 'px'; 
        div.style.borderLeft = `5px solid ${regionColor}`;
        
        const isAttending = staff.attendance !== false; 
        const badgeBgColor = isAttending ? "#27ae60" : "#e74c3c"; 
        
        let roomBadge = staff.roomName 
            ? `<span onclick="copySingleAvailability(${staff.id})" style="cursor:pointer; background:${badgeBgColor}; color:white; padding:4px 6px; border-radius:4px; font-size:12px; margin-right:4px; font-weight:bold; white-space:nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.3);" title="點擊複製空檔">${staff.roomName}</span>` 
            : `<span onclick="copySingleAvailability(${staff.id})" style="cursor:pointer; background:${badgeBgColor}; color:white; padding:4px 6px; border-radius:4px; font-size:11px; margin-right:4px; font-weight:bold; box-shadow: 0 1px 3px rgba(0,0,0,0.3);" title="點擊複製空檔">📋複製</span>`;

        // 🌟 重構：使用 Helper 組合左側名單的 HTML
        div.innerHTML = buildStaffCardHTML({
            index: index,
            staffId: staff.id,
            staffName: staff.name || '',
            staffContent: staff.content || '<span style="color:#ccc">編輯...</span>',
            roomBadge: roomBadge,
            regionOptions: regionOptions,
            regionColor: regionColor
        });
        
        leftContent.appendChild(div); 
    }); 
}

function renderTracksOnly() { 
    const openEl = document.getElementById('openHour');
    const closeEl = document.getElementById('closeHour');
    if(!openEl || !closeEl) return;

    const ruler = document.getElementById('ruler');
    const container = document.getElementById('trackContainer');
    const gridBgLine = document.getElementById('gridBg');

    if(!ruler || !container) return;

    const openH = parseInt(openEl.value) || 12; 
    const closeH = parseInt(closeEl.value) || 26; 
    const startOfDay = openH * 60; 
    const totalWidth = (closeH * 60 - startOfDay) * PX_PER_MIN; 
    if (totalWidth <= 0) return; 
    
    ruler.style.width = totalWidth + 'px'; 
    container.style.width = totalWidth + 'px'; 
    if(gridBgLine) gridBgLine.style.width = totalWidth + 'px'; 
    
    let rulerHTML = ''; 
    const gridBgContent = []; 
    
    for (let h = openH; h <= closeH; h++) { 
        let left = (h * 60 - startOfDay) * PX_PER_MIN; 
        let displayH = h >= 24 ? h - 24 : h; 
        let displayHStr = displayH < 10 ? "0" + displayH : displayH;
        
        // 🌟 重構：使用 Helper 畫出時間刻度與背景線
        rulerHTML += buildRulerMarkHTML(left, displayHStr); 
        gridBgContent.push(buildGridLineHTML(left)); 
    } 
    
    ruler.innerHTML = rulerHTML;
    container.innerHTML = buildTrackContainerHTML(totalWidth, gridBgContent.join('')); 
    
    staffData.forEach(staff => { 
        const staffRegion = staff.region || (REGIONS.length > 0 ? REGIONS[0] : "未分類");
        if (!currentRegion.includes('All') && !currentRegion.includes(staffRegion)) return;
        if (showWorkingOnly && staff.attendance === false) return;

        const trackDiv = document.createElement('div'); 
        trackDiv.className = 'track-row'; 
        trackDiv.id = `track-${staff.id}`; 
        container.appendChild(trackDiv); 
        
        const staffCard = document.querySelector(`.staff-card[data-staff-id="${staff.id}"]`); 
        if (staff.height) { 
            trackDiv.style.height = staff.height + 'px'; 
        } else if (staffCard) { 
            trackDiv.style.height = staffCard.offsetHeight + 'px'; 
        } 
        renderSingleTrack(trackDiv, staff.content || '', staff.id, startOfDay, closeH * 60); 
    }); 
    updateTimeLineAndClock(); 
}

function renderSingleTrack(container, content, staffId, startOfDay, endOfDay) { 
    container.innerHTML = ''; 
    const staff = staffData.find(s => s.id === staffId); 
    const taskStatuses = staff.taskStatuses || {}; 
    const lines = content.split('\n'); 
    const tasks = []; 
    
    let activeBlockDate = currentActiveDate;

    lines.forEach((line, index) => { 
        const trimmedLine = line.trim(); 
        if (!trimmedLine) return; 

        const isDateLine = /^[\d./-]+\s*(?:\([^)]+\))?$/.test(trimmedLine) && trimmedLine.length < 15;
        if (isDateLine) {
            const mMatch = trimmedLine.match(/(\d{1,2})[\/\-\.](\d{1,2})/);
            if (mMatch) { activeBlockDate = mMatch[1].padStart(2, '0') + '/' + mMatch[2].padStart(2, '0'); }
            return; 
        }

        if (activeBlockDate !== currentActiveDate) return;
        
        const match = trimmedLine.match(/([\d.:]+)\s*(\d+.*)/) || trimmedLine.match(/(\D+)\s*([\d.:]+)\s*(\d+.*)/); 
        if (match) { 
            let timeStr, detailStr; 
            if (match.length === 3) { timeStr = match[1]; detailStr = match[2]; } 
            else { timeStr = match[2]; detailStr = match[3]; } 
            
            let duration = 60; 
            const numMatch = detailStr.match(/^(\d+)/); 
            if (numMatch) duration = parseInt(numMatch[1]); 
            
            const startTime = parseTime(timeStr); 
            const endTime = startTime + duration; 
            
            if (startTime !== null) { 
                const scheduledStart = formatTime(startTime); 
                const scheduledEnd = formatTime(endTime); 
                const taskId = getTaskHash(trimmedLine, startTime); 
                const status = taskStatuses[taskId] || {}; 
                
                tasks.push({ 
                    start: startTime, end: endTime, rawText: trimmedLine, conflict: false, staffId, taskId, scheduledStart, scheduledEnd, 
                    inTime: status.inTime || '', 
                    outTime: status.outTime || '',
                    lineIndex: index 
                }); 
            } 
        } 
    }); 
    
    tasks.sort((a, b) => a.start - b.start); 
    
    for (let i = 0; i < tasks.length; i++) { 
        for (let j = i + 1; j < tasks.length; j++) { 
            if (tasks[i].end > tasks[j].start) { 
                tasks[i].conflict = true; tasks[j].conflict = true; 
            } else { break; } 
        } 
    } 
    
    let currentCursor = startOfDay; 
    tasks.forEach(task => { 
        if (task.start > currentCursor) { 
            let gap = task.start - currentCursor; 
            if (gap >= 10) { 
                let startStr = formatTime(currentCursor); let endStr = formatTime(task.start); 
                let durationStr = formatDuration(gap); 
                // 🌟 重構：使用 Helper 組合空檔字串
                let label = buildFreeBlockLabelHTML(durationStr, startStr, endStr); 
                createBlock(container, currentCursor, task.start, startOfDay, 'free', label, staffId); 
            } 
        } 
        let type = task.conflict ? 'conflict' : 'work'; 
        createBlock(container, task.start, task.end, startOfDay, type, task.rawText, task.staffId, task.taskId, task.scheduledStart, task.scheduledEnd, task.inTime, task.outTime, task.lineIndex); 
        if (task.end > currentCursor) currentCursor = task.end; 
    }); 

    if (currentCursor < endOfDay) {
        let gap = endOfDay - currentCursor;
        if (gap >= 10) { 
            let startStr = formatTime(currentCursor); let endStr = formatTime(endOfDay); 
            let durationStr = formatDuration(gap); 
            let label = buildFreeBlockLabelHTML(durationStr, startStr, endStr); 
            createBlock(container, currentCursor, endOfDay, startOfDay, 'free', label, staffId); 
        }
    }
}

function createBlock(container, start, end, offsetStart, type, content, staffId, taskId, scheduledStart, scheduledEnd, inTime, outTime, lineIndex) { 
    if (end <= start) return; 
    const left = (start - offsetStart) * PX_PER_MIN; 
    const width = (end - start) * PX_PER_MIN; 
    const div = document.createElement('div'); 
    div.className = `block type-${type}`; 
    div.style.left = left + 'px'; 
    div.style.width = Math.max(width - 2, 2) + 'px'; 
    
    if (type === 'free') { 
        div.innerHTML = content; 
    } else { 
        div.innerText = content; 
        if (type === 'work') { 
            div.onclick = function(e) { 
                e.stopPropagation(); 
                openTimeModal(div, staffId, taskId, content, scheduledStart, scheduledEnd, lineIndex); 
            }; 
            div.dataset.staffId = staffId; 
            div.dataset.taskId = taskId; 
            if(inTime) div.dataset.inTime = inTime; 
            if(outTime) div.dataset.outTime = outTime; 
        } 
    } 
    container.appendChild(div); 
}

let alertedTasks = new Set(); 
let lastCheckedTime = "";     

function updateTimeLineAndClock() { 
    const line = document.getElementById('currentTimeLine'); 
    const topClock = document.getElementById('topClock'); 
    const openH = parseInt(document.getElementById('openHour').value) || 12; 
    
    const now = new Date(); 
    let h = now.getHours(); 
    let m = now.getMinutes(); 
    let s = now.getSeconds();
    
    let clockH = now.getHours(); 
    if (clockH >= 0 && clockH < 11) clockH += 24; 
    const timeString = `${(clockH<10?"0"+clockH:clockH)}:${(m<10?"0"+m:m)}`;
    if(topClock) topClock.innerText = timeString; 
    
    if (h < 11) h += 24; 
    const offsetMins = (h * 60 + m) - openH * 60; 
    
    let isToday = false;
    if (typeof currentActiveDate !== 'undefined' && typeof getTodayDateStr === 'function') {
        isToday = (currentActiveDate === getTodayDateStr());
    }

    if (isToday && offsetMins >= 0 && line) { 
        line.style.display = 'block'; 
        line.style.left = (offsetMins * PX_PER_MIN) + 'px'; 
    } else if (line) { 
        line.style.display = 'none'; 
    } 

    if (s === 0 && lastCheckedTime !== timeString) {
        lastCheckedTime = timeString;
        if (isToday) { checkScheduleAlerts(h * 60 + m); }
    }
}

function checkScheduleAlerts(currentMinutes) {
    if (typeof currentActiveDate !== 'undefined' && typeof getTodayDateStr === 'function') {
        if (currentActiveDate !== getTodayDateStr()) return;
    }

    staffData.forEach(staff => {
        const lines = (staff.content || "").split('\n');
        const displayName = staff.name || staff.roomName || "人員"; 
        let activeBlockDate = currentActiveDate;

        lines.forEach(line => {
             const rawLine = line.trim();
             const isDateLine = /^[\d./-]+\s*(?:\([^)]+\))?$/.test(rawLine) && rawLine.length < 15;
             if (isDateLine) {
                 const mMatch = rawLine.match(/(\d{1,2})[\/\-\.](\d{1,2})/);
                 if (mMatch) activeBlockDate = mMatch[1].padStart(2, '0') + '/' + mMatch[2].padStart(2, '0');
                 return;
             }

             if (activeBlockDate !== currentActiveDate) return;

             const match = rawLine.match(/([\d.:]+)\s*(\d+.*)/) || rawLine.match(/(\D+)\s*([\d.:]+)\s*(\d+.*)/);
             if (match) {
                let timeStr, detailStr;
                if (match.length === 3) { timeStr = match[1]; detailStr = match[2]; } 
                else { timeStr = match[2]; detailStr = match[3]; }
                
                let duration = 60;
                const numMatch = detailStr.match(/^(\d+)/);
                if (numMatch) duration = parseInt(numMatch[1]);
                
                const startMins = parseTime(timeStr);
                const endMins = startMins + duration;
                const preStartMins = startMins - 5; 
                
                const taskUniqueId = `${currentActiveDate}-${staff.id}-${startMins}-${endMins}`;

                if (currentMinutes === preStartMins && !alertedTasks.has(taskUniqueId + "_PRE")) {
                    playLoudAlarm(); sendSystemNotification("⏳ 即將開始", `${displayName} 還有 5 分鐘開始 (${formatTime(startMins)})`);
                    showToast(`⏳ ${displayName} 還有 5 分鐘！`); alertedTasks.add(taskUniqueId + "_PRE");
                }
                if (currentMinutes === startMins && !alertedTasks.has(taskUniqueId + "_START")) {
                    playLoudAlarm(); sendSystemNotification("🟢 服務開始", `${displayName} 開始 (${formatTime(startMins)})`);
                    showToast(`🟢 ${displayName} 開始！`); alertedTasks.add(taskUniqueId + "_START");
                }
                if (currentMinutes === endMins && !alertedTasks.has(taskUniqueId + "_END")) {
                    playLoudAlarm(); sendSystemNotification("🔔 服務結束", `${displayName} 時間到 (${formatTime(endMins)})`);
                    showToast(`🔔 ${displayName} 時間到！`); alertedTasks.add(taskUniqueId + "_END");
                }
             }
        });
    });
}

let renderScheduleTimeout = null;
function renderScheduleAll() { 
    if (renderScheduleTimeout) clearTimeout(renderScheduleTimeout);
    renderScheduleTimeout = setTimeout(() => {
        executeRenderScheduleAll();
    }, 150);
}

function executeRenderScheduleAll() {
    renderSidebar(); 
    requestAnimationFrame(renderTracksOnly); 
}

const colResizer = document.getElementById('colResizer'); 
let isColDragging = false; 
let colStartX, colStartWidth;

function startColResize(clientX) {
    const leftPanel = document.getElementById('leftPanel');
    if(!leftPanel) return;
    isColDragging = true; colStartX = clientX; colStartWidth = parseInt(window.getComputedStyle(leftPanel).width, 10);
    document.body.style.cursor = 'col-resize'; document.body.style.overflow = 'hidden'; 
}

function moveColResize(clientX) {
    if (!isColDragging) return;
    const leftPanel = document.getElementById('leftPanel'); 
    if(!leftPanel) return;
    let newWidth = colStartWidth + (clientX - colStartX);
    if (newWidth < 120) newWidth = 120; if (newWidth > 500) newWidth = 500;
    leftPanel.style.width = newWidth + 'px';
}

function endColResize() {
    if (isColDragging) { isColDragging = false; document.body.style.cursor = 'default'; document.body.style.overflow = ''; }
}
if(colResizer){
    colResizer.addEventListener('mousedown', (e) => startColResize(e.clientX));
    colResizer.addEventListener('touchstart', (e) => startColResize(e.touches[0].clientX), { passive: false });
}

let isRowDragging = false; let currentRowId = null; let rowStartY, rowStartHeight; let currentStaffCardFn = null; let currentTrackRowFn = null;

function initRowResize(event, staffId) {
    event.stopPropagation(); const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    isRowDragging = true; currentRowId = staffId; rowStartY = clientY;
    currentStaffCardFn = document.querySelector(`.staff-card[data-staff-id="${staffId}"]`);
    currentTrackRowFn = document.getElementById(`track-${staffId}`);
    if (currentStaffCardFn) { rowStartHeight = parseInt(window.getComputedStyle(currentStaffCardFn).height, 10); }
    document.body.style.cursor = 'row-resize'; document.body.style.overflow = 'hidden'; 
}
function moveRowResize(clientY) {
    if (!isRowDragging || !currentStaffCardFn) return;
    let diff = clientY - rowStartY; let newHeight = rowStartHeight + diff;
    if (newHeight < 60) newHeight = 60;
    currentStaffCardFn.style.height = newHeight + 'px';
    if (currentTrackRowFn) currentTrackRowFn.style.height = newHeight + 'px';
}
function endRowResize() {
    if (isRowDragging) {
        isRowDragging = false; document.body.style.cursor = 'default'; document.body.style.overflow = '';
        if (currentRowId && currentStaffCardFn) {
            const finalHeight = parseInt(currentStaffCardFn.style.height, 10);
            staffData = staffData.map(s => s.id === currentRowId ? { ...s, height: finalHeight } : s);
            saveScheduleData(); 
        }
        currentRowId = null; currentStaffCardFn = null; currentTrackRowFn = null;
    }
}
document.addEventListener('mousemove', (e) => {
    if (isColDragging) { e.preventDefault(); moveColResize(e.clientX); }
    if (isRowDragging) { e.preventDefault(); moveRowResize(e.clientY); }
});
document.addEventListener('mouseup', () => { endColResize(); endRowResize(); });
document.addEventListener('touchmove', (e) => {
    if (isColDragging) { if(e.cancelable) e.preventDefault(); moveColResize(e.touches[0].clientX); }
    if (isRowDragging) { if(e.cancelable) e.preventDefault(); moveRowResize(e.touches[0].clientY); }
}, { passive: false });
document.addEventListener('touchend', () => { endColResize(); endRowResize(); });

async function quickPaste(staffId) {
    try {
        const text = await navigator.clipboard.readText();
        if (!text || text.trim() === "") { showToast("⚠️ 剪貼簿裡面沒有文字喔"); return; }
        
        const staff = staffData.find(s => s.id === staffId);
        if (staff.content && staff.content.trim() !== "") {
            if (!confirm(`確定要覆蓋 ${staff.name || staff.roomName || '此人員'} 的班表嗎？\n(原本的內容將被清空)`)) { return; }
        }
        
        staffData = staffData.map(s => {
            if (s.id === staffId) { return { ...s, content: text.trim(), overrides: {} }; }
            return s;
        });
        
        saveScheduleData(); renderScheduleAll();
        if (document.getElementById('view-settle').classList.contains('active')) { renderSettlementTable(); }
        showToast(`✅ 已成功貼上班表！`);
        
    } catch (err) {
        console.error("剪貼簿自動讀取失敗:", err);
        const manualText = prompt("⚠️ 瀏覽器阻擋自動讀取剪貼簿。\n請直接在下方框框「長按並貼上」班表：");
        if (manualText !== null && manualText.trim() !== "") {
            staffData = staffData.map(s => {
                if (s.id === staffId) return { ...s, content: manualText.trim(), overrides: {} };
                return s;
            });
            saveScheduleData(); renderScheduleAll();
            if (document.getElementById('view-settle').classList.contains('active')) { renderSettlementTable(); }
            showToast(`✅ 已手動貼上班表！`);
        }
    }
}

// ==========================================
// 🌟 版面與邏輯分離：專門印出 HTML 的小幫手們 (排班表)
// ==========================================

function buildStaffCardHTML(p) {
    return `
        <div class="staff-header" style="display:flex; align-items:center; padding-right:5px; padding-top:2px;">
            <div class="idx-badge">${p.index + 1}</div>
            ${p.roomBadge}
            <input class="staff-name" placeholder="姓名" value="${p.staffName}" onchange="updateStaffName(${p.staffId}, this.value)" style="flex:1; min-width:40px; padding:2px; margin-right:4px;">
            <select class="region-select-mini" onchange="updateStaffRegion(${p.staffId}, this.value)" style="max-width:55px; background-color:${p.regionColor}; color:white; border:none; border-radius:4px; padding:2px; font-weight:bold;">${p.regionOptions}</select>
        </div>
        <div class="schedule-text-display" onclick="openEditModal(${p.staffId})">${p.staffContent}</div>
        <button class="btn-floating-paste" onclick="quickPaste(${p.staffId})" title="一鍵貼上班表">📥</button>
        <div class="row-resizer" onmousedown="initRowResize(event, ${p.staffId})" ontouchstart="initRowResize(event, ${p.staffId})"></div>
    `;
}

function buildRulerMarkHTML(left, displayHStr) {
    return `<div class="hour-mark" style="left:${left}px;">${displayHStr}</div>`;
}

function buildGridLineHTML(left) {
    return `<div class="v-line" style="left:${left}px;"></div>`;
}

function buildTrackContainerHTML(totalWidth, gridBgContent) {
    return `<div class="grid-lines" id="gridBg" style="width: ${totalWidth}px;">${gridBgContent}</div><div id="currentTimeLine" class="current-time-line"></div>`;
}

function buildFreeBlockLabelHTML(durationStr, startStr, endStr) {
    return `<b>${durationStr}</b><div style="font-size:10px; margin-top:1px;">${startStr}-${endStr}</div>`;
}
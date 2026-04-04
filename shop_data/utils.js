// === utils.js : 通用工具函數 ===

function parseTime(timeStr) { 
    if (!timeStr) return null; 
    timeStr = timeStr.replace('.', ':'); 
    let parts = timeStr.split(':'); 
    let h = 0, m = 0; 
    if (parts.length === 2) { 
        h = parseInt(parts[0]); m = parseInt(parts[1]); 
    } else if (timeStr.length === 4) { 
        h = parseInt(timeStr.substring(0, 2)); m = parseInt(timeStr.substring(2, 4)); 
    } else { 
        h = parseInt(timeStr); 
    } 
    if (isNaN(h)) return null; 
    if (h < 11) h += 24; 
    return h * 60 + m; 
}

function formatTime(minutes) { 
    let h = Math.floor(minutes / 60); 
    let m = minutes % 60; 
    if (h > 24) h -= 24; 
    return (h < 10 ? "0"+h : h) + ":" + (m < 10 ? "0"+m : m); 
}

function formatDuration(mins) { 
    let h = Math.floor(mins / 60); 
    let m = mins % 60; 
    return (h > 0 ? h + "h" : "") + (m > 0 ? m + "m" : ""); 
}

function getTaskHash(rawText, startMinutes) { 
    const safeText = rawText.replace(/[^a-zA-Z0-9]/g, '').substring(0, 15); 
    return `T${startMinutes}_${safeText}`; 
}

function showToast(msg) {
    const t = document.getElementById("toast");
    if(t) {
        t.innerText = msg;
        t.className = "show";
        setTimeout(() => { t.className = t.className.replace("show", ""); }, 3000);
    }
}

function getRegionColor(regionName) {
    if (typeof REGIONS === 'undefined') return "#95a5a6";
    let idx = REGIONS.indexOf(regionName);
    if (idx === -1) return "#95a5a6"; 
    
    const REGION_COLORS = [
        "#3498db", "#9b59b6", "#e67e22", "#1abc9c", 
        "#e74c3c", "#34495e", "#f39c12", "#2ecc71"
    ];
    return REGION_COLORS[idx % REGION_COLORS.length];
}

const ALARM_URL = "https://actions.google.com/sounds/v1/alarms/bugle_tune.ogg"; 
const alarmAudio = new Audio(ALARM_URL);

function playLoudAlarm() {
    alarmAudio.currentTime = 0;
    const playPromise = alarmAudio.play();
    if (playPromise !== undefined) {
        playPromise.then(_ => {
            setTimeout(() => {
                alarmAudio.pause();
                alarmAudio.currentTime = 0; 
            }, 4000); 
        })
        .catch(error => { console.warn("音效播放失敗:", error); });
    }
}

function sendSystemNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body: body, requireInteraction: true });
    }
}

function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") { showToast("✅ 已開啟通知權限"); playLoudAlarm(); }
        });
    } else {
        alarmAudio.play().then(() => { setTimeout(() => alarmAudio.pause(), 100); }).catch(() => {});
    }
}

// 🌟 優化與重構 第一步：統一抓取全局的算錢參數表
function getGlobalPricingTables() {
    const getGlobalVal = (id) => { const el = document.getElementById(id); return el ? (parseInt(el.value) || 0) : 0; };
    const globalCommTable = { 
        "40-1": getGlobalVal('base_40_1'), 
        "60-1": getGlobalVal('base_60_1'), 
        "60-2": getGlobalVal('base_60_2'), 
        "120-3": getGlobalVal('base_120_3'), 
        "240-3": getGlobalVal('base_240_3') 
    };
    const globalCostTable = { 
        "40-1": getGlobalVal('cost_40_1'), 
        "60-1": getGlobalVal('cost_60_1'), 
        "60-2": getGlobalVal('cost_60_2'), 
        "120-3": getGlobalVal('cost_120_3'), 
        "240-3": getGlobalVal('cost_240_3') 
    };
    const globalWorkTable = { 
        "40-1": typeof WORK_UNIT_TABLE !== 'undefined' ? (WORK_UNIT_TABLE[40] || 0) : 1, 
        "60-1": typeof WORK_UNIT_TABLE !== 'undefined' ? (WORK_UNIT_TABLE[60] || 0) : 1, 
        "60-2": typeof WORK_UNIT_TABLE !== 'undefined' ? (WORK_UNIT_TABLE[60] || 0) : 1, 
        "120-3": typeof WORK_UNIT_TABLE !== 'undefined' ? (WORK_UNIT_TABLE[120] || 0) : 2, 
        "240-3": typeof WORK_UNIT_TABLE !== 'undefined' ? (WORK_UNIT_TABLE[240] || 0) : 3 
    };
    return { globalCommTable, globalCostTable, globalWorkTable };
}
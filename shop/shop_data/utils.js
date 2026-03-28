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

// 🌟 確保保留了自動發放顏色的功能
function getRegionColor(regionName) {
    if (typeof REGIONS === 'undefined') return "#95a5a6";
    let idx = REGIONS.indexOf(regionName);
    if (idx === -1) return "#95a5a6"; 
    
    const REGION_COLORS = [
        "#3498db", // 藍色
        "#9b59b6", // 紫色
        "#e67e22", // 橘色
        "#1abc9c", // 藍綠色
        "#e74c3c", // 紅色
        "#34495e", // 深藍灰
        "#f39c12", // 亮橘黃
        "#2ecc71"  // 綠色
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
        .catch(error => {
            console.warn("音效播放失敗 (可能瀏覽器阻擋，需先點擊頁面):", error);
        });
    }
}

function sendSystemNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, {
            body: body,
            requireInteraction: true 
        });
    }
}

function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                showToast("✅ 已開啟通知權限");
                playLoudAlarm(); 
            }
        });
    } else {
        alarmAudio.play().then(() => {
            setTimeout(() => alarmAudio.pause(), 100);
        }).catch(() => {});
    }
}
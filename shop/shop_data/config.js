// === config.js : 設定與資料狀態 ===

// ==========================================
// 0. 系統設定物件（預設值，會被 Firebase system_config 覆蓋）
// ==========================================
const SYSTEM_CONFIG = {
    systemPassword: "8888",
    defaultAgentRate: 300,
    pxPerMin: 2,
    defaultOpenHour: 12,
    defaultCloseHour: 26,
    pricingTable: [
        { duration: 40, count: 1, comm: 1100, cost: 2300, work: 1 },
        { duration: 60, count: 1, comm: 1400, cost: 2700, work: 1 },
        { duration: 60, count: 2, comm: 1900, cost: 3300, work: 1 },
        { duration: 120, count: 3, comm: 2800, cost: 4800, work: 2 },
        { duration: 240, count: 3, comm: 4200, cost: 8100, work: 3 }
    ],
    workUnitTable: { 40: 1, 50: 1, 60: 1, 120: 2, 200: 3, 240: 3 },
    auntExtraNames: ["顏同", "有菜", "澄澄", "姚貴", "曼達", "阿鳴", "鳴"],
    auntExtraAmount: 100,
    auntDivisor: 100
};

// ==========================================
// 1. Firebase 設定（優先從 localStorage 讀取自訂連線）
// ==========================================
const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDsUsWuynci0DP71veuu19Ht8bJmhHSkHs",
    authDomain: "worktools-f53e5.firebaseapp.com",
    databaseURL: "https://worktools-f53e5-default-rtdb.firebaseio.com",
    projectId: "worktools-f53e5",
    storageBucket: "worktools-f53e5.firebasestorage.app",
    messagingSenderId: "950551082090",
    appId: "1:950551082090:web:3c2c4962b5ffa044aec613",
    measurementId: "G-EKPY3SC0BR"
};

function getFirebaseConfig() {
    const saved = localStorage.getItem('custom_firebase_config');
    if (saved) {
        try { return { ...DEFAULT_FIREBASE_CONFIG, ...JSON.parse(saved) }; } catch(e) {}
    }
    return DEFAULT_FIREBASE_CONFIG;
}

const firebaseConfig = getFirebaseConfig();

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// ==========================================
// 2. 從 Firebase 載入 system_config 覆蓋預設值
// ==========================================
async function loadSystemConfig() {
    try {
        const snap = await db.ref('system_config').once('value');
        const val = snap.val();
        if (val) {
            // 逐一覆蓋，保留未設定的預設值
            if (val.systemPassword !== undefined) SYSTEM_CONFIG.systemPassword = val.systemPassword;
            if (val.defaultAgentRate !== undefined) SYSTEM_CONFIG.defaultAgentRate = val.defaultAgentRate;
            if (val.pxPerMin !== undefined) SYSTEM_CONFIG.pxPerMin = val.pxPerMin;
            if (val.defaultOpenHour !== undefined) SYSTEM_CONFIG.defaultOpenHour = val.defaultOpenHour;
            if (val.defaultCloseHour !== undefined) SYSTEM_CONFIG.defaultCloseHour = val.defaultCloseHour;
            if (val.auntExtraAmount !== undefined) SYSTEM_CONFIG.auntExtraAmount = val.auntExtraAmount;
            if (val.auntDivisor !== undefined) SYSTEM_CONFIG.auntDivisor = val.auntDivisor;
            if (Array.isArray(val.auntExtraNames)) SYSTEM_CONFIG.auntExtraNames = val.auntExtraNames;
            if (Array.isArray(val.pricingTable)) SYSTEM_CONFIG.pricingTable = val.pricingTable;
            if (val.workUnitTable && typeof val.workUnitTable === 'object') {
                SYSTEM_CONFIG.workUnitTable = {};
                for (const [k, v] of Object.entries(val.workUnitTable)) {
                    SYSTEM_CONFIG.workUnitTable[parseInt(k)] = v;
                }
            }
        }
    } catch(e) {
        console.warn('載入 system_config 失敗，使用預設值:', e);
    }

    // 載入後同步全局變數
    applySystemConfig();
}

function applySystemConfig() {
    // 同步 PX_PER_MIN
    PX_PER_MIN = SYSTEM_CONFIG.pxPerMin;
    // 同步 WORK_UNIT_TABLE
    WORK_UNIT_TABLE = { ...SYSTEM_CONFIG.workUnitTable };
    // 同步 AUNT_EXTRA_NAMES
    AUNT_EXTRA_NAMES = [...SYSTEM_CONFIG.auntExtraNames];

    // 同步底薪/底價 hidden inputs（如果存在的話）
    SYSTEM_CONFIG.pricingTable.forEach(row => {
        const key = `${row.duration}_${row.count}`;
        const baseEl = document.getElementById('base_' + key);
        const costEl = document.getElementById('cost_' + key);
        if (baseEl) baseEl.value = row.comm;
        if (costEl) costEl.value = row.cost;
    });

    // 同步開關門時間
    const openEl = document.getElementById('openHour');
    const closeEl = document.getElementById('closeHour');
    if (openEl && !openEl.dataset.userSet) openEl.value = SYSTEM_CONFIG.defaultOpenHour;
    if (closeEl && !closeEl.dataset.userSet) closeEl.value = SYSTEM_CONFIG.defaultCloseHour;
}

// 動態產生 hidden inputs（由 shop.html 呼叫）
function generatePricingInputs() {
    const container = document.getElementById('pricingInputsContainer');
    if (!container) return;
    container.innerHTML = '';
    SYSTEM_CONFIG.pricingTable.forEach(row => {
        const key = `${row.duration}_${row.count}`;
        container.innerHTML += `<input type="hidden" id="base_${key}" value="${row.comm}">`;
        container.innerHTML += `<input type="hidden" id="cost_${key}" value="${row.cost}">`;
    });
}

// ==========================================
// 3. 全局變數（可被 system_config 覆蓋）
// ==========================================
let PX_PER_MIN = SYSTEM_CONFIG.pxPerMin;
let WORK_UNIT_TABLE = { ...SYSTEM_CONFIG.workUnitTable };
let AUNT_EXTRA_NAMES = [...SYSTEM_CONFIG.auntExtraNames];

let REGIONS = [];
let currentRegion = ["All"];
let roomConfig = {};
let regionPrefixes = {};
let staffData = [];
let services = [];

// 當前操作狀態
let currentEditingStaffId = null;
let currentTaskElement = null;
let currentTaskInfo = null;
let currentParamsStaffId = null;

// 日結鎖定狀態
let isLocked = false;

// 是否僅顯示上班人員的開關
let showWorkingOnly = false;

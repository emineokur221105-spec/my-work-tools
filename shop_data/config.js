// === config.js : 設定與資料狀態 ===

// 1. Firebase 設定
const firebaseConfig = {
    apiKey: "AIzaSyDsUsWuynci0DP71veuu19Ht8bJmhHSkHs", 
    authDomain: "worktools-f53e5.firebaseapp.com",
    databaseURL: "https://worktools-f53e5-default-rtdb.firebaseio.com",
    projectId: "worktools-f53e5",
    storageBucket: "worktools-f53e5.firebasestorage.app",
    messagingSenderId: "950551082090",
    appId: "1:950551082090:web:3c2c4962b5ffa044aec613",
    measurementId: "G-EKPY3SC0BR"
};
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// 2. 全局常數與變數
const PX_PER_MIN = 2; 
const WORK_UNIT_TABLE = {40: 1, 50: 1, 60: 1, 120: 2, 200: 3, 240: 3}; 

// 👇 已經幫你把需要阿姨帳 +1 的名單更新上去了！
const AUNT_EXTRA_NAMES = ["顏同", "有菜", "澄澄", "姚貴", "曼達", "阿鳴", "鳴"]; 

let REGIONS = []; 
let currentRegion = ["All"]; // 🌟 升級：改為陣列支援多選
let roomConfig = {};
let regionPrefixes = {}; // 🌟 新增：用來記憶每個區域的「專屬複製前標」
let staffData = [];
let services = []; 

// 當前操作狀態
let currentEditingStaffId = null; 
let currentTaskElement = null; 
let currentTaskInfo = null;
let currentParamsStaffId = null;

// 👇 日結鎖定狀態
let isLocked = false;

// 🌟 新增：是否僅顯示上班人員的開關
let showWorkingOnly = false;
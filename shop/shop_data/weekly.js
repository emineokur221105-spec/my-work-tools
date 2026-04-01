// === weekly.js : 周結與報表邏輯 (週次獨立支出版) ===

// 1. 全局變數
let rawWeeklyData = {};
let expenseGroups = []; // 此變數現在會隨週次切換而變動
let currentWeeklyRegions = ["All"];
let weekRangesMap = {};
let weekRangeKeys = [];
let activeWeekRange = "";
let selectedDates = [];

// 🌟 注入周結專屬 CSS
const weeklyStyle = document.createElement('style');
weeklyStyle.innerHTML = `
    .week-range-btn { padding: 8px 16px; border-radius: 20px; border: 2px solid #3498db; background: white; color: #3498db; font-size: 14px; font-weight: bold; cursor: pointer; transition: 0.2s; white-space: nowrap; }
    .week-range-btn.active { background: #3498db; color: white; box-shadow: 0 4px 8px rgba(52,152,219,0.3); }
    .day-check-label { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 16px; border: 2px solid #bdc3c7; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; color: #7f8c8d; background: white; transition: 0.2s; user-select: none; min-width: 110px; }
    .day-check-label input { display: none; }
    .day-check-label.checked { background: #e1f5fe; color: #007bff; border-color: #007bff; }
    .day-check-label.checked::before { content: '✔'; font-size: 14px; }
    .breakdown-row { display: flex; justify-content: space-between; font-size: 12px; color: #7f8c8d; padding: 3px 0; border-bottom: 1px dashed #eee; }
    .breakdown-row:last-child { border-bottom: none; }
    .expense-card { background: #fffcf5; border: 1px solid #f8c471; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
    .expense-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #fad7a1; padding-bottom: 8px; margin-bottom: 5px; color: #c0392b; font-weight: bold; }
    .expense-item-row { display: flex; gap: 5px; align-items: center; margin-bottom: 5px; }
    .expense-item-row input { border: 1px solid #ccc; border-radius: 4px; padding: 6px; font-size: 14px; }
    .add-expense-item-btn { width: 100%; border: 1px dashed #3498db; background: transparent; color: #3498db; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; margin-top: 5px; }
    .region-btn.multi-active { background: #3498db; color: white; border-color: #2980b9; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
`;
document.head.appendChild(weeklyStyle);

// 2. 讀取與初始化
async function loadWeeklyData() {
    try {
        const snapData = await db.ref('shop_v8_daily_summaries').once('value');
        rawWeeklyData = snapData.val() || {};
        
        let availableDates = Object.keys(rawWeeklyData).map(k => rawWeeklyData[k].dateName).filter(Boolean);
        availableDates = [...new Set(availableDates)].sort(); 

        groupDatesByWeek(availableDates);
        
        // 預設選中最後一週
        if (!activeWeekRange || !weekRangeKeys.includes(activeWeekRange)) {
            activeWeekRange = weekRangeKeys.length > 0 ? weekRangeKeys[weekRangeKeys.length - 1] : "";
            if (activeWeekRange) selectedDates = [...weekRangesMap[activeWeekRange]]; 
        }
        
        renderWeeklyRegionTabs();
        renderWeekRangesAndDays();
        calculateAndRenderSummaries();
        
        // 🌟 核心修改：讀取該週次獨立的支出資料
        loadExpensesForActiveWeek();
        
    } catch (e) { console.error("周結初始化失敗:", e); }
}

// 🌟 新增：讀取特定週次的支出
async function loadExpensesForActiveWeek() {
    if (!activeWeekRange) return;
    // 將區間字串轉為 Firebase 安全路徑 (移除空格與正斜線)
    const safeKey = activeWeekRange.replace(/\//g, '-').replace(/\s/g, '');
    const snap = await db.ref('shop_v8_weekly_expenses/' + safeKey).once('value');
    const val = snap.val();
    expenseGroups = val ? (val.expenseGroups || []) : [];
    renderExpenses();
}

function groupDatesByWeek(dates) {
    weekRangesMap = {}; weekRangeKeys = [];
    const year = new Date().getFullYear();
    dates.forEach(dateStr => {
        const parts = dateStr.split('/');
        if(parts.length !== 2) return;
        const d = new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
        const monday = new Date(d.setDate(diff));
        const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
        const formatD = (dt) => {
            let m = dt.getMonth() + 1; let day = dt.getDate();
            return (m < 10 ? '0' + m : m) + '/' + (day < 10 ? '0' + day : day);
        };
        const rangeStr = `${formatD(monday)} - ${formatD(sunday)}`;
        if (!weekRangesMap[rangeStr]) { weekRangesMap[rangeStr] = []; weekRangeKeys.push(rangeStr); }
        weekRangesMap[rangeStr].push(dateStr);
    });
    weekRangeKeys.sort();
}

function getDayOfWeekStr(dateStr) {
    const d = new Date(new Date().getFullYear(), parseInt(dateStr.split('/')[0]) - 1, parseInt(dateStr.split('/')[1]));
    return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
}

function renderWeeklyRegionTabs() {
    const container = document.getElementById('weeklyRegionTabs');
    if(!container) return;
    let html = `<button class="region-btn ${currentWeeklyRegions.includes('All') ? 'active' : ''}" onclick="switchWeeklyRegion('All')">全部顯示</button>`;
    REGIONS.forEach(r => {
        const isActive = currentWeeklyRegions.includes(r);
        html += `<button class="region-btn ${isActive ? 'multi-active' : ''}" onclick="switchWeeklyRegion('${r}')">${r}</button>`;
    });
    container.innerHTML = html;
}

window.switchWeeklyRegion = function(region) {
    if (region === 'All') { currentWeeklyRegions = ['All']; } 
    else {
        if (currentWeeklyRegions.includes('All')) { currentWeeklyRegions = [region]; } 
        else {
            if (currentWeeklyRegions.includes(region)) { currentWeeklyRegions = currentWeeklyRegions.filter(r => r !== region); } 
            else { currentWeeklyRegions.push(region); }
        }
        if (currentWeeklyRegions.length === 0) currentWeeklyRegions = ['All'];
    }
    renderWeeklyRegionTabs(); calculateAndRenderSummaries();
};

function renderWeekRangesAndDays() {
    const container = document.getElementById('weekly_days_container');
    if (!container) return;
    
    let rangeButtons = weekRangeKeys.map(key => `
        <button class="week-range-btn ${key === activeWeekRange ? 'active' : ''}" onclick="switchWeekRange('${key}')">${key}</button>
    `).join('');
    
    let dayCheckboxes = (weekRangesMap[activeWeekRange] || []).map(dateStr => `
        <label class="day-check-label ${selectedDates.includes(dateStr) ? 'checked' : ''}">
            <input type="checkbox" ${selectedDates.includes(dateStr) ? 'checked' : ''} onchange="toggleDay('${dateStr}', this.checked)">
            ${dateStr} (${getDayOfWeekStr(dateStr)})
        </label>
    `).join('');

    container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 15px;">
            <div>
                <div style="font-size: 15px; font-weight: bold; color: #34495e; margin-bottom: 10px;">📁 1. 選擇週次區間</div>
                <div style="display:flex; gap:12px; overflow-x:auto; padding-bottom:5px;">${rangeButtons || '無紀錄'}</div>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 12px; border: 1px solid #e9ecef;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <div style="font-size: 15px; font-weight: bold; color: #2980b9;">✅ 2. 勾選每日明細 <span style="font-size:13px; color:#7f8c8d;">(${activeWeekRange})</span></div>
                    <div style="display:flex; gap:10px;">
                        <button onclick="toggleAllDays()" style="background:#f39c12; color:white; border:none; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:bold;">🔄 全選/取消</button>
                        <button onclick="deleteSelectedDays()" style="background:#e74c3c; color:white; border:none; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:bold;">🗑️ 刪除紀錄</button>
                    </div>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:10px;">${dayCheckboxes || '無資料'}</div>
            </div>
        </div>
    `;
}

window.switchWeekRange = function(rangeKey) {
    activeWeekRange = rangeKey;
    selectedDates = [...(weekRangesMap[rangeKey] || [])];
    renderWeekRangesAndDays();
    calculateAndRenderSummaries();
    // 🌟 核心修改：切換週次時，載入該週專屬支出
    loadExpensesForActiveWeek();
};

window.toggleAllDays = function() {
    const daysInView = weekRangesMap[activeWeekRange] || [];
    if (daysInView.every(d => selectedDates.includes(d))) { selectedDates = selectedDates.filter(d => !daysInView.includes(d)); } 
    else { daysInView.forEach(d => { if(!selectedDates.includes(d)) selectedDates.push(d); }); }
    renderWeekRangesAndDays(); calculateAndRenderSummaries();
};

window.toggleDay = function(dateStr, isChecked) {
    if (isChecked) { if (!selectedDates.includes(dateStr)) selectedDates.push(dateStr); }
    else { selectedDates = selectedDates.filter(d => d !== dateStr); }
    renderWeekRangesAndDays(); calculateAndRenderSummaries();
};

window.deleteSelectedDays = function() {
    if (selectedDates.length === 0) return alert("請先勾選日期");
    if (confirm(`確定要刪除這 ${selectedDates.length} 天的結算紀錄嗎？`)) {
        selectedDates.forEach(dateStr => db.ref('shop_v8_daily_summaries/' + dateStr.replace(/\//g, '-')).remove());
        location.reload();
    }
};

function calculateAndRenderSummaries() {
    let totals = { rev: 0, aunt: 0, agent: 0, works: 0, dailyProfit: 0 };
    let breakdowns = { rev: [], aunt: [], agentMap: {}, works: [], dailyProfit: [] };

    selectedDates.sort().forEach(dateStr => {
        const dData = rawWeeklyData[dateStr.replace(/\//g, '-')];
        if (!dData) return;
        const isAll = currentWeeklyRegions.includes('All');
        let dRev = 0, dAunt = 0, dAgent = 0, dWorks = 0, dProfit = 0;
        if (isAll) {
            dRev = dData.revenue || 0; dAunt = dData.aunt || 0; dAgent = dData.agentTotal || 0; dWorks = dData.works || 0; dProfit = dData.profit || 0;
            if(dData.agentMap) for(let [agent, fee] of Object.entries(dData.agentMap)) breakdowns.agentMap[agent] = (breakdowns.agentMap[agent] || 0) + fee;
        } else {
            currentWeeklyRegions.forEach(r => {
                const rData = (dData.regionData && dData.regionData[r]) || {};
                dRev += (rData.revenue || 0); dAunt += (rData.aunt || 0); dAgent += (rData.agentTotal || 0); dWorks += (rData.works || 0); dProfit += (rData.profit || 0);
                if(rData.agentMap) for(let [agent, fee] of Object.entries(rData.agentMap)) breakdowns.agentMap[agent] = (breakdowns.agentMap[agent] || 0) + fee;
            });
        }
        totals.rev += dRev; totals.aunt += dAunt; totals.agent += dAgent; totals.works += dWorks; totals.dailyProfit += dProfit;
        breakdowns.rev.push({date: dateStr, val: dRev}); breakdowns.aunt.push({date: dateStr, val: dAunt}); breakdowns.works.push({date: dateStr, val: dWorks}); breakdowns.dailyProfit.push({date: dateStr, val: dProfit});
    });

    const fStr = (arr) => arr.map(x => `<div class="breakdown-row"><span>${x.date}</span><span>$${x.val.toLocaleString()}</span></div>`).join('');
    document.getElementById('week_revenue').innerText = totals.rev.toLocaleString();
    document.getElementById('week_revenue_breakdown').innerHTML = fStr(breakdowns.rev);
    document.getElementById('week_aunt').innerText = totals.aunt.toLocaleString();
    document.getElementById('week_aunt_breakdown').innerHTML = fStr(breakdowns.aunt);
    document.getElementById('week_works').innerText = totals.works.toLocaleString();
    document.getElementById('week_works_breakdown').innerHTML = breakdowns.works.map(x => `<div class="breakdown-row"><span>${x.date}</span><span>${x.val}</span></div>`).join('');
    document.getElementById('week_daily_profit').innerText = '$' + totals.dailyProfit.toLocaleString();
    document.getElementById('week_daily_profit_breakdown').innerHTML = fStr(breakdowns.dailyProfit);
    document.getElementById('week_agent_total').innerText = '$' + totals.agent.toLocaleString();
    let agentHtml = "";
    for(let [a, v] of Object.entries(breakdowns.agentMap)) if (v > 0) agentHtml += `<div class="breakdown-row"><span>${a}</span><span style="color:#c0392b; font-weight:bold;">$${v.toLocaleString()}</span></div>`;
    document.getElementById('week_agent_breakdown').innerHTML = agentHtml || '<div style="color:#aaa; font-size:12px;">無經紀費支出</div>';
    updateFinalProfit(totals.dailyProfit);
}

function renderExpenses() {
    const container = document.getElementById('weekly_expenses_container');
    if(!container) return;
    let totalExpenseAmount = 0; container.innerHTML = '';
    expenseGroups.forEach((group, gIdx) => {
        let groupTotal = 0;
        let itemsHtml = group.items.map((item, iIdx) => {
            groupTotal += (parseInt(item.amount) || 0);
            return `<div class="expense-item-row">
                <input type="text" value="${item.name}" placeholder="項目" style="flex:1;" onchange="updateExpense(${gIdx}, ${iIdx}, 'name', this.value)">
                <span style="color:#95a5a6;">$</span>
                <input type="number" value="${item.amount}" placeholder="0" style="width:80px; text-align:right;" onchange="updateExpense(${gIdx}, ${iIdx}, 'amount', this.value)">
                <button class="btn-circle btn-red" style="width:20px; height:20px;" onclick="removeExpenseItem(${gIdx}, ${iIdx})">×</button>
            </div>`;
        }).join('');
        totalExpenseAmount += groupTotal;
        const card = document.createElement('div'); card.className = 'expense-card';
        card.innerHTML = `
            <div class="expense-header">
                👤 <input type="text" value="${group.name}" onchange="updateExpenseGroup(${gIdx}, this.value)" style="border:none; background:transparent; font-weight:bold; width:80px;">
                <div style="display:flex; gap:10px; align-items:center;">
                    <span>$${groupTotal.toLocaleString()}</span>
                    <button class="btn-circle btn-red" style="width:20px; height:20px;" onclick="removeExpenseGroup(${gIdx})">×</button>
                </div>
            </div>
            ${itemsHtml}
            <button class="add-expense-item-btn" onclick="addExpenseItem(${gIdx})">+ 新增支出項目</button>`;
        container.appendChild(card);
    });
    document.getElementById('week_expenses_total_top').innerText = totalExpenseAmount.toLocaleString();
    document.getElementById('week_expenses_total_bottom').innerText = totalExpenseAmount.toLocaleString();
    calculateAndRenderSummaries();
}

function updateFinalProfit(dailyProfitSum) {
    const totalExpense = expenseGroups.reduce((sum, g) => sum + g.items.reduce((s, i) => s + (parseInt(i.amount) || 0), 0), 0);
    document.getElementById('week_final_profit').innerText = (dailyProfitSum - totalExpense).toLocaleString();
}

window.addExpenseGroup = function() { expenseGroups.push({ id: Date.now(), name: "人員", items: [] }); saveWeeklyState(); renderExpenses(); };
window.removeExpenseGroup = function(gIdx) { if(confirm("刪除人員？")) { expenseGroups.splice(gIdx, 1); saveWeeklyState(); renderExpenses(); } };
window.updateExpenseGroup = function(gIdx, newName) { expenseGroups[gIdx].name = newName; saveWeeklyState(); };
window.addExpenseItem = function(gIdx) { expenseGroups[gIdx].items.push({ name: "", amount: 0 }); saveWeeklyState(); renderExpenses(); };
window.removeExpenseItem = function(gIdx, iIdx) { expenseGroups[gIdx].items.splice(iIdx, 1); saveWeeklyState(); renderExpenses(); };
window.updateExpense = function(gIdx, iIdx, field, value) {
    if(field === 'amount') value = parseInt(value) || 0;
    expenseGroups[gIdx].items[iIdx][field] = value;
    saveWeeklyState(); renderExpenses();
};

// 🌟 核心修改：儲存時指向該週次的獨立路徑
function saveWeeklyState() {
    if (!activeWeekRange) return;
    const safeKey = activeWeekRange.replace(/\//g, '-').replace(/\s/g, '');
    db.ref('shop_v8_weekly_expenses/' + safeKey).update({ expenseGroups: expenseGroups });
}

window.copyWeeklyReport = function() {
    const datesText = activeWeekRange ? `[${activeWeekRange}]` : "";
    const rev = document.getElementById('week_revenue').innerText;
    const aunt = document.getElementById('week_aunt').innerText;
    const agent = document.getElementById('week_agent_total').innerText;
    const exp = document.getElementById('week_expenses_total_top').innerText;
    const final = document.getElementById('week_final_profit').innerText;
    let text = `📅 周結報表 ${datesText}\n區域: ${currentWeeklyRegions.join('+')}\n總收: ${rev}\n阿姨: ${aunt}\n經紀: ${agent}\n支出: $${exp}\n--------------------\n💰 最終盈餘: $${final}`;
    navigator.clipboard.writeText(text).then(() => alert("報表已複製！"));
};
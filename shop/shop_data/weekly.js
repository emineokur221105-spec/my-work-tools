// === weekly.js : 周結算邏輯 (獨立週次升級版) ===

let availableDailyData = {};
let groupedWeeks = {};       
let sortedWeekLabels = [];   
let activeWeekLabel = null;  

let selectedWeeklyDays = []; 
let weeklyExpenseGroups = []; 

// 🌟 全新升級：改成「陣列」來支援多個區域同時選取！
let currentWeeklyRegions = ['All']; 

window.addWeeklyExpense = function() { addExpenseGroup(); }

// 🌟 點擊區域標籤切換時觸發 (多選邏輯)
window.switchWeeklyRegion = function(region) {
    if (region === 'All') {
        currentWeeklyRegions = ['All']; // 點擊全部，就只留下全部
    } else {
        // 先把 'All' 給濾掉
        currentWeeklyRegions = currentWeeklyRegions.filter(r => r !== 'All');
        
        // 如果已經選過了，就取消選取；如果沒選過，就加進去
        if (currentWeeklyRegions.includes(region)) {
            currentWeeklyRegions = currentWeeklyRegions.filter(r => r !== region);
        } else {
            currentWeeklyRegions.push(region);
        }
        
        // 如果全部都取消選取了，預設跳回 'All'
        if (currentWeeklyRegions.length === 0) {
            currentWeeklyRegions = ['All'];
        }
    }
    
    if (typeof renderRegionTabs === 'function') renderRegionTabs(); // 更新按鈕顏色
    calculateWeekly(); // 重新計算多區加總
}

function loadWeeklyData() {
    if (typeof renderRegionTabs === 'function') renderRegionTabs(); 

    db.ref('shop_v8_daily_summaries').once('value').then(snap => {
        availableDailyData = snap.val() || {};
        
        groupedWeeks = {};
        const safeDates = Object.keys(availableDailyData);
        const currentYear = new Date().getFullYear();
        
        safeDates.forEach(safeDateKey => {
            const d = availableDailyData[safeDateKey];
            const realDateStr = d.dateName || safeDateKey.replace(/-/g, '/');
            const parts = realDateStr.split('/');
            if (parts.length !== 2) return;
            
            const dateObj = new Date(currentYear, parseInt(parts[0]) - 1, parseInt(parts[1]));
            const day = dateObj.getDay();
            const diffToMon = day === 0 ? -6 : 1 - day; 
            
            const mon = new Date(dateObj); mon.setDate(dateObj.getDate() + diffToMon);
            const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
            
            const fmt = dt => String(dt.getMonth()+1).padStart(2,'0') + '/' + String(dt.getDate()).padStart(2,'0');
            const weekLabel = `${fmt(mon)} - ${fmt(sun)}`; 
            
            if (!groupedWeeks[weekLabel]) groupedWeeks[weekLabel] = [];
            groupedWeeks[weekLabel].push(safeDateKey);
        });
        
        Object.keys(groupedWeeks).forEach(w => {
            groupedWeeks[w].sort((a,b) => {
                const d1 = new Date(currentYear, a.split('-')[0]-1, a.split('-')[1]);
                const d2 = new Date(currentYear, b.split('-')[0]-1, b.split('-')[1]);
                return d1 - d2;
            });
        });
        
        sortedWeekLabels = Object.keys(groupedWeeks).sort((a,b) => {
            const d1 = new Date(currentYear, a.substring(0,2)-1, a.substring(3,5));
            const d2 = new Date(currentYear, b.substring(0,2)-1, b.substring(3,5));
            return d1 - d2;
        });
        
        if (sortedWeekLabels.length > 0) {
            if (!activeWeekLabel || !sortedWeekLabels.includes(activeWeekLabel)) {
                activeWeekLabel = sortedWeekLabels[sortedWeekLabels.length - 1];
            }
            switchWeek(activeWeekLabel); 
        } else {
            renderWeeklyDays();
            renderWeeklyExpenses();
            calculateWeekly();
        }
    });
}

window.switchWeek = function(weekLabel) {
    activeWeekLabel = weekLabel;
    const safeKey = weekLabel.replace(/\//g, '-').replace(/\s+/g, ''); 
    
    db.ref('shop_v8_weekly_state_v4/' + safeKey).once('value').then(snap => {
        const state = snap.val() || {};
        
        if (state.selectedDays) {
            selectedWeeklyDays = state.selectedDays;
        } else {
            selectedWeeklyDays = [...groupedWeeks[activeWeekLabel]];
        }
        
        weeklyExpenseGroups = state.expenses || [];
        
        renderWeeklyDays();
        renderWeeklyExpenses();
        calculateWeekly();
    });
}

function renderWeeklyDays() {
    const container = document.getElementById('weekly_days_container');
    container.innerHTML = '';
    
    if (sortedWeekLabels.length === 0) {
        container.innerHTML = '<div style="color:#7f8c8d; font-size:14px; padding: 10px;">尚無任何日結資料。請先到「日結」頁面鎖定結算。</div>';
        return;
    }

    let tabsHtml = `<div style="display:flex; gap:10px; overflow-x:auto; width:100%; border-bottom: 2px solid #ecf0f1; padding-bottom: 15px; margin-bottom: 15px;">`;
    sortedWeekLabels.forEach(w => {
        const isActive = w === activeWeekLabel;
        tabsHtml += `<button onclick="switchWeek('${w}')" style="background:${isActive ? '#3498db' : '#f4f6f9'}; color:${isActive ? 'white' : '#2c3e50'}; border:1px solid ${isActive ? '#3498db' : '#bdc3c7'}; padding:8px 15px; border-radius:20px; font-size:14px; font-weight:bold; cursor:pointer; white-space:nowrap; transition:0.2s; box-shadow:${isActive ? '0 2px 5px rgba(52,152,219,0.3)' : 'none'};">${w}</button>`;
    });
    tabsHtml += `</div>`;
    container.insertAdjacentHTML('beforeend', tabsHtml);

    if (!activeWeekLabel || !groupedWeeks[activeWeekLabel]) return;

    const weekDates = groupedWeeks[activeWeekLabel];
    const isAllSelected = weekDates.length > 0 && weekDates.every(d => selectedWeeklyDays.includes(d));

    let daysHtml = `
    <div style="width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <div style="font-weight: bold; color: #2c3e50; font-size: 16px;">📌 結算明細區間：<span style="color:#e74c3c;">${activeWeekLabel}</span></div>
        <label style="cursor:pointer; font-size:13px; color:#fff; background:${isAllSelected ? '#e74c3c' : '#2ecc71'}; padding:6px 12px; border-radius:6px; display:flex; align-items:center; gap:5px; font-weight:bold; transition: 0.2s;">
            <input type="checkbox" ${isAllSelected ? 'checked' : ''} onchange="toggleWeekGroup(this.checked)" style="display:none;">
            <span>${isAllSelected ? '取消全選' : '一鍵全選本週'}</span>
        </label>
    </div>
    <div style="display:flex; flex-wrap:wrap; gap:10px; width: 100%;">
    `;

    const currentYear = new Date().getFullYear();
    const daysOfWeek = ["(日)", "(一)", "(二)", "(三)", "(四)", "(五)", "(六)"];

    weekDates.forEach(safeDateKey => {
        const d = availableDailyData[safeDateKey];
        const isChecked = selectedWeeklyDays.includes(safeDateKey) ? 'checked' : '';
        const displayName = d.dateName || safeDateKey.replace(/-/g, '/');
        
        const parts = displayName.split('/');
        const dateObj = new Date(currentYear, parseInt(parts[0]) - 1, parseInt(parts[1]));
        const dayStr = daysOfWeek[dateObj.getDay()];

        daysHtml += `
            <label style="background:${isChecked ? '#e1f5fe' : '#fff'}; padding:8px 12px; border-radius:8px; border:2px solid ${isChecked ? '#3498db' : '#ecf0f1'}; cursor:pointer; display:flex; align-items:center; gap:8px; transition:all 0.2s;">
                <input type="checkbox" value="${safeDateKey}" ${isChecked} onchange="toggleWeeklyDay('${safeDateKey}', this.checked)" style="transform: scale(1.2);">
                <span style="font-weight:bold; color:#2c3e50; font-size:14px;">${displayName} <span style="color:#7f8c8d; font-size:12px;">${dayStr}</span></span>
            </label>
        `;
    });
    daysHtml += `</div>`;

    container.insertAdjacentHTML('beforeend', daysHtml);
}

window.toggleWeekGroup = function(isChecked) {
    const weekDates = groupedWeeks[activeWeekLabel] || [];
    if (isChecked) { selectedWeeklyDays = [...weekDates]; } else { selectedWeeklyDays = []; }
    saveWeeklyState(); renderWeeklyDays(); calculateWeekly();
};

window.toggleWeeklyDay = function(safeDateKey, isChecked) {
    if(isChecked && !selectedWeeklyDays.includes(safeDateKey)) selectedWeeklyDays.push(safeDateKey);
    else if(!isChecked) selectedWeeklyDays = selectedWeeklyDays.filter(d => d !== safeDateKey);
    saveWeeklyState(); renderWeeklyDays(); calculateWeekly();
}

window.deleteSelectedDays = function() {
    if (selectedWeeklyDays.length === 0) { alert("請先勾選想要刪除的日期！"); return; }
    if (confirm("確定要刪除打勾的日期紀錄嗎？\n(這不會影響排班表，只會清除結算紀錄)")) {
        selectedWeeklyDays.forEach(safeDateKey => { db.ref('shop_v8_daily_summaries/' + safeDateKey).remove(); });
        selectedWeeklyDays = []; showToast("🗑️ 已刪除歷史紀錄"); loadWeeklyData(); 
    }
}

function renderWeeklyExpenses() {
    const container = document.getElementById('weekly_expenses_container');
    container.innerHTML = '';
    
    if (weeklyExpenseGroups.length === 0) {
        container.innerHTML = '<div style="grid-column: 1 / -1; color:#aaa; font-size:13px; text-align:center; padding:20px;">尚無支出紀錄，請點擊右上角 [+] 新增支出</div>';
        return;
    } 
    
    weeklyExpenseGroups.forEach((group, pIdx) => {
        let groupTotal = group.items.reduce((sum, item) => sum + (parseInt(item.amount) || 0), 0);
        let html = `
        <div style="background:#fff; border:1px solid #e0e0e0; border-radius:8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); overflow:hidden; display:flex; flex-direction:column;">
            <div style="background:#f8f9fa; padding:10px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee;">
                <div style="display:flex; align-items:center; gap:5px; flex:1;">
                    <span style="font-size:14px;">👤</span>
                    <input type="text" placeholder="人員" value="${group.payer}" onchange="updateExpenseGroup(${pIdx}, 'payer', this.value)" style="padding:4px 8px; border:1px solid #dcdde1; border-radius:4px; font-weight:bold; font-size:14px; color:#2980b9; width:100%; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);">
                </div>
                <div style="display:flex; align-items:center; gap:5px; margin-left:5px;">
                    <span style="color:#e74c3c; font-weight:bold; font-size:14px;">$${groupTotal.toLocaleString()}</span>
                    <button onclick="removeExpenseGroup(${pIdx})" style="background:transparent; border:none; color:#c0392b; font-size:16px; cursor:pointer; font-weight:bold; padding:0 5px;">×</button>
                </div>
            </div>
            <div style="padding:10px; display:flex; flex-direction:column; gap:8px; background:#fffcf5; flex:1;">
        `;

        group.items.forEach((item, iIdx) => {
            html += `
                <div style="display:flex; gap:5px; align-items:center;">
                    <input type="text" placeholder="細項" value="${item.item}" onchange="updateExpenseItem(${pIdx}, ${iIdx}, 'item', this.value)" style="flex:1.5; padding:6px; border:1px solid #ccc; border-radius:4px; font-size:12px; min-width:0;">
                    <input type="number" inputmode="numeric" placeholder="金額" value="${item.amount}" onchange="updateExpenseItem(${pIdx}, ${iIdx}, 'amount', this.value)" style="flex:1; padding:6px; border:1px solid #ccc; border-radius:4px; text-align:right; font-weight:bold; color:#d35400; font-size:13px; min-width:0;">
                    <button onclick="removeExpenseItem(${pIdx}, ${iIdx})" style="background:#e74c3c; color:white; border:none; width:22px; height:22px; border-radius:50%; font-size:12px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;">×</button>
                </div>`;
        });

        html += `
                <button onclick="addExpenseItem(${pIdx})" style="margin-top:auto; background:white; border:1px dashed #3498db; color:#3498db; padding:6px; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px; transition:0.2s;">
                    + 新增支出
                </button>
            </div>
        </div>`;
        container.insertAdjacentHTML('beforeend', html);
    });
}

function addExpenseGroup() { weeklyExpenseGroups.push({ payer: '', items: [{item:'', amount:0}] }); renderWeeklyExpenses(); saveWeeklyState(); }
function removeExpenseGroup(pIdx) { if(confirm('確定要刪除此人員及其所有支出項目嗎？')) { weeklyExpenseGroups.splice(pIdx, 1); renderWeeklyExpenses(); calculateWeekly(); saveWeeklyState(); } }
function updateExpenseGroup(pIdx, field, val) { weeklyExpenseGroups[pIdx][field] = val; saveWeeklyState(); }
function addExpenseItem(pIdx) { weeklyExpenseGroups[pIdx].items.push({ item: '', amount: 0 }); renderWeeklyExpenses(); saveWeeklyState(); }
function removeExpenseItem(pIdx, iIdx) { weeklyExpenseGroups[pIdx].items.splice(iIdx, 1); renderWeeklyExpenses(); calculateWeekly(); saveWeeklyState(); }
function updateExpenseItem(pIdx, iIdx, field, val) { if(field === 'amount') val = parseInt(val) || 0; weeklyExpenseGroups[pIdx].items[iIdx][field] = val; if(field === 'amount') renderWeeklyExpenses(); calculateWeekly(); saveWeeklyState(); }
function saveWeeklyState() { if (!activeWeekLabel) return; const safeKey = activeWeekLabel.replace(/\\/g, '-').replace(/\\s+/g, ''); db.ref('shop_v8_weekly_state_v4/' + safeKey).set({ selectedDays: selectedWeeklyDays, expenses: weeklyExpenseGroups }); }

function calculateWeekly() {
    let w_rev = 0, w_aunt = 0, w_agentTotal = 0, w_works = 0, w_dailyProfit = 0; let w_agentMap = {};
    let dailyRevHtml = ''; let dailyAuntHtml = ''; let dailyWorksHtml = ''; let dailyProfitHtml = '';

    selectedWeeklyDays.forEach(safeDateKey => {
        const d = availableDailyData[safeDateKey]; if(!d) return;
        
        let dayRev = 0, dayAunt = 0, dayAgent = 0, dayWorks = 0, dayProfit = 0;
        let dayAgentMap = {};
        const dateName = d.dateName || safeDateKey.replace(/-/g, '/');

        // 🌟 核心：如果是 All 就拿全部，否則跑迴圈把被選取的地區資料「全部加起來」
        if (currentWeeklyRegions.includes('All')) {
            dayRev = d.revenue || 0;
            dayAunt = d.aunt || 0;
            dayAgent = d.agentTotal || 0;
            dayWorks = d.works || 0;
            dayProfit = d.profit || 0;
            dayAgentMap = d.agentMap || {};
        } else {
            currentWeeklyRegions.forEach(region => {
                if (d.regionData && d.regionData[region]) {
                    const rd = d.regionData[region];
                    dayRev += rd.revenue || 0;
                    dayAunt += rd.aunt || 0;
                    dayAgent += rd.agentTotal || 0;
                    dayWorks += rd.works || 0;
                    dayProfit += rd.profit || 0;
                    
                    if (rd.agentMap) {
                        Object.entries(rd.agentMap).forEach(([name, fee]) => {
                            if(!dayAgentMap[name]) dayAgentMap[name] = 0;
                            dayAgentMap[name] += fee;
                        });
                    }
                }
            });
        }

        w_rev += dayRev; w_aunt += dayAunt; w_agentTotal += dayAgent; w_works += dayWorks; w_dailyProfit += dayProfit;
        
        if (dayRev > 0) dailyRevHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:2px;"><span>${dateName}</span> <span>$${dayRev.toLocaleString()}</span></div>`;
        if (dayAunt > 0) dailyAuntHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:2px;"><span>${dateName}</span> <span>$${dayAunt.toLocaleString()}</span></div>`;
        if (dayWorks > 0) dailyWorksHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:2px;"><span>${dateName}</span> <span>${dayWorks.toLocaleString()}</span></div>`;
        if (dayProfit !== 0) dailyProfitHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:2px;"><span>${dateName}</span> <span>$${dayProfit.toLocaleString()}</span></div>`;

        if(dayAgentMap) { Object.entries(dayAgentMap).forEach(([name, fee]) => { if(!w_agentMap[name]) w_agentMap[name] = 0; w_agentMap[name] += fee; }); }
    });
    
    let w_expTotal = 0; 
    weeklyExpenseGroups.forEach(group => { group.items.forEach(exp => { w_expTotal += (parseInt(exp.amount) || 0); }); });
    
    const finalProfit = w_rev - w_aunt - w_agentTotal - w_expTotal;
    
    document.getElementById('week_revenue').innerText = w_rev.toLocaleString(); 
    document.getElementById('week_aunt').innerText = w_aunt.toLocaleString();
    document.getElementById('week_agent_total').innerText = '$' + w_agentTotal.toLocaleString(); 
    document.getElementById('week_works').innerText = w_works.toLocaleString();
    document.getElementById('week_daily_profit').innerText = '$' + w_dailyProfit.toLocaleString(); 
    
    const topExp = document.getElementById('week_expenses_total_top'); if(topExp) topExp.innerText = w_expTotal.toLocaleString();
    const bottomExp = document.getElementById('week_expenses_total_bottom'); if(bottomExp) bottomExp.innerText = w_expTotal.toLocaleString();
    
    document.getElementById('week_final_profit').innerText = finalProfit.toLocaleString();
    
    document.getElementById('week_revenue_breakdown').innerHTML = dailyRevHtml || '無';
    document.getElementById('week_aunt_breakdown').innerHTML = dailyAuntHtml || '無';
    document.getElementById('week_works_breakdown').innerHTML = dailyWorksHtml || '無';
    document.getElementById('week_daily_profit_breakdown').innerHTML = dailyProfitHtml || '無';

    let agentHtml = ''; Object.entries(w_agentMap).forEach(([name, fee]) => { agentHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:2px;"><span>${name}</span> <span>$${fee.toLocaleString()}</span></div>`; });
    document.getElementById('week_agent_breakdown').innerHTML = agentHtml || '無';
}

window.copyWeeklyReport = function() {
    if (selectedWeeklyDays.length === 0) { alert("請先勾選日期！"); return; }
    const rev = document.getElementById('week_revenue').innerText; const aunt = document.getElementById('week_aunt').innerText;
    const agent = document.getElementById('week_agent_total').innerText; const works = document.getElementById('week_works').innerText;
    const finalProfit = document.getElementById('week_final_profit').innerText;
    let datesText = selectedWeeklyDays.map(k => availableDailyData[k]?.dateName || k.replace(/-/g, '/')).join('、');
    
    let agentText = ''; const agentNodes = document.getElementById('week_agent_breakdown').querySelectorAll('div');
    if(agentNodes.length > 0) { agentNodes.forEach(el => agentText += el.innerText + '\n'); } else { agentText = '無\n'; }

    let expText = ''; let expTotal = 0;
    if(weeklyExpenseGroups.length > 0) {
        weeklyExpenseGroups.forEach(group => {
            let pName = group.payer || '未命名人員';
            let groupTotal = 0; let itemLines = '';
            group.items.forEach(e => {
                let amount = parseInt(e.amount) || 0;
                itemLines += ` - ${e.item || '未填寫'}: $${amount}\n`;
                groupTotal += amount; expTotal += amount;
            });
            if (group.items.length > 0) { expText += `【${pName}】 (小計: $${groupTotal})\n${itemLines}`; }
        });
        if(expTotal > 0) expText += `\n支出總額: $${expTotal.toLocaleString()}\n`; else expText = '無\n';
    } else { expText = '無\n'; }
    
    // 🌟 在報表開頭補上現在選取的區域名字 (用 + 號連接起來)
    const regionText = currentWeeklyRegions.includes('All') ? '全店總和' : currentWeeklyRegions.join(' + ');
    const report = `【周結報表】(${regionText})\n結算區間：${activeWeekLabel}\n包含日期：${datesText}\n總工數：${works}\n------------------\n總營收：${rev}\n總阿姨：${aunt}\n總經紀：${agent}\n\n[各經紀明細]\n${agentText.trim()}\n------------------\n[支出明細]\n${expText.trim()}\n==================\n💰 最終盈餘：${finalProfit}`;
    
    navigator.clipboard.writeText(report).then(() => { showToast(`📋 已複製 ${regionText} 周結報表！`); }).catch(() => { alert("複製失敗。"); });
}
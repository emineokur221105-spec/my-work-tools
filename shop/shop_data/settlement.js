// === settlement.js : 日結與報表邏輯 ===

let currentDailySummaryData = null;

function calculateSettlement(staff, commTable, costTable, workTable, services) {
    const results = []; let totalWorks = 0; 
    
    // 🌟 核心防呆：確保 content 不是 undefined，否則給予空字串
    const safeContent = staff.content || "";
    if (!safeContent.trim()) return { results, totalWorks };
    
    const lines = safeContent.split('\n'); const overrides = staff.overrides || {};

    let activeBlockDate = currentActiveDate;

    lines.forEach((line, index) => { 
        const rawLine = line.trim(); if (!rawLine) return;

        const isDateLine = /^[\d./-]+\s*(?:\([^)]+\))?$/.test(rawLine) && rawLine.length < 15;
        if (isDateLine) {
            const mMatch = rawLine.match(/(\d{1,2})[\/\-\.](\d{1,2})/);
            if (mMatch) {
                activeBlockDate = mMatch[1].padStart(2, '0') + '/' + mMatch[2].padStart(2, '0');
            }
            if (activeBlockDate === currentActiveDate) {
                results.push({ rawLine, index, extractedName: "", revenue: 0, total_miss: 0, aunt_disp: 0, balance: 0, work: 0, isDateHeader: true, isError: false });
            }
            return; 
        }
        
        if (activeBlockDate !== currentActiveDate) return;

        const pattern = /(\d+)(?:\([\d\s+-]*\))?[/-](\d+)[/-](\d+)/;
        const match = rawLine.match(pattern);
        let base_cost = 0; let base_comm = 0; let extra_money = 0; let revenue = 0; let work = 0; let isError = false; let extractedName = "";

        if (match) {
            const duration = parseInt(match[1]); revenue = parseInt(match[2]); const count = parseInt(match[3]);     
            const key = `${duration}-${count}`; base_comm = commTable[key] || 0; base_cost = costTable[key] || 0; 
            work = workTable[key] !== undefined ? workTable[key] : (WORK_UNIT_TABLE[duration] || 0); 
            services.forEach(svc => { if (rawLine.toLowerCase().includes(svc.name.toLowerCase())) { extra_money += svc.price; } });
            const extractedNameMatch = rawLine.match(/^(\D+)/); extractedName = extractedNameMatch ? extractedNameMatch[1].replace(/:/g, '').trim() : "";
        } else {
            isError = true; const fallbackNameMatch = rawLine.split(/[\d]/)[0]; extractedName = (fallbackNameMatch ? fallbackNameMatch.trim() : "⚠️格式錯誤");
        }
        
        let total_miss = base_comm + extra_money; let aunt_inc = revenue - base_cost - extra_money;
        let realName = staff.name; const nameMatch = rawLine.match(/^([^\d\s]+)/);
        if (nameMatch && !nameMatch[1].includes(':')) realName = nameMatch[1];
        if (typeof AUNT_EXTRA_NAMES !== 'undefined' && AUNT_EXTRA_NAMES.includes(realName)) aunt_inc += 100;
        let aunt_disp = Math.floor(aunt_inc / 100);

        if (isError) { revenue = 0; total_miss = 0; aunt_disp = 0; work = 0; }

        const o = overrides[index] || {};
        const finalRevenue = o.revenue !== undefined ? o.revenue : revenue;
        const finalTotalMiss = o.total_miss !== undefined ? o.total_miss : total_miss;
        const finalAuntDisp = o.aunt_disp !== undefined ? o.aunt_disp : aunt_disp;
        const finalWork = o.work !== undefined ? o.work : work;
        const finalBalance = finalRevenue - finalTotalMiss;

        totalWorks += finalWork; 
        results.push({ 
            rawLine, index, extractedName, revenue: finalRevenue, total_miss: finalTotalMiss, aunt_disp: finalAuntDisp, balance: finalBalance, work: finalWork,
            isRevenueOverridden: o.revenue !== undefined, isMissOverridden: o.total_miss !== undefined, isAuntOverridden: o.aunt_disp !== undefined, isWorkOverridden: o.work !== undefined, isError: isError 
        });
    });
    return { results, totalWorks };
}

function renderSettlementTable() {
    renderRegionTabs();
    
    // 🌟 安全取值函數
    const getGlobalVal = (id) => { const el = document.getElementById(id); return el ? (parseInt(el.value) || 0) : 0; };
    const globalCommTable = { "40-1": getGlobalVal('base_40_1'), "60-1": getGlobalVal('base_60_1'), "60-2": getGlobalVal('base_60_2'), "120-3": getGlobalVal('base_120_3'), "240-3": getGlobalVal('base_240_3') };
    const globalCostTable = { "40-1": getGlobalVal('cost_40_1'), "60-1": getGlobalVal('cost_60_1'), "60-2": getGlobalVal('cost_60_2'), "120-3": getGlobalVal('cost_120_3'), "240-3": getGlobalVal('cost_240_3') };
    const globalWorkTable = { "40-1": WORK_UNIT_TABLE[40] || 0, "60-1": WORK_UNIT_TABLE[60] || 0, "60-2": WORK_UNIT_TABLE[60] || 0, "120-3": WORK_UNIT_TABLE[120] || 0, "240-3": WORK_UNIT_TABLE[240] || 0 };
    
    const container = document.getElementById('table_body');
    if(!container) return;
    container.innerHTML = ''; 

    const editAttr = isLocked ? '' : 'contenteditable="true"';
    const disableAttr = isLocked ? 'disabled' : '';
    const hideBtnStyle = isLocked ? 'display:none !important;' : '';
    const lockBg = isLocked ? 'background:#f4f6f9 !important; color:#7f8c8d !important; cursor:not-allowed;' : '';

    staffData.forEach((staff) => {
        const staffRegion = staff.region || (REGIONS.length > 0 ? REGIONS[0] : "未分類");
        if (currentRegion !== 'All' && staffRegion !== currentRegion) return;
        
        const isAttending = staff.attendance !== false;
        const safeContent = staff.content || ""; 
        
        if (!isAttending && !safeContent.trim()) return; 

        let activeCommTable = globalCommTable; let activeCostTable = globalCostTable; let activeWorkTable = globalWorkTable; 
        let paramBtnClass = "btn-blue"; let paramBtnStyle = "";

        if (staff.customConfig && staff.customConfig.enabled) {
            activeCommTable = { ...globalCommTable, ...staff.customConfig.comm };
            activeCostTable = { ...globalCostTable, ...staff.customConfig.cost };
            activeWorkTable = { ...globalWorkTable, ...(staff.customConfig.work || {}) }; 
            paramBtnClass = "btn-red"; paramBtnStyle = "box-shadow: 0 0 5px red;";
        }

        const { results, totalWorks } = calculateSettlement(staff, activeCommTable, activeCostTable, activeWorkTable, services);
        
        const agentName = staff.agentName || ''; const agentRate = staff.agentRate !== undefined ? staff.agentRate : 300; 
        const manualExpense = staff.manualExpense !== undefined ? staff.manualExpense : 0; const staffAgentFee = totalWorks * agentRate; 

        const card = document.createElement('div'); card.className = 'staff-card-settle';
        card.dataset.agentName = agentName; card.dataset.agentRate = agentRate; card.dataset.totalWorks = totalWorks; card.dataset.staffName = staff.name || "未填寫";
        card.style.background = '#fff'; card.style.borderRadius = '8px'; card.style.border = '1px solid #ccc'; card.style.overflowX = 'auto'; card.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';

        let regionOptions = "";
        REGIONS.forEach(r => { const selected = (staffRegion === r) ? "selected" : ""; regionOptions += `<option value="${r}" ${selected}>${r}</option>`; });

        let roomBadge = staff.roomName ? `<span style="background:#2c3e50; color:#f1c40f; padding:2px 6px; border-radius:4px; font-size:12px; margin-right:5px; border: 1px solid #f1c40f;">${staff.roomName}</span>` : "";
        let displayName = staff.name || "未填寫";

        // 🌟 加寬表格、字體放大
        let headerHtml = `
            <div style="background:#f1c40f; padding:8px; display:flex; justify-content:space-between; align-items:center; min-width: 750px;">
                <div style="font-size:16px; font-weight:bold; color:#e74c3c; display:flex; align-items:center; gap:5px; white-space: nowrap;">
                    ${roomBadge} ${displayName}
                    <select onchange="updateStaffSettlement(${staff.id}, 'region', this.value)" ${disableAttr}
                            style="font-size:12px; padding:2px; margin-left:5px; border-radius:4px; border:1px solid #aaa; ${lockBg}">
                        ${regionOptions}
                    </select>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <button class="btn-circle ${paramBtnClass}" style="width:28px; height:28px; font-size:14px; ${paramBtnStyle} flex-shrink: 0; ${hideBtnStyle}" onclick="openStaffParamsModal(${staff.id})">⚙️</button>
                    <button class="btn-circle" style="width:28px; height:28px; font-size:14px; background:#95a5a6; flex-shrink: 0; ${hideBtnStyle}" onclick="resetStaffSettings(${staff.id})" title="初始化設定">🔄</button>
                    <input type="text" placeholder="經紀" value="${agentName}" onchange="updateStaffSettlement(${staff.id}, 'agentName', this.value)" ${disableAttr} style="width:50px; text-align:center; border:1px solid #aaa; border-radius:4px; font-weight:bold; color:#c0392b; ${lockBg}">
                    <div style="display:flex; flex-direction:column; align-items:flex-end; font-size:10px; color:#2c3e50; line-height:1.1; white-space: nowrap;">
                        <div>費率: <input type="number" value="${agentRate}" onchange="updateStaffSettlement(${staff.id}, 'agentRate', this.value)" ${disableAttr} style="width:40px; border:none; background:transparent; border-bottom:1px solid #aaa; text-align:right; ${lockBg}"></div>
                        <div class="agent-fee-display" style="font-weight:bold; color:#d35400;">費用: $${staffAgentFee.toLocaleString()}</div>
                    </div>
                </div>
            </div>
            <table style="width: 100%; min-width: 750px; table-layout: fixed; font-size:14px; border-collapse:collapse;"> 
                <thead style="background:#ecf0f1; border-bottom:1px solid #ccc; color:#555;">
                    <tr>
                        <th style="padding:8px 5px; text-align:left; width: 35%;">班表內容</th>
                        <th style="width: 70px; color:#2980b9; text-align:center;">名稱</th>
                        <th style="width: 55px; text-align:center;">阿姨</th>
                        <th style="width: 65px; text-align:center;">收</th>
                        <th style="width: 60px; text-align:center;">小姐</th>
                        <th style="width: 60px; text-align:center;">結餘</th>
                        <th style="width: 45px; text-align:center;">工數</th>
                        <th style="width: auto; text-align:center;">備註</th>
                    </tr>
                </thead>
                <tbody>
        `;

        results.forEach(row => {
            if (row.isDateHeader) { headerHtml += `<tr style="background:#fdf2e9; border-bottom:1px solid #f39c12;"><td colspan="8" style="padding:6px 10px; font-weight:bold; color:#d35400; text-align:left; font-size:13px; letter-spacing:1px;">📅 ${row.rawLine}</td></tr>`; return; }
            const auntClass = row.isAuntOverridden ? 'manual-text' : ''; const revClass = row.isRevenueOverridden ? 'manual-text' : ''; const missClass = row.isMissOverridden ? 'manual-text' : ''; const workClass = row.isWorkOverridden ? 'manual-text' : '';
            const overrideData = staff.overrides && staff.overrides[row.index] ? staff.overrides[row.index] : {}; const noteText = overrideData.note || ""; 
            const rowStyle = row.isError ? "background:#ffe6e6; border:2px solid #e74c3c;" : "border-bottom:1px solid #eee;";
            const nameStyle = row.isError ? "color:#c0392b; font-weight:bold;" : "color:#2980b9; font-weight:bold; border-left:1px dashed #eee;";
            const normalCellBg = row.isError ? 'transparent' : (isLocked ? '#f4f6f9' : '#f9f9f9');

            // 🌟 將第一欄取消隱藏，文字自動換行，並放大名稱、阿姨、收的字體
            headerHtml += `
                <tr style="${rowStyle}">
                    <td style="padding:8px 5px; word-break: break-word; white-space: normal; line-height: 1.4; color:#2c3e50;">${row.isError ? '⚠️ ' : ''}${row.rawLine}</td>
                    <td style="text-align:center; font-size:14px; ${nameStyle}">${row.extractedName}</td>
                    <td class="col-aunt editable-cell ${auntClass}" ${editAttr} onblur="saveOverride(${staff.id}, ${row.index}, 'aunt_disp', this)" style="text-align:center; font-size:15px; font-weight:bold; color:#2980b9; background:${normalCellBg}; border-left:1px dashed #eee;">${row.aunt_disp}</td>
                    <td class="col-rev editable-cell ${revClass}" ${editAttr} onblur="saveOverride(${staff.id}, ${row.index}, 'revenue', this)" style="text-align:center; font-size:15px; font-weight:bold; color:#27ae60; background:${normalCellBg};">${row.revenue}</td>
                    <td class="col-miss editable-cell ${missClass}" ${editAttr} onblur="saveOverride(${staff.id}, ${row.index}, 'total_miss', this)" style="text-align:center; color:#c0392b; background:${normalCellBg};">${row.total_miss}</td>
                    <td class="col-bal" style="text-align:center; color:#555; font-weight:bold;">${row.balance}</td>
                    <td class="col-work editable-cell ${workClass}" ${editAttr} onblur="saveOverride(${staff.id}, ${row.index}, 'work', this)" style="text-align:center; color:#d35400; font-weight:bold; background:${normalCellBg}; border-right:1px dashed #eee;">${row.work}</td>
                    <td class="editable-cell" ${editAttr} onblur="saveOverride(${staff.id}, ${row.index}, 'note', this)" style="text-align:center; color:#888; background:${isLocked ? '#f4f6f9' : '#fff'}; font-size:12px; word-break: break-word; white-space: normal;">${noteText}</td>
                </tr>
            `;
        });

        headerHtml += `
                <tr class="footer-total" style="background:#fffcf5; border-top:2px solid #ddd;">
                    <td colspan="2" style="text-align:right; font-weight:bold; padding:8px 10px;">總計:</td>
                    <td style="text-align:center; font-weight:bold; color:#2980b9;">0</td><td style="text-align:center; font-weight:bold; color:#27ae60;">0</td><td style="text-align:center;">0</td><td style="text-align:center;">-</td><td style="text-align:center; color:#d35400; font-weight:bold;">0</td><td></td> 
                </tr>
                <tr style="background:#ffe6e6;">
                    <td colspan="5" style="text-align:right; font-size:13px; font-weight:bold; color:#c0392b; padding:8px 5px;">雜支/飯錢:</td>
                    <td style="text-align:center; padding:5px;">
                        <input class="input-expense" type="number" value="${manualExpense}" onchange="updateStaffSettlement(${staff.id}, 'manualExpense', this.value)" ${disableAttr} style="width:65px; text-align:center; color:#c0392b; font-weight:bold; border:1px solid #e74c3c; border-radius:4px; padding:4px; background:${isLocked ? 'transparent' : '#fff'}; ${lockBg}">
                    </td><td colspan="2"></td>
                </tr>
                <tr style="background:#2c3e50; color:white; font-weight:bold;">
                    <td colspan="5" style="text-align:right; padding:8px 5px; font-size:13px;">修正後結餘:</td>
                    <td class="final-balance" style="text-align:center; font-size:16px; color:#f1c40f;">0</td><td colspan="2"></td>
                </tr>
            </tbody></table>
        `;
        card.innerHTML = headerHtml; container.appendChild(card);
    });

    updateTotalsFromDOM(); 
}

function updateTotalsFromDOM() {
    let dom_grand_total_revenue = 0; let dom_grand_total_aunt_points = 0; let dom_agent_fee_map = {}; let dom_grand_total_works = 0; let auntTextString = "";

    document.querySelectorAll('.staff-card-settle').forEach(card => {
        let card_total_aunt_pts = 0; let card_total_rev = 0; let card_total_miss = 0; let card_total_bal = 0; let card_total_work = 0; 
        card.querySelectorAll('tbody tr:not(.footer-total)').forEach(row => { 
            const getVal = (cls) => {
                const cell = row.querySelector(cls);
                return cell ? (parseInt(cell.innerText.replace(/[^\d-]/g,'')) || 0) : 0;
            };
            const r_rev = getVal('.col-rev'); const r_miss = getVal('.col-miss'); const r_aunt = getVal('.col-aunt'); const r_work = getVal('.col-work');
            if (r_aunt > 0) { let name = row.cells[1].innerText.trim(); auntTextString += `${name}${r_aunt} `; }
            const r_bal = r_rev - r_miss; const balCell = row.querySelector('.col-bal'); if(balCell) balCell.innerText = r_bal; 
            card_total_rev += r_rev; card_total_miss += r_miss; card_total_aunt_pts += r_aunt; card_total_bal += r_bal; card_total_work += r_work;
        });

        const expenseInput = card.querySelector('.input-expense'); const manualExpense = parseInt(expenseInput ? expenseInput.value : 0) || 0;
        const footerCells = card.querySelectorAll('.footer-total td');
        if(footerCells.length > 0) {
            footerCells[1].innerText = card_total_aunt_pts; footerCells[2].innerText = card_total_rev;
            footerCells[3].innerText = card_total_miss; footerCells[4].innerText = card_total_bal; footerCells[5].innerText = card_total_work; 
        }

        const final_bal = card_total_bal + manualExpense;
        const finalBalCell = card.querySelector('.final-balance'); if(finalBalCell) finalBalCell.innerText = final_bal;
        dom_grand_total_revenue += final_bal; dom_grand_total_aunt_points += card_total_aunt_pts; dom_grand_total_works += card_total_work; 

        const agentName = card.dataset.agentName; const agentRate = parseInt(card.dataset.agentRate || 300);
        const staffAgentFee = card_total_work * agentRate; 
        const feeDisplay = card.querySelector('.agent-fee-display'); if(feeDisplay) feeDisplay.innerText = `費用: $${staffAgentFee.toLocaleString()}`;

        if (agentName) { if (!dom_agent_fee_map[agentName]) dom_agent_fee_map[agentName] = 0; dom_agent_fee_map[agentName] += staffAgentFee; }
    });

    const dateStr = document.getElementById('dateInput').value;
    const textDisplay = document.getElementById('aunt_text_display');
    if (textDisplay) textDisplay.innerText = auntTextString.trim() ? `${dateStr}\n${auntTextString.trim()}` : "無資料";

    const grand_total_aunt_money = dom_grand_total_aunt_points * 100; let grand_total_agent_fees = 0; let agent_summary_html = "";
    for (const [name, fee] of Object.entries(dom_agent_fee_map)) {
        grand_total_agent_fees += fee; agent_summary_html += `<div>${name}: $${fee.toLocaleString()}</div>`; 
    }
    
    const net_profit = dom_grand_total_revenue - grand_total_aunt_money - grand_total_agent_fees;
    document.getElementById('total_revenue').innerText = dom_grand_total_revenue.toLocaleString();
    document.getElementById('total_aunt').innerText = grand_total_aunt_money.toLocaleString(); 
    document.getElementById('agent_fee_total_display').innerText = `$${grand_total_agent_fees.toLocaleString()}`;
    document.getElementById('agent_fee_summary').innerHTML = agent_summary_html || "無";
    document.getElementById('total_net_profit').innerText = net_profit.toLocaleString();
    document.getElementById('total_works_summary').innerText = dom_grand_total_works.toLocaleString();

    currentDailySummaryData = {
        dateName: dateStr,
        revenue: dom_grand_total_revenue,
        aunt: grand_total_aunt_money,
        agentTotal: grand_total_agent_fees,
        agentMap: dom_agent_fee_map,
        works: dom_grand_total_works,
        profit: net_profit,
        timestamp: Date.now() 
    };
}

function pushDailySummary() {
    if (currentDailySummaryData) {
        const safeDateKey = currentDailySummaryData.dateName.replace(/\//g, '-').replace(/[.#$[\]]/g, '_'); 
        db.ref('shop_v8_daily_summaries/' + safeDateKey).set(currentDailySummaryData);
    }
}

function copyDailyReport() {
    const dateStr = document.getElementById('dateInput').value;
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.innerText.replace(/[$,]/g, '').trim() : '0'; };
    const totalRev = getVal('total_revenue'); const totalAunt = getVal('total_aunt'); 
    let totalAgent = '0'; const agentEl = document.getElementById('agent_fee_total_display'); if(agentEl) totalAgent = agentEl.innerText.replace(/[^\d]/g, ''); 
    const totalProfit = getVal('total_net_profit'); 

    let staffDetails = "";
    document.querySelectorAll('.staff-card-settle').forEach(card => {
        let name = card.dataset.staffName || "未知";
        const balEl = card.querySelector('.final-balance'); const balance = balEl ? balEl.innerText.replace(/,/g, '') : "0";
        staffDetails += `${name} ${balance}\n`;
    });

    const reportText = `${dateStr}\n總收 ${totalRev}\n---------------------\n阿姨 ${totalAunt}\n經紀 ${totalAgent}\n---------------------\n${staffDetails.trim()}\n===============\n盈餘 ${totalProfit}`;
    const previewBox = document.getElementById('dailyReportPreview'); if(previewBox) previewBox.value = reportText;
    navigator.clipboard.writeText(reportText).then(() => { showToast("📊 報表已複製！"); }).catch(() => { showToast("❌ 複製失敗"); });
}

function copyAuntText() {
    const text = document.getElementById('aunt_text_display').innerText;
    if (!text || text === "無資料") { showToast("⚠️ 沒有資料可複製"); return; }
    navigator.clipboard.writeText(text).then(() => { showToast("✅ 已複製！請手動填寫日期"); }).catch(() => { showToast("❌ 複製失敗"); });
}
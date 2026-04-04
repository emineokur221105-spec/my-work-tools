// === settlement.js : 日結與報表邏輯 ===

let currentDailySummaryData = null;

function calculateSettlement(staff, commTable, costTable, workTable, services) {
    const results = []; let totalWorks = 0; 
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

let renderSettleTimeout = null;
function renderSettlementTable() {
    if (renderSettleTimeout) clearTimeout(renderSettleTimeout);
    renderSettleTimeout = setTimeout(() => { executeRenderSettlementTable(); }, 150); 
}

// 🌟 重構：讓主程式碼變得超級短，把畫圖的邏輯全部交給最下面的 Helper 函數！
function executeRenderSettlementTable() {
    renderRegionTabs();
    const { globalCommTable, globalCostTable, globalWorkTable } = getGlobalPricingTables();
    
    const container = document.getElementById('table_body');
    if(!container) return;
    container.innerHTML = ''; 

    const editAttr = isLocked ? '' : 'contenteditable="true"';
    const disableAttr = isLocked ? 'disabled' : '';
    const hideBtnStyle = isLocked ? 'display:none !important;' : '';
    const lockBg = isLocked ? 'background:#f4f6f9 !important; color:#7f8c8d !important; cursor:not-allowed;' : '';

    staffData.forEach((staff) => {
        const staffRegion = staff.region || (REGIONS.length > 0 ? REGIONS[0] : "未分類");
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
        card.id = 'settle-card-' + staff.id; 
        
        if (!currentRegion.includes('All') && !currentRegion.includes(staffRegion)) { card.style.display = 'none'; }
        
        card.dataset.region = staffRegion; card.dataset.agentName = agentName; card.dataset.agentRate = agentRate; card.dataset.totalWorks = totalWorks; card.dataset.staffName = staff.name || "未填寫";
        card.style.background = '#fff'; card.style.borderRadius = '8px'; card.style.border = '1px solid #ccc'; card.style.overflowX = 'auto'; card.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';

        let regionOptions = "";
        REGIONS.forEach(r => { const selected = (staffRegion === r) ? "selected" : ""; regionOptions += `<option value="${r}" ${selected}>${r}</option>`; });
        let roomBadge = staff.roomName ? `<span style="background:#2c3e50; color:#f1c40f; padding:2px 6px; border-radius:4px; font-size:12px; margin-right:5px; border: 1px solid #f1c40f;">${staff.roomName}</span>` : "";
        let displayName = staff.name || "未填寫";

        // 🌟 呼叫 Header Helper 組合表格頭部
        let html = buildCardHeaderHTML({ staff, roomBadge, displayName, regionOptions, disableAttr, lockBg, paramBtnClass, paramBtnStyle, hideBtnStyle, agentName, agentRate, staffAgentFee });

        // 🌟 呼叫 Row Helper 組合每一行資料
        results.forEach(row => {
            if (row.isDateHeader) { 
                html += `<tr style="background:#fdf2e9; border-bottom:1px solid #f39c12;"><td colspan="8" style="padding:6px 10px; font-weight:bold; color:#d35400; text-align:left; font-size:13px; letter-spacing:1px;">📅 ${row.rawLine}</td></tr>`; 
                return; 
            }
            html += buildCardRowHTML({ staff, row, editAttr, isLocked });
        });

        // 🌟 呼叫 Footer Helper 組合表格尾部
        html += buildCardFooterHTML({ staff, manualExpense, disableAttr, lockBg, isLocked });
        
        card.innerHTML = html; container.appendChild(card);
    });

    updateTotalsFromDOM(); 
}

function updateTotalsFromDOM() {
    let globalData = { rev: 0, aunt: 0, agent: 0, works: 0, map: {} };
    let currentViewData = { rev: 0, aunt: 0, agent: 0, works: 0, map: {} };
    let regionData = {};
    if (typeof REGIONS !== 'undefined') REGIONS.forEach(r => regionData[r] = { revenue: 0, aunt: 0, agentTotal: 0, works: 0, profit: 0, agentMap: {} });

    let auntTextString = "";

    document.querySelectorAll('.staff-card-settle').forEach(card => {
        const region = card.dataset.region || '未分類';
        if(!regionData[region]) regionData[region] = { revenue: 0, aunt: 0, agentTotal: 0, works: 0, profit: 0, agentMap: {} };

        let card_total_aunt_pts = 0; let card_total_rev = 0; let card_total_miss = 0; let card_total_bal = 0; let card_total_work = 0; 
        const isCardVisible = card.style.display !== 'none';

        card.querySelectorAll('tbody tr:not(.footer-total)').forEach(row => { 
            const getVal = (cls) => {
                const cell = row.querySelector(cls);
                return cell ? (parseInt(cell.innerText.replace(/[^\d-]/g,'')) || 0) : 0;
            };
            const r_rev = getVal('.col-rev'); const r_miss = getVal('.col-miss'); const r_aunt = getVal('.col-aunt'); const r_work = getVal('.col-work');
            
            if (r_aunt > 0 && isCardVisible) { 
                let name = row.cells[1].innerText.trim(); 
                auntTextString += `${name}${r_aunt} `; 
            }
            
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
        
        const agentName = card.dataset.agentName; const agentRate = parseInt(card.dataset.agentRate || 300);
        const staffAgentFee = card_total_work * agentRate; 
        const feeDisplay = card.querySelector('.agent-fee-display'); if(feeDisplay) feeDisplay.innerText = `費用: $${staffAgentFee.toLocaleString()}`;

        globalData.rev += final_bal; globalData.aunt += (card_total_aunt_pts * 100); globalData.works += card_total_work; globalData.agent += staffAgentFee;
        if(agentName) { if(!globalData.map[agentName]) globalData.map[agentName] = 0; globalData.map[agentName] += staffAgentFee; }

        regionData[region].revenue += final_bal; regionData[region].aunt += (card_total_aunt_pts * 100); regionData[region].works += card_total_work; regionData[region].agentTotal += staffAgentFee;
        if(agentName) { if(!regionData[region].agentMap[agentName]) regionData[region].agentMap[agentName] = 0; regionData[region].agentMap[agentName] += staffAgentFee; }
        regionData[region].profit += (final_bal - (card_total_aunt_pts * 100) - staffAgentFee);

        if (isCardVisible) {
            currentViewData.rev += final_bal; currentViewData.aunt += (card_total_aunt_pts * 100); currentViewData.works += card_total_work; currentViewData.agent += staffAgentFee;
            if(agentName) { if(!currentViewData.map[agentName]) currentViewData.map[agentName] = 0; currentViewData.map[agentName] += staffAgentFee; }
        }
    });

    const net_profit = currentViewData.rev - currentViewData.aunt - currentViewData.agent;
    document.getElementById('total_revenue').innerText = currentViewData.rev.toLocaleString();
    document.getElementById('total_aunt').innerText = currentViewData.aunt.toLocaleString(); 
    document.getElementById('agent_fee_total_display').innerText = `$${currentViewData.agent.toLocaleString()}`;
    document.getElementById('total_net_profit').innerText = net_profit.toLocaleString();
    document.getElementById('total_works_summary').innerText = currentViewData.works.toLocaleString();

    let agent_summary_html = "";
    for (const [name, fee] of Object.entries(currentViewData.map)) { agent_summary_html += `<div>${name}: $${fee.toLocaleString()}</div>`; }
    document.getElementById('agent_fee_summary').innerHTML = agent_summary_html || "無";

    const dateStr = document.getElementById('dateInput').value;
    const textDisplay = document.getElementById('aunt_text_display');
    if (textDisplay) textDisplay.innerText = auntTextString.trim() ? `${dateStr}\n${auntTextString.trim()}` : "無資料";

    currentDailySummaryData = {
        dateName: dateStr,
        revenue: globalData.rev,
        aunt: globalData.aunt,
        agentTotal: globalData.agent,
        agentMap: globalData.map,
        works: globalData.works,
        profit: globalData.rev - globalData.aunt - globalData.agent,
        regionData: regionData,
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
        if (card.style.display === 'none') return;
        let name = card.dataset.staffName || "未知";
        const balEl = card.querySelector('.final-balance'); const balance = balEl ? balEl.innerText.replace(/,/g, '') : "0";
        staffDetails += `${name} ${balance}\n`;
    });

    const regionText = currentRegion.includes('All') ? '' : ` (${currentRegion.join(' + ')})`; 
    const reportText = `${dateStr}${regionText}\n總收 ${totalRev}\n---------------------\n阿姨 ${totalAunt}\n經紀 ${totalAgent}\n---------------------\n${staffDetails.trim()}\n===============\n盈餘 ${totalProfit}`;
    const previewBox = document.getElementById('dailyReportPreview'); if(previewBox) previewBox.value = reportText;
    navigator.clipboard.writeText(reportText).then(() => { showToast("📊 報表已複製！"); }).catch(() => { showToast("❌ 複製失敗"); });
}

function copyAuntText() {
    const text = document.getElementById('aunt_text_display').innerText;
    if (!text || text === "無資料") { showToast("⚠️ 沒有資料可複製"); return; }
    navigator.clipboard.writeText(text).then(() => { showToast("✅ 已複製！請手動填寫日期"); }).catch(() => { showToast("❌ 複製失敗"); });
}

window.copySingleSettlementToExcel = async function(staffId, staffName) {
    const card = document.getElementById('settle-card-' + staffId);
    if (!card) return;

    let excelHtml = '<meta charset="UTF-8"><table border="1" style="border-collapse: collapse; font-family: sans-serif; font-size: 14pt; font-weight: bold;">';

    const table = card.querySelector('table');
    if (!table) return;

    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length === 0) return;

        if (cells[0].colSpan >= 8 || row.innerText.includes('📅')) return;
        if (row.classList.contains('footer-total')) return;
        if (cells[0].innerText.includes('雜支')) return;
        if (cells[0].innerText.includes('修正後結餘')) return;

        if (cells.length >= 6) {
            excelHtml += '<tr>';
            for (let i = 1; i <= 4; i++) {
                const td = cells[i];
                const cellText = td.innerText;
                const isModified = td.classList.contains('manual-text');
                
                let cellColor = isModified ? '#8e44ad' : 'black'; 
                if (i === 1) { cellColor = '#0000FF'; }

                excelHtml += `<td style="color: ${cellColor}; font-weight: bold; font-size: 14pt; text-align: center;">${cellText}</td>`;
            }
            excelHtml += '</tr>';
        }
    });

    excelHtml += '</table>';

    try {
        const blobHtml = new Blob([excelHtml], { type: "text/html" });
        const blobText = new Blob(["已複製 4 欄表格資料"], { type: "text/plain" }); 
        const clipboardItem = new ClipboardItem({
            "text/html": blobHtml,
            "text/plain": blobText
        });
        await navigator.clipboard.write([clipboardItem]);
        showToast(`✅ 已複製 4 欄純資料！(14號粗體 + 藍色名字)`);
    } catch (error) {
        console.error("剪貼簿 API 失敗:", error);
        const tempDiv = document.createElement("div"); tempDiv.innerHTML = excelHtml; tempDiv.style.position = "absolute"; tempDiv.style.left = "-9999px"; document.body.appendChild(tempDiv);
        const range = document.createRange(); range.selectNodeContents(tempDiv); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        const successful = document.execCommand('copy'); document.body.removeChild(tempDiv);
        if(successful) showToast(`✅ 已複製 4 欄純資料！(14號粗體 + 藍色名字)`); else showToast("❌ 複製失敗");
    }
};

// ==========================================
// 🌟 版面與邏輯分離：專門印出 HTML 的小幫手們
// ==========================================

function buildCardHeaderHTML(p) {
    return `
        <div style="background:#f1c40f; padding:8px; display:flex; justify-content:space-between; align-items:center; min-width: 750px;">
            <div style="font-size:16px; font-weight:bold; color:#e74c3c; display:flex; align-items:center; gap:5px; white-space: nowrap;">
                ${p.roomBadge} ${p.displayName}
                <button onclick="copySingleSettlementToExcel(${p.staff.id}, '${p.displayName}')" style="background:#27ae60; color:white; border:none; padding:4px 8px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px; margin-left:10px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">📊 複製Excel</button>
                <select onchange="updateStaffSettlement(${p.staff.id}, 'region', this.value)" ${p.disableAttr}
                        style="font-size:12px; padding:2px; margin-left:5px; border-radius:4px; border:1px solid #aaa; ${p.lockBg}">
                    ${p.regionOptions}
                </select>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
                <button class="btn-circle ${p.paramBtnClass}" style="width:28px; height:28px; font-size:14px; ${p.paramBtnStyle} flex-shrink: 0; ${p.hideBtnStyle}" onclick="openStaffParamsModal(${p.staff.id})">⚙️</button>
                <button class="btn-circle" style="width:28px; height:28px; font-size:14px; background:#95a5a6; flex-shrink: 0; ${p.hideBtnStyle}" onclick="resetStaffSettings(${p.staff.id})" title="初始化設定">🔄</button>
                <input type="text" placeholder="經紀" value="${p.agentName}" onchange="updateStaffSettlement(${p.staff.id}, 'agentName', this.value)" ${p.disableAttr} style="width:50px; text-align:center; border:1px solid #aaa; border-radius:4px; font-weight:bold; color:#c0392b; ${p.lockBg}">
                <div style="display:flex; flex-direction:column; align-items:flex-end; font-size:10px; color:#2c3e50; line-height:1.1; white-space: nowrap;">
                    <div>費率: <input type="number" value="${p.agentRate}" onchange="updateStaffSettlement(${p.staff.id}, 'agentRate', this.value)" ${p.disableAttr} style="width:40px; border:none; background:transparent; border-bottom:1px solid #aaa; text-align:right; ${p.lockBg}"></div>
                    <div class="agent-fee-display" style="font-weight:bold; color:#d35400;">費用: $${p.staffAgentFee.toLocaleString()}</div>
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
}

function buildCardRowHTML(p) {
    const row = p.row; const staff = p.staff;
    const auntClass = row.isAuntOverridden ? 'manual-text' : ''; const revClass = row.isRevenueOverridden ? 'manual-text' : ''; const missClass = row.isMissOverridden ? 'manual-text' : ''; const workClass = row.isWorkOverridden ? 'manual-text' : '';
    const overrideData = staff.overrides && staff.overrides[row.index] ? staff.overrides[row.index] : {}; const noteText = overrideData.note || ""; 
    const rowStyle = row.isError ? "background:#ffe6e6; border:2px solid #e74c3c;" : "border-bottom:1px solid #eee;";
    const nameStyle = row.isError ? "color:#c0392b; font-weight:bold;" : "color:#2980b9; font-weight:bold; border-left:1px dashed #eee;";
    const normalCellBg = row.isError ? 'transparent' : (p.isLocked ? '#f4f6f9' : '#f9f9f9');

    return `
        <tr style="${rowStyle}">
            <td style="padding:8px 5px; word-break: break-word; white-space: normal; line-height: 1.4; color:#2c3e50;">${row.isError ? '⚠️ ' : ''}${row.rawLine}</td>
            <td style="text-align:center; font-size:14px; ${nameStyle}">${row.extractedName}</td>
            <td class="col-aunt editable-cell ${auntClass}" ${p.editAttr} onblur="saveOverride(${staff.id}, ${row.index}, 'aunt_disp', this)" style="text-align:center; font-size:15px; font-weight:bold; color:#2980b9; background:${normalCellBg}; border-left:1px dashed #eee;">${row.aunt_disp}</td>
            <td class="col-rev editable-cell ${revClass}" ${p.editAttr} onblur="saveOverride(${staff.id}, ${row.index}, 'revenue', this)" style="text-align:center; font-size:15px; font-weight:bold; color:#27ae60; background:${normalCellBg};">${row.revenue}</td>
            <td class="col-miss editable-cell ${missClass}" ${p.editAttr} onblur="saveOverride(${staff.id}, ${row.index}, 'total_miss', this)" style="text-align:center; color:#c0392b; background:${normalCellBg};">${row.total_miss}</td>
            <td class="col-bal" style="text-align:center; color:#555; font-weight:bold;">${row.balance}</td>
            <td class="col-work editable-cell ${workClass}" ${p.editAttr} onblur="saveOverride(${staff.id}, ${row.index}, 'work', this)" style="text-align:center; color:#d35400; font-weight:bold; background:${normalCellBg}; border-right:1px dashed #eee;">${row.work}</td>
            <td class="editable-cell" ${p.editAttr} onblur="saveOverride(${staff.id}, ${row.index}, 'note', this)" style="text-align:center; color:#888; background:${p.isLocked ? '#f4f6f9' : '#fff'}; font-size:12px; word-break: break-word; white-space: normal;">${noteText}</td>
        </tr>
    `;
}

function buildCardFooterHTML(p) {
    return `
            <tr class="footer-total" style="background:#fffcf5; border-top:2px solid #ddd;">
                <td colspan="2" style="text-align:right; font-weight:bold; padding:8px 10px;">總計:</td>
                <td style="text-align:center; font-weight:bold; color:#2980b9;">0</td><td style="text-align:center; font-weight:bold; color:#27ae60;">0</td><td style="text-align:center;">0</td><td style="text-align:center;">-</td><td style="text-align:center; color:#d35400; font-weight:bold;">0</td><td></td> 
            </tr>
            <tr style="background:#ffe6e6;">
                <td colspan="5" style="text-align:right; font-size:13px; font-weight:bold; color:#c0392b; padding:8px 5px;">雜支/飯錢:</td>
                <td style="text-align:center; padding:5px;">
                    <input class="input-expense" type="number" value="${p.manualExpense}" onchange="updateStaffSettlement(${p.staff.id}, 'manualExpense', this.value)" ${p.disableAttr} style="width:65px; text-align:center; color:#c0392b; font-weight:bold; border:1px solid #e74c3c; border-radius:4px; padding:4px; background:${p.isLocked ? 'transparent' : '#fff'}; ${p.lockBg}">
                </td><td colspan="2"></td>
            </tr>
            <tr style="background:#2c3e50; color:white; font-weight:bold;">
                <td colspan="5" style="text-align:right; padding:8px 5px; font-size:13px;">修正後結餘:</td>
                <td class="final-balance" style="text-align:center; font-size:16px; color:#f1c40f;">0</td><td colspan="2"></td>
            </tr>
        </tbody></table>
    `;
}
let allDistricts = [];
let filteredDistricts = [];
let allBlocks = [];
let allPanchayats = [];
let allUnits = [];
let allMemberships = [];

let TREE_EXPANDED_STATE = { districts: {}, blocks: {}, panchayats: {} };
let BULK_UPLOAD_CONTEXT = null;
let currentPromptAction = null;
let currentConfirmAction = null;
let chartInstance = null;

let currentPage = 1;
let pageSize = 10;

document.addEventListener('DOMContentLoaded', async () => {
    if (!enforceSession()) return;
    setActiveSidebarLink('districts');
    
    // STRICT VIEW-ONLY ENFORCEMENT
    const isGlobal = STATE_CACHE.role === 'Admin' || STATE_CACHE.role === 'MasterAdmin';
    if (!isGlobal) {
        // Automatically hide all action buttons (Add, Edit, Delete, Bulk Upload) for non-admins
        const style = document.createElement('style');
        style.innerHTML = `
            button[onclick*="Template"], 
            button[onclick*="Upload"], 
            button[onclick*="Add"],
            button[onclick*="Edit"],
            button[onclick*="Delete"],
            button[onclick*="Modal"],
            input[type="file"] { 
                display: none !important; 
            }
        `;
        document.head.appendChild(style);
    }

    await fetchHierarchyData();
});

// ==========================================
// DATA CORE FETCH & METRICS
// ==========================================
async function fetchHierarchyData() {
    toggleInteractionLoader(true, "Loading Fields...");
    try {
        let dQuery = supa.from('districts').select('*');
        let bQuery = supa.from('blocks').select('*');
        let pQuery = supa.from('panchayats').select('*');
        let uQuery = supa.from('units').select('*');
        let mQuery = supa.from('memberships').select('district, block, panchayat, unit');

        const isGlobal = STATE_CACHE.role === 'Admin' || STATE_CACHE.role === 'MasterAdmin';

        // Role-Based Data Isolation
        if (!isGlobal) {
            const af = STATE_CACHE.assignedFields;
            if (af.districts && af.districts.length > 0) {
                dQuery = dQuery.in('district_name', af.districts);
                bQuery = bQuery.in('district_name', af.districts);
                pQuery = pQuery.in('district_name', af.districts);
                uQuery = uQuery.in('district_name', af.districts);
                mQuery = mQuery.in('district', af.districts);
            }
            if (af.blocks && af.blocks.length > 0) {
                bQuery = bQuery.in('block_name', af.blocks);
                pQuery = pQuery.in('block_name', af.blocks);
                uQuery = uQuery.in('block_name', af.blocks);
                mQuery = mQuery.in('block', af.blocks);
            }
            if (af.panchayats && af.panchayats.length > 0) {
                pQuery = pQuery.in('panchayat_name', af.panchayats);
                uQuery = uQuery.in('panchayat_name', af.panchayats);
                mQuery = mQuery.in('panchayat', af.panchayats);
            }
            if (af.units && af.units.length > 0) {
                uQuery = uQuery.in('unit_name', af.units);
                mQuery = mQuery.in('unit', af.units);
            }
        }

        const [dRes, bRes, pRes, uRes, mRes] = await Promise.all([dQuery, bQuery, pQuery, uQuery, mQuery]);

        allDistricts = dRes.data || [];
        filteredDistricts = [...allDistricts];
        allBlocks = bRes.data || [];
        allPanchayats = pRes.data || [];
        allUnits = uRes.data || [];
        allMemberships = mRes.data || [];
        
        updateMetrics();
        applyFilters();

    } catch(err) {
        spawnToastNotification("Failed to fetch node architecture.", "error");
        console.error(err);
    }
    toggleInteractionLoader(false);
}

function updateMetrics() {
    document.getElementById('statDistricts').innerText = allDistricts.length;
    document.getElementById('statBlocks').innerText = allBlocks.length;
    document.getElementById('statPanchayats').innerText = allPanchayats.length;
    document.getElementById('statUnits').innerText = allUnits.length;
}

function updateChart() {
    const ctx = document.getElementById('territoryChart');
    if (chartInstance) chartInstance.destroy();

    let chartData = filteredDistricts.map(d => {
        return {
            name: d.district_name,
            bCount: allBlocks.filter(b => b.district_name === d.district_name).length,
            pCount: allPanchayats.filter(p => p.district_name === d.district_name).length,
            uCount: allUnits.filter(u => u.district_name === d.district_name).length
        };
    }).sort((a,b) => b.uCount - a.uCount).slice(0, 10);

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.map(d => d.name),
            datasets: [
                { label: 'Units', data: chartData.map(d => d.uCount), backgroundColor: '#f59e0b', borderRadius: 4 },
                { label: 'Panchayats', data: chartData.map(d => d.pCount), backgroundColor: '#0ea5e9', borderRadius: 4 },
                { label: 'Blocks', data: chartData.map(d => d.bCount), backgroundColor: '#10b981', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { 
                legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 6, font: {family: 'Inter', size: 10} } }
            },
            scales: {
                x: { stacked: true, grid: { display: false }, ticks: { font: {family: 'Inter', size: 9} } },
                y: { stacked: true, grid: { color: '#f1f5f9' }, ticks: { font: {family: 'Inter', size: 10} } }
            }
        }
    });
}

// ==========================================
// FILTERS & PAGINATION CONTROL
// ==========================================
function applyFilters() {
    const q = document.getElementById('districtSearchQuery').value.toLowerCase().trim();
    const sort = document.getElementById('districtSortQuery').value;

    filteredDistricts = allDistricts.filter(d => {
        if (q && !d.district_name.toLowerCase().includes(q)) return false;
        return true;
    });

    filteredDistricts.sort((a, b) => {
        if(sort === 'AZ') return a.district_name.localeCompare(b.district_name);
        if(sort === 'ZA') return b.district_name.localeCompare(a.district_name);
        if(sort === 'UNITS_DESC') {
            const uA = allUnits.filter(u => u.district_name === a.district_name).length;
            const uB = allUnits.filter(u => u.district_name === b.district_name).length;
            return uB - uA;
        }
        return 0;
    });

    currentPage = 1;
    updateChart();
    renderPagination();
    renderTree();
}

function changePageSize() {
    pageSize = parseInt(document.getElementById('pageSizeSelect').value);
    currentPage = 1; renderPagination(); renderTree();
}

function prevPage() { if (currentPage > 1) { currentPage--; renderPagination(); renderTree(); } }
function nextPage() {
    const maxPage = Math.ceil(filteredDistricts.length / pageSize);
    if (currentPage < maxPage) { currentPage++; renderPagination(); renderTree(); }
}
function goToPage(p) { currentPage = p; renderPagination(); renderTree(); }

function renderPagination() {
    const totalRecords = filteredDistricts.length;
    const totalPages = Math.ceil(totalRecords / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, totalRecords);

    document.getElementById('pageStartText').innerText = totalRecords === 0 ? 0 : startIdx + 1;
    document.getElementById('pageEndText').innerText = endIdx;
    document.getElementById('pageTotalText').innerText = totalRecords;

    document.getElementById('btnPrevPage').disabled = currentPage === 1;
    document.getElementById('btnNextPage').disabled = currentPage === totalPages;

    const numContainer = document.getElementById('paginationNumbers');
    numContainer.innerHTML = '';
    
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

    for (let i = startPage; i <= endPage; i++) {
        const activeClass = i === currentPage ? 'bg-indigo-600 text-white shadow-md border-indigo-600' : 'bg-white text-slate-600 hover:bg-slate-100 border-slate-200';
        numContainer.innerHTML += `<button onclick="goToPage(${i})" class="w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${activeClass}">${i}</button>`;
    }
}

// ==========================================
// RESTORED HIERARCHY CARD MATRIX TREE
// ==========================================
function toggleTreeCollapseNode(level, key) {
    TREE_EXPANDED_STATE[level][key] = !TREE_EXPANDED_STATE[level][key];
    renderTree();
}

function renderTree() {
    const container = document.getElementById('districtTreeContainer');
    container.innerHTML = '';

    if (filteredDistricts.length === 0) {
        container.innerHTML = `<div class="py-12 flex flex-col items-center justify-center text-slate-400 w-full"><i class="fa-solid fa-folder-open text-4xl mb-3 opacity-20"></i><p class="font-bold text-sm text-slate-500">No records parsed.</p></div>`;
        return;
    }

    const startIdx = (currentPage - 1) * pageSize;
    const currentSlice = filteredDistricts.slice(startIdx, startIdx + pageSize);
    const isAdmin = STATE_CACHE.role === 'Admin' || STATE_CACHE.role === 'MasterAdmin';

    currentSlice.forEach(d => {
        const dOpen = !!TREE_EXPANDED_STATE.districts[d.district_name];
        let dCount = allMemberships.filter(m => m.district === d.district_name).length;
        let uCount = allUnits.filter(u => u.district_name === d.district_name).length;

        let dHtml = `
        <div class="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm mb-3">
            <div class="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors ${dOpen ? 'bg-slate-50/80 border-b border-slate-200/80' : ''}" onclick="toggleTreeCollapseNode('districts', '${d.district_name}')">
                <div class="flex items-center gap-4 min-w-0">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${dOpen ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 border border-slate-200'}">
                        <i class="fa-solid ${dOpen ? 'fa-chevron-down' : 'fa-chevron-right'} text-[11px]"></i>
                    </div>
                    <div>
                        <h3 class="font-black text-slate-900 text-sm tracking-tight truncate">${d.district_name}</h3>
                        <p class="text-[9px] font-mono text-slate-500 mt-0.5 uppercase tracking-widest"><i class="fa-solid fa-sitemap mr-1"></i> ${uCount} Units Mapped</p>
                    </div>
                </div>
                <div class="flex items-center gap-2" onclick="event.stopPropagation();">
                    <span class="hidden sm:inline-block bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] font-black font-mono px-2.5 py-1 rounded-lg shadow-sm">${dCount} Members</span>
                    ${isAdmin ? `
                    <div class="w-px h-6 bg-slate-200 mx-1 hidden sm:block"></div>
                    <button onclick="launchNestedAppendPrompt('Blocks', '${d.district_name}', '', '')" class="text-[10px] font-bold bg-white border border-slate-200 text-slate-600 px-2 h-8 rounded-lg hover:text-indigo-600 hover:border-indigo-200 shadow-sm transition-colors flex items-center gap-1.5"><i class="fa-solid fa-plus text-[9px]"></i> <span class="hidden sm:inline">Block</span></button>
                    <button onclick="openNestedBulkModal('Blocks', '${d.district_name}', '', '')" class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 shadow-sm flex items-center justify-center transition-colors" title="Bulk Add Blocks"><i class="fa-solid fa-layer-group text-xs"></i></button>
                    <button onclick="launchNestedEditPrompt('districts', '${d.district_name}')" class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 shadow-sm flex items-center justify-center transition-colors"><i class="fa-solid fa-pen text-[10px]"></i></button>
                    <button onclick="dispatchDistrictMatrixPurge('districts', '${d.district_name}')" class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 shadow-sm flex items-center justify-center transition-colors"><i class="fa-solid fa-trash-can text-[10px]"></i></button>
                    ` : ''}
                </div>
            </div>`;

        if(dOpen) {
            let blocks = allBlocks.filter(b => b.district_name === d.district_name);
            if(blocks.length === 0) dHtml += `<div class="p-4 text-xs text-slate-400 italic text-center bg-slate-50/50">No blocks configured.</div>`;

            blocks.forEach(b => {
                const bKey = `${d.district_name}_${b.block_name}`;
                const bOpen = !!TREE_EXPANDED_STATE.blocks[bKey];

                dHtml += `
                <div class="border-b border-slate-100 last:border-0 bg-white">
                    <div class="pl-12 pr-4 py-3 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors" onclick="toggleTreeCollapseNode('blocks', '${bKey}')">
                        <div class="flex items-center gap-2 min-w-0">
                            <i class="fa-solid ${bOpen ? 'fa-caret-down text-indigo-500' : 'fa-caret-right text-slate-300'} text-xs w-3 text-center"></i>
                            <span class="font-bold text-xs text-slate-700">${b.block_name}</span>
                        </div>
                        <div class="flex items-center gap-1.5" onclick="event.stopPropagation();">
                            ${isAdmin ? `
                            <button onclick="launchNestedAppendPrompt('Panchayats', '${d.district_name}', '${b.block_name}', '')" class="text-[9px] font-bold bg-white border border-slate-200 text-slate-500 px-2 py-1 rounded-md hover:text-indigo-600 hover:border-indigo-200 transition-colors shadow-sm">+ Panchayat</button>
                            <button onclick="openNestedBulkModal('Panchayats', '${d.district_name}', '${b.block_name}', '')" class="w-7 h-7 text-slate-400 hover:text-indigo-600 rounded bg-slate-50 border border-slate-100 flex items-center justify-center transition-colors"><i class="fa-solid fa-layer-group text-[9px]"></i></button>
                            <button onclick="launchNestedEditPrompt('blocks', '${b.block_name}', '${d.district_name}')" class="w-7 h-7 text-slate-400 hover:text-indigo-600 rounded bg-slate-50 border border-slate-100 flex items-center justify-center transition-colors"><i class="fa-solid fa-pen text-[9px]"></i></button>
                            <button onclick="dispatchDistrictMatrixPurge('blocks', '${b.block_name}', '${d.district_name}')" class="w-7 h-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded bg-slate-50 border border-slate-100 flex items-center justify-center transition-colors"><i class="fa-solid fa-trash-can text-[9px]"></i></button>
                            ` : ''}
                        </div>
                    </div>`;

                if(bOpen) {
                    let panchayats = allPanchayats.filter(p => p.district_name === d.district_name && p.block_name === b.block_name);
                    if(panchayats.length === 0) dHtml += `<div class="pl-20 pr-4 py-2 text-[10px] text-slate-400 italic bg-slate-50/30">No panchayats configured.</div>`;

                    panchayats.forEach(p => {
                        const pKey = `${d.district_name}_${b.block_name}_${p.panchayat_name}`;
                        const pOpen = !!TREE_EXPANDED_STATE.panchayats[pKey];

                        dHtml += `
                        <div class="bg-slate-50/50">
                            <div class="pl-20 pr-4 py-2 border-t border-dashed border-slate-200 flex items-center justify-between hover:bg-slate-100/50 cursor-pointer transition-colors" onclick="toggleTreeCollapseNode('panchayats', '${pKey}')">
                                <div class="flex items-center gap-2 min-w-0">
                                    <i class="fa-solid ${pOpen ? 'fa-angle-down text-sky-500' : 'fa-angle-right text-slate-300'} text-[10px] w-3 text-center"></i>
                                    <span class="text-[11px] font-medium text-slate-600">${p.panchayat_name}</span>
                                </div>
                                <div class="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity" onclick="event.stopPropagation();">
                                    ${isAdmin ? `
                                    <button onclick="launchNestedAppendPrompt('Units', '${d.district_name}', '${b.block_name}', '${p.panchayat_name}')" class="text-[8px] font-bold bg-white border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded shadow-sm hover:text-indigo-600 transition-colors">+ Unit</button>
                                    <button onclick="openNestedBulkModal('Units', '${d.district_name}', '${b.block_name}', '${p.panchayat_name}')" class="w-6 h-6 text-slate-400 hover:text-indigo-600 rounded bg-white border flex items-center justify-center transition-colors"><i class="fa-solid fa-layer-group text-[8px]"></i></button>
                                    <button onclick="launchNestedEditPrompt('panchayats', '${p.panchayat_name}', '${d.district_name}', '${b.block_name}')" class="p-1 text-slate-400 hover:text-indigo-600"><i class="fa-solid fa-pen text-[9px]"></i></button>
                                    <button onclick="dispatchDistrictMatrixPurge('panchayats', '${p.panchayat_name}', '${d.district_name}', '${b.block_name}')" class="p-1 text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can text-[9px]"></i></button>
                                    ` : ''}
                                </div>
                            </div>`;

                        if(pOpen) {
                            let units = allUnits.filter(u => u.district_name === d.district_name && u.block_name === b.block_name && u.panchayat_name === p.panchayat_name);
                            if(units.length === 0) dHtml += `<div class="pl-28 pr-4 py-1.5 text-[9px] text-slate-400 italic">No terminal units configured.</div>`;

                            units.forEach(u => {
                                let localUCount = allMemberships.filter(m => m.district === d.district_name && m.unit === u.unit_name).length;
                                dHtml += `
                                <div class="pl-28 pr-4 py-1.5 flex items-center justify-between text-[10px] text-slate-500 hover:bg-slate-100/80 transition-colors border-t border-slate-100/50">
                                    <div class="flex items-center gap-2">
                                        <div class="w-1 h-1 rounded-full bg-slate-300"></div>
                                        <span>${u.unit_name}</span>
                                        <span class="bg-white border border-emerald-100 text-emerald-600 font-bold font-mono px-1 rounded shadow-sm">${localUCount}</span>
                                    </div>
                                    ${isAdmin ? `
                                    <div class="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                                        <button onclick="launchNestedEditPrompt('units', '${u.unit_name}', '${d.district_name}', '${b.block_name}', '${p.panchayat_name}')" class="p-1 text-slate-400 hover:text-indigo-500"><i class="fa-solid fa-pen text-[8px]"></i></button>
                                        <button onclick="dispatchDistrictMatrixPurge('units', '${u.unit_name}', '${d.district_name}', '${b.block_name}', '${p.panchayat_name}')" class="text-slate-400 hover:text-rose-500 p-1"><i class="fa-solid fa-trash-can text-[8px]"></i></button>
                                    </div>
                                    ` : ''}
                                </div>`;
                            });
                        }
                        dHtml += `</div>`;
                    });
                }
                dHtml += `</div>`;
            });
        }
        dHtml += `</div>`; 
        container.innerHTML += dHtml;
    });
}

// ==========================================
// ACTIONS & MUTATIONS (ADD / EDIT / DELETE)
// ==========================================

async function autoCreateOperator(level, d, b, p, u) {
    let role = `${level}Admin`;
    let targetName = u || p || b || d; 
    if(!targetName) return;

    let baseUser = targetName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10);
    let randomNum = Math.floor(100 + Math.random() * 900); 
    let username = `${baseUser}_${level.toLowerCase()}${randomNum}`;
    let password = `${baseUser}123`; 
    
    let assigned = { districts: [], blocks: [], panchayats: [], units: [] };
    if(d) assigned.districts.push(d);
    if(b) assigned.blocks.push(b);
    if(p) assigned.panchayats.push(p);
    if(u) assigned.units.push(u);

    try {
        const msgBuffer = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashed = hashArray.map(byt => byt.toString(16).padStart(2, '0')).join('');

        const payload = {
            username: username,
            password_hash: hashed,
            plain_password: password,
            name: `${targetName} Operator`,
            role: role,
            assigned_fields_json: assigned,
            status: 'ACTIVE'
        };

        const { error } = await supa.from('users').insert([payload]);
        if(!error) {
            spawnToastNotification(`Auto-deployed operator: @${username}`, "success");
        }
    } catch(e) {
        console.error("Auto-create operator logic error:", e);
    }
}

async function handleDistrictFormAppend(e) {
    e.preventDefault(); 
    const val = document.getElementById('newDistrictNameInput').value.trim();
    if(!val) return; 
    toggleInteractionLoader(true, "Registering District...");
    try {
        const { error } = await supa.from('districts').insert([{ district_name: val }]);
        if (error) throw error;
        spawnToastNotification("District Created", "success");
        
        await autoCreateOperator('District', val, null, null, null);

        document.getElementById('newDistrictNameInput').value = '';
        await fetchHierarchyData();
    } catch(err) { spawnToastNotification("Failed to create node.", "error"); toggleInteractionLoader(false); }
}

function launchNestedAppendPrompt(lvl, d, b, p) {
    showCustomPrompt(`Add New ${lvl.slice(0,-1) || lvl}`, `Enter structural node name:`, "", "bg-emerald-600", async (val) => {
        if(!val || !val.trim()) return; 
        toggleInteractionLoader(true, "Appending Spatial Node...");
        try {
            let insertErr = null;
            let cleanVal = val.trim();

            if (lvl === 'Districts') {
                const { error } = await supa.from('districts').insert([{ district_name: cleanVal }]);
                insertErr = error;
                if(!error) await autoCreateOperator('District', cleanVal, null, null, null);
            }
            if (lvl === 'Blocks') {
                const { error } = await supa.from('blocks').insert([{ district_name: d, block_name: cleanVal }]);
                insertErr = error;
                if(!error) await autoCreateOperator('Block', d, cleanVal, null, null);
            }
            if (lvl === 'Panchayats') {
                const { error } = await supa.from('panchayats').insert([{ district_name: d, block_name: b, panchayat_name: cleanVal }]);
                insertErr = error;
                if(!error) await autoCreateOperator('Panchayat', d, b, cleanVal, null);
            }
            if (lvl === 'Units') {
                const { error } = await supa.from('units').insert([{ district_name: d, block_name: b, panchayat_name: p, unit_name: cleanVal }]);
                insertErr = error;
                if(!error) await autoCreateOperator('Unit', d, b, p, cleanVal);
            }
            
            if (insertErr) throw insertErr;

            spawnToastNotification("Node Appended", "success");
            await fetchHierarchyData();
        } catch(err) { spawnToastNotification("Failed to append node.", "error"); toggleInteractionLoader(false); }
    });
}

function launchNestedEditPrompt(table, name, dParent = null, bParent = null, pParent = null) {
    showCustomPrompt(`Rename ${table.slice(0,-1)}`, `Modify structural parameter string:`, name, "bg-indigo-600", async (val) => {
        const cleanVal = val.trim();
        if(!cleanVal || cleanVal === name) return; 
        
        toggleInteractionLoader(true, "Updating Matrix Parameter & Cascading Changes...");
        try {
            // UPDATING WITH CASCADES to prevent data loss or orphaned members
            if (table === 'districts') {
                await supa.from('districts').update({ district_name: cleanVal }).eq('district_name', name);
                await supa.from('blocks').update({ district_name: cleanVal }).eq('district_name', name);
                await supa.from('panchayats').update({ district_name: cleanVal }).eq('district_name', name);
                await supa.from('units').update({ district_name: cleanVal }).eq('district_name', name);
                await supa.from('memberships').update({ district: cleanVal }).eq('district', name);
            }
            if (table === 'blocks') {
                await supa.from('blocks').update({ block_name: cleanVal }).eq('district_name', dParent).eq('block_name', name);
                await supa.from('panchayats').update({ block_name: cleanVal }).eq('district_name', dParent).eq('block_name', name);
                await supa.from('units').update({ block_name: cleanVal }).eq('district_name', dParent).eq('block_name', name);
                await supa.from('memberships').update({ block: cleanVal }).eq('district', dParent).eq('block', name);
            }
            if (table === 'panchayats') {
                await supa.from('panchayats').update({ panchayat_name: cleanVal }).eq('district_name', dParent).eq('block_name', bParent).eq('panchayat_name', name);
                await supa.from('units').update({ panchayat_name: cleanVal }).eq('district_name', dParent).eq('block_name', bParent).eq('panchayat_name', name);
                await supa.from('memberships').update({ panchayat: cleanVal }).eq('district', dParent).eq('block', bParent).eq('panchayat', name);
            }
            if (table === 'units') {
                await supa.from('units').update({ unit_name: cleanVal }).eq('district_name', dParent).eq('block_name', bParent).eq('panchayat_name', pParent).eq('unit_name', name);
                await supa.from('memberships').update({ unit: cleanVal }).eq('district', dParent).eq('block', bParent).eq('panchayat', pParent).eq('unit', name);
            }

            spawnToastNotification("Node Renamed Safely.", "success");
            await fetchHierarchyData();
        } catch(err) { 
            spawnToastNotification("Failed to update.", "error"); 
            toggleInteractionLoader(false); 
        }
    });
}

function dispatchDistrictMatrixPurge(table, name, dParent = null, bParent = null, pParent = null) {
    showCustomConfirm("Delete Structural Field?", "Erase this path and ALL internal data? This cannot be undone.", "bg-rose-600", async () => {
        toggleInteractionLoader(true, "Purging node hierarchies...");
        try {
            if(table === 'districts') await supa.from('districts').delete().eq('district_name', name);
            if(table === 'blocks') await supa.from('blocks').delete().eq('district_name', dParent).eq('block_name', name);
            if(table === 'panchayats') await supa.from('panchayats').delete().eq('district_name', dParent).eq('block_name', bParent).eq('panchayat_name', name);
            if(table === 'units') await supa.from('units').delete().eq('district_name', dParent).eq('block_name', bParent).eq('panchayat_name', pParent).eq('unit_name', name);
            spawnToastNotification("Node Purged", "success");
            await fetchHierarchyData();
        } catch(err) { spawnToastNotification("Purge Failed.", "error"); toggleInteractionLoader(false); }
    });
}

// ==========================================
// BULK UPLOAD MODALS & LOGIC
// ==========================================
function openTopLevelBulkDistrictModal() { openNestedBulkModal('Districts', '', '', ''); }

function openNestedBulkModal(level, dist, blk, pan) {
    BULK_UPLOAD_CONTEXT = { level, parentDist: dist, parentBlk: blk, parentPan: pan };
    document.getElementById('bulkHierarchyTitle').innerHTML = `<i class="fa-solid fa-layer-group text-indigo-500 mr-1.5"></i> Bulk Add ${level}`;
    document.getElementById('bulkHierarchyContext').innerText = `Target Node Scope: ${dist ? dist : 'Root Folder'}`;
    document.getElementById('bulkHierarchyModal').classList.remove('hidden', 'opacity-0');
}

function closeBulkHierarchyModal() { document.getElementById('bulkHierarchyModal').classList.add('hidden', 'opacity-0'); }

function downloadBulkHierarchyTemplate() {
    if(!BULK_UPLOAD_CONTEXT) return;
    const blob = new Blob([`${BULK_UPLOAD_CONTEXT.level.slice(0,-1)}Name\n`], { type: 'text/csv;charset=utf-8;' });
    const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.setAttribute("download", `${BULK_UPLOAD_CONTEXT.level}_Template.csv`); el.click();
}

function processBulkHierarchyUpload(e) {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader(); toggleInteractionLoader(true, "Ingesting bulk structural datasets...");
    reader.onload = async function(evt) {
        try {
            const lines = evt.target.result.split(/\r?\n/);
            const rows = [];
            for(let i=1; i<lines.length; i++) {
                let v = lines[i].trim(); if(!v) continue;
                if(BULK_UPLOAD_CONTEXT.level==='Districts') rows.push({ district_name: v });
                if(BULK_UPLOAD_CONTEXT.level==='Blocks') rows.push({ district_name: BULK_UPLOAD_CONTEXT.parentDist, block_name: v });
                if(BULK_UPLOAD_CONTEXT.level==='Panchayats') rows.push({ district_name: BULK_UPLOAD_CONTEXT.parentDist, block_name: BULK_UPLOAD_CONTEXT.parentBlk, panchayat_name: v });
                if(BULK_UPLOAD_CONTEXT.level==='Units') rows.push({ district_name: BULK_UPLOAD_CONTEXT.parentDist, block_name: BULK_UPLOAD_CONTEXT.parentBlk, panchayat_name: BULK_UPLOAD_CONTEXT.parentPan, unit_name: v });
            }
            if(rows.length > 0) {
                const { error } = await supa.from(BULK_UPLOAD_CONTEXT.level.toLowerCase()).insert(rows);
                if (error) throw error;
                
                spawnToastNotification("Bulk Data Imported", "success");
                
                let l = BULK_UPLOAD_CONTEXT.level.slice(0,-1);
                rows.forEach(r => {
                    autoCreateOperator(l, r.district_name, r.block_name, r.panchayat_name, r.unit_name);
                });

                closeBulkHierarchyModal(); 
                await fetchHierarchyData();
            } else {
                toggleInteractionLoader(false); spawnToastNotification("File empty or invalid.", "error");
            }
        } catch(err) {
            spawnToastNotification("Import Error.", "error"); toggleInteractionLoader(false);
        }
    }; reader.readAsText(file);
    e.target.value = '';
}

// ==========================================
// SYSTEM MODAL UI WRAPPERS
// ==========================================
function showCustomConfirm(title, desc, color, cb) {
    document.getElementById('confirmModalTitle').innerText = title; 
    document.getElementById('confirmModalDesc').innerText = desc;
    const btn = document.getElementById('confirmModalBtn'); 
    btn.className = `px-4 py-2 text-white font-bold rounded-xl text-xs shadow-md transition-colors ${color.includes('rose')?'bg-rose-600 hover:bg-rose-700':'bg-indigo-600 hover:bg-indigo-700'}`;
    currentConfirmAction = cb; 
    btn.onclick = () => { closeCustomConfirm(); if(currentConfirmAction) currentConfirmAction(); };
    document.getElementById('customConfirmModal').classList.remove('hidden', 'opacity-0');
}
function closeCustomConfirm() { document.getElementById('customConfirmModal').classList.add('hidden', 'opacity-0'); }

function showCustomPrompt(title, desc, defVal, color, cb) {
    document.getElementById('promptModalTitle').innerText = title; 
    document.getElementById('promptModalDesc').innerText = desc;
    const input = document.getElementById('promptModalInput'); input.value = defVal;
    const btn = document.getElementById('promptModalBtn'); 
    btn.className = `px-4 py-2 text-white font-bold rounded-xl text-xs shadow-md transition-colors ${color.includes('rose')?'bg-rose-600 hover:bg-rose-700':'bg-indigo-600 hover:bg-indigo-700'}`;
    btn.onclick = () => { const v = input.value; closeCustomPrompt(); if(cb) cb(v); };
    document.getElementById('customPromptModal').classList.remove('hidden', 'opacity-0');
}
function closeCustomPrompt() { document.getElementById('customPromptModal').classList.add('hidden', 'opacity-0'); }

function exportDistrictData(fmt) {
    if(filteredDistricts.length === 0) return spawnToastNotification("No data to export.", "error");
    if (fmt === 'csv') {
        const headers = ['District_Name', 'Total_Members'];
        let content = headers.join(",") + "\n";
        filteredDistricts.forEach(d => {
            let count = allMemberships.filter(m => m.district === d.district_name).length;
            content += `"${d.district_name}","${count}"\n`;
        });
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.setAttribute("download", `SSF_Districts_Export.csv`); el.click();
    }
}

// ==========================================
// DYNAMIC LOGOUT VERIFICATION MODAL
// ==========================================

function promptLogout() {
    // Check if modal exists to prevent duplicating it on multiple clicks
    if (!document.getElementById('dynamicLogoutModal')) {
        const modalHTML = `
        <div id="dynamicLogoutModal" class="hidden fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm transition-opacity">
            <div class="bg-white rounded-2xl p-6 w-[90%] max-w-sm shadow-xl border border-slate-200 animate-fade-in-up">
                <div class="flex flex-col items-center text-center">
                    <div class="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mb-4 shadow-inner">
                        <i class="fa-solid fa-right-from-bracket text-xl"></i>
                    </div>
                    <h3 class="text-lg font-black text-slate-900 mb-1">Confirm Logout</h3>
                    <p class="text-xs text-slate-500 font-medium mb-6">Are you sure you want to securely end your current session?</p>
                    <div class="flex gap-3 w-full">
                        <button onclick="closeLogoutPrompt()" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs py-2.5 rounded-xl transition-colors font-mono uppercase tracking-wider">Cancel</button>
                        <button onclick="executeSecureLogout()" class="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-md transition-colors font-mono uppercase tracking-wider">Yes, Logout</button>
                    </div>
                </div>
            </div>
        </div>`;
        
        // Inject into the page
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
    
    // Show the modal
    document.getElementById('dynamicLogoutModal').classList.remove('hidden');
}

function closeLogoutPrompt() {
    const modal = document.getElementById('dynamicLogoutModal');
    if (modal) modal.classList.add('hidden');
}
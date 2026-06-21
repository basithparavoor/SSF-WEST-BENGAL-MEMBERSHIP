let allDistricts = [];
let allBlocks = [];
let allPanchayats = [];
let allUnits = [];
let filteredUnits = [];

let currentPage = 1;
let pageSize = 25;

let deleteTarget = null;
let editTarget = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!enforceSession()) return;
    setActiveSidebarLink('units');
    await fetchMasterData();
});

// ==========================================
// CORE DATA FETCHING
// ==========================================
async function fetchMasterData() {
    toggleInteractionLoader(true, "Loading Units...");
    try {
        let dQuery = supa.from('districts').select('*');
        let bQuery = supa.from('blocks').select('*');
        let pQuery = supa.from('panchayats').select('*');
        let uQuery = supa.from('units').select('*').order('unit_name', { ascending: true });
        let mQuery = supa.from('memberships').select('unit, panchayat, block, district');

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

        if (dRes.error) throw dRes.error;
        if (bRes.error) throw bRes.error;
        if (pRes.error) throw pRes.error;
        if (uRes.error) throw uRes.error;
        if (mRes.error) throw mRes.error;

        allDistricts = dRes.data || [];
        allBlocks = bRes.data || [];
        allPanchayats = pRes.data || [];
        const unitsRaw = uRes.data || [];
        const membersData = mRes.data || [];

        // Attach total membership counts to each unit
        allUnits = unitsRaw.map(u => {
            const mCount = membersData.filter(m => 
                m.unit?.trim().toLowerCase() === u.unit_name?.trim().toLowerCase() && 
                m.panchayat?.trim().toLowerCase() === u.panchayat_name?.trim().toLowerCase() && 
                m.block?.trim().toLowerCase() === u.block_name?.trim().toLowerCase() && 
                m.district?.trim().toLowerCase() === u.district_name?.trim().toLowerCase()
            ).length;
            return { ...u, members_count: mCount };
        });
        
        document.getElementById('statTotalUnits').innerText = allUnits.length;
        
        populateFormDropdowns();
        populateFilterDropdowns();
        applyFilters();

    } catch(err) {
        spawnToastNotification("Failed to fetch terminal architecture.", "error");
        console.error("Master Data Fetch Error:", err);
    }
    toggleInteractionLoader(false);
}

// ==========================================
// CASCADING DROPDOWNS (FORM & FILTERS)
// ==========================================
function populateFormDropdowns() {
    const dSel = document.getElementById('unitFormDistrict');
    dSel.innerHTML = '<option value="">Select District</option>';
    allDistricts.forEach(d => dSel.innerHTML += `<option value="${d.district_name}">${d.district_name}</option>`);
}

function syncUnitFormDropdowns(level) {
    const d = document.getElementById('unitFormDistrict').value;
    const b = document.getElementById('unitFormBlock').value;

    if (level === 'district') {
        const bSel = document.getElementById('unitFormBlock');
        bSel.innerHTML = '<option value="">Select Block</option>';
        document.getElementById('unitFormPanchayat').innerHTML = '<option value="">Select Panchayat</option>';
        if(d) allBlocks.filter(x => x.district_name === d).forEach(item => bSel.innerHTML += `<option value="${item.block_name}">${item.block_name}</option>`);
    } else if (level === 'block') {
        const pSel = document.getElementById('unitFormPanchayat');
        pSel.innerHTML = '<option value="">Select Panchayat</option>';
        if(d && b) allPanchayats.filter(x => x.district_name === d && x.block_name === b).forEach(item => pSel.innerHTML += `<option value="${item.panchayat_name}">${item.panchayat_name}</option>`);
    }
}

function populateFilterDropdowns() {
    const dSel = document.getElementById('filterDistrict');
    dSel.innerHTML = '<option value="">All Districts</option>';
    allDistricts.forEach(d => dSel.innerHTML += `<option value="${d.district_name}">${d.district_name}</option>`);
}

function syncFilterDropdowns(level) {
    const d = document.getElementById('filterDistrict').value;
    const b = document.getElementById('filterBlock').value;

    if (level === 'district') {
        const bSel = document.getElementById('filterBlock');
        bSel.innerHTML = '<option value="">All Blocks</option>';
        document.getElementById('filterPanchayat').innerHTML = '<option value="">All Panchayats</option>';
        if(d) allBlocks.filter(x => x.district_name === d).forEach(item => bSel.innerHTML += `<option value="${item.block_name}">${item.block_name}</option>`);
    } else if (level === 'block') {
        const pSel = document.getElementById('filterPanchayat');
        pSel.innerHTML = '<option value="">All Panchayats</option>';
        if(d && b) allPanchayats.filter(x => x.district_name === d && x.block_name === b).forEach(item => pSel.innerHTML += `<option value="${item.panchayat_name}">${item.panchayat_name}</option>`);
    }
    applyFilters();
}

// ==========================================
// FILTERS & PAGINATION
// ==========================================
function applyFilters() {
    const q = document.getElementById('filterSearch').value.toLowerCase().trim();
    const d = document.getElementById('filterDistrict').value;
    const b = document.getElementById('filterBlock').value;
    const p = document.getElementById('filterPanchayat').value;
    const minM = parseInt(document.getElementById('filterMinMembers').value);
    const maxM = parseInt(document.getElementById('filterMaxMembers').value);

    filteredUnits = allUnits.filter(u => {
        let match = true;
        if (d && u.district_name !== d) match = false;
        if (b && u.block_name !== b) match = false;
        if (p && u.panchayat_name !== p) match = false;
        if (q && !u.unit_name.toLowerCase().includes(q)) match = false;
        if (!isNaN(minM) && u.members_count < minM) match = false;
        if (!isNaN(maxM) && u.members_count > maxM) match = false;
        return match;
    });

    currentPage = 1;
    renderPagination();
    renderTable();
}

function changePageSize() {
    pageSize = parseInt(document.getElementById('pageSizeSelect').value);
    currentPage = 1; renderPagination(); renderTable();
}
function prevPage() { if (currentPage > 1) { currentPage--; renderPagination(); renderTable(); } }
function nextPage() {
    const maxPage = Math.ceil(filteredUnits.length / pageSize);
    if (currentPage < maxPage) { currentPage++; renderPagination(); renderTable(); }
}
function goToPage(p) { currentPage = p; renderPagination(); renderTable(); }

function renderPagination() {
    const totalRecords = filteredUnits.length;
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
// RENDER TABLE & CARDS
// ==========================================
function renderTable() {
    const tbody = document.getElementById('unitMasterTableBody');
    const mobileGrid = document.getElementById('unitMobileCardsGrid');
    const emptyState = document.getElementById('emptyState');
    
    tbody.innerHTML = '';
    mobileGrid.innerHTML = '';

    if (filteredUnits.length === 0) {
        emptyState.classList.remove('hidden'); return;
    }
    emptyState.classList.add('hidden');

    const startIdx = (currentPage - 1) * pageSize;
    const currentSlice = filteredUnits.slice(startIdx, startIdx + pageSize);
    const isAdmin = STATE_CACHE.role === 'Admin' || STATE_CACHE.role === 'MasterAdmin';

    currentSlice.forEach((u, index) => {
        // Desktop Row
        tbody.innerHTML += `
            <tr class="hover:bg-indigo-50/30 transition-colors group cursor-default">
                <td class="py-3 px-4 text-center font-mono text-slate-400">${startIdx + index + 1}</td>
                <td class="py-3 px-4 font-black text-slate-900">${u.unit_name}</td>
                <td class="py-3 px-4 text-slate-500 font-medium">
                    <span class="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded text-[10px] uppercase font-bold mr-1 tracking-wider">${u.district_name}</span>
                    <i class="fa-solid fa-angle-right text-[8px] mx-1 opacity-50"></i> ${u.block_name} 
                    <i class="fa-solid fa-angle-right text-[8px] mx-1 opacity-50"></i> ${u.panchayat_name}
                </td>
                <td class="py-3 px-4 font-bold text-slate-700">
                    <span class="bg-blue-50 border border-blue-200 text-blue-600 px-2 py-1 rounded text-xs inline-flex items-center gap-1.5"><i class="fa-solid fa-users text-[10px]"></i> ${u.members_count}</span>
                </td>
                <td class="py-3 px-4 text-right pr-6">
                    <div class="flex items-center justify-end gap-1 ${isAdmin ? 'opacity-60 group-hover:opacity-100' : 'opacity-20'} transition-opacity">
                        ${isAdmin ? `
                        <button onclick="openEditModal('${u.unit_name}', '${u.district_name}', '${u.block_name}', '${u.panchayat_name}')" class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 shadow-sm transition-all flex items-center justify-center" title="Edit Unit"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="openDeleteModal('${u.unit_name}', '${u.district_name}', '${u.block_name}', '${u.panchayat_name}')" class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 shadow-sm transition-all flex items-center justify-center" title="Delete Unit"><i class="fa-solid fa-trash-can"></i></button>
                        ` : `<i class="fa-solid fa-lock text-slate-300"></i>`}
                    </div>
                </td>
            </tr>`;
            
        // Mobile Card
        mobileGrid.innerHTML += `
            <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative">
                ${isAdmin ? `
                <div class="absolute top-4 right-4 flex gap-1">
                    <button onclick="openEditModal('${u.unit_name}', '${u.district_name}', '${u.block_name}', '${u.panchayat_name}')" class="w-8 h-8 bg-indigo-50 text-indigo-500 rounded-lg flex items-center justify-center border border-indigo-200"><i class="fa-solid fa-pen text-xs"></i></button>
                    <button onclick="openDeleteModal('${u.unit_name}', '${u.district_name}', '${u.block_name}', '${u.panchayat_name}')" class="w-8 h-8 bg-rose-50 text-rose-500 rounded-lg flex items-center justify-center border border-rose-200"><i class="fa-solid fa-trash-can text-xs"></i></button>
                </div>` : ''}
                <div class="pr-20">
                    <h4 class="text-base font-black text-slate-900 leading-tight">${u.unit_name}</h4>
                    <p class="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-mono"><i class="fa-solid fa-users mr-1"></i> ${u.members_count} Memberships</p>
                </div>
                <div class="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-1.5 text-[11px] font-medium text-slate-600">
                    <div><span class="font-bold text-slate-400 w-16 inline-block">District:</span> <span class="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-bold">${u.district_name}</span></div>
                    <div><span class="font-bold text-slate-400 w-16 inline-block">Block:</span> ${u.block_name}</div>
                    <div><span class="font-bold text-slate-400 w-16 inline-block">Panchayat:</span> ${u.panchayat_name}</div>
                </div>
            </div>`;
    });
}

// ==========================================
// ACTIONS & MUTATIONS (WITH AUTO-USER CREATION)
// ==========================================
async function handleUnitFormSubmit(e) {
    e.preventDefault();
    const d = document.getElementById('unitFormDistrict').value;
    const b = document.getElementById('unitFormBlock').value;
    const p = document.getElementById('unitFormPanchayat').value;
    const name = document.getElementById('unitFormName').value.trim();
    
    if(!d || !b || !p || !name) return spawnToastNotification("Please select the entire parent path.", "error");

    const payload = { district_name: d, block_name: b, panchayat_name: p, unit_name: name };
    
    toggleInteractionLoader(true, "Deploying Terminal & Auto-Generating Operator...");
    try {
        // 1. Deploy the Unit Terminal
        const { error: unitError } = await supa.from('units').insert([payload]);
        if (unitError) throw unitError; 

        // 2. Generate Operator Credentials for the new unit
        const baseString = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const randomSuffix = Math.floor(Math.random() * 900) + 100; // Adds 3-digit randomizer for uniqueness
        const newUsername = `unit_${baseString}${randomSuffix}`;
        const defaultPlainPassword = `ssf@${baseString}`;

        // Hash the generated password using SHA-256
        const msgBuffer = new TextEncoder().encode(defaultPlainPassword);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashedPassword = hashArray.map(byt => byt.toString(16).padStart(2, '0')).join('');

        // 3. Prepare the Operator Payload
        const userPayload = {
            name: `${name} Operator`,
            username: newUsername,
            role: 'UnitAdmin',
            status: 'ACTIVE',
            plain_password: defaultPlainPassword,
            password_hash: hashedPassword,
            assigned_fields_json: { 
                districts: [d], 
                blocks: [b], 
                panchayats: [p], 
                units: [name] 
            }
        };

        // 4. Inject the Operator into the Users table
        const { error: userError } = await supa.from('users').insert([userPayload]);
        
        if (userError) {
            console.error("Auto-User Creation Error:", userError);
            spawnToastNotification("Unit created, but auto-operator deployment failed.", "warning");
        } else {
            spawnToastNotification(`Unit Deployed! Operator '@${newUsername}' generated.`, "success");
        }

        document.getElementById('unitFormName').value = ''; 
        await fetchMasterData();
    } catch(err) {
        console.error("Insert Error:", err);
        spawnToastNotification(err.message || "Failed to deploy unit. Name might exist.", "error");
    }
    toggleInteractionLoader(false);
}

// --- FRONTEND EDIT MODAL LOGIC ---
function openEditModal(u, d, b, p) {
    editTarget = { oldU: u, oldD: d, oldB: b, oldP: p };
    
    // Pre-populate dropdowns
    const dSel = document.getElementById('editFormDistrict');
    dSel.innerHTML = '<option value="">Select District</option>';
    allDistricts.forEach(dist => dSel.innerHTML += `<option value="${dist.district_name}">${dist.district_name}</option>`);
    dSel.value = d;
    syncEditDropdowns('district');
    
    document.getElementById('editFormBlock').value = b;
    syncEditDropdowns('block');
    
    document.getElementById('editFormPanchayat').value = p;
    document.getElementById('editFormName').value = u;
    
    document.getElementById('editModal').classList.remove('hidden');
}

function syncEditDropdowns(level) {
    const d = document.getElementById('editFormDistrict').value;
    const b = document.getElementById('editFormBlock').value;

    if (level === 'district') {
        const bSel = document.getElementById('editFormBlock');
        bSel.innerHTML = '<option value="">Select Block</option>';
        document.getElementById('editFormPanchayat').innerHTML = '<option value="">Select Panchayat</option>';
        if(d) allBlocks.filter(x => x.district_name === d).forEach(item => bSel.innerHTML += `<option value="${item.block_name}">${item.block_name}</option>`);
    } else if (level === 'block') {
        const pSel = document.getElementById('editFormPanchayat');
        pSel.innerHTML = '<option value="">Select Panchayat</option>';
        if(d && b) allPanchayats.filter(x => x.district_name === d && x.block_name === b).forEach(item => pSel.innerHTML += `<option value="${item.panchayat_name}">${item.panchayat_name}</option>`);
    }
}

function closeEditModal() {
    editTarget = null;
    document.getElementById('editModal').classList.add('hidden');
}

async function executeUnitEdit(e) {
    e.preventDefault();
    if(!editTarget) return;

    const newD = document.getElementById('editFormDistrict').value;
    const newB = document.getElementById('editFormBlock').value;
    const newP = document.getElementById('editFormPanchayat').value;
    const newU = document.getElementById('editFormName').value.trim();

    if(!newD || !newB || !newP || !newU) return spawnToastNotification("Incomplete fields.", "error");

    const target = { ...editTarget };
    closeEditModal();
    
    toggleInteractionLoader(true, "Updating Terminal Hierarchy...");
    try {
        // Update the unit name
        const { error } = await supa.from('units').update({
            district_name: newD, block_name: newB, panchayat_name: newP, unit_name: newU
        }).eq('district_name', target.oldD).eq('block_name', target.oldB).eq('panchayat_name', target.oldP).eq('unit_name', target.oldU);
        
        if (error) throw error; 

        // CASCADE: Update the associated memberships so they don't get orphaned
        await supa.from('memberships').update({
            district: newD, block: newB, panchayat: newP, unit: newU
        }).eq('district', target.oldD).eq('block', target.oldB).eq('panchayat', target.oldP).eq('unit', target.oldU);

        spawnToastNotification("Terminal Updated.", "success");
        await fetchMasterData();
    } catch(err) {
        console.error("Update Error:", err);
        spawnToastNotification(err.message || "Update failed.", "error");
    }
    toggleInteractionLoader(false);
}

// --- FRONTEND DELETE MODAL LOGIC ---
function openDeleteModal(uName, dName, bName, pName) {
    deleteTarget = { u: uName, d: dName, b: bName, p: pName };
    document.getElementById('deleteModalUnitName').innerText = uName;
    document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() {
    deleteTarget = null;
    document.getElementById('deleteModal').classList.add('hidden');
}

async function executeUnitDelete() {
    if(!deleteTarget) return;
    
    const target = { ...deleteTarget }; 
    closeDeleteModal();
    
    toggleInteractionLoader(true, "Purging node...");
    try {
        const { error } = await supa.from('units').delete()
            .eq('district_name', target.d)
            .eq('block_name', target.b)
            .eq('panchayat_name', target.p)
            .eq('unit_name', target.u);
            
        if (error) throw error; 
            
        spawnToastNotification("Terminal Purged.", "success");
        await fetchMasterData();
    } catch(err) {
        console.error("Delete Error:", err);
        if (err.code === '23503') {
            spawnToastNotification("Cannot delete! Remove associated members first.", "error");
        } else {
            spawnToastNotification(err.message || "Purge Failed.", "error");
        }
    }
    toggleInteractionLoader(false);
}

// ==========================================
// EXPORTS (CSV & PDF)
// ==========================================
function exportToCSV() {
    if(filteredUnits.length === 0) return spawnToastNotification("No data to export.", "error");
    const headers = ["Unit_Name", "Panchayat", "Block", "District", "Total_Members"];
    let csvContent = headers.join(",") + "\n";

    filteredUnits.forEach(u => {
        let row = [`"${u.unit_name}"`, `"${u.panchayat_name}"`, `"${u.block_name}"`, `"${u.district_name}"`, u.members_count];
        csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `SSF_Units_Export.csv`);
    link.click();
}

function exportToPDF() {
    if(filteredUnits.length === 0) return spawnToastNotification("No data to export.", "error");
    
    if (!window.jspdf || !window.jspdf.jsPDF) {
        return spawnToastNotification("PDF Engine not loaded.", "error");
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(14);
    doc.text("SSF West Bengal - Units Export", 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Total Generated: ${filteredUnits.length} Units`, 14, 22);
    
    const tableData = filteredUnits.map((u, i) => [
        i + 1, 
        u.unit_name, 
        u.panchayat_name, 
        u.block_name, 
        u.district_name, 
        u.members_count
    ]);

    doc.autoTable({
        head: [['#', 'Unit Name', 'Panchayat', 'Block', 'District', 'Members']],
        body: tableData,
        startY: 28,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [15, 23, 42] }, 
        alternateRowStyles: { fillColor: [248, 250, 252] }, 
    });

    doc.save("SSF_Units_Export.pdf");
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
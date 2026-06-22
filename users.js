let allUsers = [];
let filteredUsers = [];
let allMemberships = []; 
let hierarchyData = { districts: [], blocks: [], panchayats: [], units: [] };
let chartInstance = null;

let currentPage = 1;
let pageSize = 25;

// Variables to track modal states
let editUserId = null;
let currentUserForDelete = null;
let activeViewUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!enforceSession()) return;
    setActiveSidebarLink('users');
    await fetchInitialData();
});

// Fetch all required datasets concurrently
async function fetchInitialData() {
    toggleInteractionLoader(true, "Loading Users...");
    try {
        const [uRes, mRes, dRes, bRes, pRes, unRes] = await Promise.all([
            supa.from('users').select('*').order('created_at', { ascending: false }),
            supa.from('memberships').select('created_by'),
            supa.from('districts').select('*'),
            supa.from('blocks').select('*'),
            supa.from('panchayats').select('*'),
            supa.from('units').select('*')
        ]);

        allUsers = uRes.data || [];
        filteredUsers = [...allUsers];
        allMemberships = mRes.data || [];

        hierarchyData.districts = dRes.data || [];
        hierarchyData.blocks = bRes.data || [];
        hierarchyData.panchayats = pRes.data || [];
        hierarchyData.units = unRes.data || [];

        updateMetrics();
        applyFilters(); 

    } catch(err) {
        spawnToastNotification("Failed to load user records.", "error");
        console.error(err);
    }
    toggleInteractionLoader(false);
}

// ==========================================
// METRICS & CHARTS
// ==========================================
function updateMetrics() {
    const total = allUsers.length;
    const active = allUsers.filter(u => u.status === 'ACTIVE').length;
    const blocked = allUsers.filter(u => u.status === 'BLOCKED').length;

    document.getElementById('statTotalUsers').innerText = total;
    document.getElementById('statActiveUsers').innerText = active;
    document.getElementById('statBlockedUsers').innerText = blocked;
}

function updateMiniChart() {
    const ctx = document.getElementById('roleChart');
    if (chartInstance) chartInstance.destroy();

    let roleCounts = { 'Admin': 0, 'District': 0, 'Block': 0, 'Panchayat': 0, 'Unit': 0 };
    filteredUsers.forEach(u => {
        if(u.role === 'Admin' || u.role === 'MasterAdmin') roleCounts['Admin']++;
        else if(u.role === 'DistrictAdmin') roleCounts['District']++;
        else if(u.role === 'BlockAdmin') roleCounts['Block']++;
        else if(u.role === 'PanchayatAdmin') roleCounts['Panchayat']++;
        else if(u.role === 'UnitAdmin') roleCounts['Unit']++;
    });

    if (filteredUsers.length === 0) return;

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(roleCounts),
            datasets: [{
                data: Object.values(roleCounts),
                backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#0ea5e9', '#8b5cf6'],
                borderWidth: 2, borderColor: '#ffffff', hoverOffset: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            plugins: { legend: { display: false }, tooltip: { enabled: true } },
            animation: { animateScale: true, duration: 800 }
        }
    });
}

// ==========================================
// FILTERS & PAGINATION
// ==========================================
function applyFilters() {
    const q = document.getElementById('filterSearch').value.toLowerCase().trim();
    const role = document.getElementById('filterRole').value;
    const status = document.getElementById('filterStatus').value;

    filteredUsers = allUsers.filter(u => {
        let match = true;
        if (role && u.role !== role) match = false;
        if (status && u.status !== status) match = false;
        if (q) {
            const searchStr = `${u.name} ${u.username} ${u.email}`.toLowerCase();
            if (!searchStr.includes(q)) match = false;
        }
        return match;
    });

    currentPage = 1;
    updateMiniChart();
    renderPagination();
    renderTable();
}

function changePageSize() {
    pageSize = parseInt(document.getElementById('pageSizeSelect').value);
    currentPage = 1; renderPagination(); renderTable();
}

function prevPage() { if (currentPage > 1) { currentPage--; renderPagination(); renderTable(); } }
function nextPage() {
    const maxPage = Math.ceil(filteredUsers.length / pageSize);
    if (currentPage < maxPage) { currentPage++; renderPagination(); renderTable(); }
}
function goToPage(p) { currentPage = p; renderPagination(); renderTable(); }

function renderPagination() {
    const totalRecords = filteredUsers.length;
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
// DATA TABLE RENDERING
// ==========================================
function parseTerritory(jsonStr) {
    if(!jsonStr) return "Global / Unassigned";
    try {
        let obj = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
        if(obj.units && obj.units.length > 0) return `Unit: ${obj.units[0]}`;
        if(obj.panchayats && obj.panchayats.length > 0) return `Panchayat: ${obj.panchayats[0]}`;
        if(obj.blocks && obj.blocks.length > 0) return `Block: ${obj.blocks[0]}`;
        if(obj.districts && obj.districts.length > 0) return `District: ${obj.districts[0]}`;
        return "Global Access";
    } catch(e) { return "Global Access"; }
}

function getRoleBadge(role) {
    if(role.includes('Admin') && !role.includes('District') && !role.includes('Block') && !role.includes('Panchayat') && !role.includes('Unit')) 
        return `<span class="bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider text-[9px]">Global Admin</span>`;
    return `<span class="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider text-[9px]">${role}</span>`;
}

function renderTable() {
    const tbody = document.getElementById('userTableBody');
    const mobileGrid = document.getElementById('userMobileCardsGrid');
    const emptyState = document.getElementById('emptyState');
    
    tbody.innerHTML = '';
    if(mobileGrid) mobileGrid.innerHTML = '';

    if (filteredUsers.length === 0) {
        emptyState.classList.remove('hidden'); return;
    }
    emptyState.classList.add('hidden');

    const startIdx = (currentPage - 1) * pageSize;
    const currentSlice = filteredUsers.slice(startIdx, startIdx + pageSize);

    currentSlice.forEach((u, index) => {
        const recordsCount = allMemberships.filter(m => m.created_by === u.username).length;
        const territory = parseTerritory(u.assigned_fields_json);
        const roleBadge = getRoleBadge(u.role);
        
        const statusBadge = u.status === 'ACTIVE' 
            ? `<span class="text-emerald-500 font-bold flex items-center gap-1 text-[10px]"><div class="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Active</span>`
            : `<span class="text-rose-500 font-bold flex items-center gap-1 text-[10px]"><div class="w-1.5 h-1.5 rounded-full bg-rose-500"></div> Suspended</span>`;
            
        const toggleIcon = u.status === 'ACTIVE' ? 'fa-ban text-rose-500' : 'fa-check text-emerald-500';
        const toggleTitle = u.status === 'ACTIVE' ? 'Suspend Account' : 'Activate Account';

        // Desktop Row
        tbody.innerHTML += `
            <tr class="hover:bg-indigo-50/30 transition-colors group cursor-default">
                <td class="py-3 px-4 text-center font-mono text-slate-400">${startIdx + index + 1}</td>
                <td class="py-3 px-4">
                    <div class="font-black text-slate-900">${u.name}</div>
                    <div class="text-[10px] font-mono bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded inline-block mt-1">${u.username}</div>
                </td>
                <td class="py-3 px-4 space-y-1.5">
                    ${roleBadge}
                    <div>${statusBadge}</div>
                </td>
                <td class="py-3 px-4 font-bold text-slate-700 text-[11px]"><i class="fa-solid fa-location-crosshairs text-indigo-400 mr-1"></i> ${territory}</td>
                <td class="py-3 px-4 text-center">
                    <span class="bg-emerald-50 text-emerald-700 font-bold font-mono px-2 py-1 rounded-lg border border-emerald-100">${recordsCount}</span>
                </td>
                <td class="py-3 px-4 text-right pr-4">
                    <div class="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button onclick="openViewUserModal('${u.username}')" class="w-7 h-7 rounded-md bg-sky-50 text-sky-600 hover:bg-sky-100 border border-sky-100 flex items-center justify-center" title="View Credentials"><i class="fa-solid fa-id-badge text-[10px]"></i></button>
                        <button onclick="openViewMembersModal('${u.username}')" class="w-7 h-7 rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100 flex items-center justify-center" title="View Captured Members"><i class="fa-solid fa-users text-[10px]"></i></button>
                        <button onclick="openEditUserModal('${u.username}')" class="w-7 h-7 rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100 flex items-center justify-center" title="Edit Operator"><i class="fa-solid fa-pen text-[10px]"></i></button>
                        <button onclick="toggleUserStatus('${u.username}', '${u.status}')" class="w-7 h-7 rounded-md bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 flex items-center justify-center" title="${toggleTitle}"><i class="fa-solid ${toggleIcon} text-[10px]"></i></button>
                        <button onclick="promptDeleteUser('${u.username}')" class="w-7 h-7 rounded-md bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100 flex items-center justify-center" title="Delete Operator"><i class="fa-solid fa-trash-can text-[10px]"></i></button>
                    </div>
                </td>
            </tr>`;
            
        // Mobile Card
        if(mobileGrid) {
            mobileGrid.innerHTML += `
            <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative">
                <div class="absolute top-4 right-4 flex gap-1">
                    <button onclick="openViewUserModal('${u.username}')" class="w-8 h-8 bg-sky-50 text-sky-600 rounded-lg flex items-center justify-center border border-sky-100"><i class="fa-solid fa-id-badge"></i></button>
                    <button onclick="openEditUserModal('${u.username}')" class="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center border border-indigo-100"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="promptDeleteUser('${u.username}')" class="w-8 h-8 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center border border-rose-100"><i class="fa-solid fa-trash-can"></i></button>
                </div>
                <div>
                    <h4 class="text-sm font-black text-slate-900 leading-tight pr-32">${u.name}</h4>
                    <span class="text-[10px] font-mono bg-slate-100 border text-slate-500 px-1.5 py-0.5 rounded mt-1 inline-block">${u.username}</span>
                </div>
                <div class="grid grid-cols-2 gap-2 mt-3 mb-2">
                    <div>${roleBadge}</div>
                    <div>${statusBadge}</div>
                </div>
                <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-[10px] flex justify-between items-center mt-2">
                    <span class="font-bold text-slate-600 truncate mr-2"><i class="fa-solid fa-location-crosshairs text-indigo-400 mr-1"></i> ${territory}</span>
                    <button onclick="openViewMembersModal('${u.username}')" class="font-bold text-emerald-600 bg-emerald-100/50 px-2 py-1 rounded border border-emerald-100 shrink-0 hover:bg-emerald-100 transition-colors">${recordsCount} Captured <i class="fa-solid fa-arrow-right ml-1"></i></button>
                </div>
            </div>`;
        }
    });
}

// ==========================================
// MODAL CONTROLS & FORM HANDLING
// ==========================================

function openUserCreationModal() {
    editUserId = null;
    document.getElementById('userForm').reset();
    
    // UI Reset for Create
    document.getElementById('userModalTitle').innerHTML = '<i class="fa-solid fa-user-plus text-indigo-600 mr-2"></i> Deploy Operator';
    document.getElementById('userFormSubmitBtn').innerHTML = '<i class="fa-solid fa-check mr-1"></i> Deploy';
    document.getElementById('userFormUser').disabled = false;
    document.getElementById('userFormPass').required = true;
    document.getElementById('userFormPass').placeholder = "";
    document.getElementById('editPasswordHint').classList.add('hidden');
    
    syncUserFormRoleDropdowns();
    showModal('userModal');
}

function openEditUserModal(username) {
    const user = allUsers.find(u => u.username === username);
    if(!user) return spawnToastNotification("Operator not found.", "error");

    editUserId = username;
    document.getElementById('userForm').reset();
    
    // UI Setup for Edit
    document.getElementById('userModalTitle').innerHTML = '<i class="fa-solid fa-pen text-indigo-600 mr-2"></i> Edit Operator';
    document.getElementById('userFormSubmitBtn').innerHTML = '<i class="fa-solid fa-save mr-1"></i> Save Changes';
    document.getElementById('userFormUser').value = user.username;
    document.getElementById('userFormUser').disabled = true; // Prevent changing PK
    document.getElementById('userFormName').value = user.name;
    document.getElementById('userFormRole').value = user.role;
    
    // Password is optional during edit
    document.getElementById('userFormPass').required = false;
    document.getElementById('userFormPass').placeholder = "Leave blank to keep...";
    document.getElementById('editPasswordHint').classList.remove('hidden');

    syncUserFormRoleDropdowns();

    // Re-populate assigned fields if they exist
    if (user.assigned_fields_json) {
        const af = typeof user.assigned_fields_json === 'string' ? JSON.parse(user.assigned_fields_json) : user.assigned_fields_json;
        if (af.districts && af.districts.length > 0) {
            document.getElementById('userFormDist').value = af.districts[0];
            syncUserFormScopeLevels('district');
        }
        if (af.blocks && af.blocks.length > 0) {
            document.getElementById('userFormBlk').value = af.blocks[0];
            syncUserFormScopeLevels('block');
        }
        if (af.panchayats && af.panchayats.length > 0) {
            document.getElementById('userFormPan').value = af.panchayats[0];
            syncUserFormScopeLevels('panchayat');
        }
        if (af.units && af.units.length > 0) {
            document.getElementById('userFormUnt').value = af.units[0];
        }
    }
    
    showModal('userModal');
}

function closeUserModal() { hideModal('userModal'); }

function syncUserFormRoleDropdowns() {
    const role = document.getElementById('userFormRole').value;
    const cont = document.getElementById('userFormScopeContainer');
    const dWrap = document.getElementById('userFormDistWrap'), bWrap = document.getElementById('userFormBlkWrap');
    const pWrap = document.getElementById('userFormPanWrap'), uWrap = document.getElementById('userFormUntWrap');

    const dSel = document.getElementById('userFormDist');
    dSel.innerHTML = '<option value="">-- Select District --</option>';
    hierarchyData.districts.forEach(d => dSel.innerHTML += `<option value="${d.district_name}">${d.district_name}</option>`);
    
    document.getElementById('userFormBlk').innerHTML = '<option value="">-- Select Block --</option>';
    document.getElementById('userFormPan').innerHTML = '<option value="">-- Select Panchayat --</option>';
    document.getElementById('userFormUnt').innerHTML = '<option value="">-- Select Unit --</option>';

    if (role === 'Admin' || role === 'MasterAdmin') {
        cont.classList.add('hidden');
    } else {
        cont.classList.remove('hidden');
        dWrap.classList.remove('hidden');
        bWrap.classList.toggle('hidden', role === 'DistrictAdmin');
        pWrap.classList.toggle('hidden', role === 'DistrictAdmin' || role === 'BlockAdmin');
        uWrap.classList.toggle('hidden', role !== 'UnitAdmin');
    }
}

function syncUserFormScopeLevels(level) {
    const d = document.getElementById('userFormDist').value;
    const b = document.getElementById('userFormBlk').value;
    const p = document.getElementById('userFormPan').value;
    
    if (level === 'district') {
        const bSel = document.getElementById('userFormBlk'); bSel.innerHTML = '<option value="">-- Select Block --</option>';
        hierarchyData.blocks.filter(x => x.district_name === d).forEach(item => bSel.innerHTML += `<option value="${item.block_name}">${item.block_name}</option>`);
    } else if (level === 'block') {
        const pSel = document.getElementById('userFormPan'); pSel.innerHTML = '<option value="">-- Select Panchayat --</option>';
        hierarchyData.panchayats.filter(x => x.district_name === d && x.block_name === b).forEach(item => pSel.innerHTML += `<option value="${item.panchayat_name}">${item.panchayat_name}</option>`);
    } else if (level === 'panchayat') {
        const uSel = document.getElementById('userFormUnt'); uSel.innerHTML = '<option value="">-- Select Unit --</option>';
        hierarchyData.units.filter(x => x.district_name === d && x.block_name === b && x.panchayat_name === p).forEach(item => uSel.innerHTML += `<option value="${item.unit_name}">${item.unit_name}</option>`);
    }
}

async function handleUserFormSubmit(e) {
    e.preventDefault();
    const u = document.getElementById('userFormUser').value.trim().toLowerCase();
    const p = document.getElementById('userFormPass').value;
    const role = document.getElementById('userFormRole').value;
    
    // Auto-assign scope arrays
    let assigned = { districts: [], blocks: [], panchayats: [], units: [] };
    if (role !== 'Admin' && role !== 'MasterAdmin') {
        const d = document.getElementById('userFormDist').value, b = document.getElementById('userFormBlk').value;
        const pan = document.getElementById('userFormPan').value, unt = document.getElementById('userFormUnt').value;
        if (d) assigned.districts.push(d);
        if (b) assigned.blocks.push(b);
        if (pan) assigned.panchayats.push(pan);
        if (unt) assigned.units.push(unt);
    }

    let payload = { 
        name: document.getElementById('userFormName').value.trim(), 
        role: role, 
        assigned_fields_json: assigned 
    };

    if (p) {
        const msgBuffer = new TextEncoder().encode(p);                    
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashed = hashArray.map(byt => byt.toString(16).padStart(2, '0')).join('');
        
        payload.password_hash = hashed;
        payload.plain_password = p; 
    }

    toggleInteractionLoader(true, editUserId ? "Updating operator..." : "Deploying operator...");
    try {
        if (editUserId) {
            const { error } = await supa.from('users').update(payload).eq('username', editUserId);
            if(error) throw error;
            spawnToastNotification("Operator successfully updated.", "success");
        } else {
            payload.username = u;
            payload.status = 'ACTIVE';
            const { error } = await supa.from('users').insert([payload]); 
            if(error) throw error;
            spawnToastNotification("Operator successfully deployed.", "success");
        }
        closeUserModal(); 
        await fetchInitialData();
    } catch(err) {
        console.error("Database Insert Error:", err);
        // Extracts the actual error message dynamically, preventing the "fake user exists" confusion.
        spawnToastNotification(err.message || "Operation failed due to database constraint.", "error");
    }
    toggleInteractionLoader(false);
}

// ==========================================
// VIEW MODALS (CREDENTIALS & MEMBERS)
// ==========================================

function openViewUserModal(username) {
    const user = allUsers.find(u => u.username === username);
    if(!user) return;

    activeViewUser = username; // Track the currently viewed user

    document.getElementById('vuName').innerText = user.name;
    document.getElementById('vuRole').innerText = user.role;
    document.getElementById('vuUser').innerText = user.username;
    
    const statusEl = document.getElementById('vuStatus');
    statusEl.innerHTML = user.status === 'ACTIVE' ? '<span class="text-emerald-600">Active</span>' : '<span class="text-rose-600">Suspended</span>';
    
    document.getElementById('vuPass').innerText = user.plain_password || "No Plaintext Stored";
    document.getElementById('vuTerritory').innerHTML = `<i class="fa-solid fa-location-crosshairs text-indigo-400 mr-1"></i> ${parseTerritory(user.assigned_fields_json)}`;

    showModal('viewUserModal');
}

function closeViewUserModal() { 
    activeViewUser = null; 
    hideModal('viewUserModal'); 
}

async function openViewMembersModal(username) {
    document.getElementById('vmUserTitle').innerText = `@${username}`;
    document.getElementById('vmList').innerHTML = '';
    document.getElementById('vmTotalCount').innerText = '0';
    document.getElementById('vmEmptyState').classList.add('hidden');
    document.getElementById('vmLoader').classList.remove('hidden');
    showModal('viewMembersModal');

    try {
        // FIX: Changed 'created_at' to 'timestamp' to match your database schema
        const { data, error } = await supa.from('memberships')
            .select('membership_id, name, phone, district, unit, committee_role, photo_url, is_digital, timestamp')
            .eq('created_by', username)
            .order('timestamp', { ascending: false });
            
        if(error) throw error;

        document.getElementById('vmLoader').classList.add('hidden');
        
        if(!data || data.length === 0) {
            document.getElementById('vmEmptyState').classList.remove('hidden');
        } else {
            document.getElementById('vmTotalCount').innerText = data.length;
            const list = document.getElementById('vmList');
            
            data.forEach((m) => {
                // FIX: Changed m.created_at to m.timestamp
                const date = new Date(m.timestamp).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
                const photo = m.photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80';
                
                const badge = m.is_digital 
                    ? '<span class="text-[8px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Digital</span>' 
                    : '<span class="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Physical</span>';

                list.innerHTML += `
                    <div class="bg-white border border-slate-200/80 rounded-2xl p-3 flex items-center gap-4 hover:shadow-md hover:border-indigo-200 transition-all group">
                        <div class="w-14 h-16 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200 shadow-sm">
                            <img src="${photo}" class="w-full h-full object-cover" crossorigin="anonymous">
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex justify-between items-start mb-1">
                                <h4 class="font-black text-slate-900 truncate text-sm leading-none group-hover:text-indigo-600 transition-colors">${m.name}</h4>
                                <span class="text-[9px] text-slate-400 font-mono font-bold bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 shrink-0">${date}</span>
                            </div>
                            <div class="flex items-center gap-2 mb-2">
                                <span class="text-[9px] font-mono bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded inline-block">${m.membership_id}</span>
                                ${badge}
                                <span class="text-[10px] font-bold text-slate-500 truncate"><i class="fa-solid fa-phone text-[9px] mr-0.5 opacity-50"></i> ${m.phone}</span>
                            </div>
                            <div class="flex items-center gap-1.5 mt-auto overflow-hidden">
                                <span class="bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-md text-[8px] uppercase font-bold tracking-wider truncate"><i class="fa-solid fa-location-crosshairs mr-0.5"></i> ${m.district} > ${m.unit}</span>
                                <span class="bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-md text-[8px] uppercase font-bold tracking-wider truncate">${m.committee_role}</span>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
    } catch (err) {
        console.error("Fetch Error:", err);
        document.getElementById('vmLoader').classList.add('hidden');
        spawnToastNotification("Failed to fetch members", "error");
    }
}
function closeViewMembersModal() { hideModal('viewMembersModal'); }

// ==========================================
// ACTIONS (STATUS & DELETE)
// ==========================================

async function toggleUserStatus(username, currentStatus) {
    const nextStatus = currentStatus === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
    toggleInteractionLoader(true, "Updating security clearance...");
    try {
        await supa.from('users').update({ status: nextStatus }).eq('username', username);
        spawnToastNotification(`Account mapped to ${nextStatus}`, "success");
        await fetchInitialData();
    } catch(err) {
        spawnToastNotification("Status update failed.", "error");
    }
    toggleInteractionLoader(false);
}

function promptDeleteUser(username) {
    currentUserForDelete = username;
    showModal('deleteModal');
}

function closeDeleteModal() {
    currentUserForDelete = null;
    hideModal('deleteModal');
}

async function confirmDeleteUser() {
    if(!currentUserForDelete) return;
    
    toggleInteractionLoader(true, "Terminating operator keys...");
    try {
        await supa.from('users').delete().eq('username', currentUserForDelete);
        spawnToastNotification("Operator deleted securely.", "success");
        closeDeleteModal();
        await fetchInitialData();
    } catch(err) {
        spawnToastNotification("Deletion failed.", "error");
    }
    toggleInteractionLoader(false);
}

// ==========================================
// UTILITY HELPERS
// ==========================================

function showModal(id) {
    const m = document.getElementById(id);
    m.classList.remove('hidden');
    setTimeout(() => { m.classList.remove('opacity-0'); m.children[0].classList.remove('scale-95'); }, 10);
}

function hideModal(id) {
    const m = document.getElementById(id);
    m.classList.add('opacity-0');
    m.children[0].classList.add('scale-95');
    setTimeout(() => { m.classList.add('hidden'); }, 200);
}

function exportToCSV() {
    if(filteredUsers.length === 0) return spawnToastNotification("No data to export.", "error");
    const headers = ["Name", "Username", "Role", "Status", "Territory"];
    let csvContent = headers.join(",") + "\n";

    filteredUsers.forEach(u => {
        let row = [`"${u.name}"`, `"${u.username}"`, `"${u.role}"`, `"${u.status}"`, `"${parseTerritory(u.assigned_fields_json)}"`];
        csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `SSF_Operators_Export.csv`);
    link.click();
}

function exportToPDF() {
    if(filteredUsers.length === 0) return spawnToastNotification("No data to export.", "error");
    if(!window.jspdf) return spawnToastNotification("PDF module loading...", "error");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text("SSF West Bengal - Operator Directory", 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);

    const tableColumn = ["#", "Name", "Username", "Role", "Status", "Territory"];
    const tableRows = [];

    filteredUsers.forEach((u, idx) => {
        const rowData = [
            idx + 1,
            u.name,
            u.username,
            u.role,
            u.status,
            parseTerritory(u.assigned_fields_json)
        ];
        tableRows.push(rowData);
    });

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 28,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [15, 23, 42] } 
    });

    doc.save("SSF_Operators_Export.pdf");
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

// ==========================================
// USER CREDENTIAL PDF GENERATOR (A4 PREMIUM - ADJUSTABLE)
// ==========================================
async function downloadUserCredentialPDF() {
    if(!activeViewUser || !window.jspdf || !window.html2canvas) {
        return spawnToastNotification("Required libraries are loading. Please wait.", "error");
    }

    const user = allUsers.find(u => u.username === activeViewUser);
    if(!user) return;

    // =========================================================
    // 🛠️ LAYOUT ADJUSTMENT OPTIONS
    // Change these values to shift elements up/down or adjust spacing
    // =========================================================
    const layout = {
        headerPadding: "35px 45px",       // Top/Bottom and Left/Right padding for the green header
        bodyPadding: "35px 45px",         // Padding for the main white content area
        spacingBetweenBlocks: "25px",     // Space below the Territory block and Credentials grid
        spacingBelowInstructions: "25px", // Space between instructions and the QR code box
        qrImageSize: "90px",              // Size of the QR code
        
        // 🔗 PDF Invisible Link Position 
        // (Measured in millimeters for A4 paper: 210mm wide x 297mm tall)
        // If the clickable area doesn't align with the button, adjust these:
        linkX: 20,                        // Left offset
        linkY: 220,                       // Top offset (increase to move link down, decrease to move up)
        linkWidth: 170,                   // Width of the clickable area
        linkHeight: 45                    // Height of the clickable area
    };
    // =========================================================

    const btn = document.getElementById('btnDownloadCreds');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
    btn.disabled = true;

    try {
        const container = document.createElement('div');
        const loginUrl = "https://membership.ssfwestbengal.org";
        const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(loginUrl)}&size=300&margin=0`;
        
        // Exact A4 Ratio at 96 DPI
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.width = '794px'; 
        container.style.height = '1123px'; 
        container.style.zIndex = '-9999';

        const territory = parseTerritory(user.assigned_fields_json);
        const pass = user.plain_password || 'Password Reset Required';
        const currentDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

        // Template using the layout variables
        container.innerHTML = `
        <div style="width: 794px; height: 1123px; background-color: #f8fafc; font-family: 'Segoe UI', system-ui, sans-serif; position: relative; box-sizing: border-box; overflow: hidden;">
            
            <div style="position: absolute; top: 55%; left: 50%; transform: translate(-50%, -50%) rotate(-35deg); font-size: 140px; font-weight: 900; color: rgba(0,0,0,0.02); white-space: nowrap; pointer-events: none; letter-spacing: 10px;">CONFIDENTIAL</div>

           <div style="background: linear-gradient(135deg, #047857 0%, #064e3b 100%); padding: ${layout.headerPadding}; color: white; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                <div>
                    <div style="font-family: 'Cooper Black', serif; font-size: 48px; font-weight: 900; letter-spacing: -2px; margin-bottom: 2px;">SSF</div>
                    <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 3px; color: #a7f3d0;">West Bengal State Committee</div>
                </div>
                
                <div style="display: flex; justify-content: flex-end;">
                    <div style="background: #ef4444; color: white; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 900; letter-spacing: 2px; text-indent: 2px; text-align: center; box-shadow: 0 4px 10px rgba(239, 68, 68, 0.3);">
                        RESTRICTED ACCESS
                    </div>
                </div>
            </div>

            <div style="padding: ${layout.bodyPadding};">
                <h1 style="font-size: 28px; color: #0f172a; margin: 0 0 8px 0; font-weight: 900; letter-spacing: -0.5px;">Official Operator Credentials</h1>
                <p style="font-size: 14px; color: #64748b; margin: 0 0 ${layout.spacingBetweenBlocks} 0; line-height: 1.5; font-weight: 500;">This document contains highly sensitive system access information intended solely for the designated authorized operator. Do not distribute.</p>

                <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 25px; margin-bottom: ${layout.spacingBetweenBlocks}; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
                    <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 800; letter-spacing: 1.5px; margin-bottom: 5px;">Assigned Field Jurisdiction</div>
                    <div style="font-size: 20px; color: #0f172a; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px;">${territory}</div>
                </div>

                <div style="display: flex; gap: 20px; margin-bottom: ${layout.spacingBetweenBlocks};">
                    <div style="flex: 1; background: white; border: 2px solid #e2e8f0; border-radius: 12px; padding: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.03);">
                        <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 800; letter-spacing: 1.5px; margin-bottom: 10px;">Account Username</div>
                        <div style="font-size: 18px; color: #0369a1; font-family: monospace; font-weight: bold; background: #f0f9ff; padding: 12px 15px; border-radius: 8px; border: 1px dashed #bae6fd; word-break: break-all;">${user.username}</div>
                    </div>
                    <div style="flex: 1; background: white; border: 2px solid #e2e8f0; border-radius: 12px; padding: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.03);">
                        <div style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 800; letter-spacing: 1.5px; margin-bottom: 10px;">Current Password</div>
                        <div style="font-size: 18px; color: #e11d48; font-family: monospace; font-weight: bold; background: #fff1f2; padding: 12px 15px; border-radius: 8px; border: 1px dashed #fecdd3; word-break: break-all;">${pass}</div>
                    </div>
                </div>

                <h2 style="font-size: 18px; color: #0f172a; margin: 0 0 15px 0; font-weight: 800; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">Standard Operating Procedures</h2>
                <ol style="font-size: 14px; color: #475569; line-height: 1.5; margin: 0 0 ${layout.spacingBelowInstructions} 0; padding-left: 20px; font-weight: 500;">
                    <li style="margin-bottom: 8px;">Navigate to the official SSF administration portal directly at <strong>membership.ssfwestbengal.org</strong> or scan the secure QR code below.</li>
                    <li style="margin-bottom: 8px;">Enter the exact username and password provided above. Passwords are case-sensitive and must not contain leading/trailing spaces.</li>
                    <li style="margin-bottom: 8px;">Upon successful login, verify that your dashboard reflects the correct assigned jurisdiction. If there is a mismatch, halt operations and contact the Master Admin.</li>
                    <li style="margin-bottom: 8px; color: #b91c1c; font-weight: 700; background: #fef2f2; padding: 8px 12px; border-radius: 8px; border-left: 4px solid #ef4444;">SECURITY DIRECTIVE: Never transmit these credentials via WhatsApp, SMS, or unencrypted channels. If printed, this document must be stored securely or cross-shredded after use.</li>
                </ol>

                <div style="display: flex; align-items: center; background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; box-shadow: 0 15px 35px rgba(0,0,0,0.06);">
                    <img src="${qrUrl}" crossorigin="anonymous" style="width: ${layout.qrImageSize}; height: ${layout.qrImageSize}; border-radius: 8px; margin-right: 25px; border: 3px solid #f8fafc; outline: 1px solid #e2e8f0;">
                    <div style="flex: 1;">
                        <div style="font-size: 14px; color: #0284c7; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px;">Scan to Login Instantly</div>
                        <div style="background: linear-gradient(135deg, #1e293b, #0f172a); color: white; text-align: center; padding: 15px; border-radius: 10px; font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; box-shadow: 0 8px 20px rgba(0,0,0,0.15);">Click Here To Access Portal</div>
                    </div>
                </div>

            </div>

            <div style="position: absolute; bottom: 0; left: 0; right: 0; text-align: center; padding: 20px; font-size: 12px; font-weight: 600; color: #94a3b8; border-top: 1px solid #e2e8f0; background: white;">
                Generated securely by the SSF Master Administration System on ${currentDate}
            </div>
        </div>
        `;

        document.body.appendChild(container);

        const allImages = Array.from(container.querySelectorAll('img'));
        await Promise.all(allImages.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve; 
                setTimeout(resolve, 3000); 
            });
        }));

        await new Promise(r => setTimeout(r, 200)); 

        const canvas = await html2canvas(container, { 
            scale: 2, 
            useCORS: true, 
            backgroundColor: "#ffffff",
            windowWidth: 794,
            windowHeight: 1123,
            scrollY: 0
        });
        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
        
        // Use the dynamically mapped link variables from our layout config
        pdf.link(layout.linkX, layout.linkY, layout.linkWidth, layout.linkHeight, { url: loginUrl });

        pdf.save(`SSF_Credentials_${user.username}.pdf`);

        document.body.removeChild(container);
        spawnToastNotification("A4 Credentials PDF downloaded!", "success");

    } catch(err) {
        console.error("PDF Error:", err);
        spawnToastNotification("Failed to generate PDF.", "error");
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}
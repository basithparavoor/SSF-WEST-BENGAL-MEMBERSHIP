let allPayments = [];
let filteredPayments = [];

let GLOBAL_UPI_ID = ""; 
let FEE_STRUCTURE = { state: 0, district: 0, block: 0, panchayat: 0, unit: 0, member: 0 };

// Auto-Resolved Node Variables
let NODE_PATH = "STATE_GLOBAL";
let NODE_TYPE = "GLOBAL"; 
let NODE_VALUE = "";

let currentPage = 1;
let pageSize = 25;

document.addEventListener('DOMContentLoaded', async () => {
    if (!enforceSession()) return;
    setActiveSidebarLink('payments');
    resolveUserNode();
    await fetchFinanceData();
});

// UI Helper: Animated Number Counter
function animateValue(obj, start, end, duration, prefix = "₹") {
    if (!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 4);
        const current = Math.floor(easeProgress * (end - start) + start);
        obj.innerText = prefix + current.toLocaleString('en-IN');
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerText = prefix + end.toLocaleString('en-IN');
        }
    };
    window.requestAnimationFrame(step);
}

// SAFE User Node Resolver (Prevents crashes if assignedFields is null/empty)
function resolveUserNode() {
    if (STATE_CACHE.role !== 'Admin' && STATE_CACHE.role !== 'MasterAdmin') {
        try {
            if (!STATE_CACHE.assignedFields) return;
            
            let obj = typeof STATE_CACHE.assignedFields === 'string' 
                ? JSON.parse(STATE_CACHE.assignedFields) 
                : STATE_CACHE.assignedFields;
                
            if (!obj) return;

            if (obj.units && obj.units.length > 0) { NODE_TYPE = "unit"; NODE_VALUE = obj.units[0]; NODE_PATH = `Unit: ${NODE_VALUE}`; }
            else if (obj.panchayats && obj.panchayats.length > 0) { NODE_TYPE = "panchayat"; NODE_VALUE = obj.panchayats[0]; NODE_PATH = `Panchayat: ${NODE_VALUE}`; }
            else if (obj.blocks && obj.blocks.length > 0) { NODE_TYPE = "block"; NODE_VALUE = obj.blocks[0]; NODE_PATH = `Block: ${NODE_VALUE}`; }
            else if (obj.districts && obj.districts.length > 0) { NODE_TYPE = "district"; NODE_VALUE = obj.districts[0]; NODE_PATH = `District: ${NODE_VALUE}`; }
        } catch(e) {
            console.error("Node assignment error safely caught:", e);
        }
    }
}

// ==========================================
// DATA CORE FETCH & DYNAMIC CALCULATION
// ==========================================
async function fetchFinanceData() {
    toggleInteractionLoader(true, "Loading Payments...");
    try {
        const [payRes, setRes, feeRes, memRes] = await Promise.all([
            supa.from('payments').select('*').order('id', { ascending: false }),
            supa.from('settings').select('*').eq('key', 'MasterUPI').maybeSingle(),
            supa.from('fee_structure').select('*'),
            // Added is_digital to the select query below
            supa.from('memberships').select('district, block, panchayat, unit, committee_role, is_digital') 
        ]);
        
        allPayments = payRes.data || [];
        filteredPayments = [...allPayments];

        if(setRes.data && setRes.data.value) {
            GLOBAL_UPI_ID = setRes.data.value;
        } else {
            GLOBAL_UPI_ID = "statecommittee@sbi";
        }

        if(feeRes.data) {
            feeRes.data.forEach(f => {
                // Assigns directly so the new 'digital' role type is captured automatically
                FEE_STRUCTURE[f.role_type] = parseFloat(f.amount) || 0;
            });
        }

        calculateNodeFinancials(memRes.data || []);
        applyFilters();

    } catch(err) {
        spawnToastNotification("Failed to load ledgers.", "error");
    }
    toggleInteractionLoader(false);
}
function calculateNodeFinancials(allSystemMembers) {
    let expectedTotal = 0;
    let paidTotal = 0;
    
    let nodeMembers = allSystemMembers;
    if (NODE_TYPE !== "GLOBAL") {
        nodeMembers = allSystemMembers.filter(m => m[NODE_TYPE] === NODE_VALUE);
    }

    nodeMembers.forEach(m => {
    let roleStr = m.committee_role || 'Unit Member';
    let level = roleStr.split(' ')[0].toLowerCase(); 
    if (roleStr.toLowerCase().includes('member')) level = 'member';

    let feeAmount;
    
    // Check if it's a digital membership first
    if (m.is_digital) {
        feeAmount = FEE_STRUCTURE['digital'];
    } else {
        feeAmount = FEE_STRUCTURE[level];
    }

    // Safe parsing to prevent NaN breaks
    if (feeAmount === undefined || isNaN(feeAmount)) {
        feeAmount = FEE_STRUCTURE['member'] || 0;
    }
    
    expectedTotal += parseFloat(feeAmount);
});

    allPayments.forEach(p => {
        if (NODE_TYPE === "GLOBAL" || p.node_path === NODE_PATH) {
            if (p.status === 'VERIFIED') paidTotal += parseFloat(p.amount || 0);
        }
    });

    const pendingTotal = Math.max(0, expectedTotal - paidTotal);

    // Run safe animations
    animateValue(document.getElementById('bannerTotal'), 0, expectedTotal, 1500);
    animateValue(document.getElementById('bannerPaid'), 0, paidTotal, 1500);
    animateValue(document.getElementById('bannerPending'), 0, pendingTotal, 1500);
    
    document.getElementById('bannerFieldName').innerText = NODE_PATH;

    const btnPay = document.getElementById('btnPayNow');
    if (pendingTotal === 0) {
        btnPay.classList.add('opacity-50', 'cursor-not-allowed');
        btnPay.onclick = () => spawnToastNotification("All dues are cleared for this field.", "success");
    } else {
        btnPay.classList.remove('opacity-50', 'cursor-not-allowed');
        btnPay.onclick = () => triggerUPIPayment(pendingTotal);
    }
}

// ==========================================
// FILTERS & PAGINATION
// ==========================================
function applyFilters() {
    const q = document.getElementById('filterSearch').value.toLowerCase().trim();
    const status = document.getElementById('filterStatus').value;

    filteredPayments = allPayments.filter(p => {
        let match = true;
        if (NODE_TYPE !== "GLOBAL" && p.node_path !== NODE_PATH) match = false;
        if (status && p.status !== status) match = false;
        if (q) {
            const searchStr = `${p.tx_id} ${p.node_path} ${p.recorded_by}`.toLowerCase();
            if (!searchStr.includes(q)) match = false;
        }
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
    const maxPage = Math.ceil(filteredPayments.length / pageSize);
    if (currentPage < maxPage) { currentPage++; renderPagination(); renderTable(); }
}
function goToPage(p) { currentPage = p; renderPagination(); renderTable(); }

function renderPagination() {
    const totalRecords = filteredPayments.length;
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
        const activeClass = i === currentPage ? 'bg-indigo-600 text-white shadow-[0_4px_10px_rgba(79,70,229,0.3)] border-indigo-600' : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200';
        numContainer.innerHTML += `<button onclick="goToPage(${i})" class="w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold transition-all duration-300 ${activeClass} hover:-translate-y-0.5">${i}</button>`;
    }
}

// ==========================================
// RENDER TABLE & CARDS WITH STAGGERED ANIMATION
// ==========================================
function renderTable() {
    const tbody = document.getElementById('paymentTableBody');
    const mobileGrid = document.getElementById('paymentMobileCardsGrid');
    const emptyState = document.getElementById('emptyState');
    
    tbody.innerHTML = '';
    mobileGrid.innerHTML = '';

    if (filteredPayments.length === 0) {
        emptyState.classList.remove('hidden'); return;
    }
    emptyState.classList.add('hidden');

    const startIdx = (currentPage - 1) * pageSize;
    const currentSlice = filteredPayments.slice(startIdx, startIdx + pageSize);

    const isAdmin = STATE_CACHE.role === 'Admin' || STATE_CACHE.role === 'MasterAdmin';

    currentSlice.forEach((p, index) => {
        let statusBadge = '';
        if(p.status === 'VERIFIED') statusBadge = `<span class="bg-emerald-50 text-emerald-600 border border-emerald-200/60 px-2.5 py-1 rounded-lg font-bold uppercase tracking-widest text-[9px] shadow-sm"><i class="fa-solid fa-check mr-1"></i> Verified</span>`;
        else if(p.status === 'PENDING') statusBadge = `<span class="bg-amber-50 text-amber-600 border border-amber-200/60 px-2.5 py-1 rounded-lg font-bold uppercase tracking-widest text-[9px] shadow-sm"><i class="fa-solid fa-clock mr-1 animate-pulse"></i> Pending</span>`;
        else if(p.status === 'REJECTED') statusBadge = `<span class="bg-rose-50 text-rose-600 border border-rose-200/60 px-2.5 py-1 rounded-lg font-bold uppercase tracking-widest text-[9px] shadow-sm"><i class="fa-solid fa-xmark mr-1"></i> Rejected</span>`;

        let actionButtons = `<span class="text-[9px] font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">Locked</span>`;
        if (isAdmin && p.status === 'PENDING') {
            actionButtons = `
            <div class="flex items-center justify-end gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity duration-300">
                <button onclick="updatePaymentStatus('${p.tx_id}', 'REJECTED')" class="bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white border border-rose-200 px-3 py-1.5 rounded-lg font-bold transition-all duration-300 active:scale-95 shadow-sm text-[10px] uppercase tracking-wider">Reject</button>
                <button onclick="updatePaymentStatus('${p.tx_id}', 'VERIFIED')" class="bg-[#0f7652] text-white hover:bg-emerald-800 shadow-sm hover:shadow-emerald-900/30 px-4 py-1.5 rounded-lg font-bold transition-all duration-300 active:scale-95 text-[10px] uppercase tracking-wider">Verify</button>
            </div>`;
        } else if (isAdmin) {
            actionButtons = `<button onclick="deletePaymentRecord('${p.tx_id}')" class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-white hover:bg-rose-500 shadow-sm transition-all duration-300 flex items-center justify-center ml-auto active:scale-95" title="Delete Ledger"><i class="fa-solid fa-trash-can text-[10px]"></i></button>`;
        }

        const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A';

        // Desktop Row
        tbody.innerHTML += `
            <tr class="group hover:bg-indigo-50/30 transition-colors duration-300 border-b border-slate-50 last:border-0">
                <td class="py-3.5 px-5 text-center font-mono text-slate-400 font-bold">${startIdx + index + 1}</td>
                <td class="py-3.5 px-5">
                    <div class="font-black text-slate-800 text-[13px] group-hover:text-indigo-600 transition-colors">₹${parseFloat(p.amount).toLocaleString('en-IN')}</div>
                    <div class="text-[9px] font-mono bg-slate-100 border border-slate-200 text-slate-500 px-2 py-0.5 rounded-md inline-block mt-1 tracking-widest">${p.tx_id}</div>
                </td>
                <td class="py-3.5 px-5">
                    <div class="font-bold text-slate-700 text-[11px] flex items-center gap-1.5"><i class="fa-solid fa-user-tie text-slate-400 text-[10px]"></i> ${p.recorded_by}</div>
                    <div class="text-[9px] text-slate-500 font-bold mt-1.5 uppercase tracking-wider flex items-center gap-1.5"><i class="fa-solid fa-location-crosshairs text-indigo-400 text-[10px]"></i> Field Name: ${p.node_path}</div>
                </td>
                <td class="py-3.5 px-5">
                    ${statusBadge}
                    <div class="text-[9px] text-slate-400 font-mono mt-1.5 font-bold tracking-widest">${dateStr}</div>
                </td>
                <td class="py-3.5 px-5 text-right pr-7">${actionButtons}</td>
            </tr>`;

        // Mobile Card
        mobileGrid.innerHTML += `
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative hover:shadow-md transition-shadow duration-300">
                <div class="flex justify-between items-start border-b border-slate-100 pb-3 mb-3">
                    <div>
                        <h4 class="text-lg font-black text-slate-900 leading-tight tracking-tight">₹${parseFloat(p.amount).toLocaleString('en-IN')}</h4>
                        <span class="text-[9px] font-mono bg-slate-100 border border-slate-200 text-slate-500 px-2 py-0.5 rounded-md mt-1.5 inline-block tracking-widest">${p.tx_id}</span>
                    </div>
                    ${statusBadge}
                </div>
                <div class="grid grid-cols-2 gap-3 text-[10px] font-medium text-slate-600 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div><span class="font-bold text-slate-400 block uppercase tracking-widest mb-1 font-mono">Operator</span><span class="font-bold text-slate-700">${p.recorded_by}</span></div>
                    <div><span class="font-bold text-slate-400 block uppercase tracking-widest mb-1 font-mono">Node</span><span class="font-bold text-slate-700">${p.node_path}</span></div>
                </div>
                <div class="pt-3 border-t border-slate-100 flex justify-between items-center">
                    <span class="text-[9px] font-mono font-bold tracking-widest text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">${dateStr}</span>
                    <div>${actionButtons}</div>
                </div>
            </div>`;
    });
}

// ==========================================
// UPI PAYMENT MODAL & INTENT LOGGING
// ==========================================

function triggerUPIPayment(amount) {
    document.getElementById('modalAmountDue').innerText = `₹${amount.toLocaleString('en-IN')}`;
    document.getElementById('modalUpiIdText').innerText = GLOBAL_UPI_ID;
    document.getElementById('upiQRModal').dataset.amount = amount;
    
    const upiLink = `upi://pay?pa=${GLOBAL_UPI_ID}&pn=SSF_West_Bengal&am=${amount}&cu=INR`;
    document.getElementById('qrModalImage').src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiLink)}`;
    
    const btn = document.getElementById('btnConfirmPayModal');
    btn.querySelector('.btn-text').classList.remove('opacity-0');
    btn.querySelector('.fa-spinner').classList.add('hidden');
    btn.disabled = false;

    const modal = document.getElementById('upiQRModal');
    modal.classList.remove('hidden', 'opacity-0');
    setTimeout(() => { modal.children[0].classList.remove('scale-95'); }, 10);
}

function openUPIApp() {
    const amount = document.getElementById('upiQRModal').dataset.amount;
    const upiLink = `upi://pay?pa=${GLOBAL_UPI_ID}&pn=SSF_West_Bengal&am=${amount}&cu=INR`;
    window.location.href = upiLink; 
}

function closeUPIModal() { 
    document.getElementById('upiQRModal').children[0].classList.add('scale-95');
    setTimeout(() => document.getElementById('upiQRModal').classList.add('hidden', 'opacity-0'), 300);
}

async function confirmPaymentIntent(btnElement) {
    const amt = document.getElementById('upiQRModal').dataset.amount;
    if(!amt || amt <= 0) return spawnToastNotification("Invalid amount.", "error");

    btnElement.disabled = true;
    btnElement.querySelector('.btn-text').classList.add('opacity-0');
    btnElement.querySelector('.fa-spinner').classList.remove('hidden');

    const payload = { 
        tx_id: "TXN-" + Math.floor(10000000 + Math.random() * 90000000), 
        node_path: NODE_PATH, 
        amount: amt, 
        status: 'PENDING', 
        recorded_by: STATE_CACHE.user 
    };

    try {
        await supa.from('payments').insert([payload]);
        spawnToastNotification("Intent Logged. Awaiting Admin Verification.", "success");
        closeUPIModal(); 
        await fetchFinanceData(); 
    } catch(err) {
        spawnToastNotification("Failed to log payment.", "error");
        btnElement.disabled = false;
        btnElement.querySelector('.btn-text').classList.remove('opacity-0');
        btnElement.querySelector('.fa-spinner').classList.add('hidden');
    }
}

// ==========================================
// ADMIN MUTATIONS
// ==========================================

async function updatePaymentStatus(txId, status) {
    if(!confirm(`Mark transaction as ${status}?`)) return;
    toggleInteractionLoader(true, "Updating Ledger...");
    try {
        await supa.from('payments').update({ status: status }).eq('tx_id', txId);
        spawnToastNotification(`Ledger updated to ${status}.`, "success");
        await fetchFinanceData();
    } catch(err) {
        spawnToastNotification("Update failed.", "error");
    }
    toggleInteractionLoader(false);
}

async function deletePaymentRecord(txId) {
    if(!confirm(`WARNING: Erase transaction ${txId} from the ledger?`)) return;
    toggleInteractionLoader(true, "Erasing Ledger Record...");
    try {
        await supa.from('payments').delete().eq('tx_id', txId);
        spawnToastNotification("Record erased.", "success");
        await fetchFinanceData();
    } catch(err) {
        spawnToastNotification("Erase failed.", "error");
    }
    toggleInteractionLoader(false);
}

function exportToCSV() {
    if(filteredPayments.length === 0) return spawnToastNotification("No data to export.", "error");
    const headers = ["Transaction_ID", "Operator", "Territory_Node", "Amount", "Status", "Date"];
    let csvContent = headers.join(",") + "\n";

    filteredPayments.forEach(p => {
        const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A';
        let row = [`"${p.tx_id}"`, `"${p.recorded_by}"`, `"${p.node_path}"`, `"${p.amount}"`, `"${p.status}"`, `"${dateStr}"`];
        csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `SSF_Ledger_Export.csv`);
    link.click();
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
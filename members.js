let allMembers = [];
let filteredMembers = [];
let hierarchyData = { districts: [], blocks: [], panchayats: [], units: [] };

let activeCardId = null;
let cropper = null; 
let croppedBlob = null; 

let currentPage = 1;
let pageSize = 25;

let selectedMembers = new Set();
let memberToDelete = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!enforceSession()) return;
    setActiveSidebarLink('members');
    await fetchInitialData();
});

// ==========================================
// DATA FETCHING
// ==========================================
async function fetchInitialData() {
    toggleInteractionLoader(true, "Loading Memberships...");
    try {
        let mQuery = supa.from('memberships').select('*').order('timestamp', { ascending: false });
        let dQuery = supa.from('districts').select('*');
        let bQuery = supa.from('blocks').select('*');
        let pQuery = supa.from('panchayats').select('*');
        let uQuery = supa.from('units').select('*');

        const isGlobal = STATE_CACHE.role === 'Admin' || STATE_CACHE.role === 'MasterAdmin';

        // Role-Based Data Isolation
        if (!isGlobal) {
            const af = STATE_CACHE.assignedFields;
            
            if (af.districts && af.districts.length > 0) {
                mQuery = mQuery.in('district', af.districts);
                dQuery = dQuery.in('district_name', af.districts);
                bQuery = bQuery.in('district_name', af.districts);
                pQuery = pQuery.in('district_name', af.districts);
                uQuery = uQuery.in('district_name', af.districts);
            }
            if (af.blocks && af.blocks.length > 0) {
                mQuery = mQuery.in('block', af.blocks);
                bQuery = bQuery.in('block_name', af.blocks);
                pQuery = pQuery.in('block_name', af.blocks);
                uQuery = uQuery.in('block_name', af.blocks);
            }
            if (af.panchayats && af.panchayats.length > 0) {
                mQuery = mQuery.in('panchayat', af.panchayats);
                pQuery = pQuery.in('panchayat_name', af.panchayats);
                uQuery = uQuery.in('panchayat_name', af.panchayats);
            }
            if (af.units && af.units.length > 0) {
                mQuery = mQuery.in('unit', af.units);
                uQuery = uQuery.in('unit_name', af.units);
            }
        }

        const [mRes, dRes, bRes, pRes, unRes] = await Promise.all([mQuery, dQuery, bQuery, pQuery, uQuery]);

        allMembers = mRes.data || [];
        filteredMembers = [...allMembers];
        
        hierarchyData.districts = dRes.data || [];
        hierarchyData.blocks = bRes.data || [];
        hierarchyData.panchayats = pRes.data || [];
        hierarchyData.units = unRes.data || [];

        document.getElementById('statTotalCount').innerText = allMembers.length;
        
        populateDistrictDropdown();
        applyFilters();

    } catch(err) { 
        spawnToastNotification("Failed to load memberships.", "error"); 
        console.error(err);
    }
    toggleInteractionLoader(false);
}

// ==========================================
// FILTERS & PAGINATION
// ==========================================
function populateDistrictDropdown() {
    const dSel = document.getElementById('filterDistrict');
    dSel.innerHTML = '<option value="">All Districts</option>';
    hierarchyData.districts.forEach(d => dSel.innerHTML += `<option value="${d.district_name}">${d.district_name}</option>`);
}

function syncFilterDropdowns(level) {
    const d = document.getElementById('filterDistrict').value;
    const b = document.getElementById('filterBlock').value;

    if (level === 'district') {
        const bSel = document.getElementById('filterBlock');
        bSel.innerHTML = '<option value="">All Blocks</option>';
        document.getElementById('filterPanchayat').innerHTML = '<option value="">All Panchayats</option>';
        if(d) hierarchyData.blocks.filter(x => x.district_name === d).forEach(item => bSel.innerHTML += `<option value="${item.block_name}">${item.block_name}</option>`);
    } else if (level === 'block') {
        const pSel = document.getElementById('filterPanchayat');
        pSel.innerHTML = '<option value="">All Panchayats</option>';
        if(d && b) hierarchyData.panchayats.filter(x => x.district_name === d && x.block_name === b).forEach(item => pSel.innerHTML += `<option value="${item.panchayat_name}">${item.panchayat_name}</option>`);
    }
    applyFilters();
}

function applyFilters() {
    const q = document.getElementById('filterSearchQuery').value.toLowerCase().trim();
    const d = document.getElementById('filterDistrict').value;
    const b = document.getElementById('filterBlock').value;
    const p = document.getElementById('filterPanchayat').value;
    
    // Fetch the new membership type filter safely
    const typeEl = document.getElementById('filterType');
    const type = typeEl ? typeEl.value : '';

    filteredMembers = allMembers.filter(m => {
        let match = true;
        
        // Existing territory and search filters
        if (d && m.district !== d) match = false;
        if (b && m.block !== b) match = false;
        if (p && m.panchayat !== p) match = false;
        if (q && !(m.name.toLowerCase().includes(q) || m.phone.includes(q) || m.membership_id.toLowerCase().includes(q))) match = false;
        
        // New Digital vs Physical Filter Logic
        if (type === 'digital' && m.is_digital !== true) match = false;
        if (type === 'physical' && m.is_digital === true) match = false;

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
    const maxPage = Math.ceil(filteredMembers.length / pageSize);
    if (currentPage < maxPage) { currentPage++; renderPagination(); renderTable(); }
}
function goToPage(p) { currentPage = p; renderPagination(); renderTable(); }

function renderPagination() {
    const totalRecords = filteredMembers.length;
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
// RENDER TABLE
// ==========================================
// ==========================================
// RENDER TABLE
// ==========================================
function renderTable() {
    const tbody = document.getElementById('memberMasterTableBody');
    const mobileGrid = document.getElementById('memberMobileCardsGrid');
    const emptyState = document.getElementById('emptyState');
    
    tbody.innerHTML = '';
    mobileGrid.innerHTML = '';

    if (filteredMembers.length === 0) {
        emptyState.classList.remove('hidden'); return;
    }
    emptyState.classList.add('hidden');

    const startIdx = (currentPage - 1) * pageSize;
    const currentSlice = filteredMembers.slice(startIdx, startIdx + pageSize);

    // We can safely remove the isAdmin check for memberships 
    // since data filtering already isolates their view to their authorized fields.

    currentSlice.forEach((m, index) => {
        const isChecked = selectedMembers.has(m.membership_id) ? 'checked' : '';
        
        // Removed the isAdmin checks here so all field operators can edit/delete their own members
        let actionButtons = `
            <div class="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                <button onclick="viewMemberDetails('${m.membership_id}')" class="w-7 h-7 rounded-md bg-slate-50 text-indigo-500 hover:bg-indigo-50 border border-slate-100 flex items-center justify-center transition-colors" title="View & Download ID"><i class="fa-solid fa-id-card text-[10px]"></i></button>
                <button onclick="openMembershipFormModal('${m.membership_id}', event)" class="w-7 h-7 rounded-md bg-slate-50 text-emerald-500 hover:bg-emerald-50 border border-slate-100 transition-colors flex items-center justify-center" title="Edit Member"><i class="fa-solid fa-pen text-[10px]"></i></button>
                <button onclick="triggerDeleteModal('${m.membership_id}')" class="w-7 h-7 rounded-md bg-slate-50 text-slate-400 hover:text-rose-500 border border-slate-100 transition-colors flex items-center justify-center" title="Revoke Membership"><i class="fa-solid fa-trash-can text-[10px]"></i></button>
            </div>`;

        // Desktop Row
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition-colors group">
                <td class="py-3 px-4 text-center"><input type="checkbox" class="accent-indigo-600 w-3 h-3 row-checkbox" value="${m.membership_id}" ${isChecked} onchange="toggleSelection(this)"></td>
                <td class="py-3 px-4 text-center font-mono text-slate-400">${startIdx + index + 1}</td>
                <td class="py-3 px-4">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full overflow-hidden bg-slate-100 border border-slate-200 shrink-0"><img src="${m.photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80'}" crossorigin="anonymous" class="w-full h-full object-cover"></div>
                        <div>
                            <div class="font-black text-slate-900">${m.name}</div>
                            <div class="flex items-center gap-2 mt-0.5">
                                <span class="text-[9px] font-mono bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded inline-block">${m.membership_id}</span>
                                ${m.is_digital ? '<span class="text-[8px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Digital</span>' : '<span class="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Physical</span>'}
                            </div>
                        </div>
                    </div>
                </td>
                <td class="py-3 px-4 font-mono font-medium">${m.phone}</td>
                <td class="py-3 px-4 text-slate-500 font-medium">
                    <span class="bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold mr-1 tracking-wider">${m.district}</span>
                    <i class="fa-solid fa-angle-right text-[8px] mx-1 opacity-50"></i> ${m.block} 
                    <i class="fa-solid fa-angle-right text-[8px] mx-1 opacity-50"></i> <span class="font-bold text-slate-700">${m.unit}</span>
                </td>
                <td class="py-3 px-4"><span class="bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider">${m.committee_role}</span></td>
                <td class="py-3 px-4 text-right pr-6">${actionButtons}</td>
            </tr>`;
            
        // Mobile Card
        mobileGrid.innerHTML += `
            <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative">
                <div class="flex items-start gap-3 border-b border-slate-100 pb-3 mb-3">
                    <div class="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0"><img src="${m.photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80'}" crossorigin="anonymous" class="w-full h-full object-cover"></div>
                    <div class="flex-1">
                        <h4 class="text-base font-black text-slate-900 leading-tight">${m.name}</h4>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-[9px] font-mono bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded inline-block">${m.membership_id}</span>
                            ${m.is_digital ? '<span class="text-[8px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Digital</span>' : '<span class="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Physical</span>'}
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-2 text-[10px] font-medium text-slate-600 mb-4">
                    <div><span class="font-bold text-slate-400 block uppercase tracking-wider mb-0.5 font-mono">Contact</span>${m.phone}</div>
                    <div><span class="font-bold text-slate-400 block uppercase tracking-wider mb-0.5 font-mono">Territory</span>${m.district} > ${m.unit}</div>
                </div>
                <div class="pt-3 border-t border-slate-100 flex justify-between items-center">
                    <span class="bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider">${m.committee_role}</span>
                    <div>${actionButtons}</div>
                </div>
            </div>`;
    });
}
// ==========================================
// SELECTION LOGIC
// ==========================================
function toggleSelection(checkbox) {
    if (checkbox.checked) selectedMembers.add(checkbox.value);
    else selectedMembers.delete(checkbox.value);
}

function toggleAllSelections(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = masterCheckbox.checked;
        if (masterCheckbox.checked) selectedMembers.add(cb.value);
        else selectedMembers.delete(cb.value);
    });
}

// ==========================================
// VIEW & VERIFICATION HUB
// ==========================================
function viewMemberDetails(id) {
    const m = allMembers.find(x => x.membership_id === id);
    if(!m) return;
    activeCardId = id;

    // 1. Build Verification URL
    const host = window.location.origin;
    let path = window.location.pathname;
    path = path.substring(0, path.lastIndexOf('/'));
    const verifyUrl = `${host}${path}/verify.html?id=${m.membership_id}`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(verifyUrl)}&margin=0`;

    // 2. Populate Verification Hub Link & QR
    document.getElementById('viewMemVerifyLink').value = verifyUrl;
    document.getElementById('viewMemQRCode').src = qrApiUrl;

    // 3. Populate Database Snapshot Text
    document.getElementById('viewMemPhone').innerText = m.phone;
    document.getElementById('viewMemWhatsapp').innerText = m.whatsapp;
    document.getElementById('viewMemEmail').innerText = m.email || 'N/A';
    document.getElementById('viewMemFather').innerText = m.father_name;
    document.getElementById('viewMemAge').innerText = `${m.dob} (${calculateAge(m.dob)} yrs)`;
    document.getElementById('viewMemBlood').innerText = m.blood_group || 'Unknown';
    document.getElementById('viewMemPS').innerText = m.police_station;
    document.getElementById('viewMemCreator').innerText = m.created_by;

    // 4. Populate Live Digital ID Card Preview (Landscape Design)
    document.getElementById('cardPrintId').innerText = m.membership_id;
    document.getElementById('cardPrintName').innerText = m.name;
    document.getElementById('cardPrintFather').innerText = m.father_name;
    document.getElementById('cardPrintUnit').innerText = m.unit;
    document.getElementById('cardPrintTerritory').innerText = m.district;
    document.getElementById('cardPrintPhone').innerText = m.phone;
    document.getElementById('cardPrintBlood').innerText = m.blood_group || 'Unknown';
    document.getElementById('cardPrintRoleBox').innerText = m.committee_role || 'MEMBERSHIP';
    document.getElementById('cardPrintDate').innerText = new Date().toISOString().split('T')[0];
    
    // Images
    document.getElementById('cardPrintPhoto').src = m.photo_url || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80";
    document.getElementById('cardPrintQRCode').src = qrApiUrl; // Connects directly to the Verification QR
    
    // Show Modal
    const modal = document.getElementById('viewMembershipModal');
    modal.classList.remove('hidden', 'pointer-events-none', 'opacity-0');
    modal.children[0].classList.remove('scale-95');
}

function closeViewMembershipModal() {
    document.getElementById('viewMembershipModal').children[0].classList.add('scale-95');
    setTimeout(() => document.getElementById('viewMembershipModal').classList.add('hidden', 'pointer-events-none', 'opacity-0'), 200);
    activeCardId = null;
}

function calculateAge(dobString) {
    const dob = new Date(dobString);
    const diff_ms = Date.now() - dob.getTime();
    const age_dt = new Date(diff_ms); 
    return Math.abs(age_dt.getUTCFullYear() - 1970);
}

function copyVerifyLink() {
    const linkInput = document.getElementById('viewMemVerifyLink');
    linkInput.select();
    linkInput.setSelectionRange(0, 99999); 
    navigator.clipboard.writeText(linkInput.value).then(() => {
        const btn = document.getElementById('btnCopyVerifyLink');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        btn.classList.add('bg-emerald-50', 'text-emerald-600', 'border-emerald-200');
        btn.classList.remove('bg-indigo-50', 'text-indigo-600', 'border-indigo-200');
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.classList.remove('bg-emerald-50', 'text-emerald-600', 'border-emerald-200');
            btn.classList.add('bg-indigo-50', 'text-indigo-600', 'border-indigo-200');
        }, 2000);
    });
}

async function downloadMemberQR(event) {
    if(!activeCardId) return;
    const img = document.getElementById('viewMemQRCode');
    const url = img.src;
    if(!url) return;
    
    const btn = event.currentTarget;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `SSF_QR_${activeCardId}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
        spawnToastNotification("Failed to download QR code.", "error");
    } finally {
        btn.innerHTML = originalHtml;
    }
}

async function downloadDigitalCardAsPDF(event) {
    if(!activeCardId || !window.jspdf) return;
    const m = allMembers.find(x => x.membership_id === activeCardId);
    
    const cardNode = document.getElementById('digitalCardPrintArea');
    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating Secure PDF...';
    btn.disabled = true;
    
    try {
        // Enforce specific layout dimensions to prevent stretching bugs
        const canvas = await html2canvas(cardNode, { 
            scale: 3, 
            useCORS: true, 
            allowTaint: false,
            backgroundColor: "#ffffff",
            width: 680,
            height: 440
        });
        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        
        const { jsPDF } = window.jspdf;
        
        // Client-side Password generation: yyyy + last 4 digit mobile
        const dobYear = m.dob ? new Date(m.dob).getFullYear().toString() : "0000";
        const phoneLast4 = m.phone ? m.phone.slice(-4) : "0000";
        const userPassword = dobYear + phoneLast4;

        // Initialize jsPDF with exact aspect ratio (86 x 55.65 matches 680 x 440)
        const pdf = new jsPDF({ 
            orientation: 'landscape', 
            unit: 'mm', 
            format: [86, 55.65],
            encryption: {
                userPassword: userPassword,
                ownerPassword: userPassword,
                userPermissions: ["print", "copy", "modify", "annot-forms"]
            }
        });
        
        pdf.addImage(imgData, 'JPEG', 0, 0, 86, 55.65);
        pdf.save(`SSF_Card_${activeCardId}.pdf`);
        
        spawnToastNotification(`Downloaded! (Password: ${userPassword})`, "success");
    } catch (e) {
        spawnToastNotification("PDF generation failed.", "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==========================================
// ADD / EDIT MEMBERSHIP & CROPPER
// ==========================================
function openMembershipFormModal(id = null, e = null) {
    if(e) e.stopPropagation(); 
    document.getElementById('enrollmentForm').reset();
    
    // Reset the digital membership checkbox for new entries
    const digitalCheckbox = document.getElementById('formIsDigital');
    if (digitalCheckbox) digitalCheckbox.checked = false; 
    
    document.getElementById('formPhotoPreview').src = '';
    document.getElementById('formLevel').value = "";
    syncRoleDropdown();
    document.getElementById('formPhotoPreview').classList.add('hidden');
    document.getElementById('formPhotoPlaceholder').classList.remove('hidden');
    croppedBlob = null;
    document.getElementById('formMembershipId').value = '';

    const dSel = document.getElementById('formDistrict');
    dSel.innerHTML = '<option value="">Select District</option>';
    hierarchyData.districts.forEach(d => dSel.innerHTML += `<option value="${d.district_name}">${d.district_name}</option>`);

    if (id) {
        // EDIT MODE: Populate fields
        const m = allMembers.find(x => x.membership_id === id); 
        if(m) {
            document.getElementById('formMembershipId').value = m.membership_id;
            document.getElementById('formName').value = m.name;
            document.getElementById('formFather').value = m.father_name;
            document.getElementById('formDob').value = m.dob;
            document.getElementById('formBloodGroup').value = m.blood_group || 'Unknown';
            document.getElementById('formPhone').value = m.phone; 

            // Extract Level from the saved role (e.g., split "District President" into "District")
            let savedRole = m.committee_role || 'Unit Member';
            let extractedLevel = savedRole.split(' ')[0]; 

            const validLevels = ['State', 'District', 'Block', 'Panchayat', 'Unit'];
            if (!validLevels.includes(extractedLevel)) extractedLevel = 'Unit'; // Fallback

            // Set Level and trigger sync to populate the Role dropdown
            document.getElementById('formLevel').value = extractedLevel;
            syncRoleDropdown(savedRole);
            
            document.getElementById('formWhatsapp').value = m.whatsapp;
            document.getElementById('formEmail').value = m.email || '';
            
            document.getElementById('formDistrict').value = m.district;
            syncEnrollmentDropdowns('district'); 
            document.getElementById('formBlock').value = m.block;
            syncEnrollmentDropdowns('block'); 
            document.getElementById('formPanchayat').value = m.panchayat;
            syncEnrollmentDropdowns('panchayat'); 
            document.getElementById('formUnit').value = m.unit;
            
            document.getElementById('formPS').value = m.police_station;
            document.getElementById('formPin').value = m.pin_code;
            
            // Populate the digital membership checkbox for edits
            if (digitalCheckbox) digitalCheckbox.checked = m.is_digital || false;
            
            if(m.photo_url) {
                document.getElementById('formPhotoPreview').src = m.photo_url;
                document.getElementById('formPhotoPreview').classList.remove('hidden');
                document.getElementById('formPhotoPlaceholder').classList.add('hidden');
                croppedBlob = new Blob(["fake"], { type: "image/jpeg" });
            }
        }
    }
    
    const modal = document.getElementById('addMembershipModal');
    modal.classList.remove('hidden', 'pointer-events-none', 'opacity-0');
    modal.children[0].classList.remove('scale-95');
}

function closeMembershipModal() {
    document.getElementById('addMembershipModal').children[0].classList.add('scale-95');
    setTimeout(() => document.getElementById('addMembershipModal').classList.add('hidden', 'pointer-events-none', 'opacity-0'), 200);
}

function syncEnrollmentDropdowns(level) {
    const d = document.getElementById('formDistrict').value;
    const b = document.getElementById('formBlock').value;
    const p = document.getElementById('formPanchayat').value;

    if (level === 'district') {
        const bSel = document.getElementById('formBlock');
        bSel.innerHTML = '<option value="">Select Block</option>';
        document.getElementById('formPanchayat').innerHTML = '<option value="">Select Panchayat</option>';
        document.getElementById('formUnit').innerHTML = '<option value="">Select Unit</option>';
        if(d) hierarchyData.blocks.filter(x => x.district_name === d).forEach(item => bSel.innerHTML += `<option value="${item.block_name}">${item.block_name}</option>`);
    } else if (level === 'block') {
        const pSel = document.getElementById('formPanchayat');
        pSel.innerHTML = '<option value="">Select Panchayat</option>';
        document.getElementById('formUnit').innerHTML = '<option value="">Select Unit</option>';
        if(d && b) hierarchyData.panchayats.filter(x => x.district_name === d && x.block_name === b).forEach(item => pSel.innerHTML += `<option value="${item.panchayat_name}">${item.panchayat_name}</option>`);
    } else if (level === 'panchayat') {
        const uSel = document.getElementById('formUnit');
        uSel.innerHTML = '<option value="">Select Unit</option>';
        if(d && b && p) hierarchyData.units.filter(x => x.district_name === d && x.block_name === b && x.panchayat_name === p).forEach(item => uSel.innerHTML += `<option value="${item.unit_name}">${item.unit_name}</option>`);
    }
}

function initiateCropper(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('cropperImage').src = e.target.result;
        document.getElementById('cropperModal').classList.remove('hidden', 'opacity-0');
        
        if (cropper) cropper.destroy();
        // Set aspect ratio to 3:4 for passport sizes
        cropper = new Cropper(document.getElementById('cropperImage'), {
            aspectRatio: 3 / 4,
            viewMode: 1,
            autoCropArea: 1
        });
    };
    reader.readAsDataURL(file);
}

function cancelCropper() {
    document.getElementById('cropperModal').classList.add('hidden', 'opacity-0');
    if (cropper) cropper.destroy();
    document.getElementById('formPhotoInput').value = ''; 
}

function confirmCrop() {
    if (!cropper) return;
    // Strictly enforce 3:4 dimension generation on crop confirm
    const canvas = cropper.getCroppedCanvas({ width: 300, height: 400 });
    canvas.toBlob((blob) => {
        croppedBlob = blob;
        const url = URL.createObjectURL(blob);
        document.getElementById('formPhotoPreview').src = url;
        document.getElementById('formPhotoPreview').classList.remove('hidden');
        document.getElementById('formPhotoPlaceholder').classList.add('hidden');
        cancelCropper();
    }, 'image/jpeg', 0.8);
}

async function handleMembershipSubmit(e) {
    e.preventDefault();
    if(!croppedBlob) return spawnToastNotification("Please capture and crop an identity photo.", "error");

    toggleInteractionLoader(true, "Saving Member...");
    
    // Check if editing existing or adding new
    const existingId = document.getElementById('formMembershipId').value;
    const isEdit = existingId !== '';
    const targetId = isEdit ? existingId : "SSF-WB-" + Date.now().toString().slice(-6) + Math.floor(Math.random()*1000);
    
    // Extract Form Data
    const payload = {
        membership_id: targetId,
        created_by: STATE_CACHE.user,
        name: document.getElementById('formName').value.trim().toUpperCase(),
        father_name: document.getElementById('formFather').value.trim().toUpperCase(),
        dob: document.getElementById('formDob').value,
        age: calculateAge(document.getElementById('formDob').value),
        blood_group: document.getElementById('formBloodGroup').value,
        committee_role: document.getElementById('formRole').value,
        phone: document.getElementById('formPhone').value.trim(),
        whatsapp: document.getElementById('formWhatsapp').value.trim(),
        email: document.getElementById('formEmail').value.trim(),
        district: document.getElementById('formDistrict').value,
        block: document.getElementById('formBlock').value,
        panchayat: document.getElementById('formPanchayat').value,
        unit: document.getElementById('formUnit').value,
        police_station: document.getElementById('formPS').value.trim().toUpperCase(),
        pin_code: document.getElementById('formPin').value.trim(),
        is_digital: document.getElementById('formIsDigital').checked
    };

    try {
        if (croppedBlob.size > 10) {
            const fileExt = 'jpg';
            const fileName = `${targetId}_${Date.now()}.${fileExt}`;
            const { data: uploadData, error: uploadError } = await supa.storage.from('SSF-West-Bengal').upload(fileName, croppedBlob, { contentType: 'image/jpeg', upsert: true });
            
            if (uploadError) throw new Error("Image Upload Failed");
            
            const { data: publicUrlData } = supa.storage.from('SSF-West-Bengal').getPublicUrl(fileName);
            payload.photo_url = publicUrlData.publicUrl;
        }

        const { error: dbError } = await supa.from('memberships').upsert([payload], { onConflict: 'membership_id' });
        if (dbError) throw dbError;

        spawnToastNotification(isEdit ? "Member Updated Successfully." : "Member Enrolled Successfully.", "success");
        closeMembershipModal();
        await fetchInitialData();

    } catch (error) {
        spawnToastNotification("Save failed. Ensure all fields are valid.", "error");
    }
    toggleInteractionLoader(false);
}

// ==========================================
// FRONTEND DELETE MODAL
// ==========================================
function triggerDeleteModal(id) {
    memberToDelete = id;
    const modal = document.getElementById('deleteConfirmModal');
    modal.classList.remove('hidden', 'pointer-events-none', 'opacity-0');
    modal.children[0].classList.remove('scale-95');
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteConfirmModal');
    modal.children[0].classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden', 'pointer-events-none', 'opacity-0'), 200);
    memberToDelete = null;
}

async function confirmDeleteMember() {
    if(!memberToDelete) return;
    toggleInteractionLoader(true, "Revoking membership...");
    try {
        await supa.from('memberships').delete().eq('membership_id', memberToDelete);
        spawnToastNotification("Membership revoked.", "success");
        closeDeleteModal();
        await fetchInitialData();
    } catch(err) { spawnToastNotification("Failed to revoke.", "error"); }
    toggleInteractionLoader(false);
}

// ==========================================
// DATA MUTATIONS (EXPORTS)
// ==========================================
function exportSelectedToCSV() {
    const dataToExport = selectedMembers.size > 0 
        ? allMembers.filter(m => selectedMembers.has(m.membership_id)) 
        : filteredMembers;

    if(dataToExport.length === 0) return spawnToastNotification("No data to export.", "error");
    
    const headers = ["Membership_ID", "Name", "Father", "Phone", "Email", "District", "Block", "Unit", "Role", "Timestamp"];
    let csvContent = headers.join(",") + "\n";

    dataToExport.forEach(m => {
        let row = [`"${m.membership_id}"`, `"${m.name}"`, `"${m.father_name}"`, `"${m.phone}"`, `"${m.email || ''}"`, `"${m.district}"`, `"${m.block}"`, `"${m.unit}"`, `"${m.committee_role}"`, `"${m.timestamp}"`];
        csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `SSF_Members_Export.csv`);
    link.click();
}

function exportSelectedToPDF() {
    if (!window.jspdf) return spawnToastNotification("PDF library loading. Please wait.", "error");
    const { jsPDF } = window.jspdf;

    const dataToExport = selectedMembers.size > 0 
        ? allMembers.filter(m => selectedMembers.has(m.membership_id)) 
        : filteredMembers;

    if(dataToExport.length === 0) return spawnToastNotification("No data to export.", "error");

    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("SSF West Bengal - Membership Directory", 14, 15);
    
    const tableData = dataToExport.map(m => [m.membership_id, m.name, m.phone, m.district, m.unit, m.committee_role]);
    
    doc.autoTable({
        startY: 25,
        head: [['ID', 'Name', 'Phone', 'District', 'Unit', 'Role']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129] },
        styles: { fontSize: 8 }
    });

    doc.save("SSF_Members_List.pdf");
}
function syncRoleDropdown(selectedFullRole = null) {
    const level = document.getElementById('formLevel').value;
    const roleSel = document.getElementById('formRole');
    
    // Reset and disable if no level is chosen
    if (!level) {
        roleSel.innerHTML = '<option value="" disabled selected>Select Level First</option>';
        roleSel.disabled = true;
        return;
    }
    
    // Enable the role dropdown
    roleSel.disabled = false;
    roleSel.innerHTML = '<option value="" disabled selected>Select Role</option>';
    
    // Standard roles for all levels
    const baseRoles = [
        "President",
        "General Secretary",
        "Secretary",
        "Secretariat Member",
        "Executive Member"
    ];
    
    // Populate dropdown (value is combined, text is just the role)
    baseRoles.forEach(role => {
        const fullRoleName = `${level} ${role}`;
        roleSel.innerHTML += `<option value="${fullRoleName}">${role}</option>`;
    });
    
    // Add "Member" exclusively for the Unit level
    if (level === 'Unit') {
        roleSel.innerHTML += `<option value="Unit Member">Member</option>`;
    }

    // Pre-select if editing an existing member
    if (selectedFullRole) {
        roleSel.value = selectedFullRole;
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
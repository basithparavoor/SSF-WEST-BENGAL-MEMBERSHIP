let allExportMembers = [];
let filteredExportMembers = [];
let hierarchyExportData = { districts: [], blocks: [], panchayats: [], units: [] };

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Enforce active session and UI bindings
    if (!enforceSession()) return; 

    // 2. STRICT SECURITY: Master Admin Check
    if (STATE_CACHE.role !== 'MasterAdmin') {
        window.location.href = 'dashboard.html'; // Kick out unauthorized personnel immediately
        return;
    }

    // Un-hide the Master Admin sidebar items specific to this user role
    document.querySelectorAll('.master-admin-only').forEach(el => el.classList.remove('hidden-force'));

    // Highlight sidebar
    const desktopLink = document.getElementById(`nav-export`);
    if(desktopLink) {
        desktopLink.classList.remove('text-slate-600', 'hover:bg-slate-100');
        desktopLink.classList.add('bg-slate-900', 'text-white', 'shadow-md');
    }

    await fetchMasterData();
});

async function fetchMasterData() {
    toggleInteractionLoader(true, "Synchronizing Master Database...");
    try {
        const [mRes, dRes, bRes, pRes, uRes] = await Promise.all([
            supa.from('memberships').select('*').order('timestamp', { ascending: false }),
            supa.from('districts').select('*'),
            supa.from('blocks').select('*'),
            supa.from('panchayats').select('*'),
            supa.from('units').select('*')
        ]);

        allExportMembers = mRes.data || [];
        hierarchyExportData.districts = dRes.data || [];
        hierarchyExportData.blocks = bRes.data || [];
        hierarchyExportData.panchayats = pRes.data || [];
        hierarchyExportData.units = uRes.data || [];

        document.getElementById('exportTotalCountText').innerText = `Total: ${allExportMembers.length}`;
        
        populateExportDistrictDropdown();
        calculateFilteredCount();

    } catch(err) { 
        spawnToastNotification("Failed to load master database.", "error"); 
    }
    toggleInteractionLoader(false);
}

// ==========================================
// CASCADING FILTER LOGIC
// ==========================================
function populateExportDistrictDropdown() {
    const dSel = document.getElementById('filterDistrict');
    dSel.innerHTML = '<option value="">All Districts</option>';
    hierarchyExportData.districts.forEach(d => dSel.innerHTML += `<option value="${d.district_name}">${d.district_name}</option>`);
}

function syncExportDropdowns(level) {
    const d = document.getElementById('filterDistrict').value;
    const b = document.getElementById('filterBlock').value;
    const p = document.getElementById('filterPanchayat').value;

    if (level === 'district') {
        const bSel = document.getElementById('filterBlock');
        bSel.innerHTML = '<option value="">All Blocks</option>';
        document.getElementById('filterPanchayat').innerHTML = '<option value="">All Panchayats</option>';
        document.getElementById('filterUnit').innerHTML = '<option value="">All Units</option>';
        if(d) hierarchyExportData.blocks.filter(x => x.district_name === d).forEach(item => bSel.innerHTML += `<option value="${item.block_name}">${item.block_name}</option>`);
    } else if (level === 'block') {
        const pSel = document.getElementById('filterPanchayat');
        pSel.innerHTML = '<option value="">All Panchayats</option>';
        document.getElementById('filterUnit').innerHTML = '<option value="">All Units</option>';
        if(d && b) hierarchyExportData.panchayats.filter(x => x.district_name === d && x.block_name === b).forEach(item => pSel.innerHTML += `<option value="${item.panchayat_name}">${item.panchayat_name}</option>`);
    } else if (level === 'panchayat') {
        const uSel = document.getElementById('filterUnit');
        uSel.innerHTML = '<option value="">All Units</option>';
        if(d && b && p) hierarchyExportData.units.filter(x => x.district_name === d && x.block_name === b && x.panchayat_name === p).forEach(item => uSel.innerHTML += `<option value="${item.unit_name}">${item.unit_name}</option>`);
    }
    
    calculateFilteredCount();
}

function calculateFilteredCount() {
    const startDate = document.getElementById('filterStartDate').value;
    const endDate = document.getElementById('filterEndDate').value;
    const district = document.getElementById('filterDistrict').value;
    const block = document.getElementById('filterBlock').value;
    const panchayat = document.getElementById('filterPanchayat').value;
    const unit = document.getElementById('filterUnit').value;
    const type = document.getElementById('filterType').value;
    const search = document.getElementById('filterSearch').value.toLowerCase().trim();

    filteredExportMembers = allExportMembers.filter(m => {
        let match = true;
        
        if (startDate && m.timestamp) {
            const memberDate = m.timestamp.split('T')[0];
            if (memberDate < startDate) match = false;
        }
        if (endDate && m.timestamp) {
            const memberDate = m.timestamp.split('T')[0];
            if (memberDate > endDate) match = false;
        }

        if (district && m.district !== district) match = false;
        if (block && m.block !== block) match = false;
        if (panchayat && m.panchayat !== panchayat) match = false;
        if (unit && m.unit !== unit) match = false;
        
        if (type === 'digital' && m.is_digital !== true) match = false;
        if (type === 'physical' && m.is_digital === true) match = false;

        if (search) {
            if (!(m.name.toLowerCase().includes(search) || m.membership_id.toLowerCase().includes(search) || m.phone.includes(search))) {
                match = false;
            }
        }

        return match;
    });

    document.getElementById('exportRecordCount').innerText = filteredExportMembers.length;
}

// ==========================================
// COLUMN TOGGLE & EXPORT UTILITIES
// ==========================================
function toggleAllColumns() {
    const checkboxes = document.querySelectorAll('.csv-col-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
}

function downloadCustomCSV() {
    if (filteredExportMembers.length === 0) {
        return spawnToastNotification("No records match the current filters.", "error");
    }

    const checkboxes = document.querySelectorAll('.csv-col-checkbox:checked');
    if (checkboxes.length === 0) {
        return spawnToastNotification("Please select at least one column.", "error");
    }

    const selectedKeys = Array.from(checkboxes).map(cb => cb.value);
    
    // Create Header Row
    let csvContent = selectedKeys.map(key => `"${key.toUpperCase()}"`).join(",") + "\n";

    // Create Data Rows
    filteredExportMembers.forEach(m => {
        let row = selectedKeys.map(key => {
            let val = m[key] !== null && m[key] !== undefined ? m[key] : '';
            val = val.toString().replace(/"/g, '""'); // Escape inner quotes
            return `"${val}"`;
        });
        csvContent += row.join(",") + "\n";
    });

    // Save File
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `SSF_Data_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    spawnToastNotification("CSV Export Downloaded.", "success");
}

// ==========================================
// BULK MEDIA EXPORTERS (PHOTOS & QRs)
// ==========================================
async function downloadFilteredPhotos() {
    if (filteredExportMembers.length === 0) {
        return spawnToastNotification("No records match the current filters.", "error");
    }

    const membersWithPhotos = filteredExportMembers.filter(m => m.photo_url && m.photo_url.trim() !== '');
    if (membersWithPhotos.length === 0) {
        return spawnToastNotification("None of the filtered members have photos.", "error");
    }

    const targetW = parseInt(document.getElementById('settingPhotoW').value) || null;
    const targetH = parseInt(document.getElementById('settingPhotoH').value) || null;
    const format = document.getElementById('settingPhotoFormat').value || 'jpeg';
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';

    toggleInteractionLoader(true, `Processing ${membersWithPhotos.length} photos...`);

    const zip = new JSZip();
    const photoFolder = zip.folder(`SSF_Photos_${new Date().toISOString().split('T')[0]}`);

    try {
        const promises = membersWithPhotos.map(async (member) => {
            try {
                // Fetch image directly and load it into a dynamic Canvas for resizing & format conversion
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.src = member.photo_url;
                
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });

                const canvas = document.createElement('canvas');
                canvas.width = targetW || img.width;
                canvas.height = targetH || img.height;
                const ctx = canvas.getContext('2d');
                
                // If converting to JPEG, give it a solid white background to prevent transparent black-outs
                if (format === 'jpeg') {
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
                
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // Convert canvas to requested format Blob
                const blob = await new Promise(res => canvas.toBlob(res, mimeType, 0.95));
                
                const safeName = member.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const filename = `${member.membership_id}_${safeName}.${format}`;
                
                photoFolder.file(filename, blob);
            } catch (err) {
                console.warn(`Skipped photo for ${member.membership_id}`);
            }
        });

        await Promise.all(promises);

        const zipBlob = await zip.generateAsync({ type: "blob" });
        saveAs(zipBlob, `SSF_Bulk_Photos_${new Date().toISOString().split('T')[0]}.zip`);
        spawnToastNotification("Photos downloaded successfully!", "success");

    } catch (error) {
        spawnToastNotification("Failed to compile ZIP file.", "error");
    }

    toggleInteractionLoader(false);
}

async function downloadFilteredQRs() {
    if (filteredExportMembers.length === 0) {
        return spawnToastNotification("No records match the current filters.", "error");
    }

    const w = parseInt(document.getElementById('settingQrW').value) || 300;
    const h = parseInt(document.getElementById('settingQrH').value) || 300;
    const format = document.getElementById('settingQrFormat').value || 'png';

    toggleInteractionLoader(true, `Generating ${filteredExportMembers.length} QR Codes...`);

    const zip = new JSZip();
    const qrFolder = zip.folder(`SSF_QRs_${new Date().toISOString().split('T')[0]}`);

    // Build absolute URL for the QR code target
    const host = window.location.origin;
    let path = window.location.pathname;
    let dirPath = path.substring(0, path.lastIndexOf('/'));
    const baseUrl = host !== "null" ? `${host}${dirPath}` : "https://yourwebsite.com" + dirPath; 

    try {
        // Chunk API requests to prevent browser/API throttling
        const chunkSize = 50;
        for (let i = 0; i < filteredExportMembers.length; i += chunkSize) {
            const chunk = filteredExportMembers.slice(i, i + chunkSize);
            
            const promises = chunk.map(async (member) => {
                try {
                    const verifyUrl = `${baseUrl}/verify.html?id=${member.membership_id}`;
                    
                    // Request the exact size & format directly from the QR API engine
                    const fetchUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${w}x${h}&data=${encodeURIComponent(verifyUrl)}&margin=0&format=${format}`;

                    const response = await fetch(fetchUrl);
                    if (!response.ok) throw new Error("QR Fetch failed");
                    const blob = await response.blob();
                    
                    const safeName = member.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const filename = `${member.membership_id}_${safeName}.${format}`;
                    
                    qrFolder.file(filename, blob);
                } catch (err) {
                    console.warn(`Skipped QR for ${member.membership_id}`);
                }
            });

            // Wait for chunk to finish before triggering next 50 requests
            await Promise.all(promises);
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        saveAs(zipBlob, `SSF_Bulk_QRs_${new Date().toISOString().split('T')[0]}.zip`);
        spawnToastNotification("QR Codes downloaded successfully!", "success");

    } catch (error) {
        spawnToastNotification("Failed to compile QR ZIP file.", "error");
    }

    toggleInteractionLoader(false);
}
// ==========================================
// GLOBAL LOGOUT MODAL (Required for header)
// ==========================================
function promptLogout() {
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
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
    document.getElementById('dynamicLogoutModal').classList.remove('hidden');
}

function closeLogoutPrompt() {
    const modal = document.getElementById('dynamicLogoutModal');
    if (modal) modal.classList.add('hidden');
}

// executeSecureLogout is already handled inside supabase.js globally via enforceSession bindings
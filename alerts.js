let directiveLogs = [];
let filteredLogs = [];
let hierarchyData = { districts: [], blocks: [], panchayats: [], units: [] };
let quillEditor;
let pendingDeleteId = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!enforceSession()) return;
    setActiveSidebarLink('alerts');
    
    // Initialize standard Quill canvas parameters
    quillEditor = new Quill('#rtEditorArea', {
        theme: 'snow',
        placeholder: 'Compose interactive text directions, code structures, responsive hyper-links, graphical parameters, or video elements...',
        modules: {
            toolbar: [
                [{ 'header': [1, 2, false] }],
                ['bold', 'italic', 'underline'],
                [{ 'color': [] }, { 'background': [] }],
                ['link', 'image', 'video'],
                ['clean']
            ]
        }
    });

    await fetchHierarchyAndDirectives();
});

// Fetch territory matrix tables and directive rows concurrently
async function fetchHierarchyAndDirectives() {
    toggleInteractionLoader(true, "Synchronizing Transmissions...");
    try {
        const [dRes, bRes, pRes, uRes, alRes] = await Promise.all([
            supa.from('districts').select('*'),
            supa.from('blocks').select('*'),
            supa.from('panchayats').select('*'),
            supa.from('units').select('*'),
            supa.from('directive_logs').select('*').order('id', { ascending: false })
        ]);

        hierarchyData.districts = dRes.data || [];
        hierarchyData.blocks = bRes.data || [];
        hierarchyData.panchayats = pRes.data || [];
        hierarchyData.units = uRes.data || [];
        
        directiveLogs = alRes.data || [];
        filteredLogs = [...directiveLogs];

        populateAlertGeographicOptions();
        populateFilterGeographicOptions();
        applyFilters();

    } catch(err) {
        spawnToastNotification("Communications sync failed.", "error");
    }
    toggleInteractionLoader(false);
}

// ==========================================
// TARGETED SCOPE INTERACTIVE DROPDOWNS
// ==========================================
function populateAlertGeographicOptions() {
    const dSel = document.getElementById('alertTargetDist');
    dSel.innerHTML = '<option value="">-- All Districts --</option>';
    hierarchyData.districts.forEach(d => dSel.innerHTML += `<option value="${d.district_name}">${d.district_name}</option>`);
}

function switchGeographicAlertScope() {
    const lvl = document.getElementById('alertTargetLevel').value;
    const dSel = document.getElementById('alertTargetDist');
    const bSel = document.getElementById('alertTargetBlk');
    const pSel = document.getElementById('alertTargetPan');
    const uSel = document.getElementById('alertTargetUnit');

    // Reset components based on selection
    dSel.disabled = (lvl === 'Global');
    bSel.disabled = (lvl === 'Global' || lvl === 'District');
    pSel.disabled = (lvl === 'Global' || lvl === 'District' || lvl === 'Block');
    uSel.disabled = (lvl !== 'Unit');

    if(dSel.disabled) dSel.value = '';
    if(bSel.disabled) bSel.value = '';
    if(pSel.disabled) pSel.value = '';
    if(uSel.disabled) uSel.value = '';
    
    syncAlertFormLevels('district');
}

function syncAlertFormLevels(lvl) {
    const d = document.getElementById('alertTargetDist').value;
    const b = document.getElementById('alertTargetBlk').value;
    const p = document.getElementById('alertTargetPan').value;

    if (lvl === 'district') {
        const bSel = document.getElementById('alertTargetBlk');
        bSel.innerHTML = '<option value="">-- All Blocks --</option>';
        document.getElementById('alertTargetPan').innerHTML = '<option value="">-- All Panchayats --</option>';
        document.getElementById('alertTargetUnit').innerHTML = '<option value="">-- All Units --</option>';
        if(d && !bSel.disabled) hierarchyData.blocks.filter(x => x.district_name === d).forEach(item => bSel.innerHTML += `<option value="${item.block_name}">${item.block_name}</option>`);
    } else if (lvl === 'block') {
        const pSel = document.getElementById('alertTargetPan');
        pSel.innerHTML = '<option value="">-- All Panchayats --</option>';
        document.getElementById('alertTargetUnit').innerHTML = '<option value="">-- All Units --</option>';
        if(d && b && !pSel.disabled) hierarchyData.panchayats.filter(x => x.district_name === d && x.block_name === b).forEach(item => pSel.innerHTML += `<option value="${item.panchayat_name}">${item.panchayat_name}</option>`);
    } else if (lvl === 'panchayat') {
        const uSel = document.getElementById('alertTargetUnit');
        uSel.innerHTML = '<option value="">-- All Units --</option>';
        if(d && b && p && !uSel.disabled) hierarchyData.units.filter(x => x.district_name === d && x.block_name === b && x.panchayat_name === p).forEach(item => uSel.innerHTML += `<option value="${item.unit_name}">${item.unit_name}</option>`);
    }
}

// ==========================================
// CARD LIST RENDERING WITH FILTER PARAMETERS
// ==========================================

function populateFilterGeographicOptions() {
    const fDist = document.getElementById('filterDist');
    fDist.innerHTML = '<option value="">-- Filter District --</option>';
    hierarchyData.districts.forEach(d => fDist.innerHTML += `<option value="${d.district_name}">${d.district_name}</option>`);
}

function syncFilterLevels(lvl) {
    const d = document.getElementById('filterDist').value;
    const b = document.getElementById('filterBlk').value;
    const p = document.getElementById('filterPan').value;

    if (lvl === 'district') {
        const fBlk = document.getElementById('filterBlk');
        fBlk.innerHTML = '<option value="">-- Filter Block --</option>';
        document.getElementById('filterPan').innerHTML = '<option value="">-- Filter Panchayat --</option>';
        document.getElementById('filterUnit').innerHTML = '<option value="">-- Filter Unit --</option>';
        if(d) hierarchyData.blocks.filter(x => x.district_name === d).forEach(item => fBlk.innerHTML += `<option value="${item.block_name}">${item.block_name}</option>`);
    } else if (lvl === 'block') {
        const fPan = document.getElementById('filterPan');
        fPan.innerHTML = '<option value="">-- Filter Panchayat --</option>';
        document.getElementById('filterUnit').innerHTML = '<option value="">-- Filter Unit --</option>';
        if(d && b) hierarchyData.panchayats.filter(x => x.district_name === d && x.block_name === b).forEach(item => fPan.innerHTML += `<option value="${item.panchayat_name}">${item.panchayat_name}</option>`);
    } else if (lvl === 'panchayat') {
        const fUnit = document.getElementById('filterUnit');
        fUnit.innerHTML = '<option value="">-- Filter Unit --</option>';
        if(d && b && p) hierarchyData.units.filter(x => x.district_name === d && x.block_name === b && x.panchayat_name === p).forEach(item => fUnit.innerHTML += `<option value="${item.unit_name}">${item.unit_name}</option>`);
    }
}

function applyFilters() {
    const scope = document.getElementById('filterFeedScope').value;
    const q = document.getElementById('filterTextQuery').value.toLowerCase().trim();
    
    const fDist = document.getElementById('filterDist').value;
    const fBlk = document.getElementById('filterBlk').value;
    const fPan = document.getElementById('filterPan').value;
    const fUnit = document.getElementById('filterUnit').value;

    filteredLogs = directiveLogs.filter(n => {
        // Scope match check
        if (scope === 'Global' && n.target_level !== 'Global') return false;
        if (scope === 'Targeted' && n.target_level === 'Global') return false;
        
        // Query match check
        if (q && !n.advice_text.toLowerCase().includes(q)) return false;

        // Specific Field Node Checking (Evaluates to deepest dropdown selected)
        let targetLvl = null;
        let targetNode = null;
        
        if (fUnit) { targetLvl = 'Unit'; targetNode = fUnit; }
        else if (fPan) { targetLvl = 'Panchayat'; targetNode = fPan; }
        else if (fBlk) { targetLvl = 'Block'; targetNode = fBlk; }
        else if (fDist) { targetLvl = 'District'; targetNode = fDist; }

        if (targetLvl && targetNode) {
            // Strict match required for the selected node scope
            if (n.target_level !== targetLvl || n.target_node !== targetNode) return false;
        }

        return true;
    });

    renderDirectivesMasterList();
}

function renderDirectivesMasterList() {
    const list = document.getElementById('directivesMasterList'); 
    list.innerHTML = '';
    
    if (filteredLogs.length === 0) {
        list.innerHTML = `
            <div class="col-span-full py-16 flex flex-col items-center justify-center text-slate-400 w-full bg-white rounded-2xl border border-slate-200 border-dashed">
                <i class="fa-solid fa-bullhorn text-4xl mb-3 opacity-20"></i>
                <p class="font-bold text-sm text-slate-500">No matching logs found.</p>
            </div>`;
        return;
    }

    const isAdmin = STATE_CACHE.role === 'Admin' || STATE_CACHE.role === 'MasterAdmin';

    filteredLogs.forEach(n => {
        const isGlobal = n.target_level === 'Global';
        const scopeBadgeColor = isGlobal ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100';
        const targetString = isGlobal ? 'Global Transmission' : `${n.target_level}: ${n.target_node}`;

        list.innerHTML += `
        <div class="bg-white border border-slate-200/80 rounded-2xl p-5 flex flex-col shadow-sm relative overflow-hidden group">
            <div class="flex justify-between items-center border-b border-slate-100 pb-3 mb-3 relative z-10">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${scopeBadgeColor}">
                        <i class="fa-solid ${isGlobal ? 'fa-satellite-dish' : 'fa-crosshairs'} text-xs"></i>
                    </div>
                    <div class="min-w-0">
                        <span class="text-[10px] font-black uppercase font-mono tracking-wider truncate block">${targetString}</span>
                        <p class="text-[9px] text-slate-400 font-medium">Operator: <span class="font-bold text-slate-600">${n.created_by}</span></p>
                    </div>
                </div>
                ${isAdmin ? `
                <div class="flex gap-1 opacity-40 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onclick="launchDirectiveEdit('${n.id}')" class="w-7 h-7 rounded-md bg-slate-50 text-slate-400 hover:text-indigo-600 border border-slate-100 flex items-center justify-center transition-colors" title="Edit Content"><i class="fa-solid fa-pen text-[10px]"></i></button>
                    <button onclick="dropDirectiveSafely(${n.id})" class="w-7 h-7 rounded-md bg-slate-50 text-slate-400 hover:text-rose-500 border border-slate-100 transition-colors flex items-center justify-center" title="Revoke Alert"><i class="fa-solid fa-trash-can text-[10px]"></i></button>
                </div>
                ` : ''}
            </div>
            <div class="text-sm text-slate-700 ql-editor p-0 max-h-80 overflow-y-auto custom-scrollbar relative z-10">
                ${n.advice_text}
            </div>
        </div>`;
    });
}

// ==========================================
// TRANS-SAVE INTERFACE MUTATIONS
// ==========================================
async function commitRichTextAdvice() {
    const editId = document.getElementById('editTargetDirectiveId').value;
    const htmlPayload = quillEditor.root.innerHTML;
    
    if(htmlPayload === '<p><br></p>' || !quillEditor.getText().trim()) {
        spawnToastNotification("Content payload block missing parameters.", "error");
        return;
    }
    
    // Resolve targeted node string
    const lvl = document.getElementById('alertTargetLevel').value;
    let node = 'ALL';
    if (lvl === 'District') node = document.getElementById('alertTargetDist').value;
    if (lvl === 'Block') node = document.getElementById('alertTargetBlk').value;
    if (lvl === 'Panchayat') node = document.getElementById('alertTargetPan').value;
    if (lvl === 'Unit') node = document.getElementById('alertTargetUnit').value;

    if(lvl !== 'Global' && !node) {
        spawnToastNotification("Please select target territory node.", "error");
        return;
    }

    toggleInteractionLoader(true, "Deploying Transmission...");
    const payload = { 
        created_by: STATE_CACHE.user,
        target_level: lvl, 
        target_node: node, 
        advice_text: htmlPayload
    };
    
    try {
        if(editId) {
            // Update row override configuration
            await supa.from('directive_logs').update(payload).eq('id', editId);
            spawnToastNotification("Broadcast content updated.", "success");
        } else {
            // New database entry
            await supa.from('directive_logs').insert([payload]);
            spawnToastNotification("Broadcast successfully deployed.", "success");
        }
        revertEditorFormState();
        await fetchHierarchyAndDirectives();
    } catch(err) {
        spawnToastNotification("Transmission failure.", "error");
    }
    toggleInteractionLoader(false);
}

function launchDirectiveEdit(id) {
    const target = directiveLogs.find(x => x.id == id);
    if(!target) return;

    document.getElementById('editTargetDirectiveId').value = target.id;
    document.getElementById('editorPanelHeader').innerHTML = `<i class="fa-solid fa-pen-to-square text-indigo-500"></i> Modify Active Transmission (ID: ${target.id})`;
    document.getElementById('btnSubmitText').innerText = "Update Transmission";
    document.getElementById('btnCancelEdit').classList.remove('hidden');

    // Populate scope elements
    document.getElementById('alertTargetLevel').value = target.target_level;
    switchGeographicAlertScope();

    if(target.target_level === 'District') document.getElementById('alertTargetDist').value = target.target_node;
    if(target.target_level === 'Block') {
        document.getElementById('alertTargetDist').value = target.target_node; 
        syncAlertFormLevels('district');
        document.getElementById('alertTargetBlk').value = target.target_node;
    }
    if(target.target_level === 'Panchayat') {
        document.getElementById('alertTargetPan').value = target.target_node;
    }
    if(target.target_level === 'Unit') {
        document.getElementById('alertTargetUnit').value = target.target_node;
    }
    
    quillEditor.root.innerHTML = target.advice_text;
    document.getElementById('editorPanelHeader').scrollIntoView({ behavior: 'smooth' });
}

function revertEditorFormState() {
    document.getElementById('editTargetDirectiveId').value = '';
    document.getElementById('editorPanelHeader').innerHTML = `<i class="fa-solid fa-pen-nib text-amber-500"></i> Compose Transmission`;
    document.getElementById('btnSubmitText').innerText = "Deploy Broadcast";
    document.getElementById('btnCancelEdit').classList.add('hidden');
    
    document.getElementById('alertTargetLevel').value = 'Global';
    switchGeographicAlertScope();
    quillEditor.root.innerHTML = '';
}

// Custom UI Modal Deletion Methods
function dropDirectiveSafely(id) {
    pendingDeleteId = id;
    document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() {
    pendingDeleteId = null;
    document.getElementById('deleteModal').classList.add('hidden');
}

async function confirmDeleteDirective() {
    if(!pendingDeleteId) return;
    const id = pendingDeleteId;
    closeDeleteModal();

    toggleInteractionLoader(true, "Revoking...");
    try {
        await supa.from('directive_logs').delete().eq('id', id);
        spawnToastNotification("Transmission dropped.", "success");
        if(document.getElementById('editTargetDirectiveId').value == id) revertEditorFormState();
        await fetchHierarchyAndDirectives();
    } catch(err) {
        spawnToastNotification("Delete failed.", "error");
    }
    toggleInteractionLoader(false);
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
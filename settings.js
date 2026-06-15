let activeFieldLocks = [];
let structuralHierarchyData = { districts: [], blocks: [], panchayats: [], units: [] };

document.addEventListener('DOMContentLoaded', async () => {
    if (!enforceSession()) return;
    setActiveSidebarLink('settings');
    await initializeSettingsData();
});

// ==========================================
// CORE DATA INIT
// ==========================================
async function initializeSettingsData() {
    toggleInteractionLoader(true, "Synchronizing configurations...");
    try {
        // 1. Fetch User Data to pre-fill credentials
        document.getElementById('modProfileName').value = STATE_CACHE.displayName || '';
        document.getElementById('modUsername').value = STATE_CACHE.user || '';

        const { data: userData, error: userError } = await supa.from('users').select('name, username').eq('username', STATE_CACHE.user).maybeSingle();
        if(!userError && userData) {
            document.getElementById('modProfileName').value = userData.name || '';
            document.getElementById('modUsername').value = userData.username || '';
        }

        // 2. Fetch Global Settings (Status, UPI, Locks)
        const { data: settingsData, error: settingsError } = await supa.from('settings').select('*');
        if(settingsError) throw settingsError;

        if(settingsData && settingsData.length > 0) {
            
            // Master Lock Status
            const masterStatus = settingsData.find(s => s.key === 'Status');
            if(masterStatus) {
                const toggle = document.getElementById('globalStateToggle');
                const label = document.getElementById('systemStateLabel');
                const isActive = masterStatus.value === 'ACTIVE';
                toggle.checked = isActive;
                label.innerText = `Currently: ${masterStatus.value}`;
                label.className = `text-[10px] font-mono font-bold uppercase tracking-widest block mt-0.5 ${isActive ? 'text-emerald-500' : 'text-rose-500'}`;
            }

            // Field-Level Locks
            const lockedFieldsData = settingsData.find(s => s.key === 'LockedFields');
            if(lockedFieldsData && lockedFieldsData.value) {
                try {
                    activeFieldLocks = JSON.parse(lockedFieldsData.value) || [];
                } catch(e) { activeFieldLocks = []; }
            }

            // UPI ID
            const upiData = settingsData.find(s => s.key === 'MasterUPI');
            if(upiData && upiData.value) {
                document.getElementById('upiIdInput').value = upiData.value;
            }
        }

        // 3. Fetch Fee Structure from the NEW dedicated table
        const { data: feeData, error: feeError } = await supa.from('fee_structure').select('*');
        if (!feeError && feeData) {
            feeData.forEach(row => {
                if (row.role_type === 'state') document.getElementById('feeState').value = row.amount;
                if (row.role_type === 'district') document.getElementById('feeDistrict').value = row.amount;
                if (row.role_type === 'block') document.getElementById('feeBlock').value = row.amount;
                if (row.role_type === 'panchayat') document.getElementById('feePanchayat').value = row.amount;
                if (row.role_type === 'unit') document.getElementById('feeUnit').value = row.amount;
                if (row.role_type === 'member') document.getElementById('feeMember').value = row.amount;
            });
        }

        // 4. Fetch Hierarchy for Lock Dropdowns
        const [dRes, bRes, pRes, uRes] = await Promise.all([
            supa.from('districts').select('district_name'),
            supa.from('blocks').select('block_name'),
            supa.from('panchayats').select('panchayat_name'),
            supa.from('units').select('unit_name')
        ]);
        
        structuralHierarchyData.districts = dRes.data || [];
        structuralHierarchyData.blocks = bRes.data || [];
        structuralHierarchyData.panchayats = pRes.data || [];
        structuralHierarchyData.units = uRes.data || [];

        syncLockTargets();
        renderActiveLocks();

    } catch(err) {
        console.error("Initialization Error:", err);
        spawnToastNotification("Failed to load settings data.", "error");
    } finally {
        toggleInteractionLoader(false);
    }
}

// ==========================================
// USER CREDENTIAL UPDATES
// ==========================================
async function handleSecurityCredentialUpdate(e) {
    e.preventDefault(); 
    const newName = document.getElementById('modProfileName').value.trim();
    const newUsername = document.getElementById('modUsername').value.trim().toLowerCase();
    const newPass = document.getElementById('modPassword').value;

    if(!newName || !newUsername) return spawnToastNotification("Name and Username are required.", "error");

    toggleInteractionLoader(true, "Updating security credentials...");
    
    let updatePayload = { name: newName, username: newUsername };

    if (newPass) {
        if (window.crypto && window.crypto.subtle) {
            try {
                const msgBuffer = new TextEncoder().encode(newPass);                    
                const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashed = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                updatePayload.password_hash = hashed;
                updatePayload.plain_password = newPass; 
            } catch (err) {
                toggleInteractionLoader(false);
                return spawnToastNotification("Failed to encrypt password.", "error");
            }
        } else {
            toggleInteractionLoader(false);
            return spawnToastNotification("Secure context required.", "error");
        }
    }

    try {
        const { error } = await supa.from('users').update(updatePayload).eq('username', STATE_CACHE.user);
        if (error) throw error;
        
        spawnToastNotification("Credentials Updated Successfully.", "success");
        
        if(newUsername !== STATE_CACHE.user) {
            setTimeout(() => {
                alert("Username changed. You must log in again with your new credentials.");
                executeSecureLogout();
            }, 1500);
        } else {
            STATE_CACHE.displayName = newName;
            document.getElementById('sessionUserBadge').innerText = newName;
            document.getElementById('modPassword').value = '';
            
            let session = JSON.parse(localStorage.getItem('ssf_session_user'));
            session.name = newName;
            localStorage.setItem('ssf_session_user', JSON.stringify(session));
        }
    } catch(err) {
        console.error(err);
        spawnToastNotification(err.message || "Update failed.", "error");
    } finally {
        toggleInteractionLoader(false);
    }
}

// ==========================================
// SYSTEM LOCKS (GLOBAL & FIELD)
// ==========================================
async function dispatchGlobalStateChange(cb) {
    const newState = cb.checked ? "ACTIVE" : "STOPPED";
    toggleInteractionLoader(true, `Switching global state...`);
    try {
        const { error } = await supa.from('settings').upsert([{ key: 'Status', value: newState }], { onConflict: 'key' });
        if (error) throw error;
        
        await initializeSettingsData(); 
        spawnToastNotification(`System globally set to ${newState}`, "success");
    } catch(err) {
        console.error(err);
        spawnToastNotification("Failed to update status.", "error");
        cb.checked = !cb.checked; 
    } finally {
        toggleInteractionLoader(false);
    }
}

function syncLockTargets() {
    const lvl = document.getElementById('lockLevelSelect').value;
    const tSel = document.getElementById('lockTargetSelect');
    tSel.innerHTML = '';

    let dataset = [];
    if (lvl === 'District') dataset = structuralHierarchyData.districts.map(d => d.district_name);
    else if (lvl === 'Block') dataset = structuralHierarchyData.blocks.map(b => b.block_name);
    else if (lvl === 'Panchayat') dataset = structuralHierarchyData.panchayats.map(p => p.panchayat_name);
    else if (lvl === 'Unit') dataset = structuralHierarchyData.units.map(u => u.unit_name);

    if(dataset.length === 0) {
        tSel.innerHTML = `<option value="">-- No ${lvl}s Found --</option>`;
        tSel.disabled = true;
    } else {
        tSel.disabled = false;
        [...new Set(dataset)].filter(Boolean).sort().forEach(item => {
            tSel.innerHTML += `<option value="${item}">${item}</option>`;
        });
    }
}

async function applyFieldLock() {
    const lvl = document.getElementById('lockLevelSelect').value;
    const target = document.getElementById('lockTargetSelect').value;
    
    if(!target) return spawnToastNotification("Select a valid target field.", "error");

    if(activeFieldLocks.some(lock => lock.level === lvl && lock.target === target)) {
        return spawnToastNotification("This field is already locked.", "error");
    }

    activeFieldLocks.push({ level: lvl, target: target });
    await saveActiveLocksToDatabase("Field Locked Successfully.");
}

async function removeFieldLock(index) {
    activeFieldLocks.splice(index, 1);
    await saveActiveLocksToDatabase("Field Unlocked Successfully.");
}

async function saveActiveLocksToDatabase(successMsg) {
    toggleInteractionLoader(true, "Updating security locks...");
    try {
        const payload = JSON.stringify(activeFieldLocks);
        const { error } = await supa.from('settings').upsert([{ key: 'LockedFields', value: payload }], { onConflict: 'key' });
        if(error) throw error;
        
        spawnToastNotification(successMsg, "success");
        renderActiveLocks();
    } catch(err) {
        console.error(err);
        spawnToastNotification("Failed to update locks.", "error");
    } finally {
        toggleInteractionLoader(false);
    }
}

function renderActiveLocks() {
    const container = document.getElementById('activeLocksContainer');
    container.innerHTML = '';
    
    if(activeFieldLocks.length === 0) {
        container.innerHTML = `<p class="text-[10px] text-slate-400 italic">No specific fields are currently locked.</p>`;
        return;
    }

    activeFieldLocks.forEach((lock, index) => {
        container.innerHTML += `
        <div class="flex justify-between items-center bg-white p-2.5 rounded-lg border border-rose-100 shadow-sm animate-fade-in-up">
            <div class="flex items-center gap-2 text-[10px]">
                <span class="font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-1.5 py-0.5 rounded">${lock.level}</span>
                <span class="font-bold text-slate-700">${lock.target}</span>
            </div>
            <button onclick="removeFieldLock(${index})" class="w-7 h-7 rounded bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 transition-colors" title="Unlock Field"><i class="fa-solid fa-unlock text-[10px]"></i></button>
        </div>`;
    });
}

// ==========================================
// MEMBERSHIP FEES & UPI 
// ==========================================
async function handleFeeUpdate(e) {
    e.preventDefault();
    
    // Map UI inputs to their exact row identifiers in the new 'fee_structure' table
    const updates = [
        { role_type: 'state', amount: parseFloat(document.getElementById('feeState').value) || 0 },
        { role_type: 'district', amount: parseFloat(document.getElementById('feeDistrict').value) || 0 },
        { role_type: 'block', amount: parseFloat(document.getElementById('feeBlock').value) || 0 },
        { role_type: 'panchayat', amount: parseFloat(document.getElementById('feePanchayat').value) || 0 },
        { role_type: 'unit', amount: parseFloat(document.getElementById('feeUnit').value) || 0 },
        { role_type: 'member', amount: parseFloat(document.getElementById('feeMember').value) || 0 }
    ];

    toggleInteractionLoader(true, "Updating fee structure in database...");
    try {
        // Send a separate update command for each role_type row
        const updatePromises = updates.map(item => 
            supa.from('fee_structure')
                .update({ amount: item.amount })
                .eq('role_type', item.role_type)
        );
        
        const results = await Promise.all(updatePromises);
        
        // Throw an error if any of the row updates failed
        const errorResult = results.find(res => res.error);
        if(errorResult) throw errorResult.error;

        spawnToastNotification("Membership Fees Updated Successfully.", "success");
    } catch(err) {
        console.error(err);
        spawnToastNotification("Failed to update fees. Check your database structure.", "error");
    } finally {
        toggleInteractionLoader(false);
    }
}

async function handleUpiUpdate(e) {
    e.preventDefault();
    const upi = document.getElementById('upiIdInput').value.trim();

    toggleInteractionLoader(true, "Routing payment gateways...");
    try {
        const { error } = await supa.from('settings').upsert([{ key: 'MasterUPI', value: upi }], { onConflict: 'key' });
        if(error) throw error;
        spawnToastNotification("Global UPI ID Updated.", "success");
    } catch(err) {
        console.error(err);
        spawnToastNotification("Failed to update UPI ID.", "error");
    } finally {
        toggleInteractionLoader(false);
    }
}
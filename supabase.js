// Initialize Supabase Client
const SUPABASE_URL = "https://nefrtapsazuwopouqene.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_X0YE3PEm6XYOIY4UgEesog_ky8_HV4m";

// Check if window.supabase exists
if (!window.supabase) {
    console.error("Supabase library not loaded. Check your CDN links.");
}

const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test Connection
supa.from('districts').select('count').limit(1).then(({ data, error }) => {
    if (error) console.error("Supabase Connection Error:", error.message);
    else console.log("Supabase Connection Established.");
});

// Global Variables
let STATE_CACHE = {
    user: null, role: null, displayName: "",
    assignedFields: { districts: [], blocks: [], panchayats: [], units: [] }
};

// UI Helpers
function toggleInteractionLoader(show, text = "") {
    const loader = document.getElementById('globalLoader'); if(!loader) return;
    if(text) document.getElementById('globalLoaderText').innerText = text;
    show ? loader.classList.remove('hidden') : loader.classList.add('hidden');
}

function spawnToastNotification(msg, type='success') {
    const container = document.getElementById('toastContainer');
    if(!container) return;
    const toast = document.createElement('div');
    toast.className = `p-3.5 rounded-xl text-xs font-bold text-white shadow-lg transition-all duration-300 ${type==='success'?'bg-slate-900':'bg-rose-600'}`;
    toast.innerText = msg; 
    container.appendChild(toast); 
    setTimeout(() => toast.remove(), 3500);
}

// ==========================================
// SESSION & ROLE-BASED PAGE SECURITY
// ==========================================
function enforceSession() {
    const session = localStorage.getItem('ssf_session_user');
    if (!session) {
        if (!window.location.pathname.includes('index.html')) {
            window.location.href = 'index.html';
        }
        return false;
    }
    
    const userObj = JSON.parse(session);
    STATE_CACHE.user = userObj.username;
    STATE_CACHE.role = userObj.role;
    STATE_CACHE.displayName = userObj.displayName || userObj.name;
    STATE_CACHE.assignedFields = userObj.assignedFields || { districts: [], blocks: [], panchayats: [], units: [] };
    
    const nameBadge = document.getElementById('sessionUserBadge');
    const roleBadge = document.getElementById('sessionRoleTag');
    if(nameBadge) nameBadge.innerText = STATE_CACHE.displayName;
    if(roleBadge) roleBadge.innerText = STATE_CACHE.role;
    
    const isMasterAdmin = (STATE_CACHE.role === 'MasterAdmin');
    const isGlobalController = (isMasterAdmin || STATE_CACHE.role === 'Admin');

    const currentPath = window.location.pathname.toLowerCase();
    
    const masterAdminPages = ['users.html', 'alerts.html', 'export-master.html'];
    if (masterAdminPages.some(page => currentPath.includes(page)) && !isMasterAdmin) {
        window.location.href = 'members.html';
        return false;
    }

    // Notice we REMOVED 'districts.html' from this block so operators can access it
    const adminPages = ['dashboard.html', 'settings.html']; 
    if (adminPages.some(page => currentPath.includes(page)) && !isGlobalController) {
        window.location.href = 'members.html';
        return false;
    }

    if (isGlobalController) {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden-force'));
    } else {
        // DYNAMIC RENAMING FOR STANDARD OPERATORS
        const navDistDesktop = document.getElementById('nav-districts');
        const navDistMobile = document.getElementById('mob-districts');
        
        if (navDistDesktop) navDistDesktop.innerHTML = '<i class="fa-solid fa-map-location-dot w-4 text-center"></i> Fields';
        if (navDistMobile) navDistMobile.innerHTML = '<i class="fa-solid fa-map-location-dot text-sm"></i><span class="text-[8px] font-bold mt-1">Fields</span>';
        
        // Rename the page header if they are currently looking at the districts page
        if (currentPath.includes('districts.html')) {
            const pageHeader = document.querySelector('h2');
            if (pageHeader) pageHeader.innerText = "My Assigned Fields";
            document.title = "Fields | SSF West Bengal";
        }
    }

    if (isMasterAdmin) {
        document.querySelectorAll('.master-admin-only').forEach(el => el.classList.remove('hidden-force'));
    }
    
    verifyLiveAccountStatus(STATE_CACHE.user);
    
    return true;
}

// NEW FUNCTION: Checks the live database to ensure the session hasn't been revoked
async function verifyLiveAccountStatus(username) {
    // Skip database check for offline fallback master accounts
    if (username === 'masteradmin' || username === 'adminwb') return;

    try {
        const { data, error } = await supa.from('users')
            .select('status')
            .eq('username', username)
            .maybeSingle();

        // If user is deleted (no data) or status is no longer ACTIVE, nuke the session
        if (error || !data || data.status !== 'ACTIVE') {
            console.warn("Security Event: Account suspended or deleted. Terminating active session.");
            spawnToastNotification("Security clearance revoked. Session terminated.", "error");
            
            // Short delay so the user can read the toast before being booted
            setTimeout(() => {
                executeSecureLogout();
            }, 2000);
        }
    } catch (err) {
        console.error("Background session validation failed:", err);
    }
}

function executeSecureLogout() {
    localStorage.removeItem('ssf_session_user');
    window.location.href = 'index.html';
}

// Function to highlight both Desktop and Mobile navigation links
function setActiveSidebarLink(pageId) {
    // Highlight Desktop Link
    const desktopLink = document.getElementById(`nav-${pageId}`);
    if(desktopLink) {
        desktopLink.classList.remove('text-slate-600', 'hover:bg-slate-100');
        desktopLink.classList.add('bg-slate-900', 'text-white', 'shadow-md');
    }

    // Highlight Mobile Link
    const mobileLink = document.getElementById(`mob-${pageId}`);
    if(mobileLink) {
        mobileLink.classList.remove('text-slate-400');
        mobileLink.classList.add('text-emerald-600');
    }
}

// ==========================================
// UI HELPER: TOGGLE PASSWORD VISIBILITY
// ==========================================
function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

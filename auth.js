// Auto-redirect if already logged in based on role
window.addEventListener('DOMContentLoaded', () => {
    const session = localStorage.getItem('ssf_session_user');
    if (session) {
        const userObj = JSON.parse(session);
        if (userObj.role === 'MasterAdmin' || userObj.role === 'Admin') {
            window.location.href = 'dashboard.html';
        } else {
            window.location.href = 'members.html';
        }
    }
});

async function digestMessageSHA256(message) {
    const msgBuffer = new TextEncoder().encode(message);                    
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

document.getElementById('authForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const u = document.getElementById('authUsername').value.trim().toLowerCase();
    const p = document.getElementById('authPassword').value;
    
    toggleInteractionLoader(true, "Authorizing Login...");

    // Master Override Check
    if ((u === 'masteradmin' && p === 'SSF@WestBengal2026!') || (u === 'adminwb' && p === 'SSFAdmin2026!')) {
        let fallbackPayload = {
            username: u, role: u === 'masteradmin' ? 'MasterAdmin' : 'Admin',
            displayName: u === 'masteradmin' ? 'State Master Committee' : 'State Administrator',
            assignedFields: { districts: [], blocks: [], panchayats: [], units: [] }
        };
        localStorage.setItem('ssf_session_user', JSON.stringify(fallbackPayload));
        window.location.href = 'dashboard.html'; // Redirect to dashboard
        return;
    }

    try {
        const inputHash = await digestMessageSHA256(p);
        const { data, error } = await supa.from('users')
          .select('*').eq('username', u).eq('password_hash', inputHash).eq('status', 'ACTIVE').maybeSingle();

        if (error || !data) {
           spawnToastNotification("Invalid Username Or Password.", "error");
           toggleInteractionLoader(false);
           return;
        }

        let sessionPayload = {
           username: data.username, role: data.role, displayName: data.name,
           assignedFields: data.assigned_fields_json
        };

        localStorage.setItem('ssf_session_user', JSON.stringify(sessionPayload));
        
        // FIX: Route based on role upon successful login
        if (data.role === 'MasterAdmin' || data.role === 'Admin') {
            window.location.href = 'dashboard.html'; 
        } else {
            window.location.href = 'members.html'; // Operators go straight to directory
        }
    } catch(err) {
        spawnToastNotification("Authentication Failure.", "error");
        toggleInteractionLoader(false);
    }
});
let chartInstances = {};

document.addEventListener('DOMContentLoaded', async () => {
    if (!enforceSession()) return; 
    setActiveSidebarLink('dashboard'); 
    await fetchAnalyticsData();
});

async function fetchAnalyticsData() {
    toggleInteractionLoader(true, "Loading Analytics...");

    try {
        // Fetch raw counts and entire membership dataset for deep analytics
        const [
            { count: dCount }, 
            { count: bCount }, 
            { count: uCount },
            { data: members }
        ] = await Promise.all([
            supa.from('districts').select('*', { count: 'exact', head: true }),
            supa.from('blocks').select('*', { count: 'exact', head: true }),
            supa.from('units').select('*', { count: 'exact', head: true }),
            supa.from('memberships').select('district, unit, committee_role, timestamp')
        ]);

        // Process Core Metrics
        const totalMembers = members ? members.length : 0;
        
        const todayStr = new Date().toISOString().split('T')[0];
        const todayMembers = members ? members.filter(m => m.timestamp && m.timestamp.startsWith(todayStr)).length : 0;

        // Render Top Metrics
        animateValue('statTotalMembers', 0, totalMembers, 1000);
        document.getElementById('statTotalDistricts').innerText = dCount || 0;
        document.getElementById('statTotalBlocks').innerText = bCount || 0;
        document.getElementById('statTotalUnits').innerText = uCount || 0;
        document.getElementById('statTodayMembers').innerText = todayMembers;

        if(members && members.length > 0) {
            processGraphics(members);
        }

    } catch(e) { 
        spawnToastNotification("Failed to compile analytics.", "error"); 
        console.error(e);
    }
    
    toggleInteractionLoader(false);
}

// Function to calculate and render the charts and lists
function processGraphics(members) {
    // 1. Data Aggregation
    let distMap = {};
    let unitMap = {};
    let roleMap = { 'Standard Member': 0, 'Committee Official': 0 };

    members.forEach(m => {
        // Map Districts
        if(m.district) distMap[m.district] = (distMap[m.district] || 0) + 1;
        
        // Map Units
        let u = m.unit || 'Unassigned';
        unitMap[u] = (unitMap[u] || 0) + 1;

        // Map Roles (Simplified to Official vs Member for clean doughnut chart)
        let role = (m.committee_role || 'Member').toLowerCase();
        if(role.includes('member') && !role.includes('executive') && !role.includes('secretariat')) {
            roleMap['Standard Member']++;
        } else {
            roleMap['Committee Official']++;
        }
    });

    // Sort arrays for visual rankings
    const sortedDistricts = Object.entries(distMap).sort((a, b) => b[1] - a[1]);
    const sortedUnits = Object.entries(unitMap).sort((a, b) => b[1] - a[1]).slice(0, 10); // Top 10 Units

    // 2. Render HTML Progress Bar Lists
    renderDensityList('districtDensityList', sortedDistricts, members.length, 'bg-indigo-400');
    renderDensityList('unitDensityList', sortedUnits, members.length, 'bg-emerald-400');

    // 3. Render Chart.js Models
    renderBarChart(sortedDistricts.slice(0, 7)); // Show top 7 districts on chart
    renderDoughnutChart(roleMap);
}

function renderDensityList(elementId, sortedData, total, colorClass) {
    const list = document.getElementById(elementId);
    list.innerHTML = '';
    
    sortedData.forEach(([k, v], index) => {
        let pct = total > 0 ? Math.round((v / total) * 100) : 0;
        // Adding a slight animation delay based on index for a cascade effect
        list.innerHTML += `
        <div class="text-[11px] space-y-1.5 animate-fade-in-up" style="animation-delay: ${index * 0.05}s">
            <div class="flex justify-between font-bold text-slate-700">
                <span class="truncate pr-2">${k}</span>
                <span class="text-slate-500 shrink-0">${v} (${pct}%)</span>
            </div>
            <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden shadow-inner">
                <div class="${colorClass} h-full rounded-full transition-all duration-1000 ease-out" style="width: 0%" data-target-width="${pct}%"></div>
            </div>
        </div>`;
    });

    // Trigger width animations after rendering
    setTimeout(() => {
        const bars = list.querySelectorAll('[data-target-width]');
        bars.forEach(bar => { bar.style.width = bar.getAttribute('data-target-width'); });
    }, 100);
}

// Chart.js: Bar Chart Initialization
function renderBarChart(topDistricts) {
    const ctx = document.getElementById('districtBarChart');
    if (chartInstances['bar']) chartInstances['bar'].destroy();

    chartInstances['bar'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topDistricts.map(d => d[0]),
            datasets: [{
                label: 'Members Registered',
                data: topDistricts.map(d => d[1]),
                backgroundColor: '#6366f1', // Indigo 500
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleFont: { family: 'Inter', size: 11 },
                    bodyFont: { family: 'Inter', size: 12, weight: 'bold' },
                    padding: 10,
                    cornerRadius: 8
                }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f1f5f9', drawBorder: false }, ticks: { font: { family: 'Inter' } } },
                x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 10 }, maxRotation: 45, minRotation: 0 } }
            },
            animation: {
                y: { duration: 1500, easing: 'easeOutQuart' }
            }
        }
    });
}

// Chart.js: Doughnut Chart Initialization
function renderDoughnutChart(roleMap) {
    const ctx = document.getElementById('roleDoughnutChart');
    if (chartInstances['doughnut']) chartInstances['doughnut'].destroy();

    chartInstances['doughnut'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(roleMap),
            datasets: [{
                data: Object.values(roleMap),
                backgroundColor: ['#10b981', '#f59e0b'], // Emerald and Amber
                borderWidth: 3,
                borderColor: '#ffffff',
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20, font: { family: 'Inter', size: 11, weight: 'bold' } } },
            },
            animation: {
                animateScale: true,
                animateRotate: true,
                duration: 1500,
                easing: 'easeOutQuart'
            }
        }
    });
}

// Visual Number Counter Animation
function animateValue(id, start, end, duration) {
    if (start === end) return;
    let range = end - start;
    let current = start;
    let increment = end > start ? 1 : -1;
    let stepTime = Math.abs(Math.floor(duration / range));
    if (stepTime < 10) stepTime = 10; // Cap speed
    
    let obj = document.getElementById(id);
    if(!obj) return;
    
    let timer = setInterval(function() {
        current += increment;
        obj.innerHTML = current;
        if (current == end) { clearInterval(timer); }
    }, stepTime);
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
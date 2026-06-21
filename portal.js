// Store the active member globally so the download function can access their DOB and Phone
window.currentPortalMember = null;

// ==========================================
// FETCHING LOGIC (ADDED)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const searchForm = document.getElementById('searchForm');
    
    if (searchForm) {
        searchForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const phone = document.getElementById('searchPhone').value.trim();
            const dob = document.getElementById('searchDob').value;
            const btn = document.getElementById('searchBtn');
            const errorMsg = document.getElementById('errorMessage');
            
            const originalBtnText = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching...';
            btn.disabled = true;
            errorMsg.classList.add('hidden');

            try {
                // Query Supabase for the member based on Phone AND Date of Birth
                const { data, error } = await supa.from('memberships')
                    .select('*')
                    .eq('phone', phone)
                    .eq('dob', dob)
                    .maybeSingle();

                if (error || !data) {
                    errorMsg.innerText = "Identity Not Found. Please check the Phone Number and Date of Birth.";
                    errorMsg.classList.remove('hidden');
                } else {
                    // Hide search form, show result, and render the card
                    document.getElementById('searchSection').classList.add('hidden');
                    document.getElementById('resultSection').classList.remove('hidden');
                    renderPortalCard(data);
                }
            } catch (err) {
                errorMsg.innerText = "Network error connecting to the registry. Please try again.";
                errorMsg.classList.remove('hidden');
            } finally {
                btn.innerHTML = originalBtnText;
                btn.disabled = false;
            }
        });
    }
});

function resetPortal() {
    document.getElementById('searchForm').reset();
    document.getElementById('errorMessage').classList.add('hidden');
    document.getElementById('resultSection').classList.add('hidden');
    document.getElementById('searchSection').classList.remove('hidden');
    window.currentPortalMember = null;
}

// ==========================================
// RENDER & DOWNLOAD LOGIC
// ==========================================
window.toggleCardView = function(side) {
    const front = document.getElementById('preview-front-card');
    const back = document.getElementById('preview-back-card');
    const btnF = document.getElementById('btn-front-toggle');
    const btnB = document.getElementById('btn-back-toggle');
    
    if(side === 'front') {
        front.classList.remove('hidden');
        back.classList.add('hidden');
        btnF.className = "flex-1 bg-emerald-600 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-colors uppercase tracking-wider";
        btnB.className = "flex-1 bg-slate-100 text-slate-500 font-bold py-2.5 rounded-xl text-xs border border-slate-200 hover:bg-slate-200 transition-colors uppercase tracking-wider";
    } else {
        back.classList.remove('hidden');
        front.classList.add('hidden');
        btnB.className = "flex-1 bg-emerald-600 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-colors uppercase tracking-wider";
        btnF.className = "flex-1 bg-slate-100 text-slate-500 font-bold py-2.5 rounded-xl text-xs border border-slate-200 hover:bg-slate-200 transition-colors uppercase tracking-wider";
    }
}

function renderPortalCard(m) {
    window.currentPortalMember = m;
    const container = document.getElementById('cardTargetNode');
    
    const host = window.location.origin;
    let path = window.location.pathname;
    let dirPath = path.substring(0, path.lastIndexOf('/'));
    const verifyUrl = `${host !== "null" ? host : "https://yourwebsite.com"}${dirPath}/verify.html?id=${m.membership_id}`;
    const qrApiUrl = `https://quickchart.io/qr?text=${encodeURIComponent(verifyUrl)}&size=300&margin=0`;

    // Strip the outer box styling so the card floats cleanly
    container.style.background = 'transparent';
    container.style.border = 'none';
    container.style.boxShadow = 'none';
    container.className = "w-full flex flex-col items-center mt-4 overflow-visible";

    container.innerHTML = `
        <div class="flex gap-3 w-full max-w-[400px] mb-6">
            <button id="btn-front-toggle" onclick="toggleCardView('front')" class="flex-1 bg-emerald-600 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-colors uppercase tracking-wider">Front Side</button>
            <button id="btn-back-toggle" onclick="toggleCardView('back')" class="flex-1 bg-slate-100 text-slate-500 font-bold py-2.5 rounded-xl text-xs border border-slate-200 hover:bg-slate-200 transition-colors uppercase tracking-wider">Back Side</button>
        </div>

        <div class="origin-top scale-[0.45] sm:scale-75 md:scale-90 lg:scale-100 transition-transform h-[180px] sm:h-[290px] md:h-[350px] lg:h-[380px] w-[600px] flex justify-center pb-4">
            
            <div id="preview-front-card" class="w-[600px] h-[380px] relative overflow-hidden flex flex-col box-border shadow-xl rounded-2xl shrink-0 border border-slate-300 bg-white">
                <img src="front.png" class="absolute inset-0 w-full h-full object-cover z-0" onerror="this.style.display='none'">
                
                <div class="absolute top-[102px] left-[150px] w-[340px] text-[14px] leading-none font-normal text-slate-900 z-10" style="font-family: 'Poppins', sans-serif;">
                    <div class="truncate tracking-wider mb-[14px]">${m.membership_id}</div>
                    <div class="truncate text-[#c41e23] font-bold uppercase mb-[9px]">${m.name}</div>
                    <div class="truncate uppercase mb-[9px]">${m.unit}</div>
                    <div class="truncate uppercase mb-[9px]">${m.block}</div>
                    <div class="truncate tracking-widest">${m.phone}</div>
                </div>
                
                <div class="absolute top-[80px] right-[40px] w-[108px] h-[135px] z-10 overflow-hidden rounded-xl">
                    <img src="${m.photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80'}" crossorigin="anonymous" class="w-full h-full object-cover bg-white">
                </div>

                <div class="absolute top-[241px] right-[54px] w-[85px] h-[85px] z-10">
                    <img src="${qrApiUrl}" crossorigin="anonymous" class="w-full h-full object-contain mix-blend-multiply">
                </div>
            </div>

            <div id="preview-back-card" class="hidden w-[600px] h-[380px] relative overflow-hidden flex flex-col box-border shadow-xl rounded-2xl shrink-0 border border-slate-300 bg-white">
                <img src="back.png" class="absolute inset-0 w-full h-full object-cover z-0" onerror="this.style.display='none'">
            </div>

        </div>
    `;
}

// Intercept HTML button click
window.downloadDigitalCardAsPDF = function(event) {
    if(event) event.preventDefault();
    promptDownloadDigitalCard();
};

function promptDownloadDigitalCard() {
    const m = window.currentPortalMember;
    if(!m) return;

    const dobYear = m.dob ? new Date(m.dob).getFullYear().toString() : "0000";
    const phoneLast4 = m.phone ? m.phone.slice(-4) : "0000";
    const pwd = dobYear + phoneLast4;

    const modalHTML = `
    <div id="passwordAlertModal" class="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
        <div class="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 animate-fade-in-up text-center">
            <div class="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                <i class="fa-solid fa-file-pdf"></i>
            </div>
            <h3 class="text-xl font-black text-slate-900 mb-2">Encrypted Document</h3>
            <p class="text-xs text-slate-600 font-medium mb-4 leading-relaxed">Your secure printable document is ready. You will need a password to open the file.</p>
            
            <div class="bg-rose-50 border border-rose-100 p-5 rounded-2xl mb-6 text-left shadow-inner">
                <div class="text-[10px] font-black text-rose-800 uppercase tracking-wider mb-1">Password Format</div>
                <div class="text-[13px] font-bold text-rose-900 mb-3">Birth Year + Last 4 Digits of Mobile</div>
                <div class="text-xs text-rose-700 bg-white p-3 rounded-xl border border-rose-200 mb-3 shadow-sm leading-relaxed">
                    <b>Example:</b> If you were born in <b>1995</b> and your mobile ends in <b>7890</b>, your password is <b>19957890</b>.
                </div>
                <div class="text-sm font-black text-indigo-700 bg-indigo-50 p-3 rounded-xl border border-indigo-200 text-center uppercase tracking-widest">
                    Your Password: <span class="bg-white px-2 py-1 rounded shadow-sm ml-1 select-all">${pwd}</span>
                </div>
            </div>
            
            <div class="flex gap-3">
                <button onclick="document.getElementById('passwordAlertModal').remove()" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-xl text-xs transition-colors uppercase tracking-wider">Cancel</button>
                <button id="popupDownloadBtn" onclick="executePDFDownload()" class="flex-[1.5] bg-rose-600 hover:bg-rose-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-colors text-xs uppercase tracking-wider"><i class="fa-solid fa-download mr-1"></i> Download PDF</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

async function executePDFDownload() {
    const m = window.currentPortalMember;
    if(!m || !window.jspdf) {
        alert("PDF Library not loaded yet. Please wait a moment.");
        return;
    }

    const popupBtn = document.getElementById('popupDownloadBtn');
    if(popupBtn) {
        popupBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
        popupBtn.disabled = true;
    }

    const exportContainer = document.createElement('div');
    
    try {
        const host = window.location.origin;
        let path = window.location.pathname;
        let dirPath = path.substring(0, path.lastIndexOf('/'));
        const baseUrl = host !== "null" ? `${host}${dirPath}` : "."; 
        
        const verifyUrl = `${host !== "null" ? host : "https://yourwebsite.com"}${dirPath}/verify.html?id=${m.membership_id}`;
        const qrApiUrl = `https://quickchart.io/qr?text=${encodeURIComponent(verifyUrl)}&size=300&margin=0`;
        const downloadDate = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });

        exportContainer.style.position = 'fixed';
        exportContainer.style.left = '-9999px';
        exportContainer.style.top = '0';
        exportContainer.style.width = '600px'; 
        exportContainer.style.height = '800px';
        exportContainer.style.backgroundColor = '#ffffff';
        exportContainer.style.zIndex = '-9999';
        
        exportContainer.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 20px;">
                <div id="pdf-front-card" style="width: 600px; height: 380px; position: relative; box-sizing: border-box; background: #ffffff; overflow: hidden; border-radius: 12px; border: 1px solid #cbd5e1;">
                    <img src="${baseUrl}/front.png" style="position: absolute; top: 0; left: 0; width: 600px; height: 380px; object-fit: cover; z-index: 1;">
                    
                    <div style="position: absolute; top: 92px; left: 150px; width: 340px; font-size: 14px; line-height: 1.2; font-weight: normal; color: #0f172a; z-index: 10; font-family: 'Poppins', sans-serif;">
                        <div style="letter-spacing: 1px; margin-bottom: 12px;">${m.membership_id}</div>
                        <div style="color: #c41e23; font-weight: bold; text-transform: uppercase; margin-bottom: 7px;">${m.name}</div>
                        <div style="text-transform: uppercase; margin-bottom: 7px;">${m.unit}</div>
                        <div style="text-transform: uppercase; margin-bottom: 7px;">${m.block}</div>
                        <div style="letter-spacing: 2px;">${m.phone}</div>
                    </div>
                    
                    <div style="position: absolute; top: 80px; right: 40px; width: 108px; height: 135px; z-index: 10; overflow: hidden; border-radius: 12px; background: #f8fafc;">
                        <img src="${m.photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80'}" style="width: 100%; height: 100%; object-fit: cover;" crossorigin="anonymous">
                    </div>

                    <div style="position: absolute; top: 241px; right: 54px; width: 85px; height: 85px; z-index: 10; background: white;">
                        <img src="${qrApiUrl}" style="width: 100%; height: 100%; object-fit: contain;" crossorigin="anonymous">
                    </div>
                </div>

                <div id="pdf-back-card" style="width: 600px; height: 380px; position: relative; box-sizing: border-box; background: #ffffff; overflow: hidden; border-radius: 12px; border: 1px solid #cbd5e1;">
                    <img src="${baseUrl}/back.png" style="position: absolute; top: 0; left: 0; width: 600px; height: 380px; object-fit: cover; z-index: 1;">
                    
                    <div style="position: absolute; bottom: 8px; left: 0; width: 100%; text-align: center; font-size: 8px; color: #94a3b8; font-weight: bold; font-family: monospace; letter-spacing: 1px; z-index: 10;">
                        Downloaded On: ${downloadDate}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(exportContainer);

        const allImages = Array.from(exportContainer.querySelectorAll('img'));
        await Promise.all(allImages.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve; 
                setTimeout(resolve, 3000); 
            });
        }));

        await new Promise(resolve => setTimeout(resolve, 300)); 

        const frontElem = document.getElementById('pdf-front-card');
        const backElem = document.getElementById('pdf-back-card');

        const canvasOptions = { scale: 2, useCORS: true, allowTaint: false, backgroundColor: "#ffffff" };
        const canvasFront = await html2canvas(frontElem, canvasOptions);
        const canvasBack = await html2canvas(backElem, canvasOptions);
        
        let imgDataFront, imgDataBack;
        
        try {
            imgDataFront = canvasFront.toDataURL("image/jpeg", 0.95);
            imgDataBack = canvasBack.toDataURL("image/jpeg", 0.95);
        } catch (canvasError) {
            if (canvasError.name === "SecurityError") {
                throw new Error("SECURITY_ERROR");
            } else {
                throw canvasError;
            }
        }
        
        const { jsPDF } = window.jspdf;
        
        const dobYear = m.dob ? new Date(m.dob).getFullYear().toString() : "0000";
        const phoneLast4 = m.phone ? m.phone.slice(-4) : "0000";
        const userPassword = dobYear + phoneLast4;

        const pdf = new jsPDF({ 
            orientation: 'landscape', 
            unit: 'mm', 
            format: [86, 54.5],
            encryption: {
                userPassword: userPassword,
                ownerPassword: userPassword,
                userPermissions: ["print", "copy", "modify"]
            }
        });
        
        pdf.addImage(imgDataFront, 'JPEG', 0, 0, 86, 54.5);
        pdf.addPage();
        pdf.addImage(imgDataBack, 'JPEG', 0, 0, 86, 54.5);
        pdf.save(`SSF_ID_${m.membership_id}.pdf`);
        
        const modal = document.getElementById('passwordAlertModal');
        if(modal) modal.remove();
        
        setTimeout(() => alert(`Downloaded Successfully!\n\nYour PDF Password is: ${userPassword}`), 300);

    } catch (error) {
        console.error("PDF Export Error:", error);
        if (error.message === "SECURITY_ERROR") {
            alert("Browser blocked PDF generation. You MUST use a Local Web Server (not file:///).");
        } else {
            alert("Failed to generate PDF. Please check the console for details.");
        }
    } finally {
        if(document.body.contains(exportContainer)) document.body.removeChild(exportContainer);
        if(popupBtn) {
            popupBtn.innerHTML = '<i class="fa-solid fa-download mr-1"></i> Download PDF';
            popupBtn.disabled = false;
        }
    }
}
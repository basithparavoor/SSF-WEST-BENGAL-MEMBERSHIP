document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const verifyId = urlParams.get('id');

    const loader = document.getElementById('loadingState');
    const validUI = document.getElementById('validState');
    const invalidUI = document.getElementById('invalidState');

    if (!verifyId) {
        loader.classList.add('hidden');
        invalidUI.classList.remove('hidden');
        return;
    }

    await executePublicVerificationSequence(verifyId, loader, validUI, invalidUI);
});

async function executePublicVerificationSequence(id, loader, validUI, invalidUI) {
    try {
        const { data, error } = await supa.from('memberships')
            .select('*')
            .eq('membership_id', id)
            .maybeSingle();

        loader.classList.add('hidden');

        if (error || !data) {
            invalidUI.classList.remove('hidden');
            return;
        }

        renderVerifiedCard(data);
        validUI.classList.remove('hidden');
        
    } catch (err) {
        loader.classList.add('hidden');
        invalidUI.classList.remove('hidden');
    }
}

// Store globally for the download function
window.currentVerifyMember = null;

function renderVerifiedCard(m) {
    window.currentVerifyMember = m;
    const container = document.getElementById('verifyTargetNode');
    
    // Generate QR Code URL dynamically
    const verifyUrl = window.location.href;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(verifyUrl)}&margin=0`;

    container.innerHTML = `
    <div class="w-full overflow-x-auto custom-scrollbar pb-4 bg-slate-50 pt-4 border-t border-slate-200" style="text-align: left;">
        <div class="w-max mx-auto p-1">
            
            <div id="digitalCardPrintArea" class="w-[680px] h-[440px] bg-white relative overflow-hidden border border-slate-200 shadow-md rounded-xl flex flex-col" style="background-color: #f8fafc; background-image: radial-gradient(#e2e8f0 1px, transparent 1px); background-size: 20px 20px;">
                
                <div class="flex justify-between items-start pt-6 pl-8">
                    <h1 class="text-[#b91c1c] text-[65px] leading-none tracking-wider font-cooper" style="text-shadow: 2px 2px 0px rgba(0,0,0,0.05);">SSF</h1>
                    <div id="cardPrintRoleBox" class="bg-[#b91c1c] text-white font-bold text-xl px-6 py-2.5 rounded-l-2xl shadow-md uppercase tracking-widest mt-2 whitespace-nowrap">${m.committee_role || 'MEMBERSHIP'}</div>
                </div>

                <div class="px-8 mt-4 flex justify-between gap-6 relative z-10 flex-1">
                    <div class="bg-gradient-to-r from-[#ebd699] to-[#d6bc6d] rounded-2xl p-5 flex-1 shadow-sm text-[15px] font-bold text-slate-900 z-10 relative h-fit">
                        <table class="w-full">
                            <tr><td class="w-24 pb-2 opacity-80">No</td><td class="pb-2">: <span>${m.membership_id}</span></td></tr>
                            <tr><td class="pb-2 opacity-80">Name</td><td class="pb-2 text-[#b91c1c] uppercase">: <span>${m.name}</span></td></tr>
                            <tr><td class="pb-2 opacity-80">S/O</td><td class="pb-2 uppercase">: <span>${m.father_name}</span></td></tr>
                            <tr><td class="pb-2 opacity-80">Unit</td><td class="pb-2 uppercase">: <span>${m.unit}</span></td></tr>
                            <tr><td class="pb-2 opacity-80">Division</td><td class="pb-2 uppercase">: <span>${m.district}</span></td></tr>
                            <tr><td class="pb-2 opacity-80">Mobile</td><td class="pb-2">: <span>${m.phone}</span></td></tr>
                            <tr><td class="pb-0 opacity-80">Blood</td><td class="pb-0 text-[#b91c1c]">: <span>${m.blood_group || 'Unknown'}</span></td></tr>
                        </table>
                    </div>

                    <div class="flex flex-col items-center gap-3 relative z-10 mr-4">
                        <div class="w-[110px] h-[135px] shrink-0 bg-white rounded-[1rem] shadow-md overflow-hidden border-[4px] border-white z-10 relative">
                            <img src="${m.photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80'}" crossorigin="anonymous" class="w-full h-full object-cover">
                        </div>
                        <div class="bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm w-20 h-20 z-20">
                            <img src="${qrApiUrl}" crossorigin="anonymous" class="w-full h-full object-contain">
                        </div>
                    </div>
                    
                    <div class="absolute right-0 top-0 bottom-0 flex items-center justify-center w-6">
                        <div class="text-[11px] font-bold tracking-widest text-slate-800 transform -rotate-90 whitespace-nowrap">
                            Valid Upto : 2028 December 31
                        </div>
                    </div>
                </div>

                <div class="w-full px-8 pb-3 relative z-20 mt-auto">
                    <div class="flex justify-between items-end mb-2">
                        <div class="flex items-center gap-4">
                            <div class="w-16 h-16 flex items-center justify-center overflow-hidden">
                                <img src="https://corsproxy.io/?https%3A%2F%2Fdrive.google.com%2Fuc%3Fexport%3Dview%26id%3D1HPuNAPX_dq_HY5jAsZaIq9tpSc5tR0sf" crossorigin="anonymous" class="w-full h-full object-contain mix-blend-multiply opacity-90" onerror="this.style.display='none'">
                            </div>
                            <div class="flex flex-col items-center relative min-w-[150px]">
                                <img src="https://corsproxy.io/?https%3A%2F%2Fdrive.google.com%2Fuc%3Fexport%3Dview%26id%3D1-dNg9lxhjaw5HdLexa_1EM0jNYM4KBrB" crossorigin="anonymous" class="h-10 w-auto absolute -top-8 mix-blend-multiply opacity-90" onerror="this.style.display='none'">
                                <span class="font-black text-[13px] text-slate-900 mt-2 z-10">Abdul Rahman Saqafi</span>
                                <span class="text-[9px] font-bold text-slate-600">(General Secretary, SSF West Bengal)</span>
                            </div>
                        </div>
                    </div>

                    <div class="flex flex-col items-center border-t border-slate-300/50 pt-2">
                        <h2 class="text-[#b91c1c] font-black text-[22px] tracking-wide font-sans">West Bengal State Sunni Student's Federation</h2>
                        <div class="flex gap-4 text-[9px] font-bold text-slate-600 mt-1">
                            <span class="flex items-center gap-1"><i class="fa-solid fa-location-dot"></i> Students' Centre Kolkata</span>
                            <span class="flex items-center gap-1"><i class="fa-solid fa-globe"></i> www.ssfwestbengal.org</span>
                            <span class="flex items-center gap-1"><i class="fa-solid fa-envelope"></i> ssf.wbstate@gmail.com</span>
                            <span class="flex items-center gap-1"><i class="fa-solid fa-phone"></i> +91 7025 292 136</span>
                        </div>
                        <div class="text-[8px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Generated On: <span class="text-slate-600 font-black">${new Date().toISOString().split('T')[0]}</span></div>
                    </div>
                </div>
            </div>

        </div>
    </div>
    
    <div class="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-3 rounded-b-[2rem]">
        
        <div class="bg-indigo-50 border border-indigo-100/50 text-indigo-800 p-3 rounded-xl text-xs flex gap-3 shadow-sm">
            <i class="fa-solid fa-lock text-indigo-500 mt-0.5 text-sm"></i>
            <div class="leading-relaxed">
                <strong class="block mb-0.5 text-[10px] uppercase tracking-widest font-black text-indigo-900">Encrypted PDF Password</strong>
                The downloaded file is password protected. Format: <b>Birth Year</b> + <b>Last 4 digits of Mobile</b> <br>
                <span class="text-indigo-600/80 font-mono mt-1 inline-block">(e.g., if born 1995 and mobile ends in 7890 &rarr; <b>19957890</b>)</span>
            </div>
        </div>

        <button onclick="downloadDigitalCardAsPDF(event)" class="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2 text-xs uppercase tracking-wider">
            <i class="fa-solid fa-lock"></i> Download Secure PDF
        </button>
        <a href="portal.html" class="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-xs uppercase tracking-wider">
            <i class="fa-solid fa-arrow-left"></i> Public Portal
        </a>
    </div>
    `;
}

async function downloadDigitalCardAsPDF(event) {
    const m = window.currentVerifyMember;
    if(!m || !window.jspdf) return;
    
    const cardNode = document.getElementById('digitalCardPrintArea');
    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating Secure PDF...';
    btn.disabled = true;

    try {
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
        
        const dobYear = m.dob ? new Date(m.dob).getFullYear().toString() : "0000";
        const phoneLast4 = m.phone ? m.phone.slice(-4) : "0000";
        const userPassword = dobYear + phoneLast4;

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
        pdf.save(`SSF_Card_${m.membership_id}.pdf`);
        
        alert(`Downloaded Successfully!\n\nYour PDF Password is: ${userPassword}`);
    } catch (error) {
        alert("PDF generation failed. Please try again.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
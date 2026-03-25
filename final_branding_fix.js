const fs = require('fs');

// --- 1. Fix app.js ---
let appJs = fs.readFileSync('app.js', 'utf8');

// A. Fix Branding in generatePrescriptionHTML
appJs = appJs.replace(/CLINIC NAME/g, "${(biz.name || 'PHYSIONER').toUpperCase()}");
appJs = appJs.replace(/<h1 style="margin: 0; font-size: 2\.2rem; font-weight: 900; letter-spacing: -1px; line-height: 1;">CLINIC<\/h1>/g, 
    '<h1 style="margin: 0; font-size: 2.2rem; font-weight: 900; letter-spacing: -1px; line-height: 1;">${biz.name || "CLINIC"}</h1>');
appJs = appJs.replace(/Restore\. Realign\. Revive\./g, "Restore. Revive. Realign.");

// B. Fix "Clinic Physiotherapy Clinic" duplication
// The user says "Sparq Physiotherapy Clinic" renders as "Clinic Physiotherapy Clinic"
// We should check if biz.name already contains "Clinic" and not prepend it.
// Looking at the code:
// <h1 ...>${biz.name || "CLINIC"}</h1>
// <div ...>Physiotherapy Clinic</div>
// This is redundant if biz.name is "Sparq Physiotherapy Clinic".
// I'll change it to show biz.name and a more subtle specialty.
appJs = appJs.replace(/<div style="font-size: 0\.9rem; font-weight: 700; text-transform: uppercase; margin-top: 2px;">Physiotherapy Clinic<\/div>/g, 
    '<div style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; margin-top: 2px; color: #64748b;">Specialized Physiotherapy Care</div>');

// C. Fix 'onclick' on null crash
// I'll wrap all direct .onclick assignments in safety checks
appJs = appJs.replace(/([a-zA-Z0-9]+)\.onclick =/g, (match, el) => {
    if (el === 'el' || el === 'preview' || el === 'overlay' || el === 'saveBtn' || el === 'confirmBtn') {
        return `if (${el}) ${el}.onclick =`;
    }
    return match;
});

// D. Fix Delete Item Option
// I'll ensure the delete button is rendered in the library
appJs = appJs.replace(/div\.innerHTML = [\s\S]*?<\/div>`;/g, (match) => {
    if (match.includes('item-card-simple') && !match.includes('item-card-delete-btn')) {
        return match.replace('</div>`', `
            <div class="item-card-delete-btn" onclick="event.stopPropagation(); window.deleteItemFromLibrary('\${item.id}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </div>
        </div>\``);
    }
    return match;
});

fs.writeFileSync('app.js', appJs, 'utf8');
console.log('Fixed app.js: branding, safety, and deletion');

// --- 2. Fix index.html ---
let indexHtml = fs.readFileSync('index.html', 'utf8');

// A. Fix FAB visibility by removing min-height: 100vh from .screen
indexHtml = indexHtml.replace(/style="background: white; min-height: 100vh;"/g, 'style="background: white;"');

// B. Add FABs to all main screens if missing
const screens = [
    { id: 'invoiceDashboardScreen', btn: 'mainCreateBtn' },
    { id: 'prescDashboardScreen', btn: 'btnNewPrescription' },
    { id: 'estimatesDashboardScreen', btn: 'mainCreateBtnEstimates' },
    { id: 'clientPickerScreen', btn: 'btnNewClient' },
    { id: 'itemPickerScreen', btn: 'addNewItemBtn' }
];

screens.forEach(s => {
    const screenRegex = new RegExp(`<section class="screen"([^>]*?)id="${s.id}"([\\s\\S]*?)<\/section>`, 'g');
    indexHtml = indexHtml.replace(screenRegex, (match, attrs, content) => {
        if (!content.includes('class="fab"') && !content.includes('id="' + s.btn + '"')) {
             return `<section class="screen"${attrs}id="${s.id}">${content}
                <button class="fab" id="${s.btn}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
             </section>`;
        }
        return match;
    });
});

// C. Fix Business Modal Scrolling
indexHtml = indexHtml.replace(/<div class="main-scroll" style="background: white;">/g, '<div class="main-scroll" style="background: white; height: calc(100vh - 80px); overflow-y: auto;">');

fs.writeFileSync('index.html', indexHtml, 'utf8');
console.log('Fixed index.html: FABs, scrolling, and screens');

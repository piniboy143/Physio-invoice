const fs = require('fs');

// --- 1. Fix app.js ---
let appJs = fs.readFileSync('app.js', 'utf8');

// A. Inject NativeBridge at the top (after state initialization)
const bridgeCode = `
const NativeBridge = {
    get platform() {
        if (window.ReactNativeWebView) return 'expo';
        if (window.location.protocol === 'capacitor:' || window.Capacitor) return 'capacitor';
        return 'web';
    },
    postMessage(data) {
        if (this.platform === 'expo') {
            window.ReactNativeWebView.postMessage(JSON.stringify(data));
        } else {
            console.log("Bridge Call:", data);
        }
    },
    share(data) {
        if (this.platform === 'expo') {
            this.postMessage({ type: 'share', ...data });
        } else {
            // Capacitor or Web: Use print flow (best for PDF)
            window.print();
        }
    }
};
`;

// Find first instance of "const state" or similar to inject after
appJs = appJs.replace(/const STORAGE_KEY = .*/, (match) => match + "\n" + bridgeCode);

// B. Fix isNative getter again
appJs = appJs.replace(/get isNative\(\) \{[\s\S]*?\}/g, "get isNative() { return NativeBridge.platform !== 'web'; }");

// C. Replace all React Native postMessages
appJs = appJs.replace(/window\.ReactNativeWebView\.postMessage\(JSON\.stringify\(([\s\S]*?)\)\);/g, "NativeBridge.postMessage($1);");
// Handle one-line if blocks
appJs = appJs.replace(/if \(this\.isNative\) \{[\s\S]*?postMessage[\s\S]*?\}/g, "if (this.isNative) { NativeBridge.postMessage({ type: 'GOOGLE_LOGIN' }); }");

// D. Standardize Sharers
appJs = appJs.replace(/window\.shareCurrentInvoice =[\s\S]*?\};/g, `window.shareCurrentInvoice = () => { NativeBridge.share({ html: document.getElementById("invoicePreviewContainer").innerHTML, filename: "Invoice.pdf" }); };`);
appJs = appJs.replace(/window\.shareCurrentPrescription =[\s\S]*?\};/g, `window.shareCurrentPrescription = () => { NativeBridge.share({ html: document.getElementById("prescPreviewContainer").innerHTML, filename: "Prescription.pdf" }); };`);

// E. Add VCard Contact implementation
const contactCode = `
window.saveToContacts = (client) => {
    const vcard = "BEGIN:VCARD\\nVERSION:3.0\\nFN:" + client.name + "\\nTEL;TYPE=CELL:" + client.phone + "\\nEND:VCARD";
    const blob = new Blob([vcard], { type: "text/vcard" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', client.name + ".vcf");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
`;
appJs += contactCode;

fs.writeFileSync('app.js', appJs, 'utf8');
console.log('Migrated app.js to NativeBridge');

// --- 2. Fix styles.css (Preview Layout) ---
let stylesCss = fs.readFileSync('styles.css', 'utf8');
// Fix the top alignment and scaling
stylesCss = stylesCss.replace(/#pdfFrame \{[\s\S]*?\}/g, \`#pdfFrame {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
  background: #f1f5f9;
  padding: 40px 0;
}\`);

fs.writeFileSync('styles.css', stylesCss, 'utf8');
console.log('Updated styles.css layout');

// --- 3. Fix index.html (Payment Screen & Main Scroll) ---
let indexHtml = fs.readFileSync('index.html', 'utf8');

// Ensure all "main-scroll" containers have proper height
indexHtml = indexHtml.replace(/class="main-scroll"/g, 'class="main-scroll" style="height: calc(100vh - 120px); overflow-y: auto;"');

fs.writeFileSync('index.html', indexHtml, 'utf8');
console.log('Fixed index.html main-scroll containers');

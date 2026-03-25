const fs = require('fs');

// --- 1. Fix app.js ---
let appJs = fs.readFileSync('app.js', 'utf8');

const bridgeCode = `
const NativeBridge = {
    get platform() {
        if (window.ReactNativeWebView) return 'expo';
        if (window.location.protocol === 'capacitor:' || window.Capacitor) return 'capacitor';
        return 'web';
    },
    postMessage(data) {
        if (this.platform === 'expo') {
            try { window.ReactNativeWebView.postMessage(JSON.stringify(data)); } catch(e) { console.error(e); }
        } else {
            console.log("Bridge Call:", data);
        }
    },
    share(data) {
        if (this.platform === 'expo') {
            this.postMessage({ type: 'share', ...data });
        } else {
            window.print();
        }
    }
};
`;

// Prepend Bridge at the very top (after console log)
if (!appJs.includes('NativeBridge')) {
    appJs = appJs.replace('console.log("App loading...");', 'console.log("App loading...");\n' + bridgeCode);
}

// Fix isNative getter
appJs = appJs.replace(/get isNative\(\) \{[\s\S]*?\}/g, "get isNative() { return NativeBridge.platform !== 'web'; }");
// Fallback if getter not found
appJs = appJs.replace(/isNative: !!window\.ReactNativeWebView.*/g, "get isNative() { return NativeBridge.platform !== 'web'; },");

// Replace ALL window.ReactNativeWebView.postMessage
appJs = appJs.replace(/window\.ReactNativeWebView\.postMessage/g, "NativeBridge.postMessage");

// Standardize Sharers to avoid complex bridge logic for now (window.print is best)
appJs = appJs.replace(/window\.shareCurrentInvoice =[\s\S]*?\}\;/g, `window.shareCurrentInvoice = () => { window.print(); };`);
appJs = appJs.replace(/window\.shareCurrentPrescription =[\s\S]*?\}\;/g, `window.shareCurrentPrescription = () => { window.print(); };`);

// Implement vCard for Contacts
if (!appJs.includes('saveToContacts')) {
    appJs += `
window.saveToContacts = (client) => {
    const vcard = "BEGIN:VCARD\\nVERSION:3.0\\nFN:" + (client.name || "Client") + "\\nTEL;TYPE=CELL:" + (client.phone || "") + "\\nEND:VCARD";
    const blob = new Blob([vcard], { type: "text/vcard" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', (client.name || "Client") + ".vcf");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
`;
}

fs.writeFileSync('app.js', appJs, 'utf8');

// --- 2. Fix index.html ---
let indexHtml = fs.readFileSync('index.html', 'utf8');
// Fix the blank screen issue by ensuring "active" screens have proper display and height
indexHtml = indexHtml.replace(/<section class="screen"/g, '<section class="screen" style="background: white; min-height: 100vh;"');

// Ensure "Add to Contacts" buttons call the new function
indexHtml = indexHtml.replace(/onclick="saveClientToContacts\((.*?)\)"/g, 'onclick="window.saveToContacts($1)"');

fs.writeFileSync('index.html', indexHtml, 'utf8');

console.log('Final Robust Migration Complete');

console.log("App loading...");

const NativeBridge = {
    get platform() {
        if (window.ReactNativeWebView) return 'expo';
        if (window.location.protocol === 'capacitor:' || window.Capacitor) return 'capacitor';
        return 'web';
    },
    postMessage(data) {
        if (this.platform === 'expo') {
            try { NativeBridge.postMessage(JSON.stringify(data)); } catch(e) { console.error(e); }
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

window.onerror = function(msg, url, line, col, error) {
  console.group("GLOBAL ERROR");
  console.error(msg);
  console.error(`at ${url}:${line}:${col}`);
  if (error) console.error(error.stack);
  console.groupEnd();
  alert("Internal Error: " + msg + "\nCheck console for details.");
  return false;
};
const STORAGE_KEY = "billing_v2_state";

const defaultState = {
  businesses: [{ id: "b1", name: "", address: "", email: "", phone: "" }],
  activeBusinessId: "b1",
  patients: [],
  items: [],
  invoices: [],
  activeFilter: "all",
  signatures: [],
  termsList: [
    { id: "t1", content: "*Payments: Due at the time of service via Cash/UPI/Bank Transfer.\n*Refunds: Services rendered or consultations are non-refundable.\n*Cancellations: 24-hour notice required; late cancellations may incur a fee.\n*Packages: Pre-paid sessions must be used within 1 months.\n*Equipment: Orthopedic supports/tapes are non-returnable for hygiene.\n*Liability: Results vary by individual; treatment is at the patient's own risk." }
  ],
  paymentMethods: [
    { id: "pm1", name: "UPI" },
    { id: "pm2", name: "Cash" },
    { id: "pm3", name: "UPI+Cash" }
  ],
  settings: {
    dueTerms: 'none',
    dueTermsList: [
      { id: 'dt1', content: 'Due on receipt' },
      { id: 'dt2', content: 'Net 15' },
      { id: 'dt3', content: 'Net 30' }
    ],
    showPaidStatus: true,
    currency: 'INR',
    numberFormat: '10,00,000.00',
    dateFormat: 'DD/MM/YYYY'
  },
  taxList: [
    { id: "tx1", name: "GST", rate: 18 },
    { id: "tx2", name: "VAT", rate: 5 }
  ]
};

// Global State & Helpers
let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(defaultState);
state.prescriptions = state.prescriptions || [];
state.estimates = state.estimates || [];
state.doctors = state.doctors || [];
state.editorMode = 'invoice'; 
state.reportFilter = state.reportFilter || { dateRange: "last30" };
const SyncManager = {
  db: null,
  uid: localStorage.getItem("sync_uid") || null,
  enabled: localStorage.getItem("sync_enabled") === 'true',
    get isNative() { return NativeBridge.platform !== 'web'; },

  init() {
    if (typeof firebase === 'undefined') return console.warn("Firebase not loaded");
    // Placeholder config - User should set this in Firebase Console
    const config = {
      apiKey: "YOUR_API_KEY",
      authDomain: "YOUR_AUTH_DOMAIN",
      projectId: "YOUR_PROJECT_ID",
      storageBucket: "YOUR_STORAGE_BUCKET",
      messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
      appId: "YOUR_APP_ID"
    };
    
    // Check for empty config
    if (config.apiKey === "YOUR_API_KEY") {
        console.warn("Cloud Sync: Firebase configuration is missing. Real-time sync disabled.");
        return;
    }

    if (!firebase.apps.length) firebase.initializeApp(config);
    this.db = firebase.firestore();
    if (this.uid && this.enabled) this.startSync();
    this.updateUI();
  },

  triggerLogin() {
    if (this.uid && this.enabled) {
        // Sign Out
        this.uid = null;
        this.enabled = false;
        localStorage.removeItem("sync_uid");
        localStorage.removeItem("sync_enabled");
        if (this.unsubscribe) this.unsubscribe();
        this.updateUI();
        return;
    }

    if (this.isNative) {
      NativeBridge.postMessage(JSON.stringify({ type: 'GOOGLE_LOGIN' }));
    } else {
      alert("Google Login is only available in the Mobile App (APK). Please use the mobile version for real-time sync.");
    }
  },

  handleLoginSuccess(uid) {
    this.uid = uid;
    this.enabled = true;
    localStorage.setItem("sync_uid", uid);
    localStorage.setItem("sync_enabled", "true");
    this.startSync();
    this.updateUI();
  },

  startSync() {
    if (!this.db || !this.uid) return;
    this.unsubscribe = this.db.collection("users").doc(this.uid).onSnapshot(doc => {
      if (doc.exists) {
        const cloudData = doc.data().state;
        if (cloudData && JSON.stringify(cloudData) !== JSON.stringify(state)) {
           console.log("Cloud Sync: Updating local state from cloud...");
           state = Object.assign(state, cloudData);
           localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
           if (window.renderAll) window.renderAll();
           else location.reload(); // Fallback if renderAll is not ready
        }
      }
    }, err => console.error("Snapshot Error:", err));
  },

  async push() {
    if (!this.enabled || !this.db || !this.uid) return;
    try {
      await this.db.collection("users").doc(this.uid).set({ 
        state: state,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      console.error("Sync Push Error:", e);
    }
  },

  updateUI() {
    const label = document.getElementById("syncStatusLabel");
    const sub = document.getElementById("syncStatusSub");
    const loginBtnText = document.getElementById("googleLoginText");
    
    if (this.uid && this.enabled) {
      if (label) label.innerText = "Cloud Sync Active";
      if (sub) sub.innerText = "Automatically updating on all devices";
      if (loginBtnText) loginBtnText.innerText = "Sign Out from Google";
    } else {
      if (label) label.innerText = "Not Signed In";
      if (sub) sub.innerText = "Sign in to enable automatic sync";
      if (loginBtnText) loginBtnText.innerText = "Sign in with Google";
    }
  }
};

const save = (skipCloud = false) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!skipCloud) SyncManager.push();
};

window.triggerGoogleLogin = () => SyncManager.triggerLogin();
window.handleLoginSuccess = (uid) => SyncManager.handleLoginSuccess(uid);
const formatINR = (amt) => {
  const num = Number(amt) || 0;
  // Forced Indian format for currency with /- suffix
  const formatted = num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return "₹" + formatted + "/-";
};

const formatDate = (dateStr) => {
  if (!dateStr) return "--.--.----";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    // Attempt to handle dd.mm.yyyy strings directly if they already exist
    return String(dateStr);
  }
  // Forced DD.MM.YYYY
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

window.calcDays = (from, to) => {
  if (!from || !to) return 0;
  const d1 = new Date(from);
  const d2 = new Date(to);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  const diff = Math.abs(d2 - d1);
  return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
};

// Auto-adjust date from DDMMYY to DD.MM.YYYY
const autoAdjustDate = (val) => {
  val = val.replace(/\D/g, '');
  if (val.length === 6) {
    const day = val.substring(0, 2);
    const month = val.substring(2, 4);
    let year = val.substring(4, 6);
    year = (parseInt(year) > 50 ? "19" : "20") + year;
    return `${day}.${month}.${year}`;
  }
  return null;
};

// Global listener for date inputs to handle auto-adjustment
document.addEventListener('change', (e) => {
  if (e.target && e.target.type === 'date' || e.target.id === 'iiDate' || e.target.id === 'iiDueDate') {
    // If it's a standard date input, the browser handles it, but for our custom text inputs:
    if (e.target.type === 'text') {
      const adjusted = autoAdjustDate(e.target.value);
      if (adjusted) e.target.value = adjusted;
    }
  }
});

// Since we use some text inputs for dates (like in Invoice Info), let's ensure we catch them
// DOB Auto-formatter & Age Calculator
document.addEventListener('input', (e) => {
  if (e.target.id === 'cfDob') {
    let val = e.target.value.replace(/\D/g, '');
    if (val.length > 8) val = val.substring(0, 8);
    
    let formatted = "";
    if (val.length > 0) formatted += val.substring(0, 2);
    if (val.length > 2) formatted += '/' + val.substring(2, 4);
    if (val.length > 4) formatted += '/' + val.substring(4, 8);
    
    // If user typed exactly 6 or 8 digits, we can try to finalize it
    if (val.length === 6 && e.inputType !== 'deleteContentBackward') {
        const d = val.substring(0, 2);
        const m = val.substring(2, 4);
        let y = val.substring(4, 6);
        const currentYear = new Date().getFullYear() % 100;
        y = (parseInt(y) <= currentYear ? "20" : "19") + y;
        formatted = `${d}/${m}/${y}`;
    }
    
    e.target.value = formatted;
    
    // Auto calculate age if we have a full date
    if (formatted.length === 10) {
        const parts = formatted.split('/');
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const year = parseInt(parts[2]);
        const dob = new Date(year, month, day);
        if (!isNaN(dob.getTime())) {
            const today = new Date();
            let age = today.getFullYear() - dob.getFullYear();
            const m = today.getMonth() - dob.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
            if (age >= 0) document.getElementById("cfAge").value = age;
        }
    }
  }
  
  if (e.target.id === 'iiDate' || e.target.id === 'iiDueDate') {
    const val = e.target.value.replace(/\D/g, '');
    if (val.length === 6) {
      const adjusted = autoAdjustDate(val);
      if (adjusted) {
        e.target.value = adjusted;
        // Trigger a change to save
        e.target.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }
});
const setupBtn = (id, fn) => {
  const el = document.getElementById(id);
  if (el) {
    el.onclick = fn;
  }
};
let screenStack = ["dashboard"];
let currentInvoice = null;

// Bottom Sheet Logic
function showBottomSheet(header, items) {
  const overlay = document.getElementById("bottomSheetOverlay");
  const sheet = document.getElementById("bottomSheet");
  const content = document.getElementById("bottomSheetContent");

  let html = `<div class="bs-header">${header}</div>`;
  items.forEach(item => {
    html += `
      <div class="bs-menu-item" onclick="${item.action}">
        ${item.icon || ''}
        <div class="label">${item.label}</div>
      </div>
    `;
  });

  content.innerHTML = html;
  overlay.classList.add("active");
  sheet.classList.add("active");
  overlay.onclick = hideBottomSheet;
  document.body.style.overflow = "hidden";
}

// Modal Input Logic
window.showInputModal = (title, placeholder, currentVal, callback) => {
  const overlay = document.getElementById("inputModalOverlay");
  const titleEl = document.getElementById("inputModalTitle");
  const inputEl = document.getElementById("modalTextInput");
  const saveBtn = document.getElementById("modalSaveBtn");

  if (!overlay || !titleEl || !inputEl || !saveBtn) return;

  titleEl.textContent = title;
  inputEl.placeholder = placeholder || "";
  inputEl.value = currentVal || "";
  
  overlay.classList.add("active");
  
  saveBtn.onclick = () => {
    const val = inputEl.value.trim();
    if (val) {
      callback(val);
      window.closeInputModal();
    } else {
      alert("Please enter a value.");
    }
  };
};

window.closeInputModal = () => {
  const overlay = document.getElementById("inputModalOverlay");
  if (overlay) overlay.classList.remove("active");
};

// Standardized Confirmation Modal
window.showConfirmModal = (title, message, onConfirm, onCancel) => {
  const overlay = document.getElementById("confirmModalOverlay");
  const titleEl = document.getElementById("confirmModalTitle");
  const bodyEl = document.getElementById("confirmModalBody");
  const confirmBtn = document.getElementById("confirmModalConfirmBtn");
  const cancelBtn = document.getElementById("confirmModalCancelBtn");

  if (!overlay || !titleEl || !bodyEl || !confirmBtn || !cancelBtn) return;

  titleEl.textContent = title || "Are you sure?";
  bodyEl.textContent = message || "This action cannot be undone.";
  
  overlay.classList.add("active");

  confirmBtn.onclick = () => {
    overlay.classList.remove("active");
    if (onConfirm) onConfirm();
  };

  cancelBtn.onclick = () => {
    overlay.classList.remove("active");
    if (onCancel) onCancel();
  };
};

window.closeConfirmModal = () => {
  const overlay = document.getElementById("confirmModalOverlay");
  if (overlay) overlay.classList.remove("active");
};

function hideBottomSheet() {
  const overlay = document.getElementById("bottomSheetOverlay");
  const sheet = document.getElementById("bottomSheet");
  overlay.classList.remove("active");
  sheet.classList.remove("active");
  document.body.style.overflow = "";
}

window.hideBottomSheet = hideBottomSheet;

// Premium Modal Logic
window.showInfoModal = (title, message) => {
  const overlay = document.getElementById("infoModalOverlay");
  const titleEl = document.getElementById("infoModalTitle");
  const bodyEl = document.getElementById("infoModalBody");
  
  if (overlay && titleEl && bodyEl) {
    titleEl.textContent = title || "Attention";
    bodyEl.textContent = message || "Feature under development.";
    overlay.classList.add("active");
  }
};

window.hideInfoModal = () => {
  const overlay = document.getElementById("infoModalOverlay");
  if (overlay) overlay.classList.remove("active");
};

// Replace alerts
const originalAlert = window.alert;
window.alert = (msg) => {
  if (msg.toLowerCase().includes("soon")) {
     window.showInfoModal("Coming Soon", msg);
  } else {
     window.showInfoModal("Notification", msg);
  }
};

// Data Migration: Convert old singular 'business' to 'businesses' array
if (state.business && !state.businesses) {
  console.log("Migrating business data to new schema...");
  state.businesses = [{ 
    id: "b1", 
    name: state.business.name || "My Business",
    email: state.business.email || "",
    phone: state.business.contact || state.business.phone || "",
    address: state.business.address || "",
    website: state.business.website || ""
  }];
  state.activeBusinessId = "b1";
  delete state.business;
  save();
}

// Ensure new collections exist
if (!state.signatures) state.signatures = [];
if (!state.termsList) state.termsList = structuredClone(defaultState.termsList);
if (!state.taxList) state.taxList = structuredClone(defaultState.taxList || []);
if (!state.paymentMethods) state.paymentMethods = structuredClone(defaultState.paymentMethods);
if (!state.settings) state.settings = structuredClone(defaultState.settings);
if (!state.settings.dueTermsList) state.settings.dueTermsList = structuredClone(defaultState.settings.dueTermsList);
if (state.settings.dueTerms === undefined) state.settings.dueTerms = 'none';


// Fallback for missing businesses or patients
if (!state.businesses || state.businesses.length === 0) {
  state.businesses = structuredClone(defaultState.businesses);
  state.activeBusinessId = state.businesses[0].id;
}
if (!state.patients || state.patients.length === 0) {
  state.patients = structuredClone(defaultState.patients);
}

// Invoice Migration: Handle legacy schemas
state.invoices.forEach(inv => {
  // Map 'number' to 'invoiceNumber'
  if (inv.number && !inv.invoiceNumber) {
    inv.invoiceNumber = inv.number;
  }
  
  // Migration: Singular Terms to Multi-select
  if (inv.termsId && !inv.termsIds) {
    inv.termsIds = [inv.termsId];
  }
  if (!inv.termsIds) inv.termsIds = [];

  // Migration: Singular Tax to Multi-select
  if (inv.taxId && !inv.taxIds) {
    inv.taxIds = [inv.taxId];
  }
  if (!inv.taxIds) inv.taxIds = [];
  
  // Map 'clientName' to 'patient' object
  if (inv.clientName && !inv.patient) {
    const p = state.patients.find(pt => pt.name === inv.clientName || pt.id === inv.patientId);
    if (p) {
      inv.patient = p;
    } else {
      inv.patient = { 
        id: inv.patientId || ("p_migrated_" + Math.random().toString(36).substr(2, 9)), 
        name: inv.clientName, 
        address: "Migrated", 
        phone: "" 
      };
      state.patients.push(inv.patient);
    }
  }

  // Ensure patient name exists for display if mapped
  if (inv.patientName && !inv.patient) {
    const p = state.patients.find(pt => pt.name === inv.patientName);
    if (p) inv.patient = p;
    else {
      inv.patient = { id: "p_migrated_" + Date.now(), name: inv.patientName, address: "Migrated", phone: "" };
      state.patients.push(inv.patient);
    }
  }

  inv.total = Number(inv.total) || 0;
  if (!["paid", "unpaid", "partially_paid", "overdue"].includes(inv.status)) inv.status = "unpaid";
});

save();

const els = {
  headerLBtn: document.getElementById("headerLBtn"),
  headerTitle: document.getElementById("headerTitle"),
  headerRActions: document.getElementById("headerRActions"),
  appHeader: document.getElementById("appHeader"),
  bottomNav: document.getElementById("appBottomNav"),
  screens: document.querySelectorAll(".screen"),
  invoicesList: document.getElementById("invoicesList"),
  unpaidVal: document.getElementById("unpaidVal"),
  overdueVal: document.getElementById("overdueVal"),
  creditVal: document.getElementById("creditVal"),
  createInvoiceBtn: document.getElementById("createInvoiceBtn"),
  // Editor fields
  editIdText: document.getElementById("editIdText"),
  editDateText: document.getElementById("editDateText"),
  activeLangText: document.getElementById("activeLangText"),
  editorFromText: document.getElementById("editorFromText"),
  editorToText: document.getElementById("editorToText"),
  editorItemCount: document.getElementById("editorItemCount"),
  editorPaymentText: document.getElementById("editorPaymentText"),
  editorTermsText: document.getElementById("editorTermsText"),
  editorSignatureVal: document.getElementById("editorSignatureVal"),
  editorSessionText: document.getElementById("editorSessionText"),
  editorPaymentHistoryText: document.getElementById("editorPaymentHistoryText"),
  signaturePreviewSmall: document.getElementById("signaturePreviewSmall"),
  hubTotalText: document.getElementById("hubTotalText"),
  // New Editor elements
  editorItemsList: document.getElementById("editorItemsList"),
  btnEditPreview: document.getElementById("btnEditPreview"),
  // Modals
  overlay: document.getElementById("modalOverlay"),
  modalBody: document.getElementById("modalBody"),
  btnSaveHub: document.getElementById("btnSaveHub"),
  btnPreview: document.getElementById("btnPreview"),
  sideNavLogo: document.getElementById("sideNavLogo"),
  sideNavName: document.getElementById("sideNavName")
};

// Sidebar Logic
window.toggleSideNav = () => {
  const sideNav = document.getElementById("sideNav");
  const overlay = document.getElementById("sideNavOverlay");
  if (sideNav) sideNav.classList.toggle("open");
  if (overlay) overlay.classList.toggle("active");
};

window.closeSideNav = () => {
  const sideNav = document.getElementById("sideNav");
  const overlay = document.getElementById("sideNavOverlay");
  if (sideNav) sideNav.classList.remove("open");
  if (overlay) overlay.classList.remove("active");
};

const sideNavOverlay = document.getElementById("sideNavOverlay");
if (sideNavOverlay) sideNavOverlay.onclick = window.closeSideNav;

function updateHeader() {
  try {
    const current = screenStack[screenStack.length - 1];
    const isRoot = screenStack.length === 1;


    if (els.appHeader) els.appHeader.classList.remove("blue-header");
    if (els.headerRActions) els.headerRActions.innerHTML = "";
    if (els.headerLBtn) els.headerLBtn.onclick = null;

    if (isRoot) {
      if (els.headerLBtn) {
        els.headerLBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
        els.headerLBtn.onclick = window.toggleSideNav;
      }
      if (els.bottomNav) els.bottomNav.classList.remove("hidden");
      
      if (els.headerRActions) {
        els.headerRActions.innerHTML = `
          <button class="icon-btn" onclick="openDashboardMore()">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
          </button>
        `;
      }
    } else {
      if (els.headerLBtn) {
        els.headerLBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`;
        els.headerLBtn.onclick = popScreen;
      }
      if (els.bottomNav) els.bottomNav.classList.add("hidden");
    }

    let title = "Invoice", rActions = "";
    const isEst = state.editorMode === 'estimate';
    const prefix = isEst ? 'EST' : 'SPC';

    if (current === "dashboard") {
      title = "Invoices";
    } else if (current === "estimatesDashboard") {
      title = "Estimates";
    } else if (current === "preview") {
      title = currentInvoice ? ((currentInvoice.invoiceNumber || currentInvoice.estimateNumber || "Document")) : "Preview";
      if (els.appHeader) els.appHeader.classList.remove("blue-header");
      rActions = `
        <div style="display: flex; gap: 12px; align-items: center;">
          <button class="icon-btn" onclick="pushScreen('editor')">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="icon-btn" onclick="screenStack=['dashboard']; renderScreen('dashboard');">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          </button>
          <button class="icon-btn" style="color: #f59e0b;">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12l4 6-10 13L2 9z"></path><path d="M11 3v19M14 9l-4 13M10 9l4 13"></path></svg>
          </button>
        </div>
      `;
    } else if (current === "fullPreview") {
      title = "Preview";
      if (els.appHeader) els.appHeader.classList.add("blue-header");
      const doneAction = "screenStack=['dashboard']; renderScreen('dashboard');";
      rActions = `
        <div style="display: flex; gap: 8px; align-items: center;">
          <button class="icon-btn" onclick="${doneAction}" style="color: white; padding: 4px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </button>
        </div>
      `;
    } else if (current === "editor") {
      const displayNo = currentInvoice ? (currentInvoice.invoiceNumber || currentInvoice.estimateNumber || "0") : "0";
      title = currentInvoice ? (prefix + String(displayNo).padStart(4, "0")) : ("New " + (isEst ? "Estimate" : "Invoice"));
      rActions = `
        <button class="icon-btn" onclick="openEditorMore()">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
        </button>
      `;
    } else if (current === "invoiceInfo") {
      title = (isEst ? "Estimate" : "Invoice") + " Info";
      if (els.appHeader) els.appHeader.classList.add("blue-header");
      rActions = `<button class="header-action" id="saveInvoiceInfoBtn" style="color: white;"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></button>`;
    } else if (current === "businessInfo") {
      title = "Business Info";
      if (els.appHeader) els.appHeader.classList.add("blue-header");
      rActions = `<button class="header-action" id="saveBusinessInfoBtn" style="color: white;"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></button>`;
    } else if (current.includes("Picker") || ["discount", "signaturePicker", "termsPicker", "paymentPicker", "taxPicker", "dateFormat", "numberFormat", "client"].includes(current)) {
      title = current.replace("Picker", "").replace("client", "Client").charAt(0).toUpperCase() + current.replace("Picker", "").replace("client", "Client").slice(1);
      if (title === "Terms") title = "Terms & Conditions";
      if (title === "Dueterms") title = "Due Terms";
      if (title === "Business") title = "Businesses";
      
      if (els.appHeader) els.appHeader.classList.add("blue-header");
      rActions = `<button class="header-action" onclick="popScreen();">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </button>`;
    } else if (current === "sessions") {
      title = "Sessions Tracking";
      if (els.appHeader) els.appHeader.classList.add("blue-header");
      rActions = `<button class="header-action" onclick="window.saveSessions();" style="color: white;">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </button>`;
    } else if (current === "paymentHistory") {
      title = "Payment History";
    } else if (current === "itemForm") {
      title = window.editingItemIndex !== null ? "Edit Item" : "New Item";
      if (els.appHeader) els.appHeader.classList.add("blue-header");
      rActions = `<button class="header-action" id="saveItemBtn" style="color: white;">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </button>`;
    } else if (current === "clientForm") {
      title = window.editingClientId ? "Edit Client" : "New Client";
      if (els.appHeader) els.appHeader.classList.add("blue-header");
      rActions = `<button class="header-action" id="saveClientBtn" style="color: white;">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </button>`;
    } else {
      title = current.charAt(0).toUpperCase() + current.slice(1);
    }

    if (els.headerTitle) els.headerTitle.textContent = title;
    if (rActions && els.headerRActions) {
      els.headerRActions.innerHTML = rActions;
    }
    
    // Mode-specific labels in header
    if (current === "editor" || current === "preview" || current === "invoiceInfo") {
        const docName = state.editorMode === 'estimate' ? 'Estimate' : 'Invoice';
        if (current === "editor" && !currentInvoice) {
            els.headerTitle.textContent = "New " + docName;
        } else if (current === "editor" && currentInvoice) {
            const prefix = state.editorMode === 'estimate' ? 'EST' : 'SPC';
            els.headerTitle.textContent = prefix + String(currentInvoice.invoiceNumber || currentInvoice.estimateNumber || 0).padStart(4, "0");
        } else if (current === "invoiceInfo") {
            els.headerTitle.textContent = docName + " Info";
        }
    }

    if (document.getElementById("saveInvoiceInfoBtn")) setupBtn("saveInvoiceInfoBtn", () => { window.saveInvoiceInfo(); });
    if (document.getElementById("saveBusinessInfoBtn")) setupBtn("saveBusinessInfoBtn", () => { window.saveBusinessInfo(); });
    if (document.getElementById("saveClientBtn")) setupBtn("saveClientBtn", () => { window.saveClient(); });
    if (document.getElementById("saveItemBtn")) setupBtn("saveItemBtn", () => { window.saveItem(); });
    if (document.getElementById("saveSessionBtn")) setupBtn("saveSessionBtn", window.saveSessions);
  } catch (err) {
    console.error("Error in updateHeader:", err);
  }
}

function renderScreen(id) {
  const screens = document.querySelectorAll(".screen");
  screens.forEach(s => s.classList.toggle("active", s.id === id + "Screen"));
  updateHeader();
  if (id === "dashboard") renderDashboard();
  if (id === "preview") generatePreview();
  if (id === "fullPreview") generateFullPreview();
  if (id === "editor") renderEditorHub();
  if (id === "invoiceInfo") renderInvoiceInfo();
  if (id === "templatePicker") renderTemplatePicker();
  if (id === "client") renderClientPicker();
  if (id === "clientForm") renderClientForm(window.editingClientId);
  if (id === "itemForm") renderItemForm(window.editingItemIndex);
  if (id === "discount") renderDiscountScreen();
  if (id === "signaturePicker") renderSignaturePicker();
  if (id === "termsPicker") renderTermsPicker();
  if (id === "taxPicker") renderTaxPicker();
  if (id === "paymentPicker") renderPaymentPicker();
  if (id === "sessions") renderSessionsScreen();
  if (id === "paymentHistory") renderPaymentHistory();
  if (id === "settings") renderSettings();
  if (id === "itemPicker") renderItemPicker();
  if (id === "item") renderItemsList();
  if (id === "businessInfo") renderBusinessInfo();
  if (id === "dateFormat") renderDateFormatPicker();
  if (id === "numberFormat") renderNumberFormatPicker();
  if (id === "estimatesDashboard") renderEstimatesDashboard();
  if (id === "dueTermsPicker") renderDueTermsPicker();  if (id === "businessPicker") renderBusinessPicker();
  if (id === "exportImport") { /* No additional rendering needed for now */ }

  
  // Clinical SOAP screens
  if (id === "prescAssessment") renderPrescAssessment();
  if (id === "prescObjective") renderPrescObjective();
  if (id === "prescInfo") renderPrescInfo();
  if (id === "prescExercises") renderPrescExercises();
  if (id === "prescDoctorPicker") renderPrescDoctorPicker();
  if (id === "prescDoctorForm") renderPrescDoctorForm();
  if (id === "prescInternalNotes") renderPrescInternalNotes();
  if (id === "prescAdvice") renderPrescAdvice();
  if (id === "prescPreview") renderPrescriptionPreview();
  
  // Prescription Module Screens
  if (id === "prescription") renderPrescriptionScreen();
  if (id === "prescriptionEditorHub") renderPrescriptionEditorHub();
  if (id === "prescInfo") renderPrescriptionInfo();
  if (id === "prescExercises") renderPrescriptionExercises();
  if (id === "prescClientPicker") pushScreen('client');
  if (id === "prescDoctorPicker") renderPrescDoctorPicker();
  if (id === "prescDoctorForm") renderPrescDoctorForm();
  if (id === "prescAssessment") renderPrescAssessment();
  if (id === "prescInternalNotes") renderPrescInternalNotes();
}

function renderSettings() {
  const s = state.settings;
  
  // Set values
  const dueTermsEl = document.getElementById("setDueTermsVal");
  if (dueTermsEl) {
    const selectedDueTerm = s.dueTermsList.find(dt => dt.id === s.dueTerms);
    dueTermsEl.textContent = selectedDueTerm ? selectedDueTerm.content : 'None';
  }
  
  const paidStatusEl = document.getElementById("setPaidStatus");
  if (paidStatusEl) {
    paidStatusEl.checked = s.showPaidStatus;
    paidStatusEl.onchange = (e) => {
      state.settings.showPaidStatus = e.target.checked;
      save();
    };
  }
  
  const currencyEl = document.getElementById("setCurrencyVal");
  if (currencyEl) currencyEl.textContent = `${s.currency} ₹`;
  
  const numFormatEl = document.getElementById("setNumberFormatVal");
  if (numFormatEl) numFormatEl.textContent = s.numberFormat;
  
  const dateFormatEl = document.getElementById("setDateFormatVal");
  if (dateFormatEl) dateFormatEl.textContent = s.dateFormat;
  
  // Bind actions
  setupBtn("setBusinessInfo", () => pushScreen("businessInfo"));
  setupBtn("setBusinessSwitch", () => pushScreen("businessPicker"));
  setupBtn("setPaymentMethod", () => pushScreen("paymentPicker"));
  setupBtn("setTerms", () => pushScreen("termsPicker"));
  setupBtn("setDueTerms", () => pushScreen("dueTermsPicker"));
  setupBtn("setTax", () => pushScreen("taxPicker"));
  setupBtn("setSignature", () => pushScreen("signaturePicker"));
}


function renderItemsList() {
  const container = document.getElementById("itemsList");
  if (!container) return;
  container.innerHTML = state.items.map(item => `
    <div class="invoice-card">
      <div class="invoice-info">
        <div class="id">${item.name}</div>
        <div class="sub">${item.unit || "N/A"}</div>
      </div>
      <div class="invoice-meta"><div class="price">${formatINR(item.price)}</div></div>
    </div>
  `).join("");
  
  document.getElementById("addItemBtn").onclick = () => {
    window.editingItemIndex = null;
    pushScreen("itemForm");
  };
}

function renderClientPicker() {
  const container = document.getElementById("clientsList");
  if (!container) return;
  
  const searchText = (document.getElementById("clientSearch")?.value || "").toLowerCase();
  const filtered = state.patients.filter(p => 
    p.name.toLowerCase().includes(searchText) || 
    (p.phone && p.phone.includes(searchText))
  );

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8;">No clients found</div>`;
    return;
  }
  
  container.innerHTML = filtered.map(p => {
    const isSelected = (currentInvoice && currentInvoice.patient && currentInvoice.patient.id === p.id) || (currentPrescription && currentPrescription.patientId === p.id);
    return `
      <div class="picker-card ${isSelected ? 'selected' : ''}" onclick="window.selectClient('${p.id}')">
        <div class="picker-card-checkbox"></div>
        <div class="picker-card-content">
          <div style="font-weight: 700; color: #1e293b;">${p.name}</div>
          <div style="font-size: 0.85rem; color: #64748b;">${p.phone || "No phone"}</div>
        </div>
        <div style="display: flex; gap: 8px; margin-left: auto;">
          <div class="picker-card-edit" onclick="event.stopPropagation(); window.editClient('${p.id}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </div>
          <div class="picker-card-edit" onclick="event.stopPropagation(); window.deleteClient('${p.id}')" style="color: #ef4444;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </div>
        </div>
      </div>
    `;
  }).join("");

  document.getElementById("createNewClientBtn").onclick = () => {
    window.editingClientId = null;
    pushScreen("clientForm");
  };
}

window.renderClientForm = (clientId) => {
  const nameInput = document.getElementById("cfName");
  const emailInput = document.getElementById("cfEmail");
  const phoneInput = document.getElementById("cfPhone");
  const dobInput = document.getElementById("cfDob");
  const b1Input = document.getElementById("cfBillAddr1");
  const b2Input = document.getElementById("cfBillAddr2");
  const s1Input = document.getElementById("cfShipAddr1");
  const s2Input = document.getElementById("cfShipAddr2");
  const detailInput = document.getElementById("cfDetail");

  const ageInput = document.getElementById("cfAge");
  const sexInput = document.getElementById("cfSex");
  const refInput = document.getElementById("cfReferral");

  if (clientId) {
    const p = state.patients.find(x => x.id === clientId);
    if (p) {
      if (nameInput) nameInput.value = p.name || "";
      if (emailInput) emailInput.value = p.email || "";
      if (phoneInput) phoneInput.value = p.phone || "";
      if (dobInput) dobInput.value = p.dob || "";
      if (ageInput) ageInput.value = p.age || "";
      if (sexInput) sexInput.value = p.sex || "";
      if (refInput) refInput.value = p.referral || "";
      if (b1Input) b1Input.value = p.address1 || p.address || "";
      if (b2Input) b2Input.value = p.address2 || "";
      if (s1Input) s1Input.value = p.shipAddress1 || "";
      if (s2Input) s2Input.value = p.shipAddress2 || "";
      if (detailInput) detailInput.value = p.detail || "";
    }
  } else {
    [nameInput, emailInput, phoneInput, dobInput, ageInput, sexInput, refInput, b1Input, b2Input, s1Input, s2Input, detailInput].forEach(el => {
        if (el) el.value = "";
    });
  }
};

window.saveClient = () => {
  const name = document.getElementById("cfName").value.trim();
  if (!name) return alert("Client Name is required");

  const clientData = {
    name,
    email: document.getElementById("cfEmail")?.value?.trim() || "",
    phone: document.getElementById("cfPhone")?.value?.trim() || "",
    dob: document.getElementById("cfDob")?.value?.trim() || "",
    age: document.getElementById("cfAge")?.value?.trim() || "",
    sex: document.getElementById("cfSex")?.value?.trim() || "",
    referral: document.getElementById("cfReferral")?.value?.trim() || "",
    address1: document.getElementById("cfBillAddr1")?.value?.trim() || "",
    address2: document.getElementById("cfBillAddr2")?.value?.trim() || "",
    shipAddress1: document.getElementById("cfShipAddr1")?.value?.trim() || "",
    shipAddress2: document.getElementById("cfShipAddr2")?.value?.trim() || "",
    detail: document.getElementById("cfDetail")?.value?.trim() || ""
  };

  if (window.editingClientId) {
    const p = state.patients.find(x => x.id === window.editingClientId);
    if (p) Object.assign(p, clientData);
  } else {
    const newP = { id: "p" + Date.now(), ...clientData };
    state.patients.push(newP);
  }

  save();
  popScreen();
  renderClientPicker();
};

window.editClient = (id) => {
  window.editingClientId = id;
  pushScreen("clientForm");
};

window.deleteClient = (id) => {
  window.showConfirmModal("Delete Client", "Are you sure you want to delete this client? This will NOT delete their existing invoices.", () => {
    state.patients = state.patients.filter(p => p.id !== id);
    if (currentInvoice && currentInvoice.patient && currentInvoice.patient.id === id) {
        currentInvoice.patient = null;
    }
    save();
    renderClientPicker();
  });
};


window.saveToPhone = () => {
    const name = document.getElementById("cfName").value.trim();
    const phone = document.getElementById("cfPhone").value.trim();
    const email = document.getElementById("cfEmail").value.trim();
    const clinic = state.businesses.find(b => b.id === state.activeBusinessId)?.name || "Clinic Name";

    if (!name || !phone) return alert("Patient Name and Phone are required to create a contact.");

    // Native Bridge: Save to Phone Contacts
    if (window.ReactNativeWebView) {
        NativeBridge.postMessage(JSON.stringify({
            type: 'SAVE_CONTACT',
            payload: { name, phone, email, clinic }
        }));
        return;
    }

    // Web Fallback: Generate vCard
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:${name}
TEL;TYPE=CELL:${phone}
EMAIL:${email}
ORG:${clinic}
NOTE:Patient exported from Invoice Studio
END:VCARD`;

    const blob = new Blob([vcard], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name.replace(/\s+/g, '_')}.vcf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

function pushScreen(id) {
  if (screenStack[screenStack.length - 1] === id) return;
  screenStack.push(id);
  renderScreen(id);
}

function popScreen() {
  if (screenStack.length > 1) {
    screenStack.pop();
    renderScreen(screenStack[screenStack.length - 1]);
  }
}

// Session Management Logic
window.toggleSessionType = (val) => {
  const adv = document.getElementById("sessionsAdvancedArea");
  const cons = document.getElementById("sessConsultationArea");
  if (adv) adv.style.display = (val === 'range') ? 'block' : 'none';
  if (cons) cons.style.display = (val === 'consultation') ? 'block' : 'none';
};

window.changeSessCount = (delta) => {
  // Deprecated - using records now
};

window.addSessionRecordRow = (rowData = {}) => {
  const { date = '', itemId = '', discount = 0 } = rowData;
  const finalDate = date || new Date().toISOString().split("T")[0];
  const itemsHtml = state.items.map(it => `<option value="${it.id}" ${it.id === itemId ? 'selected' : ''}>${it.name} (₹${it.price})</option>`).join("");
  
  const list = document.getElementById("sessionRecordList");
  const div = document.createElement("div");
  div.className = "input-group session-record-row";
  div.style.cssText = "display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; background: #f8fafc; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; position: relative;";
  
  div.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between;">
       <div style="display: flex; align-items: center; gap: 8px;">
         <span class="session-badge" style="font-size: 0.7rem; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: 700; color: #475569;">#${list.children.length + 1}</span>
         <input type="date" class="sess-record-date" value="${finalDate}" style="border: none; background: transparent; font-weight: 700; font-size: 0.85rem; color: var(--primary); outline: none;">
       </div>
       <button class="icon-btn" onclick="this.parentElement.parentElement.remove(); window.reindexSessionRecords();" style="color: #ef4444; padding: 0;">
         <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
       </button>
    </div>
    <div style="display: flex; gap: 8px;">
      <select class="modern-input sess-record-item" style="flex: 2.5; font-size: 0.8rem; padding: 6px;">
        <option value="">Select Service</option>
        ${itemsHtml}
      </select>
      <div style="flex: 1; position: relative;">
        <span style="position: absolute; left: 6px; top: 50%; transform: translateY(-50%); font-size: 0.7rem; color: #94a3b8;">₹</span>
        <input type="number" class="modern-input sess-record-disc" placeholder="Disc" value="${discount || ''}" style="padding: 6px 6px 6px 16px; font-size: 0.8rem;">
      </div>
    </div>
  `;
  list.appendChild(div);
};

window.reindexSessionRecords = () => {
  const rows = document.querySelectorAll(".session-record-row");
  rows.forEach((row, idx) => {
    const badge = row.querySelector(".session-badge");
    if (badge) badge.textContent = `#${idx + 1}`;
  });
};

window.addSessionRangeRow = (from = '', to = '') => {
  const list = document.getElementById("sessionRangeList");
  const div = document.createElement("div");
  div.className = "input-group session-range-row";
  div.style.cssText = "display: flex; gap: 8px; align-items: center; margin-bottom: 12px; background: #f8fafc; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0;";
  div.innerHTML = `
    <div style="flex: 1;">
      <label style="font-size: 0.75rem; color: #64748b; margin-bottom: 4px; display: block;">From</label>
      <input type="date" class="modern-input sess-from" value="${from}" style="padding: 8px;">
    </div>
    <div style="flex: 1;">
      <label style="font-size: 0.75rem; color: #64748b; margin-bottom: 4px; display: block;">To</label>
      <input type="date" class="modern-input sess-to" value="${to}" style="padding: 8px;">
    </div>
    <button class="icon-btn" onclick="this.parentElement.remove()" style="margin-top: 20px; color: #ef4444;">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
    </button>
  `;
  list.appendChild(div);
};

window.renderSessionsScreen = () => {
  if (!currentInvoice) return;
  const sess = currentInvoice.sessions || { type: 'none', dateRanges: [], sessionsPerDay: 1 };
  
  const typeSelect = document.getElementById("sessType");
  const frequencyInput = document.getElementById("sessPerDay");
  const list = document.getElementById("sessionRangeList");
  const recordList = document.getElementById("sessionRecordList");
  
  typeSelect.value = sess.type || (sess.isPayPerSession ? 'consultation' : 'none');
  frequencyInput.value = sess.sessionsPerDay || 1;
  list.innerHTML = "";
  if (recordList) recordList.innerHTML = "";
  
  if (sess.dateRanges) {
    sess.dateRanges.forEach(r => window.addSessionRangeRow(r.from, r.to));
  }
  if (sess.records) {
    sess.records.forEach(r => window.addSessionRecordRow(r));
  }
  
  if (list.children.length === 0 && typeSelect.value === 'range') {
    window.addSessionRangeRow();
  }
  if (recordList && recordList.children.length === 0 && typeSelect.value === 'consultation') {
    window.addSessionRecordRow();
  }
  
  window.toggleSessionType(typeSelect.value);
};

window.saveSessions = () => {
  const type = document.getElementById("sessType").value;
  const frequency = parseInt(document.getElementById("sessPerDay").value) || 1;
  const ranges = [];
  const records = [];
  
  if (type === 'range') {
    const rows = document.querySelectorAll(".session-range-row");
    rows.forEach(row => {
      const from = row.querySelector(".sess-from").value;
      const to = row.querySelector(".sess-to").value;
      if (from && to) ranges.push({ from, to });
    });
  } else if (type === 'consultation') {
    const rows = document.querySelectorAll(".session-record-row");
    // Preserve non-session items if any (future proof)
    let nonSessionItems = (currentInvoice.items || []).filter(it => !it.isSessionRecord);
    let sessionItems = [];
    
    rows.forEach(row => {
      const date = row.querySelector(".sess-record-date").value;
      const itemId = row.querySelector(".sess-record-item").value;
      const discount = parseFloat(row.querySelector(".sess-record-disc").value) || 0;
      
      if (date && itemId) {
        const itemObj = state.items.find(it => it.id === itemId);
        if (itemObj) {
          records.push({ date, itemId, discount });
          sessionItems.push({
            name: `${itemObj.name} (${formatDate(date)})`,
            price: itemObj.price,
            qty: 1,
            discount: discount,
            discountType: 'fixed',
            unit: 'Session',
            isSessionRecord: true
          });
        }
      }
    });
    currentInvoice.items = [...nonSessionItems, ...sessionItems];
  }
  
  currentInvoice.sessions = {
    type,
    isPayPerSession: type === 'consultation',
    dateRanges: ranges,
    records: records,
    sessionsPerDay: frequency
  };
  
  save();
  popScreen();
  renderEditorHub();
};

function renderDashboard() {
  let unpaid = 0;
  let overdue = 0;
  let credit = 0;

  const searchText = (document.getElementById("dashboardSearch")?.value || "").toLowerCase();
  const filter = state.activeFilter || 'all';

  const filteredInvoices = state.invoices.filter(inv => {
    // Search filter
    const patientName = (inv.patient?.name || inv.clientName || inv.patientName || "Unknown").toLowerCase();
    const invNo = (inv.invoiceNumber || inv.number || "").toLowerCase();
    const matchesSearch = patientName.includes(searchText) || invNo.includes(searchText);
    
    if (!matchesSearch) return false;

    // Status filter
    if (filter === "all") return true;
    const total = Number(inv.total) || 0;
    const totalPaid = (inv.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    if (filter === "advance") {
      return totalPaid > total || (totalPaid > 0 && inv.status !== "paid");
    }
    return inv.status === filter;
  });

  state.invoices.forEach(i => {
    const total = Number(i.total) || 0;
    const paid = (i.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    
    if (paid > total) {
      credit += (paid - total);
    } else if (i.status === "paid") {
      // No unpaid/overdue
    } else if (i.status === "overdue") {
      overdue += (total - paid);
    } else {
      unpaid += (total - paid);
    }
  });
  
  els.unpaidVal.textContent = formatINR(unpaid);
  els.overdueVal.textContent = formatINR(overdue);
  els.creditVal.textContent = formatINR(credit);
  
  if (state.invoices.length === 0) {
    els.invoicesList.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8;">No invoices yet</div>`;
    return;
  }

  if (filteredInvoices.length === 0) {
    els.invoicesList.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8;">No invoices found for this search/filter</div>`;
    return;
  }

  els.invoicesList.innerHTML = [...filteredInvoices].reverse().map(inv => {
    const patientName = (inv.patient && inv.patient.name) ? inv.patient.name : (inv.clientName || inv.patientName || "Unknown Client");
    const invNo = inv.invoiceNumber || inv.number || "---";
    const total = Number(inv.total) || 0;
    const paid = (inv.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const balance = total - paid;
    
    let statusLabel = inv.status || "unpaid";
    if (paid > total) statusLabel = "Credit Available";
    else if (statusLabel === "partially_paid") statusLabel = `Partially Paid (₹${paid})`;

    return `
      <div class="invoice-card" onclick="openInvoicePreview('${inv.id}')" style="cursor: pointer;">
        <div class="invoice-info">
          <div class="id">${invNo}</div>
          <div class="sub">${formatDate(inv.date)}</div>
          <div class="client">${patientName}</div>
          <div class="status-badge-container" onclick="event.stopPropagation(); openStatusPicker('${inv.id}')">
            <span class="badge ${paid > total ? 'badge-advance' : 'badge-' + (inv.status || 'unpaid')}">${statusLabel}</span>
          </div>
        </div>
        <div class="invoice-meta">
          <div class="price">${formatINR(total)}</div>
          ${balance > 0 ? `<div style="font-size: 0.75rem; color: #ef4444; margin-top: 4px;">Balance: ${formatINR(balance)}</div>` : ""}
          ${balance < 0 ? `<div style="font-size: 0.8rem; color: #2563eb; font-weight: 700; margin-top: 4px;">Credit: ${formatINR(Math.abs(balance))}</div>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function bindFilters() {
  const btns = document.querySelectorAll(".filter-btn");
  btns.forEach(btn => {
    btn.onclick = () => {
      btns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeFilter = btn.dataset.f;
      renderDashboard();
    };
  });
}

window.openInvoicePreview = (id) => {
  currentInvoice = state.invoices.find(i => i.id === id);
  pushScreen("preview");
};

function renderEditorHub() {
  window.sigTarget = 'invoice';
  const isEst = state.editorMode === 'estimate';
  const prefix = isEst ? 'EST' : 'SPC';
  
  if (!currentInvoice) {
    const activeBus = state.businesses.find(b => b.id === state.activeBusinessId) || state.businesses[0];
    const nextNo = isEst ? nextEstimateNumber() : nextInvoiceNumber();
    currentInvoice = {
      id: (isEst ? "e" : "i") + Date.now(),
      invoiceNumber: nextNo,
      date: new Date().toISOString().split("T")[0],
      language: "English",
      patient: state.patients[0],
      business: activeBus,
      items: [],
      total: 0,
      status: "unpaid",
      discount: 0,
      discountType: "percentage",
      tax: 0,
      shipping: 0,
      currency: "INR",
      notes: "",
      terms: "",
      dueTerms: "none",
      dueDate: "",
      poNumber: "",
      title: "",
      template: "Classic",
      payments: []
    };
  }
  
  if (!currentInvoice.payments) currentInvoice.payments = [];
  if (!currentInvoice.items) currentInvoice.items = [];
  if (!currentInvoice.termsIds) {
    currentInvoice.termsIds = currentInvoice.termsId ? [currentInvoice.termsId] : [];
  }
  if (!currentInvoice.taxIds) currentInvoice.taxIds = [];
  
  if (currentInvoice.tax === undefined) currentInvoice.tax = 0;
  if (currentInvoice.shipping === undefined) currentInvoice.shipping = 0;
  if (currentInvoice.discount === undefined) currentInvoice.discount = 0;
  
  const displayNo = currentInvoice.invoiceNumber || currentInvoice.estimateNumber || "---";
  els.editIdText.textContent = (displayNo.startsWith(prefix) ? "" : prefix) + displayNo;
  els.editDateText.textContent = currentInvoice.date ? formatDate(currentInvoice.date) : "--/--/----";
  els.editorFromText.textContent = currentInvoice.business ? currentInvoice.business.name : "Select Business";
  els.editorToText.textContent = currentInvoice.patient ? currentInvoice.patient.name : "Select Client";
  els.editorItemCount.textContent = (currentInvoice.items || []).length;

  const sig = state.signatures.find(s => s.id === (currentInvoice.signatureId || ""));
  els.editorSignatureVal.innerHTML = sig ? `<img src="${sig.data}" style="max-height: 40px;">` : "Select Signature";
  if (els.signaturePreviewSmall) {
    els.signaturePreviewSmall.src = sig ? sig.data : "";
  }
  
  const selectedTerms = (currentInvoice.termsIds || []).map(id => state.termsList.find(t => t.id === id)).filter(Boolean);
  if (selectedTerms.length === 0) els.editorTermsText.textContent = "Select Terms";
  else if (selectedTerms.length === 1) els.editorTermsText.textContent = selectedTerms[0].content.substring(0, 30) + "...";
  else els.editorTermsText.textContent = `${selectedTerms.length} Terms Selected`;
  
  const pm = state.paymentMethods.find(p => p.id === currentInvoice.paymentMethodId);
  els.editorPaymentText.textContent = pm ? pm.name : "Select Method";
  
  const totalPaid = currentInvoice.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  els.editorPaymentHistoryText.textContent = `${formatINR(totalPaid)} Paid`;
  
  // Subtotal Calculation (Unified Standard)
  const grossSubtotal = currentInvoice.items.reduce((s, i) => s + (Number(i.price) * (Number(i.qty) || 1)), 0);
  
  // Calculate total item-level discounts
  const totalItemDiscount = currentInvoice.items.reduce((s, i) => {
    let base = (Number(i.price) * (Number(i.qty) || 1));
    if (i.discountType === "percentage") return s + (base * (i.discount || 0) / 100);
    return s + (Number(i.discount) || 0);
  }, 0);
  
  const netBeforeGlobal = grossSubtotal - totalItemDiscount;
  
  let globalDiscAmt = currentInvoice.discount || 0;
  if (currentInvoice.discountType === "percentage") {
    globalDiscAmt = (netBeforeGlobal * globalDiscAmt / 100);
  }
  
  const totalDiscount = totalItemDiscount + globalDiscAmt;
  
  document.getElementById("hubSubtotalText").textContent = formatINR(grossSubtotal);
  
  const discDisplay = document.getElementById("hubDiscountText");
  discDisplay.textContent = formatINR(totalDiscount);
  if (currentInvoice.voucherName || totalItemDiscount > 0) {
    let note = "";
    if (currentInvoice.voucherName) note += currentInvoice.voucherName;
    if (totalItemDiscount > 0) note += (note ? " + " : "") + "Item Savings";
    discDisplay.innerHTML += ` <span style="font-size: 0.7rem; color: #94a3b8; font-weight: 400;">(${note})</span>`;
  }

  const selectedTaxes = (currentInvoice.taxIds || []).map(id => state.taxList.find(t => t.id === id)).filter(Boolean);
  let totalTaxAmt = 0;
  if (selectedTaxes.length > 0) {
    totalTaxAmt = selectedTaxes.reduce((s, tax) => s + (netBeforeGlobal * tax.rate / 100), 0);
  } else {
    totalTaxAmt = Number(currentInvoice.tax) || 0;
  }

  document.getElementById("hubTaxText").textContent = formatINR(totalTaxAmt);
  document.getElementById("hubShippingText").textContent = formatINR(currentInvoice.shipping || 0);
  
  currentInvoice.total = netBeforeGlobal - globalDiscAmt + totalTaxAmt + (currentInvoice.shipping || 0);
  els.hubTotalText.textContent = formatINR(currentInvoice.total);

  // Sessions Tracking Summary
  const sess = currentInvoice.sessions || { type: 'none' };
  const sessEl = document.getElementById("editorSessionsText");
  if (sessEl) {
    if (sess.type === 'range' && sess.dateRanges && sess.dateRanges.length > 0) {
      const total = sess.dateRanges.reduce((acc, r) => acc + window.calcDays(r.from, r.to), 0) * (sess.sessionsPerDay || 1);
      sessEl.textContent = `${total} Sessions tracked`;
    } else if (sess.type === 'consultation' || sess.isPayPerSession) {
      const records = sess.records || [];
      const totalSess = records.length;
      const totalPaid = currentInvoice.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      
      const sessionItem = currentInvoice.items.find(i => i.unit === "Session") || currentInvoice.items[0];
      const sessionPrice = sessionItem ? (Number(sessionItem.price) || 0) : 0;
      
      const paidCount = sessionPrice > 0 ? Math.floor(totalPaid / sessionPrice) : 0;
      const pendingCount = Math.max(0, totalSess - paidCount);
      
      sessEl.textContent = `${totalSess} Sessions (${paidCount} Paid, ${pendingCount} Pending)`;
    } else {
      sessEl.textContent = "Not tracking sessions";
    }
  }

  // Render Items List inside Editor
  const itemsList = document.getElementById("editorItemsList");
  if (itemsList) {
    if (currentInvoice.items.length === 0) {
      itemsList.innerHTML = `<div style="padding: 12px; text-align: center; color: #94a3b8; font-size: 0.85rem;">No items added</div>`;
    } else {
      itemsList.innerHTML = currentInvoice.items.map((item, idx) => `
        <div class="preview-item-row">
          <div class="preview-item-info" onclick="editHubItem(${idx})">
            <div class="name">${item.name}</div>
            <div class="details">${item.qty || 1} x ${formatINR(item.price)}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="preview-item-price">${formatINR(item.price * (item.qty || 1))}</div>
            <button class="icon-btn" onclick="deleteItemFromInvoice(event, ${idx})">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `).join("");
    }
  }

  // Bind Editor Actions
  setupBtn("editInfoBtn", () => pushScreen("invoiceInfo"));
  setupBtn("editLangBtn", () => alert("Language translation feature to be added in next update."));
  setupBtn("editTemplateBtn", () => pushScreen("templatePicker"));
  setupBtn("editFromBtn", () => pushScreen("businessInfo"));
  setupBtn("editToBtn", () => pushScreen("client"));
  setupBtn("editItemsBtn", () => {
    pushScreen("itemPicker");
  });
  
  setupBtn("menuItems", () => { window.closeSideNav(); pushScreen("item"); });
  setupBtn("menuExport", () => { window.closeSideNav(); pushScreen("exportImport"); });     
  setupBtn("menuInvoices", () => { window.closeSideNav(); renderScreen("dashboard"); });
  setupBtn("menuReport", () => { window.closeSideNav(); window.renderReportDashboard(); });
  
  setupBtn("editDiscountBtn", () => pushScreen("discount"));
  setupBtn("editTaxBtn", () => pushScreen("taxPicker"));
  setupBtn("editTermsBtn", () => pushScreen("termsPicker"));
  setupBtn("editPaymentBtn", () => pushScreen("paymentPicker"));
  setupBtn("editSignatureBtn", () => pushScreen("signaturePicker"));
  
  setupBtn("editSessionsBtn", () => {
    window.renderSessionsScreen();
    pushScreen("sessions");
  });

  // New Triggers
  setupBtn("editPaymentHistoryBtn", () => pushScreen("paymentHistory"));

  setupBtn("btnEditPreview", () => {
    pushScreen("preview");
    generatePreview();
  });
}

window.editingItemIndex = null;
window.renderItemForm = (index) => {
  const nameIn = document.getElementById("ifName");
  const priceIn = document.getElementById("ifPrice");
  const qtyIn = document.getElementById("ifQty");
  const unitIn = document.getElementById("ifUnit");
  const discIn = document.getElementById("ifDiscount");
  const discTypeIn = document.getElementById("ifDiscountType");
  const voucherIn = document.getElementById("ifVoucherName");
  const taxIn = document.getElementById("ifTax");
  const totalDisplay = document.getElementById("ifTotal");

  if (index !== null && currentInvoice.items[index]) {
    const it = currentInvoice.items[index];
    nameIn.value = it.name || "";
    priceIn.value = it.price || "";
    qtyIn.value = it.qty || 1;
    unitIn.value = it.unit || "";
    discIn.value = it.discount || "";
    discTypeIn.value = it.discountType || "percentage";
    voucherIn.value = it.voucherName || "";
    taxIn.value = it.tax || "";
  } else {
    [nameIn, priceIn, unitIn, discIn, voucherIn, taxIn].forEach(el => {
        if (el) el.value = "";
    });
    qtyIn.value = 1;
    discTypeIn.value = "percentage";
  }

  const calc = () => {
    const p = parseFloat(priceIn.value) || 0;
    const q = parseFloat(qtyIn.value) || 0;
    const d = parseFloat(discIn.value) || 0;
    const t = parseFloat(taxIn.value) || 0;
    const dt = discTypeIn.value;

    let sub = p * q;
    if (dt === "percentage") sub -= (sub * d / 100);
    else sub -= d;
    
    sub += (sub * t / 100);
    totalDisplay.textContent = formatINR(sub);
  };

  [priceIn, qtyIn, discIn, discTypeIn, taxIn].forEach(el => el.oninput = calc);
  calc();
};

window.saveItem = () => {
  const name = document.getElementById("ifName").value.trim();
  if (!name) return alert("Item name is required");

  const itemData = {
    name,
    price: parseFloat(document.getElementById("ifPrice").value) || 0,
    qty: parseFloat(document.getElementById("ifQty").value) || 1,
    unit: document.getElementById("ifUnit").value.trim(),
    discount: parseFloat(document.getElementById("ifDiscount").value) || 0,
    discountType: document.getElementById("ifDiscountType").value,
    voucherName: document.getElementById("ifVoucherName").value.trim(),
    tax: parseFloat(document.getElementById("ifTax").value) || 0
  };

  if (window.editingItemIndex !== null) {
    if (currentInvoice) currentInvoice.items[window.editingItemIndex] = itemData;
  } else {
    // New Item: Add to global catalog first
    const catalogItem = { 
      id: "i" + Date.now(), 
      name: itemData.name, 
      price: itemData.price, 
      unit: itemData.unit 
    };
    state.items.push(catalogItem);
    
    // If we're editing an invoice, also add this specific instance to the invoice
    if (currentInvoice) {
      currentInvoice.items.push(itemData);
    }
  }

  save();
  popScreen();
};

window.editHubItem = (index) => {
  window.editingItemIndex = index;
  pushScreen("itemForm");
};

window.renderDiscountScreen = () => {
  if (!currentInvoice) return;
  document.getElementById("invDiscount").value = currentInvoice.discount || "";
  document.getElementById("invDiscountType").value = currentInvoice.discountType || "fixed";
  document.getElementById("invVoucherName").value = currentInvoice.voucherName || "";
};

window.saveDiscount = () => {
  if (!currentInvoice) return;
  currentInvoice.discount = parseFloat(document.getElementById("invDiscount").value) || 0;
  currentInvoice.discountType = document.getElementById("invDiscountType").value;
  currentInvoice.voucherName = document.getElementById("invVoucherName").value.trim();
  
  save();
  popScreen();
  renderEditorHub();
};

window.renderSignaturePicker = () => {
  // Open the signature options modal instead of direct file upload
  setupBtn("btnNewSignature", () => { window.showSignatureOptions(); });

  const container = document.getElementById("signatureListContainer");
  if (!container) return;
  container.innerHTML = "";

  if (state.signatures.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8; font-size: 0.9rem;">No signatures found. Click above to add.</div>`;
    return;
  }

  state.signatures.forEach(sig => {
    const card = document.createElement("div");
    card.className = "section-card no-margin";
    card.style.cssText = "display: flex; align-items: center; padding: 12px; margin-bottom: 12px; border-radius: 12px; background: #f8fafc; box-shadow: var(--shadow-sm); border: 2px solid transparent;";
    const isSelected = currentInvoice && currentInvoice.signatureId === sig.id;
    if (isSelected) card.style.borderColor = "var(--primary)";
    card.innerHTML = `
      <div style="flex: 1; display: flex; align-items: center; justify-content: center; height: 80px; background: #f8fafc; border-radius: 10px; overflow: hidden; cursor: pointer; padding: 8px;" onclick="window.selectSignature('${sig.id}')">
        <img src="${sig.data}" style="max-height: 100%; max-width: 100%; object-fit: contain;"/>
      </div>
      <button class="icon-btn" style="color: #ef4444; width: 48px; height: 48px; margin-left: 8px;" onclick="window.deleteSignature('${sig.id}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    `;
    container.appendChild(card);
  });
};

window.selectSignature = (id) => {
  if (window.sigTarget === 'doctor') {
    const sig = state.signatures.find(s => s.id === id);
    if (sig) {
      window.tempSigId = id;
      window.tempSigData = sig.data;
    }
    popScreen();
  } else {
    // Default to invoice
    if (currentInvoice) {
      currentInvoice.signatureId = id;
      renderEditorHub();
    }
  }
  renderSignaturePicker();
};

// Signature Workflow Functions
window.showSignatureOptions = () => {
  const modal = document.getElementById("sigOptionsModal");
  if (modal) modal.classList.add("active");
};

window.closeSigOptions = () => {
  const modal = document.getElementById("sigOptionsModal");
  if (modal) modal.classList.remove("active");
};

window.openSignaturePad = () => {
  window.closeSigOptions();
  const pad = document.getElementById("sigPadModal");
  if (pad) pad.classList.add("active");
  const canvas = document.getElementById("sigCanvas");
  if (canvas) {
    // Must set pixel dimensions AFTER the modal is visible
    requestAnimationFrame(() => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width || 400;
      canvas.height = rect.height || 220;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let drawing = false;
      const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
        const y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
        return { x, y };
      };
      const start = (e) => { drawing = true; const pos = getPos(e); ctx.beginPath(); ctx.moveTo(pos.x, pos.y); e.preventDefault(); };
      const draw = (e) => { if (!drawing) return; const pos = getPos(e); ctx.lineTo(pos.x, pos.y); ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke(); e.preventDefault(); };
      const stop = (e) => { drawing = false; };
      canvas.addEventListener("mousedown", start);
      canvas.addEventListener("touchstart", start, { passive: false });
      canvas.addEventListener("mousemove", draw);
      canvas.addEventListener("touchmove", draw, { passive: false });
      canvas.addEventListener("mouseup", stop);
      canvas.addEventListener("mouseleave", stop);
      canvas.addEventListener("touchend", stop);
    });
  }
};

window.closeSigPad = () => {
  const pad = document.getElementById("sigPadModal");
  if (pad) pad.classList.remove("active");
};

window.clearSigCanvas = () => {
  const canvas = document.getElementById("sigCanvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
};

window.saveSigFromPad = () => {
  const canvas = document.getElementById("sigCanvas");
  if (!canvas) return;
  const dataUrl = canvas.toDataURL("image/png");
  const id = "sig_" + Date.now();
  state.signatures.push({ id, data: dataUrl });
  save();
  window.closeSigPad();
  renderSignaturePicker();
};

window.handleSigGallery = () => {
  // Trigger hidden file input for image selection
  const input = document.getElementById("sigUploadInput");
  if (input) input.click();
};

window.handleSigCamera = () => {
  // Use the same file input with capture attribute if supported
  const input = document.getElementById("sigUploadInput");
  if (input) {
    input.setAttribute("capture", "environment");
    input.click();
    // Reset capture attribute after use
    setTimeout(() => input.removeAttribute("capture"), 1000);
  }
};

// Global listener for sigUploadInput, now that it's not inside renderSignaturePicker
const sigUploadInput = document.getElementById("sigUploadInput");
if (sigUploadInput) {
  sigUploadInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const id = "sig_" + Date.now();
        state.signatures.push({ id, data: event.target.result });
        save();
        renderSignaturePicker();
      };
      reader.readAsDataURL(file);
    }
    e.target.value = ""; 
  };
}

window.deleteSignature = (id) => {
  window.showConfirmModal("Delete Signature", "Are you sure you want to delete this signature?", () => {
    state.signatures = state.signatures.filter(s => s.id !== id);
    if (currentInvoice && currentInvoice.signatureId === id) currentInvoice.signatureId = "";
    save();
    renderSignaturePicker();
  });
};

window.renderTermsPicker = () => {
  setupBtn("btnNewTerms", () => {
    window.showInputModal("New Terms & Conditions", "Enter payment terms, cancellation policy, etc...", "", (val) => {
      const id = "t_" + Date.now();
      state.termsList.push({ id, content: val });
      save();
      renderTermsPicker();
    });
  });

  const container = document.getElementById("termsListContainer");
  if (!container) return;
  container.innerHTML = "";
  
  if (state.termsList.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8; font-size: 0.9rem;">No terms found. Click above to add.</div>`;
    return;
  }

  console.log("Rendering Terms Picker, selected count:", (currentInvoice?.termsIds || []).length);
  state.termsList.forEach(t => {
    const card = document.createElement("div");
    card.className = "section-card no-margin";
    card.style.cssText = "display: flex; align-items: center; padding: 16px; margin-bottom: 12px; border-radius: 12px; background: white; box-shadow: var(--shadow-sm); border: 1px solid transparent; cursor: pointer;";
    
    // Support multi-selection
    const isSelected = currentInvoice && (currentInvoice.termsIds || []).includes(t.id);
    if (isSelected) card.style.borderColor = "var(--primary)";

    card.innerHTML = `
      <div style="width: 24px; height: 24px; border-radius: 6px; border: 2px solid ${isSelected ? 'var(--primary)' : '#e2e8f0'}; background: ${isSelected ? 'var(--primary)' : 'transparent'}; display: flex; align-items: center; justify-content: center; transition: all 0.2s; margin-right: 12px;" onclick="window.selectTerms('${t.id}')">
           ${isSelected ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
      </div>
      <div style="flex: 1;" onclick="window.selectTerms('${t.id}')">
        <div style="font-weight: 700; color: #1e293b; margin-bottom: 4px;">Terms & Conditions</div>
        <div style="font-size: 0.85rem; color: #64748b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${t.content}</div>
      </div>
      <button class="icon-btn" style="color: #64748b; width: 44px; height: 44px; margin-left: 8px;" onclick="window.openTermsOptions('${t.id}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="4.5" r="1.5"/><circle cx="12" cy="19.5" r="1.5"/></svg>
      </button>
    `;
    container.appendChild(card);
  });
};

window.selectTerms = (id) => {
  if (currentInvoice) {
    if (!currentInvoice.termsIds) currentInvoice.termsIds = currentInvoice.termsId ? [currentInvoice.termsId] : [];
    const idx = currentInvoice.termsIds.indexOf(id);
    if (idx >= 0) {
      currentInvoice.termsIds.splice(idx, 1);
    } else {
      currentInvoice.termsIds.push(id);
    }
    // Maintain legacy termsId for single selection compat
    currentInvoice.termsId = currentInvoice.termsIds[0] || "";
    save();
    renderEditorHub();
  }
  renderTermsPicker();
};

window.openTermsOptions = (id) => {
  const t = state.termsList.find(x => x.id === id);
  showBottomSheet("Terms Options", [
    { label: "Edit", action: `window.editTerms('${id}')` },
    { label: "Delete", action: `window.deleteTerms('${id}')` }
  ]);
};

window.editTerms = (id) => {
  hideBottomSheet();
  const t = state.termsList.find(x => x.id === id);
  window.showInputModal("Edit Terms & Conditions", "", t.content, (newVal) => {
    t.content = newVal;
    save();
    renderTermsPicker();
  });
};

window.deleteTerms = (id) => {
  hideBottomSheet();
  window.showConfirmModal("Delete Terms", "Delete these Terms & Conditions?", () => {
    state.termsList = state.termsList.filter(x => x.id !== id);
    if (currentInvoice && currentInvoice.termsId === id) currentInvoice.termsId = "";
    save();
    renderTermsPicker();
  });
};

window.renderDueTermsPicker = () => {
  setupBtn("btnNewDueTerms", () => {
    window.showInputModal("New Due Terms", "e.g. Net 30, Due on Receipt", "", (val) => {
      const id = "dt_" + Date.now();
      state.settings.dueTermsList.push({ id, content: val });
      save();
      renderDueTermsPicker();
    });
  });

  const container = document.getElementById("dueTermsListContainer");
  if (!container) return;
  container.innerHTML = "";
  
  if (state.settings.dueTermsList.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8; font-size: 0.9rem;">No due terms found. Click above to add.</div>`;
    return;
  }

  console.log("Rendering Due Terms Picker, selected ID:", state.settings.dueTerms);
  state.settings.dueTermsList.forEach(t => {
    const card = document.createElement("div");
    card.className = "section-card no-margin";
    card.style.cssText = "display: flex; align-items: center; padding: 16px; margin-bottom: 12px; border-radius: 12px; background: white; box-shadow: var(--shadow-sm); border: 1px solid transparent; cursor: pointer;";
    const isSelected = state.settings.dueTerms === t.id;
    if (isSelected) card.style.borderColor = "var(--primary)";

    card.innerHTML = `
      <div style="width: 24px; height: 24px; border-radius: 6px; border: 2px solid ${isSelected ? 'var(--primary)' : '#e2e8f0'}; background: ${isSelected ? 'var(--primary)' : 'transparent'}; display: flex; align-items: center; justify-content: center; transition: all 0.2s; margin-right: 12px;" onclick="window.selectDueTerms('${t.id}')">
           ${isSelected ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
      </div>
      <div style="flex: 1;" onclick="window.selectDueTerms('${t.id}')">
        <div style="font-weight: 700; color: #1e293b; margin-bottom: 4px;">Due Terms</div>
        <div style="font-size: 0.85rem; color: #64748b;">${t.content}</div>
      </div>
      <button class="icon-btn" style="color: #64748b; width: 44px; height: 44px; margin-left: 8px;" onclick="window.deleteDueTerms('${t.id}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    `;
    container.appendChild(card);
  });
};

window.selectDueTerms = (id) => {
  const isGlobal = screenStack[screenStack.length - 2] === 'settings';
  if (isGlobal) {
    state.settings.dueTerms = id;
    save();
    renderSettings();
    popScreen();
  } else {
    if (currentInvoice) {
      currentInvoice.dueTerms = id;
      save();
      renderInvoiceInfo();
    }
    popScreen();
  }
};

window.deleteDueTerms = (id) => {
  window.showConfirmModal("Delete Due Term", "Delete this due term?", () => {
    state.settings.dueTermsList = state.settings.dueTermsList.filter(x => x.id !== id);
    if (state.settings.dueTerms === id) state.settings.dueTerms = 'none';
    save();
    renderDueTermsPicker();
    renderSettings();
  });
};

window.renderPaymentPicker = () => {
  setupBtn("btnNewPaymentMethod", () => window.showPaymentForm());

  const container = document.getElementById("paymentListContainer");
  if (!container) return;
  container.innerHTML = "";
  
  if (state.paymentMethods.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8; font-size: 0.9rem;">No payment methods found. Click above to add.</div>`;
    return;
  }

  console.log("Rendering Payment Picker, selected ID:", currentInvoice?.paymentMethodId);
  state.paymentMethods.forEach(pm => {
    const card = document.createElement("div");
    card.className = "section-card no-margin";
    card.style.cssText = "display: flex; align-items: center; padding: 16px; margin-bottom: 12px; border-radius: 12px; background: white; box-shadow: var(--shadow-sm); border: 2px solid transparent; cursor: pointer;";
    const isSelected = currentInvoice && currentInvoice.paymentMethodId === pm.id;
    if (isSelected) card.style.borderColor = "var(--primary)";

    card.onclick = (e) => {
      if (e.target.closest('button')) return;
      if (currentInvoice) {
        currentInvoice.paymentMethodId = pm.id;
        save();
        renderEditorHub();
      }
      renderPaymentPicker();
    };

    card.innerHTML = `
      <div style="width: 24px; height: 24px; border-radius: 6px; border: 2px solid ${isSelected ? 'var(--primary)' : '#e2e8f0'}; background: ${isSelected ? 'var(--primary)' : 'transparent'}; display: flex; align-items: center; justify-content: center; transition: all 0.2s; margin-right: 12px;">
           ${isSelected ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
      </div>
      <div style="flex: 1;">
        <div style="font-weight: 700; color: #1e293b;">${pm.name}</div>
        <div style="font-size: 0.8rem; color: #64748b;">Active Payment Method</div>
      </div>
      <button class="icon-btn" style="color: #64748b; width: 44px; height: 44px; margin-left: 8px;" onclick="window.openPaymentOptions('${pm.id}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="4.5" r="1.5"/><circle cx="12" cy="19.5" r="1.5"/></svg>
      </button>
    `;
    container.appendChild(card);
  });
};

window.showPaymentForm = (id = null) => {
  const pm = id ? state.paymentMethods.find(x => x.id === id) : { name: "" };
  const overlay = document.getElementById("formModalOverlay");
  const container = document.getElementById("formModalContainer");
  
  container.innerHTML = `
    <div class="form-modal-content">
      <div class="form-modal-title">${id ? 'Edit' : 'New'} Payment Method</div>
      <div class="form-modal-group">
        <label class="form-modal-label">Payment Method Name</label>
        <input type="text" id="pmNameInput" class="form-modal-input" placeholder="e.g. Cash, GPay, Bank Transfer" value="${pm.name}">
      </div>
      <div class="form-modal-actions">
        <button class="form-modal-btn" onclick="window.hideFormModal()">CANCEL</button>
        <button class="form-modal-btn" onclick="window.savePaymentMethodData('${id || ''}')">SAVE</button>
      </div>
    </div>
  `;
  overlay.classList.add("active");
};

window.savePaymentMethodData = (id) => {
  const name = document.getElementById("pmNameInput").value.trim();
  if (!name) return alert("Name cannot be empty");
  
  if (id) {
    const pm = state.paymentMethods.find(x => x.id === id);
    if (pm) pm.name = name;
  } else {
    state.paymentMethods.push({ id: "pm_" + Date.now(), name });
  }
  save();
  window.hideFormModal();
  renderPaymentPicker();
};

window.openPaymentOptions = (id) => {
  showBottomSheet("Payment Options", [
    { label: "Edit", action: `window.editPaymentMethod('${id}')` },
    { label: "Delete", action: `window.deletePaymentMethod('${id}')` }
  ]);
};

window.editPaymentMethod = (id) => {
  hideBottomSheet();
  window.showPaymentForm(id);
};

window.deletePaymentMethod = (id) => {
  hideBottomSheet();
  window.showConfirmModal("Delete Payment Method", "Are you sure you want to delete this payment method?", () => {
    state.paymentMethods = state.paymentMethods.filter(x => x.id !== id);
    if (currentInvoice && currentInvoice.paymentMethodId === id) currentInvoice.paymentMethodId = "";
    save();
    renderPaymentPicker();
  });
};

function nextInvoiceNumber() {
  if (state.invoices.length === 0) return "SPC00001";
  const nums = state.invoices.map(inv => {
    const match = String(inv.invoiceNumber || "").match(/\d+$/);
    return match ? parseInt(match[0]) : 0;
  });
  const max = Math.max(...nums);
  return "SPC" + String(max + 1).padStart(5, "0");
}

function nextEstimateNumber() {
  if (state.estimates.length === 0) return "EST00001";
  const nums = state.estimates.map(est => {
    const match = String(est.invoiceNumber || est.estimateNumber || "").match(/\d+$/);
    return match ? parseInt(match[0]) : 0;
  });
  const max = Math.max(...nums);
  return "EST" + String(max + 1).padStart(5, "0");
}

function renderEstimatesDashboard() {
  const container = document.getElementById("estimatesList");
  if (!container) return;

  const searchText = (document.getElementById("estimatesSearch")?.value || "").toLowerCase();
  const filtered = state.estimates.filter(est => {
    const patientName = (est.patient?.name || est.clientName || "Unknown").toLowerCase();
    const estNo = (est.invoiceNumber || est.estimateNumber || "").toLowerCase();
    return patientName.includes(searchText) || estNo.includes(searchText);
  });

  if (state.estimates.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8;">No estimates yet</div>`;
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8;">No estimates found</div>`;
    return;
  }

  container.innerHTML = [...filtered].reverse().map(est => {
    const patientName = est.patient ? est.patient.name : (est.clientName || "Unknown Client");
    const estNo = est.invoiceNumber || est.estimateNumber || "---";
    const total = Number(est.total) || 0;
    
    return `
      <div class="invoice-card" onclick="window.openEstimate('${est.id}')" style="cursor: pointer;">
        <div class="invoice-info">
          <div class="id" style="color: #f59e0b;">${estNo}</div>
          <div class="sub">${formatDate(est.date)}</div>
          <div class="client">${patientName}</div>
          <span class="badge badge-unpaid">Estimate</span>
        </div>
        <div class="invoice-meta">
          <div class="price">${formatINR(total)}</div>
        </div>
      </div>
    `;
  }).join("");
}

window.openEstimate = (id) => {
  currentInvoice = state.estimates.find(e => e.id === id);
  state.editorMode = 'estimate';
  pushScreen("preview");
};


// Session Tracking logic moved to bottom for clarity

window.renderPaymentHistory = () => {
  const container = document.getElementById("paymentHistoryContainer");
  if (!container) return;
  container.innerHTML = "";
  
  if (!currentInvoice.payments) currentInvoice.payments = [];
  
  if (currentInvoice.payments.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 20px; color: #94a3b8;">No payments recorded</div>`;
  }
  
  currentInvoice.payments.forEach((p, idx) => {
    const card = document.createElement("div");
    card.className = "invoice-card"; // Using invoice-card for better spacing
    card.style.display = "flex";
    card.style.justifyContent = "space-between";
    card.style.alignItems = "center";
    card.style.padding = "16px";
    card.style.marginBottom = "10px";
    card.innerHTML = `
      <div>
        <div style="font-weight: 800; color: #1e293b; font-size: 1.1rem;">${formatINR(p.amount)}</div>
        <div style="font-size: 0.85rem; color: #64748b; margin-top: 4px;">${formatDate(p.date)} • ${(p.method === 'Correction' || !p.method) ? 'Payment' : p.method === 'Advance Full' ? 'Full Payment' : p.method}</div>
      </div>
      <button class="icon-btn" onclick="window.deleteHistoryPayment(${idx})">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    `;
    container.appendChild(card);
  });

  // Refactored to use the modern payment screen
  setupBtn("btnAddPayment", () => {
    if (!currentInvoice) return;
    document.getElementById("paAmount").value = "";
    document.getElementById("paDate").value = new Date().toISOString().split('T')[0];
    document.getElementById("paNote").value = "";
    // Reset method tabs
    document.querySelectorAll('.method-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.method-tab[data-m="UPI"]').classList.add('active');
    window.selectedMethod = "UPI";
    pushScreen("paymentAddScreen");
  });
};

window.selectedMethod = "UPI";
window.selectPaymentMethod = (m) => {
    window.selectedMethod = m;
    document.querySelectorAll('.method-tab').forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-m') === m);
    });
};

window.savePaymentEntry = () => {
    if (!currentInvoice) return;
    const amt = parseFloat(document.getElementById("paAmount").value);
    if (isNaN(amt) || amt <= 0) return alert("Please enter a valid amount");
    
    const date = document.getElementById("paDate").value || new Date().toISOString().split('T')[0];
    const method = window.selectedMethod || "UPI";
    const note = document.getElementById("paNote").value.trim();
    
    if (!currentInvoice.payments) currentInvoice.payments = [];
    currentInvoice.payments.push({ amount: amt, date, method, note });
    
    // Auto-update status
    const total = currentInvoice.total || 0;
    const paid = currentInvoice.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    if (paid >= total) currentInvoice.status = "paid";
    else if (paid > 0) currentInvoice.status = "partially_paid";
    
    save();
    alert("Payment Record Saved!");
    popScreen();
    window.renderPaymentHistory();
    renderEditorHub();
};

window.deleteHistoryPayment = (idx) => {
  currentInvoice.payments.splice(idx, 1);
  
  // Recalculate status after deletion
  const totalPaid = (currentInvoice.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  if (totalPaid <= 0) {
    currentInvoice.status = "unpaid";
  } else if (totalPaid < currentInvoice.total) {
    currentInvoice.status = "partially_paid";
  }

  save();
  window.renderPaymentHistory();
  renderEditorHub();
};

window.addToGoogleCalendar = () => {
  if (!currentInvoice || !currentInvoice.sessions.startDate) {
    return alert("Please set a Session Start Date first.");
  }
  const start = currentInvoice.sessions.startDate.replace(/-/g, '');
  const end = start; // Same day for now
  const title = encodeURIComponent(`Physio Session: ${currentInvoice.patient.name}`);
  const details = encodeURIComponent(`Invoce: ${currentInvoice.invoiceNumber}\nSessions: ${currentInvoice.sessions.done}/${currentInvoice.sessions.total}`);
  const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}`;
  window.open(url, '_blank');
};

async function generatePreview() {
  console.log("Starting generatePreview...");
  const frame = document.getElementById("pdfFrame");
  if (!frame) {
    console.error("CRITICAL: pdfFrame element not found!");
    return;
  }

  // Use state.invoices[0] as fallback if currentInvoice is missing (e.g., page refresh)
  if (!currentInvoice && state.invoices.length > 0) {
    currentInvoice = state.invoices[0];
  }
  const pName = (currentInvoice.patient && currentInvoice.patient.name) ? currentInvoice.patient.name : (currentInvoice.clientName || currentInvoice.patientName || "Unknown Client");
  console.log(`Generating preview for client: ${pName}`);

  // Use the helper to generate the high-fidelity invoice content
  generateInvoiceHTML(frame);
  console.log("HTML successfully injected into pdfFrame.");
  
  // Populate Stage Details Banner (Screenshot 2)
  const pNameEl = document.getElementById("previewClientName");
  const pStatusEl = document.getElementById("previewStatusBadge");
  const pTotalEl = document.getElementById("previewTotalAmount");
  
  if (pNameEl) pNameEl.textContent = pName;
  if (pStatusEl) {
    const status = String(currentInvoice.status || "unpaid");
    pStatusEl.textContent = status.replace(/_/g, " ").charAt(0).toUpperCase() + status.replace(/_/g, " ").slice(1);
    pStatusEl.className = status === 'paid' ? 'badge-android-paid' : 'badge-android-unpaid';
  }
  const total = Number(currentInvoice.total) || 0;
  if (pTotalEl) pTotalEl.textContent = formatINR(total);

  // Apply Scaling to Fit Screen
  setTimeout(() => {
    window.applyPreviewScaling(false);
    window.fitInvoiceToPage("pdfContent");
  }, 50);

  // Bind Stage Details Actions (Screenshot 2)
  setupBtn("btnDetailsShare", () => window.shareDocumentNative());
  setupBtn("btnDetailsSend", () => window.shareDocumentNative());
  setupBtn("btnDetailsPrint", () => {
    window.fitInvoiceToPage().then(() => window.print());
  });
  setupBtn("btnDetailsMore", () => {
    window.openPreviewMore();
  });

  window.addEventListener('resize', window.applyPreviewScaling);
}

async function generateFullPreview() {
  const frame = document.getElementById("fullPdfFrame");
  if (!frame) return;

  // Use the helper with isFull=true
  generateInvoiceHTML(frame, true);

  // Bind Full Preview Actions
  setupBtn("btnFullSend", () => window.exportPdf().then(() => alert("PDF generated. You can now send it via your email client.")));
  setupBtn("btnFullPrint", () => window.fitInvoiceToPage("fullPdfContent").then(() => window.print()));
  setupBtn("btnFullExport", () => window.exportPdf());
  setupBtn("btnFullShare", async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Invoice',
          text: 'Check out this invoice',
          url: window.location.href
        });
      } catch (err) {
        window.exportPdf();
      }
    } else {
      window.exportPdf();
    }
  });

  // Apply Scaling
  setTimeout(() => window.applyPreviewScaling(true), 10);
  window.fitInvoiceToPage("fullPdfContent");
  console.log("Full Preview Stage 2 Generated and Actions Bound");
}

function generateInvoiceHTML(container, isFull = false) {
  try {
    console.log(`[RENDER] Generating Invoice HTML. Container: ${container?.id}, isFull: ${isFull}`);
    if (!container) { console.error("[RENDER] Container is null!"); return; }
  if (!currentInvoice.items) currentInvoice.items = [];
  
  const activeBus = (state.businesses || []).find(b => b.id === state.activeBusinessId);
  const bus = activeBus || currentInvoice.business || state.businesses[0];
  const pName = (currentInvoice.patient && currentInvoice.patient.name) ? currentInvoice.patient.name : (currentInvoice.clientName || currentInvoice.patientName || "Unknown Client");
  const invNo = currentInvoice.invoiceNumber || currentInvoice.number || "---";
  const grossSubtotal = currentInvoice.items.reduce((s, i) => s + (Number(i.price) * (Number(i.qty) || 1)), 0);
  const totalItemDiscount = currentInvoice.items.reduce((s, i) => {
    let base = (Number(i.price) * (Number(i.qty) || 1));
    if (i.discountType === "percentage") return s + (base * (i.discount || 0) / 100);
    if (i.discount) return s + Number(i.discount);
    return s;
  }, 0);
  
  const netBeforeGlobal = grossSubtotal - totalItemDiscount;
  let globalDiscAmt = currentInvoice.discount || 0;
  if (currentInvoice.discountType === "percentage") globalDiscAmt = (netBeforeGlobal * globalDiscAmt / 100);
  
  const totalDiscount = totalItemDiscount + globalDiscAmt;
  const payments = currentInvoice.payments || [];
  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const sigId = currentInvoice.signatureId || "";
  const sig = (state.signatures || []).find(s => s.id === sigId);
  const selectedTerms = (currentInvoice.termsIds || []).map(id => (state.termsList || []).find(t => t.id === id)).filter(Boolean);
  const selectedTaxes = (currentInvoice.taxIds || []).map(id => (state.taxList || []).find(t => t.id === id)).filter(Boolean);

  let headerTitle = currentInvoice.title || (state.editorMode === 'estimate' ? "Estimate" : "Invoice");
  if (!currentInvoice.title) {
    const sess = currentInvoice.sessions || {};
    if (sess.isPayPerSession) {
      headerTitle = "Consultation / Pay Per Session";
    } else if (sess.dateRanges && sess.dateRanges.length > 0) {
      const parts = sess.dateRanges.filter(r => r.from && r.to).map(r => {
        const days = window.calcDays(r.from, r.to),
              sessionsPerDay = sess.sessionsPerDay || 1;
        return `${formatDate(r.from)} to ${formatDate(r.to)} (${days * sessionsPerDay} Sessions)`;
      });
      if (parts.length > 0) {
        headerTitle = `<span style="font-size: 0.6em; color: #64748b; font-weight: 700; text-transform: uppercase;">Sessions</span><br><div style="font-size: 0.65em; line-height: 1.3; margin-top: 4px;">${parts.join("<br>")}</div>`;
        const totalCalculated = sess.dateRanges.reduce((acc, r) => acc + window.calcDays(r.from, r.to), 0) * (sess.sessionsPerDay || 1);
        if (sess.sessionsPerDay > 1) {
          headerTitle += `<div style="font-size: 0.45em; opacity: 0.8; margin-top: 4px; font-weight: 600;">Frequency: ${sess.sessionsPerDay} per day | Total: ${totalCalculated} sessions</div>`;
        }
      }
    }
  }

  const scalerId = isFull ? "fullPdfScaler" : "pdfScaler";
  const contentId = isFull ? "fullPdfContent" : "pdfContent";

  container.innerHTML = `
    <div class="pdf-scaler" id="${scalerId}">
      <div class="temp-container" id="${contentId}">
      ${(currentInvoice.status === 'paid' && state.settings.showPaidStatus) ? '<div class="temp-stamp">PAID</div>' : ''}
      
      <div class="temp-header">
        <div class="temp-bus-info">
          <img src="${bus.logo || 'https://via.placeholder.com/150?text=LOGO'}" class="temp-logo">
          <div class="temp-bus-details">
            <h1>${bus.name}</h1>
            <p>${(bus.address || "").replace(/\n/g, "<br>")}</p>
            <p>${bus.phone || ""}</p>
            <p>${bus.email || ""}</p>
          </div>
        </div>
        <div class="temp-title">${headerTitle}</div>
      </div>
      
      <div class="temp-info-grid">
        <div class="temp-info-content">
          <div class="temp-info-label">Bill To</div>
          <p style="font-size: 1.2rem; font-weight: 800; margin-bottom: 4px;">${pName}</p>
          <div style="font-size: 0.85rem; color: #64748b; margin-bottom: 8px; font-weight: 600;">
            ${(currentInvoice.patient && currentInvoice.patient.age) ? `Age: ${currentInvoice.patient.age} ` : ''}
            ${(currentInvoice.patient && currentInvoice.patient.sex) ? `| Sex: ${currentInvoice.patient.sex}` : ''}
          </div>
          <p style="font-size: 0.85rem; line-height: 1.4;">${(currentInvoice.patient && currentInvoice.patient.address) || currentInvoice.address || ""}</p>
          <p style="font-size: 0.85rem; font-weight: 600; margin-top: 4px;">Contact: ${(currentInvoice.patient && currentInvoice.patient.phone) || currentInvoice.phone || ""}</p>
        </div>
        <div class="temp-info-content">
          <div class="temp-info-row">
            <span class="temp-info-label">${state.editorMode === 'estimate' ? 'Estimate' : 'Invoice'} #</span>
            <p style="text-align: right; display: inline-block; float: right;">${invNo}</p>
          </div>
          <div style="clear: both; margin-top: 10px;"></div>
          <div class="temp-info-row">
            <span class="temp-info-label">Creation Date</span>
            <p style="text-align: right; display: inline-block; float: right;">${formatDate(currentInvoice.date)}</p>
          </div>
        </div>
      </div>

      <table class="temp-table">
        <thead>
          <tr>
            <th style="width: 50%;">Description</th>
            <th style="padding: 10px; text-align: center;">Qty</th>
            <th style="padding: 10px; text-align: right;">Price</th>
            <th style="padding: 10px; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${currentInvoice.items.map(item => {
            let itemTotal = (item.price * (item.qty || 1));
            // Apply item-level discount if any
            if (item.discount) {
              if (item.discountType === "percentage") itemTotal -= (itemTotal * item.discount / 100);
              else itemTotal -= item.discount;
            }
            return `
              <tr>
                <td>${item.name}</td>
                <td style="text-align: center;">${item.qty || 1}</td>
                <td style="text-align: right;">${formatINR(item.price)}</td>
                <td style="text-align: right;">${formatINR(itemTotal)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>

      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div class="temp-info-content">
             <div class="temp-info-label" style="font-size: 0.85rem;">Payment Method</div>
             <p style="font-size: 0.9rem;">${((state.paymentMethods || []).find(pm => pm.id === currentInvoice.paymentMethodId)?.name || "UPI")}</p>
        </div>
        <div class="temp-totals">
          <div class="temp-row">
            <span>Subtotal</span>
            <span>${formatINR(grossSubtotal)}</span>
          </div>
          ${totalDiscount > 0 ? `
          <div class="temp-row">
            <span>Total Discount</span>
            <span>-${formatINR(totalDiscount)}</span>
          </div>
          ` : ''}
          ${selectedTaxes.map(tax => `
          <div class="temp-row">
            <span>${tax.name} (${tax.rate}%)</span>
            <span>${formatINR(netBeforeGlobal * tax.rate / 100)}</span>
          </div>
          `).join("")}
          ${(selectedTaxes.length === 0 && currentInvoice.tax > 0) ? `
          <div class="temp-row">
            <span>Tax</span>
            <span>${formatINR(currentInvoice.tax)}</span>
          </div>
          ` : ''}
          <div class="temp-row temp-row-highlight">
            <span>Total</span>
            <span>${formatINR(currentInvoice.total)}</span>
          </div>
          
          <div class="temp-payment-records">
            ${payments.length > 0 ? `
              <h4>Payment Records</h4>
              ${payments.map(p => `
                <div class="temp-pay-item">${(p.method === 'Correction' || !p.method) ? 'Payment' : p.method === 'Advance Full' ? 'Full Payment' : p.method}: ${formatINR(p.amount)} (${new Date(p.date).toLocaleDateString('en-GB')})</div>
              `).join("")}
              <div class="temp-pay-item" style="border-top: 1px solid #cbd5e1; padding-top: 4px; border-bottom: 2px double #64748b; font-weight: 800; margin-top: 4px;">Total Paid: ${formatINR(totalPaid)}</div>
            ` : ""}
          </div>
        </div>
      </div>

      <div class="temp-footer">
        <div class="temp-terms">
          ${selectedTerms.length > 0 ? `
            <h3>Terms & Conditions</h3>
            ${selectedTerms.map(t => `<p>${t.content}</p>`).join("")}
          ` : ''}
        </div>
        <div class="temp-sig">
          ${sig ? `<img src="${sig.data}">` : ""}
          <div style="border-top: 1px solid #1e293b; padding-top: 8px; font-weight: 700; font-size: 0.9rem;">Authorized Signature</div>
        </div>
      </div>
      </div>
    `;
  } catch (err) {
    console.error("FATAL RENDERING ERROR:", err);
    container.innerHTML = `<div style="padding:20px; color:red; font-weight:bold;">Error Rendering Preview: ${err.message}</div>`;
  }
}



window.fitInvoiceToPage = async (contentId = "pdfContent") => {
  const container = document.getElementById(contentId);
  if (!container) return;

  // Reset scale first
  container.style.setProperty('--inv-scale', '1');
  
  const targetHeight = 1040; 
  
  let scale = 1.0;
  for (let i = 0; i < 3; i++) {
    await new Promise(r => setTimeout(r, 60));
    const currentHeight = container.scrollHeight;
    if (currentHeight <= 0) {
       console.warn("fitInvoiceToPage: Height is 0, skipping.");
       break;
    }
    
    if (currentHeight <= targetHeight + 5) break; 
    
    scale = (targetHeight / currentHeight) * scale;
    if (scale < 0.5) { scale = 0.5; break; }
    if (isNaN(scale) || !isFinite(scale)) { scale = 1.0; break; }
    
    container.style.setProperty('--inv-scale', scale.toString());
  }
  
  console.log(`Final scaling applied to ${contentId}: ${scale.toFixed(2)}`);
  await new Promise(r => setTimeout(r, 100));
};

window.applyPreviewScaling = (isFull = false) => {
    const frameId = isFull ? "fullPdfFrame" : "pdfFrame";
    const scalerId = isFull ? "fullPdfScaler" : "pdfScaler";
    const contentId = isFull ? "fullPdfContent" : "pdfContent";

    const frame = document.getElementById(frameId);
    const scaler = document.getElementById(scalerId);
    const container = document.getElementById(contentId);
    
    if (!frame || !scaler || !container) return;

    const marginFactor = isFull ? 0.98 : 0.98; // Increased from 0.92 to maximize preview
    const availableWidth = frame.clientWidth * marginFactor;
    const availableHeight = frame.clientHeight * marginFactor;

    const containerWidth = container.offsetWidth;
    const containerHeight = container.offsetHeight;
    
    const scaleW = availableWidth / containerWidth;
    const scaleH = availableHeight / containerHeight;
    
    let finalScale = Math.min(scaleW, scaleH);
    finalScale = Math.min(1.0, Math.max(0.1, finalScale));

    scaler.style.transform = `scale(${finalScale})`;
};

window.exportPdf = async () => {
  const isFull = screenStack[screenStack.length - 1] === 'fullPreview';
  const contentId = isFull ? "fullPdfContent" : "pdfContent";
  const element = document.getElementById(contentId);
  if (!element) return;

  try {
    const { jsPDF } = window.jspdf;
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff"
    });
    
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    const fileName = currentInvoice ? `Invoice_${currentInvoice.invoiceNumber || 'Detail'}.pdf` : 'Invoice.pdf';
    pdf.save(fileName);
  } catch (err) {
    console.error("PDF Export failed:", err);
    alert("Export failed. Please try again.");
  }
};

// End of PDF generation helpers

window.duplicateInvoice = () => {
  if (!currentInvoice) return;
  const isEst = state.editorMode === 'estimate';
  const newDoc = {
    ...structuredClone(currentInvoice),
    id: (isEst ? "e" : "i") + Date.now(),
    invoiceNumber: isEst ? nextEstimateNumber() : nextInvoiceNumber(),
    date: new Date().toISOString().split('T')[0],
    status: "unpaid",
    payments: []
  };
  
  const collection = isEst ? state.estimates : state.invoices;
  collection.push(newDoc);
  save();
  
  alert((isEst ? "Estimate" : "Invoice") + " duplicated successfully!");
  if (isEst) renderEstimatesDashboard();
  else renderDashboard();
};

window.deleteInvoice = () => {
  const typeLabel = state.editorMode === 'estimate' ? "estimate" : "invoice";
  window.showConfirmModal("Delete " + typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1), "Are you sure you want to delete this " + typeLabel + "?", () => {
    state.invoices = state.invoices.filter(i => i.id !== currentInvoice.id);
    state.estimates = state.estimates.filter(i => i.id !== currentInvoice.id);
    save();
    closeModal();
    const nextScr = state.editorMode === 'estimate' ? "estimatesDashboard" : "dashboard";
    screenStack = [nextScr];
    renderScreen(nextScr);
  });
};

window.selectClient = (id) => {
  const patient = state.patients.find(p => p.id === id);
  if (screenStack.includes("prescriptionEditorHub") || screenStack.includes("prescClientPicker")) {
    if (currentPrescription) currentPrescription.patientId = id;
    popScreen();
    renderPrescriptionEditorHub();
  } else {
    if (currentInvoice) currentInvoice.patient = patient;
    popScreen();
    renderEditorHub();
  }
};

window.renderTemplatePicker = () => {
  const grid = document.getElementById("templateGrid");
  const templates = ["Classic", "Modern", "Professional", "Minimal", "Business", "Creative"];
  grid.innerHTML = templates.map(t => `
    <div class="template-card ${currentInvoice.template === t ? 'active' : ''}" onclick="window.selectTemplate('${t}')">
      <div class="template-preview">Template Preview ${t}</div>
      <div class="name">${t}</div>
    </div>
  `).join("");
};

window.selectTemplate = (t) => {
  currentInvoice.template = t;
  popScreen();
  renderEditorHub();
};

window.closeModal = () => {
  els.overlay.classList.remove("active");
};

if (els.overlay) els.overlay.onclick = (e) => { if (e.target === els.overlay) closeModal(); };

// Item Picker Logic
window.renderItemPicker = () => {
  const list = document.getElementById("itemPickerList");
  if (!list) return;
  list.innerHTML = state.items.map(item => `
    <div class="picker-card" onclick="addItemToInvoice('${item.id}')">
      <div class="picker-card-content">
        <div style="font-weight: 700; color: #1e293b;">${item.name}</div>
        <div style="font-size: 0.85rem; color: var(--primary); font-weight: 600;">${formatINR(item.price)}</div>
      </div>
      <div class="picker-card-edit" onclick="event.stopPropagation(); window.deleteGlobalItem(event, '${item.id}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </div>
    </div>
  `).join("");

  setupBtn("addNewItemBtn", () => {
    window.editingItemIndex = null;
    pushScreen("itemForm");
  });
};

window.deleteItemFromInvoice = (event, index) => {
  event.stopPropagation();
  window.showConfirmModal("Remove Item", "Remove this item from the invoice?", () => {
    currentInvoice.items.splice(index, 1);
    save();
    renderEditorHub();
  });
};

window.deleteGlobalItem = (event, id) => {
  event.stopPropagation();
  window.showConfirmModal("Delete Global Item", "Delete this item globally from your catalog? This will not affect existing invoices.", () => {
    state.items = state.items.filter(i => i.id !== id);
    save();
    renderItemPicker();
  });
};

window.addItemToInvoice = (id) => {
  const item = state.items.find(i => i.id === id);
  currentInvoice.items.push({ ...item, qty: 1 });
  calculateTotal();
  popScreen();
};

function calculateTotal() {
  currentInvoice.total = currentInvoice.items.reduce((s, i) => s + (i.price * (i.qty || 1)), 0);
  renderEditorHub();
}

els.btnSaveHub.onclick = () => {
  if (currentInvoice.items.length === 0) return alert("Add at least one item");
  const collection = state.editorMode === 'estimate' ? state.estimates : state.invoices;
  const idx = collection.findIndex(i => i.id === currentInvoice.id);
  if (idx > -1) collection[idx] = currentInvoice;
  else collection.push(currentInvoice);
  save();
  const nextScr = state.editorMode === 'estimate' ? "estimatesDashboard" : "dashboard";
  screenStack = [nextScr];
  renderScreen(nextScr);
};


window.renderBusinessInfo = () => {
  const b = state.businesses.find(bus => bus.id === state.activeBusinessId);
  document.getElementById("biName").value = b.name;
  document.getElementById("biEmail").value = b.email || "";
  document.getElementById("biPhone").value = b.phone || "";
  const parts = (b.address || "").split("\n");
  document.getElementById("biAddr1").value = parts[0] || "";
  document.getElementById("biAddr2").value = parts[1] || "";
  document.getElementById("biWebsite").value = b.website || "";
  document.getElementById("sideNavName").textContent = b.name;

  const logoImg = document.getElementById("biLogoImg");
  const logoInput = document.getElementById("biLogoInput");
  const deleteBtn = document.getElementById("btnDeleteLogo");
  
  if (b.logo) {
    logoImg.src = b.logo;
    if (deleteBtn) deleteBtn.style.display = "flex";
  } else {
    logoImg.src = "https://via.placeholder.com/150";
    if (deleteBtn) deleteBtn.style.display = "none";
  }

  logoInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (re) => {
        const base64 = re.target.result;
        b.logo = base64;
        logoImg.src = base64;
        if (deleteBtn) deleteBtn.style.display = "flex";
        save();
        renderSideNavBusinessInfo();
      };
      reader.readAsDataURL(file);
    }
  };
};

window.deleteLogo = () => {
    const b = state.businesses.find(bus => bus.id === state.activeBusinessId);
    if (b) {
      window.showConfirmModal("Delete Logo", "Are you sure you want to delete the business logo?", () => {
        delete b.logo;
        document.getElementById("biLogoImg").src = "https://via.placeholder.com/150";
        document.getElementById("btnDeleteLogo").style.display = "none";
        save();
        renderSideNavBusinessInfo();
      });
    }
};

window.renderBusinessPicker = () => {
    setupBtn("btnNewBusiness", () => {
        // Create a blank business and edit it
        const id = "b_" + Date.now();
        const newBus = { id, name: "New Business", address: "", email: "", phone: "", website: "" };
        state.businesses.push(newBus);
        state.activeBusinessId = id;
        save();
        pushScreen("businessInfo");
    });

    const container = document.getElementById("businessListContainer");
    if (!container) return;
    container.innerHTML = "";

    state.businesses.forEach(b => {
        const card = document.createElement("div");
        card.className = "picker-card " + (state.activeBusinessId === b.id ? "selected" : "");
        card.innerHTML = `
            <div class="picker-card-checkbox"></div>
            <div class="picker-card-content" onclick="window.switchBusiness('${b.id}')">
                <div style="font-weight: 700; color: #1e293b;">${b.name}</div>
                <div style="font-size: 0.85rem; color: #64748b;">${b.email || 'No email set'}</div>
            </div>
            <div class="picker-card-edit" onclick="event.stopPropagation(); window.editSpecificBusiness('${b.id}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </div>
        `;
        container.appendChild(card);
    });
};

window.switchBusiness = (id) => {
    state.activeBusinessId = id;
    save();
    renderBusinessPicker();
    renderSideNavBusinessInfo();
    // Refresh header and everything
    updateHeader();
    if (screenStack.length === 1 && screenStack[0] === 'dashboard') renderDashboard();
};

window.editSpecificBusiness = (id) => {
    state.activeBusinessId = id;
    pushScreen("businessInfo");
};
window.openStatusPicker = (id) => {
  const inv = state.invoices.find(i => i.id === id);
  const currentStatus = inv.status || "unpaid";
  
  const items = [
    { 
      label: "Mark as Paid", 
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>', 
      action: `window.setInvoiceStatusById('${id}', 'paid')` 
    },
    { 
      label: "Mark as Unpaid", 
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>', 
      action: `window.setInvoiceStatusById('${id}', 'unpaid')` 
    },
    { 
      label: "Mark as Partially Paid", 
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>', 
      action: `window.setInvoiceStatusById('${id}', 'partially_paid')` 
    }
  ];
  
  showBottomSheet("Change Status", items);
};

window.setInvoiceStatusById = (id, status) => {
  const inv = state.invoices.find(i => i.id === id);
  if (inv) {
    inv.status = status;
    // If marking as paid, ensure balance is zero if no payments exist
    const total = Number(inv.total) || 0;
    const paid = (inv.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    if (status === 'paid' && paid < total) {
      inv.payments.push({ id: "pay_" + Date.now(), amount: total - paid, date: new Date().toISOString().split('T')[0], method: 'Full Payment' });
    } else if (status === 'unpaid') {
      inv.payments = [];
    }
    save();
    renderDashboard();
    if (currentInvoice && currentInvoice.id === id) generatePreview();
    hideBottomSheet();
  }
};




window.renderSideNavBusinessInfo = () => {
  const b = state.businesses.find(bus => bus.id === state.activeBusinessId);
  if (!b) return;
  if (els.sideNavName) els.sideNavName.textContent = b.name || "Clinic Name";
  if (els.sideNavLogo) els.sideNavLogo.src = b.logo || "https://via.placeholder.com/150";
};

window.saveBusinessInfo = () => {
  const b = state.businesses.find(bus => bus.id === state.activeBusinessId);
  if (!b) return alert("Error: Business not found");
  
  b.name = document.getElementById("biName").value;
  b.email = document.getElementById("biEmail").value;
  b.phone = document.getElementById("biPhone").value;
  b.address = document.getElementById("biAddr1").value + "\n" + document.getElementById("biAddr2").value;
  b.website = document.getElementById("biWebsite").value;
  if (b.tempLogo) {
    b.logo = b.tempLogo;
    delete b.tempLogo;
  }
  
  save();
  renderSideNavBusinessInfo();
  alert("Business Information Saved Successfully!");
  popScreen();
};

document.getElementById("sideNavName").onclick = document.getElementById("btnManageBusiness").onclick = () => {
  window.closeSideNav();
  pushScreen("businessInfo");
};

// Sidebar Handlers
document.getElementById("menuReport").onclick = () => { window.closeSideNav(); window.renderReportDashboard(); };
document.getElementById("menuSettings").onclick = () => { window.closeSideNav(); pushScreen("settings"); };
document.getElementById("menuSync").onclick = () => { window.closeSideNav(); alert("Syncing..."); };
document.getElementById("menuExport").onclick = () => { window.closeSideNav(); pushScreen("exportImport"); };
document.getElementById("menuShare").onclick = () => { window.closeSideNav(); alert("Shared!"); };

els.createInvoiceBtn = document.getElementById("mainCreateBtn");
if (els.createInvoiceBtn) {
    els.createInvoiceBtn.onclick = () => {
        showBottomSheet("Create New", [
            { 
              label: "New Invoice", 
              icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>', 
              action: "window.startNewDocument('invoice')" 
            },
            { 
              label: "New Estimate", 
              icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><path d="M9 14l2 2 4-4"></path></svg>', 
              action: "window.startNewDocument('estimate')" 
            }
        ]);
    };
}

const estCreateBtn = document.getElementById("mainCreateBtnEstimates");
if (estCreateBtn) {
    estCreateBtn.onclick = () => window.startNewDocument('estimate');
}

window.startNewDocument = (type) => {
    hideBottomSheet();
    state.editorMode = type;
    currentInvoice = null;
    pushScreen("editor");
};

document.querySelectorAll("#appBottomNav .nav-item").forEach(item => {
  item.onclick = () => {
    document.querySelectorAll("#appBottomNav .nav-item").forEach(ni => ni.classList.remove("active"));
    item.classList.add("active");
    const s = item.dataset.s;
    if (s === "dashboard" || s === "estimatesDashboard" || s === "prescription" || s === "client" || s === "item" || s === "settings") {
        // These are root level tabs
        screenStack = [s]; 
        renderScreen(s);
    } else {
        pushScreen(s);
    }
  };
});

window.editInvoice = (id) => {
  currentInvoice = state.invoices.find(i => i.id === id);
  pushScreen("editor");
};
window.exportToExcel = () => {
  try {
    if (typeof XLSX === 'undefined') return alert("Excel library not loaded. Please check your internet connection.");

    const filterVal = document.getElementById('exportDateFilter')?.value || 'lifetime';
    const invoices = getFilteredInvoices(filterVal);
    
    if (invoices.length === 0) {
        return alert("No invoices found for the selected period.");
    }

    // 1. Invoices Sheet
    const invoiceData = invoices.map(inv => {
      const patient = inv.patient ? inv.patient.name : (inv.patientName || "Unknown");
      const paid = (inv.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const total = Number(inv.total) || 0;
      return {
        "Invoice #": inv.invoiceNumber,
        "Date": new Date(inv.date).toLocaleDateString('en-GB'),
        "Patient": patient,
        "Total Amount": total,
        "Total Paid": paid,
        "Balance": total - paid,
        "Status": inv.total - paid < 0 ? "Credit" : inv.status
      };
    });

    // 2. Invoice Items Sheet (Flattened)
    const itemRows = [];
    state.invoices.forEach(inv => {
      (inv.items || []).forEach(item => {
        itemRows.push({
          "Invoice #": inv.invoiceNumber,
          "Date": new Date(inv.date).toLocaleDateString('en-GB'),
          "Item Name": item.name,
          "Price": item.price,
          "Qty": item.qty,
          "Unit": item.unit,
          "Total": (item.price * item.qty) - (item.discount || 0)
        });
      });
    });

    // 3. Patients Sheet
    const patientData = state.patients.map(p => ({
      "Name": p.name,
      "Phone": p.phone || "",
      "Email": p.email || "",
      "Address": p.address || "",
      "Created At": new Date(p.id.replace('p', '') * 1).toLocaleDateString('en-GB')
    }));

    // 4. Catalog Sheet
    const catalogData = state.items.map(i => ({
      "Item Name": i.name,
      "Base Price": i.price,
      "Default Unit": i.unit
    }));

    // Create workbook
    const wb = XLSX.utils.book_new();
    
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invoiceData), "Invoices");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows), "Invoice_Details");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(patientData), "Patients");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catalogData), "Product_Catalog");

    // Download
    const rangeName = filterVal === 'lifetime' ? 'all' : filterVal;
    const fileName = `Invoice_Studio_Sales_${rangeName}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  } catch (err) {
    console.error("Excel Export Error:", err);
    alert("Export failed: " + err.message);
  }
};

window.openExportModal = () => {
  els.overlay.classList.add("active");
  els.modalBody.innerHTML = `
    <div style="font-weight: 800; font-size: 1.25rem; color: var(--primary); margin-bottom: 20px;">Data Management</div>
    
    <div class="status-option" onclick="window.exportToExcel()">
      <div style="font-weight: 600; color: #1e293b;">Export to Excel (Report)</div>
      <p style="font-size: 0.75rem; color: #64748b; margin-top: 4px;">Best for clinical audits and analysis.</p>
    </div>

    <div class="status-option" onclick="window.importData()">
      <div style="font-weight: 600; color: #1e293b;">Restore from Backup (JSON)</div>
      <p style="font-size: 0.75rem; color: #64748b; margin-top: 4px;">Restore your data from a previous JSON file.</p>
    </div>

    <div style="display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 24px;">
      <button class="btn btn-outline" onclick="closeModal()">Close</button>
    </div>
  `;
};

// --- Terms & Tax Management ---
// Consolidated logic below
window.renderTaxPicker = () => {
  setupBtn("btnNewTax", () => window.showTaxForm());
  const container = document.getElementById("taxListContainer");
  if (!container) return;
  container.innerHTML = "";

  if (state.taxList.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8; font-size: 0.9rem;">No taxes found. Click above to add.</div>`;
    return;
  }

  console.log("Rendering Tax Picker, selected count:", (currentInvoice?.taxIds || []).length);
  state.taxList.forEach(tax => {
    const card = document.createElement("div");
    card.className = "section-card no-margin";
    card.style.cssText = "display: flex; align-items: center; padding: 16px; margin-bottom: 12px; border-radius: 12px; background: white; box-shadow: var(--shadow-sm); border: 2px solid transparent; cursor: pointer;";
    const isSelected = currentInvoice && currentInvoice.taxIds && currentInvoice.taxIds.includes(tax.id);
    if (isSelected) card.style.borderColor = "var(--primary)";

    card.onclick = (e) => {
      if (e.target.closest('button')) return;
      if (currentInvoice) {
        if (!currentInvoice.taxIds) currentInvoice.taxIds = [];
        const idx = currentInvoice.taxIds.indexOf(tax.id);
        if (idx >= 0) currentInvoice.taxIds.splice(idx, 1);
        else currentInvoice.taxIds.push(tax.id);
        save();
        renderEditorHub();
      }
      renderTaxPicker();
    };

    card.innerHTML = `
      <div style="width: 24px; height: 24px; border-radius: 6px; border: 2px solid ${isSelected ? 'var(--primary)' : '#e2e8f0'}; background: ${isSelected ? 'var(--primary)' : 'transparent'}; display: flex; align-items: center; justify-content: center; transition: all 0.2s; margin-right: 12px;">
           ${isSelected ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
      </div>
      <div style="flex: 1;">
        <div style="font-weight: 700; color: #1e293b;">${tax.name}</div>
        <div style="font-size: 0.8rem; color: #64748b;">${tax.rate}% Tax Rate</div>
      </div>
      <button class="icon-btn" style="color: #64748b; width: 44px; height: 44px; margin-left: 8px;" onclick="window.showTaxForm('${tax.id}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="4.5" r="1.5"/><circle cx="12" cy="19.5" r="1.5"/></svg>
      </button>
    `;
    container.appendChild(card);
  });
};

window.toggleTaxSelection = (id) => {
  if (!currentInvoice.taxIds) currentInvoice.taxIds = [];
  const idx = currentInvoice.taxIds.indexOf(id);
  if (idx > -1) currentInvoice.taxIds.splice(idx, 1);
  else currentInvoice.taxIds.push(id);
  
  // Recalculate invoice tax amount based on the first selected tax for now
  const tax = state.taxList.find(t => t.id === currentInvoice.taxIds[0]);
  if (tax) {
    // Note: We might want to calculate this dynamically in renderEditorHub later
  }
  
  save();
  renderTaxPicker();
};

// --- Form Modals Logic ---
// Legacy modals removed
window.showTaxForm = (id = null) => {
  const tax = id ? state.taxList.find(t => t.id === id) : { name: "", rate: "" };
  const overlay = document.getElementById("formModalOverlay");
  const container = document.getElementById("formModalContainer");
  
  container.innerHTML = `
    <div class="form-modal-content">
      <div class="form-modal-title">Tax</div>
      <div class="form-modal-group">
        <label class="form-modal-label">Tax Name</label>
        <input type="text" id="taxNameInput" class="form-modal-input" placeholder="Enter tax name" value="${tax.name}">
      </div>
      <div class="form-modal-group">
        <label class="form-modal-label">Tax Rate</label>
        <input type="number" id="taxRateInput" class="form-modal-input" placeholder="0%" value="${tax.rate}">
      </div>
      <div class="form-modal-actions">
        <button class="form-modal-btn" onclick="window.hideFormModal()">CANCEL</button>
        <button class="form-modal-btn" onclick="window.saveTaxData('${id || ''}')">SAVE</button>
      </div>
    </div>
  `;
  overlay.classList.add("active");
};

window.saveTaxData = (id) => {
  const name = document.getElementById("taxNameInput").value;
  const rate = parseFloat(document.getElementById("taxRateInput").value);
  if (!name.trim()) return alert("Tax name cannot be empty");
  if (isNaN(rate)) return alert("Invalid rate");
  
  if (id) {
    const tax = state.taxList.find(t => t.id === id);
    if (tax) { tax.name = name; tax.rate = rate; }
  } else {
    if (!state.taxList) state.taxList = [];
    state.taxList.push({ id: "tx" + Date.now(), name, rate });
  }
  save();
  window.hideFormModal();
  renderTaxPicker();
};

window.hideFormModal = () => {
  const overlay = document.getElementById("formModalOverlay");
  if (overlay) overlay.classList.remove("active");
};

// Consolidated logic blocks removed

// --- Data Management ---
// --- Data Management (JSON Backup/Restore) ---
window.exportData = () => {
  try {
    const filterVal = document.getElementById('exportDateFilter')?.value || 'lifetime';
    let dataToExport = state;

    if (filterVal !== 'lifetime') {
      const filteredInvoices = getFilteredInvoices(filterVal);
      if (filteredInvoices.length === 0) {
        return alert("No data found for the selected period to backup.");
      }
      dataToExport = { ...state, invoices: filteredInvoices };
    }

    const dataStr = JSON.stringify(dataToExport, null, 2);
    
    // Native Bridge Support
    if (window.ReactNativeWebView) {
      NativeBridge.postMessage(JSON.stringify({
        type: 'SHARE_BACKUP',
        payload: dataStr,
        filename: `Invoice_Studio_Backup_${new Date().toISOString().split('T')[0]}.json`
      }));
      if (typeof closeModal === 'function') closeModal();
      return;
    }

    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const rangeName = filterVal === 'lifetime' ? 'full_backup' : `backup_${filterVal}`;
    const name = `Invoice_Studio_${rangeName}_` + new Date().toISOString().slice(0, 10) + ".json";
    
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    if (typeof closeModal === 'function') closeModal();
  } catch (e) {
    alert("Export failed: " + e.message);
  }
};

window.importData = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (!imported.invoices || !imported.patients) {
          throw new Error("Invalid backup file format.");
        }
        
        window.showConfirmModal("Restore System", "WARNING: This will replace ALL current data with the backup file. This cannot be undone. Proceed?", () => {
          Object.assign(state, imported);
          save();
          alert("System Restored Successfully!");
          location.reload();
        });
      } catch (err) {
        alert("Import failed: " + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
};
window.renderInvoiceInfo = () => {
  if (!currentInvoice) return;
  document.getElementById("iiNumber").value = currentInvoice.invoiceNumber || "";
  document.getElementById("iiDate").value = currentInvoice.date || "";
  
  const dt = state.settings.dueTermsList.find(t => t.id === currentInvoice.dueTerms);
  document.getElementById("iiDueTermsText").textContent = dt ? dt.content : "Select Due Terms";
  setupBtn("iiDueTermsText", () => pushScreen("dueTermsPicker")); // Bind click to open picker
  
  document.getElementById("iiDueDate").value = currentInvoice.dueDate || "";
  document.getElementById("iiPoNumber").value = currentInvoice.poNumber || "";
  document.getElementById("iiTitle").value = currentInvoice.title || "";
};

window.saveInvoiceInfo = () => {
  if (!currentInvoice) return;
  currentInvoice.invoiceNumber = document.getElementById("iiNumber").value;
  currentInvoice.date = document.getElementById("iiDate").value;
  // currentInvoice.dueTerms is updated via selectDueTerms directly
  currentInvoice.dueDate = document.getElementById("iiDueDate").value;
  currentInvoice.poNumber = document.getElementById("iiPoNumber").value;
  currentInvoice.title = document.getElementById("iiTitle").value;
  
  save();
  popScreen();
  renderEditorHub();
};


// Initial boot
bindFilters();
renderSideNavBusinessInfo();
screenStack = ["dashboard"]; 
renderScreen("dashboard");

window.openDashboardMore = () => {
  const items = [
    { label: "Export & Import", icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path></svg>', action: "window.openExportModal(); hideBottomSheet();" }
  ];
  showBottomSheet("Dashboard Options", items);
};

window.openEditorMore = () => {
  const isEst = state.editorMode === 'estimate';
  const typeLabel = isEst ? "Estimate" : "Invoice";
  const items = [
    { label: "Duplicate " + typeLabel, icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>', action: "window.duplicateInvoice(); hideBottomSheet();" },
    { label: "Delete " + typeLabel, icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>', action: "window.deleteInvoice(); hideBottomSheet();" }
  ];
  showBottomSheet(typeLabel + " Options", items);
};

window.openPreviewMore = () => {
  const isEst = state.editorMode === 'estimate';
  const typeLabel = isEst ? "Estimate" : "Invoice";
  const items = [
    { label: "Download PDF", icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path></svg>', action: "window.exportPdf(); hideBottomSheet();" }
  ];

  if (isEst) {
    items.push({ 
      label: "Convert to Invoice", 
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>', 
      action: "window.convertToInvoice(); hideBottomSheet();" 
    });
  } else {
    items.push({ label: "Mark as Paid", icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>', action: "window.setInvoiceStatus('paid'); hideBottomSheet();" });
    items.push({ label: "Mark as Unpaid", icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>', action: "window.setInvoiceStatus('unpaid'); hideBottomSheet();" });
    items.push({ label: "Mark as Partially Paid", icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>', action: "window.setInvoiceStatus('partially_paid'); hideBottomSheet();" });
  }

  items.push({ label: "Delete " + typeLabel, icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>', action: "window.deleteInvoice(); hideBottomSheet();" });
  
  showBottomSheet(typeLabel + " Options", items);
};

window.convertToInvoice = () => {
  const isEst = state.editorMode === 'estimate';
  if (!isEst || !currentInvoice) return;

  window.showConfirmModal("Convert to Invoice", "Convert this estimate into a formal invoice?", () => {
    const newInv = {
      ...structuredClone(currentInvoice),
      id: "inv_" + Date.now(),
      invoiceNumber: nextInvoiceNumber(),
      status: "unpaid",
      payments: [],
      date: new Date().toISOString().split('T')[0]
    };
    
    state.invoices.push(newInv);
    save();
    
    // Switch to invoice mode and open the new invoice
    state.editorMode = 'invoice';
    currentInvoice = newInv;
    
    alert("Converted successfully! Document No: " + newInv.invoiceNumber);
    pushScreen("preview");
  });
};

window.setInvoiceStatus = (status) => {
  if (currentInvoice) {
    currentInvoice.status = status;
    save();
    generatePreview();
    updateHeader();
  }
};

// --- Prescription Module ---
let currentPrescription = null;

window.renderPrescriptionScreen = () => {
  const container = document.getElementById("prescriptionsListContainer");
  const countEl = document.getElementById("prescCountText");
  if (!container) return;
  
  const prescList = state.prescriptions || [];
  if (countEl) countEl.textContent = prescList.length;
  
  container.innerHTML = "";
  if (prescList.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8;">No prescriptions yet</div>`;
  } else {
    [...prescList].reverse().forEach(p => {
      const patient = state.patients.find(pt => pt.id === p.patientId) || { name: "Unknown Patient" };
      const div = document.createElement("div");
      div.className = "invoice-card professionally-styled";
      div.style.marginBottom = "12px";
      div.onclick = () => { currentPrescription = p; pushScreen("prescriptionEditorHub"); };
      div.innerHTML = `
        <div class="invoice-info">
          <div class="id">PRESC #${p.id.substring(p.id.length-4)}</div>
          <div class="sub">${formatDate(p.date)}</div>
          <div class="client" style="font-weight: 800; font-size: 1.1rem; color: #1e293b;">${patient.name}</div>
          <div style="font-size: 0.8rem; color: #64748b; margin-top: 4px; font-weight: 600;">Diagnosis: <strong>${p.diagnosis || "No Diagnosis"}</strong></div>
        </div>
        <div class="invoice-meta">
           <div class="amt">${(p.exercises || []).length} Exercises</div>
           <div style="display: flex; gap: 8px; margin-top: 8px;">
        <button class="icon-btn" onclick="event.stopPropagation(); currentPrescription = state.prescriptions.find(x => x.id === '${p.id}'); pushScreen('prescriptionEditorHub')" style="color: #64748b; background: #f1f5f9;">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button class="icon-btn" onclick="event.stopPropagation(); window.printPrescription('${p.id}')" style="color: #3b82f6; background: #eff6ff;">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
        </button>
     </div>
        </div>
      `;
      container.appendChild(div);
    });
  }
};

window.createNewPrescription = () => {
  currentPrescription = {
    id: "presc_" + Date.now(),
    date: new Date().toISOString().split("T")[0],
    patientId: null,
    doctorId: state.doctors.length > 0 ? state.doctors[0].id : null,
    diagnosis: "",
    plan: "",
    exercises: [],
    complaints: "",
    illnessHistory: "",
    painScale: 0,
    painFactors: "",
    observation: "",
    palpation: "",
    measurements: [],
    specialTests: "",
    referringDr: "",
    occupation: "",
    pastHistory: "",
    drugHistory: "",
    personalHistory: "",
    advice: ""
  };
  pushScreen("prescriptionEditorHub");
};


window.renderPrescriptionInfo = () => {
  if (!currentPrescription) return;
  document.getElementById("prescDiagnosisInput").value = currentPrescription.diagnosis || "";
  document.getElementById("prescPlanInput").value = currentPrescription.plan || "";
  document.getElementById("prescAdviceInput").value = currentPrescription.advice || "";
};

window.applyPrescInfoChanges = () => {
    if (!currentPrescription) return;
    currentPrescription.diagnosis = document.getElementById("prescDiagnosisInput").value;
    currentPrescription.plan = document.getElementById("prescPlanInput").value;
    currentPrescription.advice = document.getElementById("prescAdviceInput").value;
    popScreen();
    renderPrescriptionEditorHub();
};

window.renderPrescriptionExercises = () => {
  const container = document.getElementById("exerciseList");
  if (!container || !currentPrescription) return;
  container.innerHTML = "";
  
  (currentPrescription.exercises || []).forEach((ex, idx) => {
    container.appendChild(createExerciseRowElement(ex, idx));
  });
};

function createExerciseRowElement(ex, idx) {
  const div = document.createElement("div");
  div.className = "section-card";
  div.style.cssText = "margin-bottom: 12px; padding: 16px; background: white; border: 1px solid #e2e8f0; border-radius: 12px;";
  div.innerHTML = `
    <div style="display: flex; gap: 12px; align-items: flex-start;">
      <div style="flex: 1;">
          <input type="text" placeholder="Exercise Name" value="${ex.name || ''}" oninput="window.updateExerciseData(${idx}, 'name', this.value)" style="width: 100%; border-bottom: 2px solid #e2e8f0; font-weight: 800; font-size: 1.1rem; color: #1e293b; outline: none; padding: 4px 0; margin-bottom: 8px; border-radius: 0;">
          <div style="display: flex; gap: 8px; margin-top: 4px;">
             <input type="text" placeholder="Reps (e.g. 10)" value="${ex.reps || ''}" oninput="window.updateExerciseData(${idx}, 'reps', this.value)" style="flex: 1; padding: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.85rem; font-weight: 600;">
             <input type="text" placeholder="Freq (e.g. 3x/day)" value="${ex.freq || ''}" oninput="window.updateExerciseData(${idx}, 'freq', this.value)" style="flex: 1; padding: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.85rem; font-weight: 600;">
          </div>
         </div>
      </div>
      <button class="icon-btn" onclick="window.deleteExerciseRow(${idx})" style="color: #ef4444; margin-top: 4px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    </div>
  `;
  return div;
}

window.addExerciseRow = () => {
  if (!currentPrescription) return;
  if (!currentPrescription.exercises) currentPrescription.exercises = [];
  currentPrescription.exercises.push({ name: "", reps: "", freq: "" });
  window.renderPrescriptionExercises();
};

window.updateExerciseData = (idx, key, val) => {
  if (!currentPrescription || !currentPrescription.exercises[idx]) return;
  currentPrescription.exercises[idx][key] = val;
};

window.renderPrescriptionInfo = () => {
    if (!currentPrescription) return;
    document.getElementById("prescDiagnosisInput").value = currentPrescription.diagnosis || "";
    document.getElementById("prescPlanInput").value = currentPrescription.plan || "";
};

window.deleteExerciseRow = (idx) => {
  if (!currentPrescription) return;
  currentPrescription.exercises.splice(idx, 1);
  window.renderPrescriptionExercises();
};

// --- Expanded Prescription Logic ---

window.generatePatientId = () => {
    return 'REG-' + Math.random().toString(36).substr(2, 6).toUpperCase();
};

window.renderPrescDoctorPicker = () => {
    const container = document.getElementById("doctorListContainer");
    if (!container) return;
    container.innerHTML = "";

    setupBtn("btnNewDoctor", () => {
        window.editingDoctorId = null;
        window.tempSigId = null;
        window.tempSigData = null;
        pushScreen("prescDoctorForm");
    });

    if (state.doctors.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 40px; color: #94a3b8; font-size: 0.9rem;">No doctors found. Add one above.</div>`;
        return;
    }

    state.doctors.forEach(dr => {
        const card = document.createElement("div");
        card.className = "section-card no-margin";
        card.style.cssText = "display: flex; align-items: center; padding: 16px; margin-bottom: 12px; border-radius: 12px; background: white; box-shadow: var(--shadow-sm); border: 2px solid transparent; cursor: pointer;";
        
        const isSelected = currentPrescription && currentPrescription.doctorId === dr.id;
        if (isSelected) card.style.borderColor = "var(--primary)";

        card.onclick = (e) => {
            if (e.target.closest('button')) return;
            if (currentPrescription) {
                currentPrescription.doctorId = dr.id;
                renderPrescriptionEditorHub();
            }
            popScreen();
        };

        card.innerHTML = `
            <div style="flex: 1;">
                <div style="font-weight: 700; color: #1e293b;">${dr.name}</div>
                <div style="font-size: 0.8rem; color: #64748b;">${dr.quals || 'Physiotherapist'}</div>
            </div>
            <button class="icon-btn" style="color: #64748b; width: 44px; height: 44px; margin-left: 8px;" onclick="event.stopPropagation(); window.editDoctorProfile('${dr.id}')">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
        `;
        container.appendChild(card);
    });
};

window.editDoctorProfile = (id) => {
    window.editingDoctorId = id;
    window.tempSigId = null;
    window.tempSigData = null;
    pushScreen("prescDoctorForm");
};

window.renderPrescDoctorForm = () => {
    window.sigTarget = 'doctor';
    const dr = window.editingDoctorId ? state.doctors.find(d => d.id === window.editingDoctorId) : { name: "", quals: "", contact: "", regNo: "", signature: null, signatureId: "" };
    
    document.getElementById("drName").value = dr.name;
    document.getElementById("drQuals").value = dr.quals;
    document.getElementById("drContact").value = dr.contact;
    document.getElementById("drRegNo").value = dr.regNo;
    
    const preview = document.getElementById("drSignaturePreview");
    
    // Check for a temporary selection first
    const sigId = window.tempSigId || dr.signatureId;
    const sigData = window.tempSigData || (sigId ? state.signatures.find(s => s.id === sigId)?.data : dr.signature);

    if (sigData) {
        preview.innerHTML = `<img src="${sigData}" ${sigId ? `data-sigid="${sigId}"` : ""} style="max-height: 100%; max-width: 100%; object-fit: contain;">`;
    } else {
        preview.innerHTML = `<span style="color: #64748b; font-size: 0.9rem;">Tap to select signature</span>`;
    }

    preview.onclick = () => pushScreen('signaturePicker');
};

window.saveDoctor = () => {
    const name = document.getElementById("drName").value.trim();
    if (!name) return alert("Doctor name is required");

    const sigImg = document.querySelector("#drSignaturePreview img");
    const drData = {
        id: window.editingDoctorId || "dr_" + Date.now(),
        name,
        quals: document.getElementById("drQuals").value.trim(),
        contact: document.getElementById("drContact").value.trim(),
        regNo: document.getElementById("drRegNo").value.trim(),
        signature: sigImg ? sigImg.src : null,
        signatureId: sigImg ? sigImg.dataset.sigid : null
    };

    if (window.editingDoctorId) {
        const idx = state.doctors.findIndex(d => d.id === window.editingDoctorId);
        if (idx !== -1) state.doctors[idx] = drData;
    } else {
        state.doctors.push(drData);
    }

    save();
    popScreen();
    renderPrescDoctorPicker();
};

window.renderPrescAssessment = () => {
    if (!currentPrescription) return;
    const p = currentPrescription;
    document.getElementById("prescComplaints").value = p.complaints || "";
    document.getElementById("prescIllnessHistory").value = p.illnessHistory || "";
    document.getElementById("prescPainScale").value = p.painScale || 0;
    document.getElementById("prescPainScaleVal").textContent = p.painScale || 0;
    document.getElementById("prescPainFactors").value = p.painFactors || "";

    // Add slider listener
    document.getElementById("prescPainScale").oninput = function() {
        document.getElementById("prescPainScaleVal").textContent = this.value;
    };
};

window.applyPrescAssessmentChanges = () => {
    if (!currentPrescription) return;
    currentPrescription.complaints = document.getElementById("prescComplaints").value;
    currentPrescription.illnessHistory = document.getElementById("prescIllnessHistory").value;
    currentPrescription.painScale = parseInt(document.getElementById("prescPainScale").value);
    currentPrescription.painFactors = document.getElementById("prescPainFactors").value;
    popScreen();
    renderPrescriptionEditorHub();
};


window.renderPrescObjective = () => {
    if (!currentPrescription) return;
    const p = currentPrescription;
    document.getElementById("prescObservation").value = p.observation || "";
    document.getElementById("prescPalpation").value = p.palpation || "";
    document.getElementById("prescSpecialTests").value = p.specialTests || "";
    
    // Render measurements
    const container = document.getElementById("prescMeasurementsList");
    if (container) {
        container.innerHTML = "";
        if (!p.measurements) p.measurements = [];
        p.measurements.forEach((m, idx) => {
            const row = document.createElement("div");
            row.style.cssText = "display: flex; gap: 8px; margin-bottom: 12px; align-items: center; border: 1px solid #f1f5f9; padding: 12px; border-radius: 12px; background: white;";
            row.innerHTML = `
                <input type="text" placeholder="Metric" value="${m.metric || ''}" oninput="window.updateMeasurement(${idx}, 'metric', this.value)" style="flex: 2; padding: 8px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.85rem;">
                <input type="text" placeholder="Value" value="${m.value || ''}" oninput="window.updateMeasurement(${idx}, 'value', this.value)" style="flex: 1.5; padding: 8px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.85rem;">
                <button class="icon-btn" onclick="window.removeMeasurement(${idx})" style="color: #ef4444;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            `;
            container.appendChild(row);
        });
    }
};

window.updateMeasurement = (idx, key, val) => {
    if (currentPrescription && currentPrescription.measurements[idx]) {
        currentPrescription.measurements[idx][key] = val;
    }
};

window.addPrescMeasurementRow = () => {
    if (!currentPrescription) return;
    if (!currentPrescription.measurements) currentPrescription.measurements = [];
    currentPrescription.measurements.push({ metric: "", value: "" });
    window.renderPrescObjective();
};

window.removeMeasurement = (idx) => {
    if (!currentPrescription) return;
    currentPrescription.measurements.splice(idx, 1);
    window.renderPrescObjective();
};

window.applyPrescObjectiveChanges = () => {
    if (!currentPrescription) return;
    currentPrescription.observation = document.getElementById("prescObservation").value;
    currentPrescription.palpation = document.getElementById("prescPalpation").value;
    currentPrescription.specialTests = document.getElementById("prescSpecialTests").value;
    popScreen();
    renderPrescriptionEditorHub();
};

window.renderPrescInfo = () => {
    if (!currentPrescription) return;
    const p = currentPrescription;
    document.getElementById("prescDiagnosisInput").value = p.diagnosis || "";
    document.getElementById("prescPlanInput").value = p.plan || "";
};

window.applyPrescInfoChanges = () => {
    if (!currentPrescription) return;
    currentPrescription.diagnosis = document.getElementById("prescDiagnosisInput").value;
    currentPrescription.plan = document.getElementById("prescPlanInput").value;
    popScreen();
    renderPrescriptionEditorHub();
};

window.renderPrescExercises = () => {
    if (!currentPrescription) return;
    const p = currentPrescription;
    const container = document.getElementById("exerciseList");
    if (!container) return;
    container.innerHTML = "";
    if (!p.exercises) p.exercises = [];
    p.exercises.forEach((ex, idx) => {
        const div = document.createElement("div");
        div.className = "section-card professionally-styled";
        div.style.marginBottom = "16px";
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                <input type="text" class="form-input" value="${ex.name || ''}" placeholder="Exercise Name" oninput="window.updateExerciseData(${idx}, 'name', this.value)" style="flex: 1; font-weight: 700; font-size: 1rem; border-color: transparent; padding-left: 0;">
                <button class="icon-btn" onclick="window.deleteExerciseRow(${idx})" style="color: #ef4444;"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <div><label style="font-size: 0.7rem; color: #64748b;">Sets/Reps</label><input type="text" class="form-input" value="${ex.setsReps || ''}" placeholder="3x10" oninput="window.updateExerciseData(${idx}, 'setsReps', this.value)"></div>
                <div><label style="font-size: 0.7rem; color: #64748b;">Frequency</label><input type="text" class="form-input" value="${ex.frequency || ''}" placeholder="Daily" oninput="window.updateExerciseData(${idx}, 'frequency', this.value)"></div>
            </div>
        `;
        container.appendChild(div);
    });
};

window.addExerciseRow = () => {
    if (!currentPrescription) return;
    if (!currentPrescription.exercises) currentPrescription.exercises = [];
    currentPrescription.exercises.push({ name: "", setsReps: "", frequency: "" });
    renderPrescExercises();
};

window.updateExerciseData = (idx, key, val) => {
    if (currentPrescription && currentPrescription.exercises[idx]) {
        currentPrescription.exercises[idx][key] = val;
    }
};

window.deleteExerciseRow = (idx) => {
    if (!currentPrescription) return;
    currentPrescription.exercises.splice(idx, 1);
    renderPrescExercises();
};

// Enhanced Hub Renderer
window.renderPrescriptionEditorHub = () => {
    if (!currentPrescription) return;
    const p = currentPrescription;
    const patient = state.patients.find(c => c.id === p.patientId);
    document.getElementById("prescHubPatientName").textContent = patient ? patient.name : "Select Patient";
    
    // Doctor
    const dr = state.doctors ? state.doctors.find(d => d.id === p.doctorId) : null;
    document.getElementById("prescHubDoctorText").textContent = dr ? dr.name : "Select Doctor";

    // Summary labels
    document.getElementById("prescHubDiagnosisText").textContent = p.diagnosis || "Not entered";
    document.getElementById("prescHubSubjectiveSummary").textContent = p.complaints ? (p.complaints.substring(0, 30) + "...") : "Complaints, History, Pain Scale";
    document.getElementById("prescHubObjectiveSummary").textContent = p.observation ? (p.observation.substring(0, 30) + "...") : "Observation, Palpation, ROM/MMT";
    document.getElementById("prescHubExercisesText").textContent = (p.exercises ? p.exercises.length : 0) + " Exercises added";
    document.getElementById("prescHubAdviceText").textContent = p.advice ? (p.advice.substring(0, 30) + "...") : "Not entered";
};


window.renderPrescInternalNotes = () => {
    if (!currentPrescription) return;
    const p = currentPrescription;
    document.getElementById("prescReferringDr").value = p.referringDr || "";
    document.getElementById("prescOccupation").value = p.occupation || "";
    document.getElementById("prescPastHistory").value = p.pastHistory || "";
    document.getElementById("prescDrugHistory").value = p.drugHistory || "";
    document.getElementById("prescPersonalHistory").value = p.personalHistory || "";
};

window.applyPrescInternalNotesChanges = () => {
    if (!currentPrescription) return;
    currentPrescription.referringDr = document.getElementById("prescReferringDr").value;
    currentPrescription.occupation = document.getElementById("prescOccupation").value;
    currentPrescription.pastHistory = document.getElementById("prescPastHistory").value;
    currentPrescription.drugHistory = document.getElementById("prescDrugHistory").value;
    currentPrescription.personalHistory = document.getElementById("prescPersonalHistory").value;
    popScreen();
    renderPrescriptionEditorHub();
};

window.renderPrescAdvice = () => {
    if (!currentPrescription) return;
    document.getElementById("prescAdviceInput").value = currentPrescription.advice || "";
    pushScreen("prescAdvice");
};

window.applyPrescAdviceChanges = () => {
    if (!currentPrescription) return;
    currentPrescription.advice = document.getElementById("prescAdviceInput").value;
    popScreen();
    renderPrescriptionEditorHub();
};

window.renderPrescriptionEditorHub = () => {
    if (!currentPrescription) return;
    
    const p = currentPrescription;
    const patient = state.patients.find(pt => pt.id === p.patientId);
    document.getElementById("prescHubPatientName").textContent = patient ? patient.name : "Select Patient";
    
    // Subjective Summary
    const subText = p.complaints ? (p.complaints.substring(0, 25) + "...") : "Complaints, History, Pain Scale";
    document.getElementById("prescHubSubjectiveSummary").textContent = subText;

    // Objective Summary
    const objText = p.observation ? (p.observation.substring(0, 25) + "...") : (p.measurements && p.measurements.length > 0 ? (p.measurements.length + " metrics recorded") : "Observation, Palpation, ROM/MMT");
    document.getElementById("prescHubObjectiveSummary").textContent = objText;

    document.getElementById("prescHubDiagnosisText").textContent = p.diagnosis || "Diagnosis & Clinical Impression";
    
    const doc = state.doctors.find(d => d.id === p.doctorId);
    document.getElementById("prescHubDoctorText").textContent = doc ? doc.name : "Select Doctor";
    
    document.getElementById("prescHubAdviceText").textContent = p.advice ? (p.advice.substring(0, 30) + "...") : "Final patient instructions...";
    
    document.getElementById("prescHubExercisesText").textContent = (p.exercises || []).length + " Exercises added";
};

window.applyPrescPreviewScaling = () => {
    const viewport = document.getElementById("prescPreviewViewport");
    const scaler = document.getElementById("prescPreviewScaler");
    const container = document.getElementById("prescPreviewContainer");
    
    if (!viewport || !scaler || !container) return;

    // A4 Paper width is roughly 794px (210mm at 96dpi)
    const paperWidth = 794; 
    const availableWidth = viewport.clientWidth - 40; // 20px padding each side
    
    if (availableWidth <= 0) {
        setTimeout(window.applyPrescPreviewScaling, 100);
        return;
    }

    const scale = Math.min(1.0, availableWidth / paperWidth);
    
    scaler.style.transform = `scale(${scale})`;
    scaler.style.width = paperWidth + "px";
    
    const paper = container.querySelector("#prescPaper") || container.firstElementChild;
    if (paper) {
        // We MUST set the scaler's footprint height so the main-scroll can scroll correctly
        scaler.style.height = (paper.offsetHeight * scale) + "px";
    }
};

window.renderPrescriptionPreview = () => {
    if (!currentPrescription) return;
    const container = document.getElementById("prescPreviewContainer");
    if (!container) return;
    
    container.innerHTML = window.generatePrescriptionHTML(currentPrescription);
    pushScreen("prescPreview");
    
    // Multiple attempts a bit later to ensure layout settled
    setTimeout(window.applyPrescPreviewScaling, 50);
    setTimeout(window.applyPrescPreviewScaling, 300);
    setTimeout(window.applyPrescPreviewScaling, 800);
};

window.addEventListener('resize', () => {
    if (screenStack[screenStack.length - 1] === 'prescPreview') {
        window.applyPrescPreviewScaling();
    }
});

window.printPrescription = (id) => {
    const p = state.prescriptions.find(x => x.id === id);
    if (!p) return;
    
    let printFrame = document.getElementById("prescPrintFrame");
    if (!printFrame) {
        printFrame = document.createElement("iframe");
        printFrame.id = "prescPrintFrame";
        printFrame.style.position = "fixed";
        printFrame.style.visibility = "hidden";
        printFrame.style.width = "0";
        printFrame.style.height = "0";
        document.body.appendChild(printFrame);
    }

    const html = window.generatePrescriptionHTML(p);
    const doc = printFrame.contentWindow.document;
    doc.open();
    doc.write(`
        <html>
        <head>
            <title>Prescription_${p.id}</title>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800;900&family=Dancing+Script:wght@700&display=swap" rel="stylesheet">
            <style>
                @page { size: A4; margin: 0; }
                body { margin: 0; padding: 0; background: white; width: 210mm; }
                #prescPaper { margin: 0 !important; box-shadow: none !important; width: 210mm !important; }
            </style>
        </head>
        <body>
            ${html}
            <script>
                window.onload = () => {
                    setTimeout(() => {
                        window.print();
                    }, 500);
                };
            </script>
        </body>
        </html>
    `);
    doc.close();
};

window.printCurrentPrescription = () => {
    if (!currentPrescription) return;
    window.printPrescription(currentPrescription.id);
};

window.generatePrescriptionHTML = (p) => {
    const patient = state.patients.find(pt => pt.id === p.patientId) || { name: "Test Patient" };
    const doc = state.doctors.find(d => d.id === p.doctorId) || { name: "", quals: "", regNo: "", contact: "" };
    
    const biz = state.businesses.find(bus => bus.id === state.activeBusinessId) || state.businesses[0] || {};
    const hasLogo = biz.logo && biz.logo.length > 10;
    const date = new Date(p.date || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    
    // Resolve doctor signature
    let sigData = doc.signature;
    if (doc.signatureId) {
        const found = state.signatures.find(s => s.id === doc.signatureId);
        if (found) sigData = found.data;
    }

    return `
    <div style="position: relative; width: 210mm; min-height: 297mm; padding: 10mm 20mm 20mm 20mm; margin: 0 auto; background: white; color: #1e3a8a; font-family: 'Outfit', sans-serif; overflow: hidden;">
        <!-- Watermark -->
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); opacity: 0.03; font-size: 15rem; font-weight: 800; pointer-events: none; z-index: 0; white-space: nowrap;">
            CLINIC NAME
        </div>

        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 20px; position: relative; z-index: 1;">
            <div style="flex: 1;">
                <h1 style="margin: 0; font-size: 2.2rem; font-weight: 900; letter-spacing: -1px; line-height: 1;">CLINIC</h1>
                <div style="font-size: 0.9rem; font-weight: 700; text-transform: uppercase; margin-top: 2px;">Physiotherapy Clinic</div>
                <div style="font-family: 'Dancing Script', cursive; font-size: 1.2rem; color: #3b82f6; margin-top: 5px;">Restore. Realign. Revive.</div>
            </div>
            <div style="flex: 0 0 100px; text-align: center; display: flex; justify-content: center; align-items: center;">
                ${hasLogo ? `<img src="${biz.logo}" style="max-height: 80px; max-width: 100%; object-fit: contain;">` : ''}
            </div>
            <div style="flex: 1; text-align: right; font-size: 0.75rem; color: #1e3a8a; line-height: 1.4;">
                <strong style="font-size: 0.85rem;">${doc.name}</strong><br>
                ${doc.quals}<br>
                Reg No: ${doc.regNo}<br>
                Contact: ${doc.contact}
            </div>
        </div>

        <div style="text-align: center; font-weight: 800; text-decoration: underline; margin-bottom: 30px; font-size: 1.1rem;">
             Physiotherapy Assessment & Treatment Notes
        </div>

        <!-- Patient Info -->
        <div style="display: grid; grid-template-columns: 1.5fr 0.8fr 0.8fr 1fr; gap: 10px; margin-bottom: 30px; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; font-size: 0.85rem;">
            <div><strong>NAME:</strong> <span style="display: block; border-bottom: 1px dotted #1e3a8a; margin-top: 2px; height: 20px;">${patient.name.toUpperCase()}</span></div>
            <div><strong>AGE:</strong> <span style="display: block; border-bottom: 1px dotted #1e3a8a; margin-top: 2px; height: 20px;">${patient.age || '--'}</span></div>
            <div><strong>SEX:</strong> <span style="display: block; border-bottom: 1px dotted #1e3a8a; margin-top: 2px; height: 20px;">${patient.sex || '--'}</span></div>
            <div><strong>DATE:</strong> <span style="display: block; border-bottom: 1px dotted #1e3a8a; margin-top: 2px; height: 20px;">${date}</span></div>
        </div>
        <div style="font-size: 0.8rem; margin-top: -20px; margin-bottom: 30px; color: #64748b;">
            <strong>CONTACT:</strong> ${patient.phone || '--'} | <strong>ADDRESS:</strong> ${patient.address || '--'}
        </div>

        <!-- Clinical Content -->
        <div style="position: relative; z-index: 1;">
            ${p.diagnosis ? `
            <div style="margin-bottom: 25px;">
                <h3 style="font-size: 1rem; margin-bottom: 6px; border-left: 4px solid #f59e0b; padding-left: 10px; color: #1e3a8a;">CLINICAL DIAGNOSIS & IMPRESSION</h3>
                <div style="font-size: 1.05rem; line-height: 1.4; color: #334155; padding-left: 14px; font-weight: 600;">${p.diagnosis}</div>
                ${p.plan ? `<div style="font-size: 0.95rem; line-height: 1.4; color: #475569; padding-left: 14px; margin-top: 4px; white-space: pre-line;">${p.plan}</div>` : ''}
            </div>` : ''}

            ${(p.complaints || p.illnessHistory || p.painScale > 0) ? `
            <div style="margin-bottom: 25px;">
                <h3 style="font-size: 1rem; margin-bottom: 6px; border-left: 4px solid #3b82f6; padding-left: 10px; color: #1e3a8a;">SUBJECTIVE ASSESSMENT</h3>
                <div style="padding-left: 14px; font-size: 0.95rem; line-height: 1.5; color: #475569;">
                    ${p.complaints ? `<div style="margin-bottom: 4px;"><strong>Chief Complaints:</strong> ${p.complaints}</div>` : ''}
                    ${p.illnessHistory ? `<div style="margin-bottom: 4px;"><strong>History:</strong> ${p.illnessHistory}</div>` : ''}
                    ${p.painScale > 0 ? `<div style="margin-bottom: 4px;"><strong>Pain Intensity (VAS):</strong> ${p.painScale}/10 ${p.painFactors ? `(${p.painFactors})` : ''}</div>` : ''}
                </div>
            </div>` : ''}

            ${(p.observation || p.palpation || (p.measurements && p.measurements.length > 0) || p.specialTests) ? `
            <div style="margin-bottom: 25px;">
                <h3 style="font-size: 1rem; margin-bottom: 6px; border-left: 4px solid #10b981; padding-left: 10px; color: #1e3a8a;">OBJECTIVE EXAMINATION</h3>
                <div style="padding-left: 14px; font-size: 0.95rem; line-height: 1.5; color: #475569;">
                    ${p.observation ? `<div style="margin-bottom: 4px;"><strong>Observation:</strong> ${p.observation}</div>` : ''}
                    ${p.palpation ? `<div style="margin-bottom: 4px;"><strong>Palpation:</strong> ${p.palpation}</div>` : ''}
                    
                    ${(p.measurements && p.measurements.length > 0) ? `
                    <div style="margin-top: 8px; margin-bottom: 8px;">
                        <table style="width: 100%; border-collapse: collapse; background: #f8fafc; border: 1px solid #e2e8f0;">
                            <thead>
                                <tr style="background: #eff6ff; color: #1e3a8a; text-align: left;">
                                    <th style="padding: 8px; border: 1px solid #e2e8f0; font-size: 0.85rem;">Measurement / Metric</th>
                                    <th style="padding: 8px; border: 1px solid #e2e8f0; font-size: 0.85rem;">Value / Range</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${p.measurements.map(m => `
                                    <tr>
                                        <td style="padding: 8px; border: 1px solid #e2e8f0;">${m.metric}</td>
                                        <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: 700;">${m.value}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>` : ''}

                    ${p.specialTests ? `<div style="margin-top: 4px;"><strong>Special Tests:</strong> ${p.specialTests}</div>` : ''}
                </div>
            </div>` : ''}

            ${(p.exercises && p.exercises.length > 0) ? `
            <div style="margin-bottom: 30px;">
                <h3 style="font-size: 1rem; margin-bottom: 8px; border-left: 4px solid #8b5cf6; padding-left: 10px; color: #1e3a8a;">HOME EXERCISE PLAN</h3>
                <div style="padding-left: 14px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        ${p.exercises.map((ex, i) => `
                            <div style="margin-bottom: 8px; border-bottom: 1px dotted #e2e8f0; padding-bottom: 4px;">
                                <div style="font-weight: 800; color: #1e3a8a; font-size: 0.95rem;">${i+1}. ${ex.name}</div>
                                <div style="font-size: 0.85rem; color: #64748b;">
                                    Reps: <strong>${ex.setsReps || '--'}</strong> | Freq: <strong>${ex.frequency || '--'}</strong>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>` : ''}

            ${p.advice ? `
            <div style="margin-bottom: 30px;">
                <h3 style="font-size: 1rem; margin-bottom: 6px; border-left: 4px solid #d97706; padding-left: 10px; color: #1e3a8a;">ADVICE & INSTRUCTIONS</h3>
                <div style="font-size: 0.95rem; line-height: 1.6; color: #475569; padding-left: 14px; white-space: pre-line; background: #fffbeb; padding: 10px; border-radius: 4px;">${p.advice}</div>
            </div>` : ''}
        </div>

        <!-- Signature Section -->
        <div style="margin-top: 40px; display: flex; justify-content: flex-end; position: relative; z-index: 1;">
            <div style="text-align: center; min-width: 150px;">
                ${sigData ? `<img src="${sigData}" style="max-height: 60px; margin-bottom: 0;">` : '<div style="height: 60px;"></div>'}
                <div style="border-top: 1px solid #1e3a8a; padding-top: 2px; font-size: 0.85rem; font-weight: 700;">
                    ${doc.name}
                </div>
            </div>
        </div>

        <!-- Footer -->
        <div style="position: absolute; bottom: 15mm; left: 20mm; right: 20mm; text-align: center; border-top: 2px solid #1e3a8a; padding-top: 10px;">
            <div style="font-size: 0.7rem; color: #3b82f6; font-weight: 700; margin-bottom: 4px;">
                Disclaimer: This prescription is valid for physiotherapy consultation and rehabilitation care only.
            </div>
            <div style="font-size: 0.75rem; color: #1e3a8a; font-weight: 600;">
                B-4, Shivam Complex, Hadapsar, Pune. 411013
            </div>
        </div>
    </div>
    `;
};

// Override Save to include all clinical fields
window.savePrescription = () => {
    if (!currentPrescription.patientId) return alert("Select a patient first");

    // Capture from basic info screen (if open)
    const diagInput = document.getElementById("prescDiagnosisInput");
    if (diagInput) currentPrescription.diagnosis = diagInput.value;
    
    const planInput = document.getElementById("prescPlanInput");
    if (planInput) currentPrescription.plan = planInput.value;

    const adviceInput = document.getElementById("prescAdviceInput");
    if (adviceInput) currentPrescription.advice = adviceInput.value;
    
    // Capture Assessment if open
    if (document.getElementById("prescComplaints")) {
        currentPrescription.complaints = document.getElementById("prescComplaints").value;
        currentPrescription.illnessHistory = document.getElementById("prescIllnessHistory").value;
        currentPrescription.painScale = parseInt(document.getElementById("prescPainScale").value);
        currentPrescription.painFactors = document.getElementById("prescPainFactors").value;
    }

    // Capture Objective if open
    if (document.getElementById("prescObservation")) {
        currentPrescription.observation = document.getElementById("prescObservation").value;
        currentPrescription.palpation = document.getElementById("prescPalpation").value;
        currentPrescription.specialTests = document.getElementById("prescSpecialTests").value;
    }
    
    // Capture Internal Notes if open
    if (document.getElementById("prescReferringDr")) {
        currentPrescription.referringDr = document.getElementById("prescReferringDr").value;
        currentPrescription.occupation = document.getElementById("prescOccupation").value;
        currentPrescription.pastHistory = document.getElementById("prescPastHistory").value;
        currentPrescription.drugHistory = document.getElementById("prescDrugHistory").value;
        currentPrescription.personalHistory = document.getElementById("prescPersonalHistory").value;
    }

    currentPrescription.date = currentPrescription.date || new Date().toISOString().split("T")[0];
    
    if (!state.prescriptions) state.prescriptions = [];
    const idx = state.prescriptions.findIndex(p => p.id === currentPrescription.id);
    if (idx !== -1) {
        state.prescriptions[idx] = JSON.parse(JSON.stringify(currentPrescription));
    } else {
        state.prescriptions.push(JSON.parse(JSON.stringify(currentPrescription)));
    }

    save();
    window.renderPrescriptionScreen();
    pushScreen("prescription"); // Back to list
};

window.deletePrescription = () => {
  if (!currentPrescription) return;
  window.showConfirmModal("Delete Clinical Record", "Are you sure you want to delete this clinical record?", () => {
    state.prescriptions = state.prescriptions.filter(p => p.id !== currentPrescription.id);
    save();
    popScreen();
    window.renderPrescriptionScreen();
  });
};

window.exportFullPreviewToPDF = () => {
    const element = document.getElementById('fullPdfFrame');
    if (!element) return;
    
    const isPrescription = !!element.querySelector('.presc-container');
    const nameStr = element.querySelector('#previewClientName')?.innerText || 'Document';
    const filename = isPrescription ? `Prescription_${nameStr}.pdf` : `Invoice_${nameStr}.pdf`;

    const opt = {
      margin: 0,
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().from(element).set(opt).save();
};

window.filterInvoices = (filter, btn) => {
    state.activeFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(el => el.classList.remove('active'));
    if (btn) btn.classList.add('active');
    window.renderDashboard();
};

// ==========================================
// REPORTS MODULE LOGIC
// ==========================================

state.reportFilter = state.reportFilter || { dateRange: 'last30', currency: 'inr' };

let trendingChartInstance = null;
let clientPieChartInstance = null;
let itemPieChartInstance = null;

const getFilteredInvoices = (dateRangeFilter) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    let past = new Date();
    past.setHours(0, 0, 0, 0);
    
    if (dateRangeFilter === 'last30') {
        past.setDate(past.getDate() - 30);
    } else if (dateRangeFilter === 'thisMonth') {
        past.setDate(1);
    } else if (dateRangeFilter === 'lastMonth') {
        past = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        today.setDate(0); 
    } else if (dateRangeFilter === 'thisYear') {
        past.setMonth(0, 1);
    } else if (dateRangeFilter === 'lifetime') {
        past = new Date(2000, 0, 1); 
    }
    
    return state.invoices.filter(inv => {
        if (!inv.date) return false;
        const d = new Date(
            inv.date.includes('.') 
            ? `${inv.date.split('.')[2]}-${inv.date.split('.')[1]}-${inv.date.split('.')[0]}` 
            : inv.date
        );
        return d >= past && d <= today;
    });
};

const getReportMetrics = (invoices) => {
    let sales = 0;
    let paid = 0;
    invoices.forEach(inv => {
        sales += Number(inv.total) || 0;
        paid += (inv.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    });
    return { sales, paid };
};

const groupSalesByDate = (invoices) => {
    const map = {};
    invoices.forEach(inv => {
        const dStr = formatDate(inv.date).substring(0, 5); // Just DD.MM for graph
        map[dStr] = (map[dStr] || 0) + (Number(inv.total) || 0);
    });
    return Object.entries(map).sort((a,b) => {
        const parseD = s => new Date(2025, parseInt(s.split('.')[1])-1, parseInt(s.split('.')[0]));
        return parseD(a[0]) - parseD(b[0]);
    });
};

const getClientSales = (invoices) => {
    const map = {};
    invoices.forEach(inv => {
        const id = inv.patient?.id || inv.clientName || 'Walk-in';
        const name = inv.patient?.name || inv.clientName || 'Walk-in';
        if (!map[id]) map[id] = { name, total: 0, count: 0 };
        map[id].total += (Number(inv.total) || 0);
        map[id].count += 1;
    });
    const totalSales = Object.values(map).reduce((sum, c) => sum + c.total, 0);
    return Object.values(map)
        .sort((a,b) => b.total - a.total)
        .map(c => ({...c, pct: totalSales > 0 ? ((c.total/totalSales)*100).toFixed(1) : "0.0" }));
};

const getItemSales = (invoices) => {
    const map = {};
    invoices.forEach(inv => {
        (inv.items || []).forEach(item => {
            const name = item.name || 'Unknown Item';
            if (!map[name]) map[name] = { name, qty: 0, total: 0 };
            const q = Number(item.qty) || 1;
            const t = q * (Number(item.price) || 0);
            map[name].qty += q;
            map[name].total += t;
        });
    });
    const totalSales = Object.values(map).reduce((sum, i) => sum + i.total, 0);
    const totalQty = Object.values(map).reduce((sum, i) => sum + i.qty, 0);
    return {
        totalQty,
        totalSales,
        items: Object.values(map)
            .sort((a,b) => b.total - a.total)
            .map(i => ({...i, pct: totalSales > 0 ? ((i.total/totalSales)*100).toFixed(1) : "0.0" }))
    };
};

window.renderReportDashboard = () => {
    console.log("Reports: Starting render...");
    try {
        pushScreen("reportDashboard");
        
        const loader = document.getElementById('reportLoadingIndicator');
        if (loader) loader.style.display = 'flex';

        const rangeEl = document.getElementById('reportDateFilter');
        if (!rangeEl) throw new Error("Missing reportDateFilter element");
        
        const range = rangeEl.value || 'last30';
        state.reportFilter.dateRange = range;
        
        console.log("Reports: Filtering for range:", range);
        const invoices = getFilteredInvoices(range);
        const metrics = getReportMetrics(invoices);
        console.log("Reports: Found metrics:", metrics);
        
        const safeSetText = (id, txt) => {
            const el = document.getElementById(id);
            if (el) el.innerText = txt;
        };

        safeSetText('reportTotalSalesVal', formatINR(metrics.sales));
        safeSetText('reportTotalPaidVal', formatINR(metrics.paid));
        safeSetText('reportTrendingSubtitle', `${invoices.length} invoices`);
        
        console.log("Reports: Rendering charts...");
        try { renderTrendingChart(invoices); } catch(e) { console.error("Trending Chart Error:", e); }
        
        const clientData = getClientSales(invoices);
        try { renderClientPieChart(clientData); } catch(e) { console.error("Client Pie Error:", e); }
        renderClientMiniList(clientData);
        
        const itemData = getItemSales(invoices);
        try { renderItemPieChart(itemData.items); } catch(e) { console.error("Item Pie Error:", e); }
        renderItemMiniList(itemData.items);

        if (loader) loader.style.display = 'none';
        console.log("Reports: Render Complete.");
    } catch (err) {
        console.error("CRITICAL ERROR in renderReportDashboard:", err);
        const loader = document.getElementById('reportLoadingIndicator');
        if (loader) loader.style.display = 'none';
        alert("Reports Error: " + err.message);
    }
};

const _syncFilters = (val) => {
    state.reportFilter.dateRange = val;
    document.getElementById('reportDateFilter').value = val;
    document.getElementById('reportClientDateFilter').value = val;
    document.getElementById('reportItemDateFilter').value = val;
};

document.getElementById('reportDateFilter').addEventListener('change', (e) => {
    _syncFilters(e.target.value);
    window.renderReportDashboard();
});
document.getElementById('reportClientDateFilter').addEventListener('change', (e) => {
    _syncFilters(e.target.value);
    window.showSalesByClient(); 
});
document.getElementById('reportItemDateFilter').addEventListener('change', (e) => {
    _syncFilters(e.target.value);
    window.showSalesByItem(); 
});

const renderTrendingChart = (invoices) => {
    const ctx = document.getElementById('salesTrendingChart').getContext('2d');
    if (trendingChartInstance) trendingChartInstance.destroy();
    
    const data = groupSalesByDate(invoices);
    const labels = data.map(d => d[0]);
    const values = data.map(d => d[1]);
    if (labels.length === 0) { labels.push('No Data'); values.push(0); }

    trendingChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Sales',
                data: values,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointBackgroundColor: '#3b82f6'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { beginAtZero: true, border: { dash: [4, 4] }, grid: { color: '#e2e8f0' }, ticks: { maxTicksLimit: 5, font: { size: 10 } } }
            }
        }
    });
};

const CHART_COLORS = ['#6366f1', '#60a5fa', '#38bdf8', '#fbbf24', '#a3e635'];
const _renderPieChart = (canvasId, instanceObj, dataList) => {
    const ctx = document.getElementById(canvasId).getContext('2d');
    if (instanceObj) instanceObj.destroy();
    
    const top5 = dataList.slice(0, 5);
    const labels = top5.map(c => c.name);
    const values = top5.map(c => c.total);
    if (values.length === 0) { labels.push('No Sales'); values.push(1); }

    return new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data: values, backgroundColor: CHART_COLORS, borderWidth: 2, borderColor: '#ffffff' }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '55%',
            plugins: { legend: { display: false } }
        }
    });
};

const renderClientPieChart = (clientData) => {
    clientPieChartInstance = _renderPieChart('salesClientPieChart', clientPieChartInstance, clientData);
};
const renderItemPieChart = (itemsData) => {
    itemPieChartInstance = _renderPieChart('salesItemPieChart', itemPieChartInstance, itemsData);
};

const _generateListHTML = (list, isItem = false) => {
    if (list.length === 0) return `<div style="text-align: center; color: #94a3b8; padding: 20px;">No data available</div>`;
    return list.map((item, idx) => {
        const color = CHART_COLORS[idx % CHART_COLORS.length];
        return `
            <div style="display: flex; align-items: stretch; gap: 12px; margin-bottom: 12px; padding: 12px 0; border-bottom: 1px dashed #e2e8f0;">
                <div style="width: 45px; height: 45px; border-radius: 8px; background: ${color}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; flex-shrink: 0;">
                    ${item.pct}%
                </div>
                <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="font-weight: 500; color: #1e293b; font-size: 0.95rem;">${item.name}</span>
                        <span style="font-weight: 700; color: #1e293b;">${formatINR(item.total)}</span>
                    </div>
                    <div style="color: #94a3b8; font-size: 0.8rem; margin-bottom: 6px;">
                        ${isItem ? `QTY: ${item.qty.toFixed(1)}` : `Invoices: ${item.count}`}
                    </div>
                    <div style="width: 100%; height: 4px; background: #f1f5f9; border-radius: 2px; overflow: hidden;">
                        <div style="width: ${item.pct}%; height: 100%; background: ${color}; border-radius: 2px;"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

const renderClientMiniList = (clientData) => {
    document.getElementById('reportClientMiniList').innerHTML = _generateListHTML(clientData.slice(0, 5), false);
};
const renderItemMiniList = (itemsData) => {
    document.getElementById('reportItemMiniList').innerHTML = _generateListHTML(itemsData.slice(0, 5), true);
};

window.showSalesByClient = () => {
    try {
        pushScreen("reportClient");
        const invoices = getFilteredInvoices(state.reportFilter.dateRange);
        const clientData = getClientSales(invoices);
        document.getElementById('reportClientFullList').innerHTML = _generateListHTML(clientData, false);
    } catch (e) { console.error(e); }
};

window.showSalesByItem = () => {
    try {
        pushScreen("reportItem");
        const invoices = getFilteredInvoices(state.reportFilter.dateRange);
        const itemData = getItemSales(invoices);
        document.getElementById('reportItemQtyVal').innerText = Number(itemData.totalQty).toFixed(1);
        document.getElementById('reportItemTotalVal').innerText = formatINR(itemData.totalSales);
        document.getElementById('reportItemFullList').innerHTML = _generateListHTML(itemData.items, true);
    } catch (e) { console.error(e); }
};

// ==========================================
// DATA MANAGEMENT & BACKUP LOGIC
// ==========================================

// --- Data Management Helpers (Consolidated) ---
window.exportAllData = window.exportData;
window.importAllData = window.importData;

window.importSalesData = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importData = JSON.parse(event.target.result);
                const newInvoices = importData.invoices || [];
                const newPatients = importData.patients || [];
                
                window.showConfirmModal("Merge Data", `Do you want to MERGE ${newInvoices.length} invoices and ${newPatients.length} patients into your current list?`, () => {
                    // Merge patients (avoid duplicates by ID)
                    newPatients.forEach(np => {
                        if (!state.patients.find(p => p.id === np.id)) {
                            state.patients.push(np);
                        }
                    });
                    
                    // Merge invoices (avoid duplicates by ID)
                    newInvoices.forEach(ni => {
                        if (!state.invoices.find(v => v.id === ni.id)) {
                            state.invoices.push(ni);
                        }
                    });
                    
                    save();
                    alert("Import/Merge Successful!");
                    window.renderDashboard();
                    pushScreen("dashboard");
                });
            } catch (err) {
                alert("Import failed: " + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
};

/**
 * Native Sharing / Printing Bridge
 * Communicates with Expo's ReactNativeWebView
 */

window.shareDocumentNative = () => {
    const element = document.getElementById('fullPdfFrame');
    if (!element) return;
    
    // Get identifying info
    const isPrescription = !!element.querySelector('.presc-container');
    const nameStr = element.querySelector('#previewClientName')?.innerText || 'Document';
    const filename = isPrescription ? `Prescription_${nameStr}.pdf` : `Invoice_${nameStr}.pdf`;

    // Special case for full preview sharing
    if (window.ReactNativeWebView) {
        NativeBridge.postMessage(JSON.stringify({
            type: 'share',
            html: element.innerHTML,
            filename: filename
        }));
    } else {
        // Fallback for web: just use the existing export/print
        window.exportFullPreviewToPDF();
    }
};

window.shareCurrentPrescription = () => { window.print(); };

// Redundant exportToExcel removed (Better version exists at line 2849)

// End of file


// Initialize Sync on load
SyncManager.init();
// --- Additional Global Fixes ---
window.addNewClient = () => {
    window.editingClientId = null;
    pushScreen("clientForm");
};

window.deleteItemFromLibrary = (id) => {
    window.showConfirmModal("Delete Item", "Remove this item from your library?", () => {
        state.items = state.items.filter(i => i.id !== id);
        save();
        alert("Item deleted");
        if (window.renderItemPicker) window.renderItemPicker();
    });
};

window.saveToContacts = (client) => {
    const vcard = "BEGIN:VCARD\nVERSION:3.0\nFN:" + (client.name || "Client") + "\nTEL;TYPE=CELL:" + (client.phone || "") + "\nEND:VCARD";
    const blob = new Blob([vcard], { type: "text/vcard" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', (client.name || "Client") + ".vcf");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

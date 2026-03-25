const fs = require('fs');

let indexHtml = fs.readFileSync('index.html', 'utf8');

// The corrupted point is around the Share App menu item
// We need to restore from <div class="menu-item" id="menuShare"> up to the summary-cards
const corruptedSearch = /<div class="menu-item" id="menuShare">[\s\S]*?<div class="value" id="creditVal"/;

const restorationCode = `<div class="menu-item" id="menuShare">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
        Share App
      </div>
      <div class="menu-item" id="menuSettings">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1-2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        Settings
      </div>
    </div>
  </nav>

  <div class="app-container">
    <header id="appHeader">
      <button class="icon-btn" id="headerLBtn">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </button>
      <h1 id="headerTitle">Invoice</h1>
      <div class="header-actions" id="headerRActions"></div>
    </header>

    <main class="app-main">
      <section class="screen active" style="background: white;" id="dashboardScreen">
        <div class="main-scroll">
          <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px; background: white; border-bottom: 2px solid #f1f5f9; margin-bottom: 12px;">
            <div class="search-bar" style="position: relative; display: flex; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0 12px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <input type="text" id="dashboardSearch" placeholder="Search invoices or clients..." oninput="window.renderDashboard()" style="flex: 1; border: none; background: transparent; padding: 12px; font-size: 0.95rem; outline: none;">
            </div>
          </div>
          <div class="summary-cards" style="grid-template-columns: repeat(3, 1fr);">
            <div class="summary-card">
              <div class="label">Total Unpaid</div>
              <div class="value" id="unpaidVal">₹0.00</div>
            </div>
            <div class="summary-card overdue">
              <div class="label">Total Overdue</div>
              <div class="value" id="overdueVal">₹0.00</div>
            </div>
            <div class="summary-card advance" style="border-color: #bfdbfe; background: #eff6ff;">
              <div class="label" style="color: #3b82f6;">Total Credit</div>
              <div class="value" id="creditVal"`;

if (corruptedSearch.test(indexHtml)) {
    indexHtml = indexHtml.replace(corruptedSearch, restorationCode);
    fs.writeFileSync('index.html', indexHtml, 'utf8');
    console.log('Restored index.html');
} else {
    console.error('Could not find corrupted section in index.html');
}

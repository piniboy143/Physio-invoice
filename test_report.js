const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = `<!DOCTYPE html><html><body>
<div id="reportDateFilter" value="last30"></div>
<div id="reportTotalSalesVal"></div>
<div id="reportTotalPaidVal"></div>
<div id="reportTrendingSubtitle"></div>
<canvas id="salesTrendingChart"></canvas>
<canvas id="salesClientPieChart"></canvas>
<div id="reportClientMiniList"></div>
<canvas id="salesItemPieChart"></canvas>
<div id="reportItemMiniList"></div>
</body></html>`;

const dom = new JSDOM(html);
global.window = dom.window;
global.document = dom.window.document;
global.localStorage = { getItem: () => null, setItem: () => {} };
global.Chart = class { constructor() {} destroy() {} };
global.html2pdf = () => ({ set: () => ({ save: () => {} }), from: () => ({ set: () => ({ save: () => {} }) }) });

let code = fs.readFileSync('app.js', 'utf8');

try {
  eval(code);
  console.log("App parsed OK");
  window.renderReportDashboard();
  console.log("renderReportDashboard executed OK");
} catch (e) {
  console.error("ERROR:");
  fs.writeFileSync('real_error.txt', e.stack);
}

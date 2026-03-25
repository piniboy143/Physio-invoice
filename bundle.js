const fs = require('fs');
const path = require('path');
const https = require('https');

const assets = {
    "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js": "html2pdf.js",
    "https://cdn.jsdelivr.net/npm/chart.js": "chart.js",
    "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js": "html2canvas.js",
    "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js": "jspdf.js",
    "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js": "xlsx.js"
};

async function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, response => {
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', err => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

async function run() {
    console.log("Starting build process...");

    // 1. Download missing libraries
    for (const [url, file] of Object.entries(assets)) {
        if (!fs.existsSync(file)) {
            console.log(`Downloading ${url}...`);
            await download(url, file);
        } else {
            console.log(`${file} already exists.`);
        }
    }

    // 2. Read Source Files
    const html = fs.readFileSync('index.html', 'utf8');
    const css = fs.readFileSync('styles.css', 'utf8');
    const appJs = fs.readFileSync('app.js', 'utf8');

    // 3. Process and Inline
    let finalHtml = html;

    // Replace CSS link with <style>
    finalHtml = finalHtml.replace(/<link rel="stylesheet" href="styles.css[^"]*">/i, `<style>\n${css}\n</style>`);

    // Inline JS Libraries (replace script tags with actual content)
    for (const [url, file] of Object.entries(assets)) {
        const jsContent = fs.readFileSync(file, 'utf8').replace(/<\/script>/g, '<\\/script>');
        finalHtml = finalHtml.replace(new RegExp(`<script src="${url}"></script>`, 'i'), `<script>\n${jsContent}\n</script>`);
    }

    // Inline app.js (replace the v2.2 script tag)
    const safeApp = appJs.replace(/<\/script>/g, '<\\/script>');
    finalHtml = finalHtml.replace(/<script src="app.js[^"]*"><\/script>/i, `<script>\n${safeApp}\n</script>`);

    // Remove Service Worker registration script
    finalHtml = finalHtml.replace(/<script>\s*if\s*\('serviceWorker'[\s\S]*?<\/script>/i, '');

    // 4. Output to dist/index.html
    if (!fs.existsSync('dist')) {
        fs.mkdirSync('dist');
    }
    fs.writeFileSync('dist/index.html', finalHtml, 'utf8');

    console.log("Done! dist/index.html is ready.");
}

run().catch(err => {
    console.error("Build failed:", err);
    process.exit(1);
});

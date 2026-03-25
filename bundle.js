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
        if (fs.existsSync(dest)) {
            console.log(`${dest} already exists.`);
            return resolve();
        }
        console.log(`Downloading ${url}...`);
        const file = fs.createWriteStream(dest);
        https.get(url, response => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', err => {
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            reject(err);
        });
    });
}

async function run() {
    console.log("Starting build process...");

    // 1. Download missing libraries
    for (const [url, file] of Object.entries(assets)) {
        await download(url, file);
    }

    // 2. Read Source Files
    const html = fs.readFileSync('index.html', 'utf8');
    const css = fs.readFileSync('styles.css', 'utf8');
    const appJs = fs.readFileSync('app.js', 'utf8');

    // 3. Process and Inline
    let finalHtml = html;

    // Helper for safe replacement (no $ expansion)
    function safeReplace(source, targetPattern, replacement) {
        // Find the match using regex first to get the exact string
        const match = source.match(targetPattern);
        if (match) {
            console.log(`Inlining ${match[0]}...`);
            const parts = source.split(match[0]);
            return parts.join(replacement);
        }
        return source;
    }

    // Replace CSS link with <style>
    finalHtml = safeReplace(finalHtml, /<link rel="stylesheet" href="styles.css[^"]*">/i, `<style>\n${css}\n</style>`);

    // Inline JS Libraries
    for (const [url, file] of Object.entries(assets)) {
        const jsContent = fs.readFileSync(file, 'utf8').replace(/<\/script>/g, '<\\/script>');
        const libRegex = new RegExp(`<script src="${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"></script>`, 'i');
        finalHtml = safeReplace(finalHtml, libRegex, `<script>\n${jsContent}\n</script>`);
    }

    // Inline app.js
    const safeApp = appJs.replace(/<\/script>/g, '<\\/script>');
    finalHtml = safeReplace(finalHtml, /<script src="app.js[^"]*"><\/script>/i, `<script>\n${safeApp}\n</script>`);

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

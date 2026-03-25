$htmlPath = "d:\Billing\index.html"
$appJsPath = "d:\Billing\app.js"
$outputPath = "d:\Billing\index.html"

# 1. Load the original HTML (assumed to be the clean-ish state from Git)
$html = Get-Content $htmlPath -Raw

# 2. Define CDN Assets to download
$cdnAssets = @(
    "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
    "https://cdn.sheetjs.com/xlsx-0.19.3/package/dist/xlsx.full.min.js"
)

$jsInlines = ""

foreach ($url in $cdnAssets) {
    Write-Host "Downloading $url..."
    $content = Invoke-WebRequest -Uri $url -UseBasicParsing | Select-Object -ExpandProperty Content
    # Escape </script> inside JS
    $content = $content -replace '</script>', '<\/script>'
    $jsInlines += "`n<!-- Inlined from $url -->`n<script>`n$content`n</script>`n"
}

# 3. Process app.js
Write-Host "Inlining app.js..."
$appJs = Get-Content $appJsPath -Raw
# Escape </script>
$appJs = $appJs -replace '</script>', '<\/script>'

# Wrap in DOMContentLoaded to ensure elements like #invoiceBtn exist
$wrappedAppJs = @"
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded and parsed. Starting app.js logic.');
    $appJs
});
"@

$jsInlines += "`n<!-- Inlined from local app.js (wrapped in DOMContentLoaded) -->`n<script>`n$wrappedAppJs`n</script>`n"

# 4. Remove original script tags to prevent double loading
# We use a broad regex to find and remove script tags that point to these sources
foreach ($url in $cdnAssets) {
    $urlEscaped = [regex]::Escape($url)
    $html = $html -replace "<script src=`"$urlEscaped`"></script>", ""
}
# Also remove any app.js or app.js?v=... tags
$html = $html -replace '<script src="app.js[^"]*"></script>', ""
# Remove service worker registration if it exists
$html = $html -replace '<script>[^<]*serviceWorker[^<]*</script>', ""

# 5. Insert all script blocks at the very end of <body>
# We find the </body> tag and insert before it
if ($html -match '</body>') {
    $html = $html -replace '</body>', "$jsInlines`n</body>"
} else {
    Write-Error "Could not find </body> tag in index.html"
}

# 6. Save the final file
[System.IO.File]::WriteAllText($outputPath, $html)
Write-Host "Standalone index.html generated successfully at $outputPath"

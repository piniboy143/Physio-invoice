$assets = @{
    "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js" = "html2pdf.js"
    "https://cdn.jsdelivr.net/npm/chart.js" = "chart.js"
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" = "jspdf_old.js"
    "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js" = "html2canvas.js"
    "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js" = "jspdf_new.js"
    "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js" = "xlsx.js"
}

foreach ($url in $assets.Keys) {
    $outFile = $assets[$url]
    if (-not (Test-Path $outFile)) {
        Write-Host "Downloading $url to $outFile..."
        Invoke-WebRequest -Uri $url -OutFile $outFile
    } else {
        Write-Host "$outFile already exists, skipping download."
    }
}

$indexFile = "index.html"
if (Test-Path $indexFile) {
    [string]$content = Get-Content $indexFile -Raw
    
    # Inline CSS
    $cssFile = "styles.css"
    if (Test-Path $cssFile) {
        $cssContent = Get-Content $cssFile -Raw
        $content = $content.Replace('<link rel="stylesheet" href="styles.css?v=2">', "<style>`n$cssContent`n</style>")
        Write-Host "Inlined styles.css"
    }

    # Inline JS Libraries
    foreach ($url in $assets.Keys) {
        $file = $assets[$url]
        $jsContent = Get-Content $file -Raw
        $safeJS = $jsContent.Replace("</script>", "<\/script>")
        $content = $content.Replace("<script src=""$url""></script>", "<script>`n$safeJS`n</script>")
        Write-Host "Inlined $url"
    }

    # Inline app.js
    $appFile = "app.js"
    if (Test-Path $appFile) {
        $appContent = Get-Content $appFile -Raw
        $safeApp = $appContent.Replace("</script>", "<\/script>")
        $content = $content.Replace('<script src="app.js?v=2.1"></script>', "<script>`n$safeApp`n</script>")
        Write-Host "Inlined app.js"
    }

    # Remove SW
    $content = $content -replace '(?s)<script>\s*if.*''serviceWorker''.*?</script>', ''

    $outputDir = "dist"
    if (-not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir
    }

    Set-Content -Path "$outputDir/index.html" -Value $content -Encoding Utf8
    Write-Host "Done! dist/index.html is now standalone."
}

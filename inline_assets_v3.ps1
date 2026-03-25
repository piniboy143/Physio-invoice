$indexFile = "index.html"

# Files to inline
$assets = @{
    'styles.css' = '  <link rel="stylesheet" href="styles.css?v=2">'
    'app.js'     = '  <script src="app.js?v=2.1"></script>'
    'xlsx.js'    = '  <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>'
    'chart.js'   = '  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>'
    'html2canvas.js' = '  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>'
    'jspdf.js'   = '  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>'
}

if (Test-Path $indexFile) {
    [string]$content = Get-Content $indexFile -Raw
    
    foreach ($file in $assets.Keys) {
        if (Test-Path $file) {
            $fileContent = Get-Content $file -Raw
            
            if ($file -match "styles.css") {
                $replacement = "<style>`n$fileContent`n</style>"
            } else {
                # ESCAPE </script> to avoid breaking HTML
                $safeContent = $fileContent.Replace("</script>", "<\/script>")
                $replacement = "<script>`n$safeContent`n</script>"
            }
            
            $target = $assets[$file]
            if ($content.Contains($target)) {
                $content = $content.Replace($target, $replacement)
                Write-Host "Inlined $file (with escaping if JS)"
            } else {
                # Fallback: maybe the version tag is different
                Write-Host "Warning: Could not find exact target for $file ($target)"
            }
        } else {
            Write-Host "Error: $file not found"
        }
    }

    # REMOVE Service Worker block if it exists (it shouldn't in baseline, but just in case)
    $content = $content -replace '(?s)<script>\s*if.*''serviceWorker''.*?</script>', ''

    Set-Content -Path $indexFile -Value $content -Encoding Utf8
    Write-Host "Successfully updated index.html with all escaped assets"
} else {
    Write-Host "Error: index.html not found"
}

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
            $target = $assets[$file]
            
            if ($file -match "styles.css") {
                $replacement = "<style>`n$fileContent`n</style>"
            } else {
                $replacement = "<script>`n$fileContent`n</script>"
            }
            
            if ($content.Contains($target)) {
                $content = $content.Replace($target, $replacement)
                Write-Host "Inlined $file"
            } else {
                Write-Host "Warning: Could not find target for $file ($target)"
            }
        } else {
            Write-Host "Error: $file not found"
        }
    }

    Set-Content -Path $indexFile -Value $content -Encoding Utf8
    Write-Host "Successfully updated index.html with all assets"
} else {
    Write-Host "Error: index.html not found"
}

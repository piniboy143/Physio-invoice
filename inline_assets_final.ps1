$htmlPath = "d:\Billing\index.html"
$appJsPath = "d:\Billing\app.js"
$stylesPath = "d:\Billing\styles.css"
$outputPath = "d:\Billing\index_standalone.html"

# Libraries to inline (local files)
$libs = @(
    "chart.js",
    "html2canvas.js",
    "html2pdf.js",
    "jspdf.js",
    "xlsx.js"
)

# Write-Host "Restoring index.html from Git..."
# git checkout a7f4ee7a -- $htmlPath

Write-Host "Loading index.html..."
$html = [System.IO.File]::ReadAllText($htmlPath)

# 1. Extract pieces
$headEnd = $html.IndexOf('</head>')
$bodyStart = $html.IndexOf('<body')
$bodyEnd = $html.IndexOf('</body>')

if ($headEnd -lt 0 -or $bodyStart -lt 0 -or $bodyEnd -lt 0) {
    Write-Error "Could not find expected HTML tags."
    exit
}

$headContent = $html.Substring(0, $headEnd)
# Strip existing local stylesheet links
$headContent = $headContent -replace '<link rel="stylesheet" href="styles.css[^"]*">', ""

$bodyTagEnd = $html.IndexOf('>', $bodyStart) + 1
$bodyTag = $html.Substring($bodyStart, $bodyTagEnd - $bodyStart)
$bodyInner = $html.Substring($bodyTagEnd, $bodyEnd - $bodyTagEnd)

# 2. Process CSS
Write-Host "Processing CSS..."
$css = [System.IO.File]::ReadAllText($stylesPath)

# 3. Process Libraries
Write-Host "Processing Libraries..."
$jsInlines = ""
foreach ($lib in $libs) {
    $libPath = "d:\Billing\$lib"
    if (Test-Path $libPath) {
        Write-Host "Inlining $lib..."
        $content = [System.IO.File]::ReadAllText($libPath)
        $content = $content.Replace('</script>', '<\/script>')
        $jsInlines += "`n<!-- Inlined from $lib -->`n<script>`n" + $content + "`n</script>`n"
    }
}

# 4. Process app.js
Write-Host "Processing app.js..."
$appJs = [System.IO.File]::ReadAllText($appJsPath)
$appJs = $appJs.Replace('</script>', '<\/script>')

# Do NOT wrap in a function scope, as it breaks HTML onclick handlers.
# Instead, rely on placement at the end of <body>.
$jsInlines += "`n<!-- Local app.js -->`n<script>`n" + $appJs + "`n</script>`n"

# 5. Assemble
Write-Host "Assembling final HTML..."
$finalHtml = $headContent + "`n<style>`n" + $css + "`n</style>`n</head>`n" + $bodyTag + "`n" + $bodyInner + "`n" + $jsInlines + "`n</body>`n</html>"

# Final clean of stray script tags in the assembled string (using literal Replace if possible or safe regex)
# Since we want to remove tags like <script src="app.js"></script>, we'll be careful.
# Actually, it's safer to do this on $bodyInner before assembly.
$bodyInnerClean = $bodyInner -replace '<script src="[^"]*"></script>', ""
$finalHtml = $headContent + "`n<style>`n" + $css + "`n</style>`n</head>`n" + $bodyTag + "`n" + $bodyInnerClean + "`n" + $jsInlines + "`n</body>`n</html>"

[System.IO.File]::WriteAllText($outputPath, $finalHtml, [System.Text.UTF8Encoding]::new($false))
Write-Host "Assembly complete: $outputPath"
Write-Host "Final size: $(( (Get-Item $outputPath).Length / 1MB ).ToString('F2')) MB"

# Overwrite index.html
Copy-Item $outputPath $htmlPath -Force
Write-Host "Active index.html updated."

$indexFile = "index.html"
$cssFile = "styles.css"
$jsFile = "app.js"

if (Test-Path $indexFile) {
    $indexContent = Get-Content $indexFile -Raw
    $cssContent = Get-Content $cssFile -Raw
    $jsContent = Get-Content $jsFile -Raw

    $cssTarget = '  <link rel="stylesheet" href="styles.css?v=2">'
    $jsTarget = '  <script src="app.js?v=2.1"></script>'

    $cssReplacement = "<style>`n$cssContent`n</style>"
    $jsReplacement = "<script>`n$jsContent`n</script>"

    $newIndexContent = $indexContent.Replace($cssTarget, $cssReplacement)
    $newIndexContent = $newIndexContent.Replace($jsTarget, $jsReplacement)

    Set-Content -Path $indexFile -Value $newIndexContent -Encoding Utf8
    Write-Host "Successfully inlined CSS and JS into index.html"
} else {
    Write-Host "Error: index.html not found"
}

$bytes = [IO.File]::ReadAllBytes("d:\Billing\dist\index.html")
$base64 = [Convert]::ToBase64String($bytes)
$content = "export const indexHtmlBase64 = '$base64';"
Set-Content -Path "d:\Billing\index_bundle.js" -Value $content -Encoding UTF8
Write-Host "Successfully updated index_bundle.js"

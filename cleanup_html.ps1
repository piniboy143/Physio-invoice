$path = "d:\Billing\index.html"
Write-Host "Cleaning $path..."
$c = Get-Content $path -Raw
$endHtml = $c.IndexOf('</html>')
if ($endHtml -gt 0) {
    Write-Host "Found </html> at index $endHtml. Truncating..."
    $clean = $c.Substring(0, $endHtml + 7)
    [System.IO.File]::WriteAllText($path, $clean, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Cleanup complete."
} else {
    Write-Warning "</html> not found in $path"
}

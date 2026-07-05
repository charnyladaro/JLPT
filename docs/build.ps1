# Regenerates data.js from the five reviewer .md files.
# Run this whenever a JLPT_Nx_Reviewer.md changes:  pwsh ./build.ps1
# index.html, styles.css, and app.js are static — only data.js is generated.

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

$files = [ordered]@{
    N5 = 'JLPT_N5_Reviewer.md'
    N4 = 'JLPT_N4_Reviewer.md'
    N3 = 'JLPT_N3_Reviewer.md'
    N2 = 'JLPT_N2_Reviewer.md'
    N1 = 'JLPT_N1_Reviewer.md'
}

$data = [ordered]@{}
foreach ($k in $files.Keys) {
    $path = Join-Path $root $files[$k]
    if (-not (Test-Path $path)) { throw "Missing reviewer file: $path" }
    $data[$k] = Get-Content $path -Raw -Encoding utf8
}

$json = $data | ConvertTo-Json -Compress
if ($json.Contains('</script>')) { throw 'Reviewer content contains </script>; refusing to inject.' }

$out = "const JLPT_MD = $json;"
Set-Content -Path (Join-Path $PSScriptRoot 'data.js') -Value $out -Encoding utf8 -NoNewline

$size = [math]::Round((Get-Item (Join-Path $PSScriptRoot 'data.js')).Length / 1KB, 1)
Write-Host "Built data.js ($size KB) from $($files.Count) reviewer files."

param(
    [switch]$Login
)

$ErrorActionPreference = "Stop"
$scriptPath = Join-Path $PSScriptRoot "apps-script\\tools\\deploy-gateway.ps1"
$nodePath = "C:\\Program Files\\nodejs"
$npmGlobalBin = Join-Path $env:APPDATA "npm"

if (-not (Test-Path $scriptPath)) {
    throw "배포 스크립트를 찾지 못했습니다: $scriptPath"
}

if (Test-Path $nodePath) {
    $env:Path = "$nodePath;$env:Path"
}
if (Test-Path $npmGlobalBin) {
    $env:Path = "$npmGlobalBin;$env:Path"
}

& $scriptPath -Login:$Login

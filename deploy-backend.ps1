param(
    [switch]$Login
)

$ErrorActionPreference = "Stop"
$scriptPath = Join-Path $PSScriptRoot "apps-script\\tools\\deploy-gateway.ps1"

if (-not (Test-Path $scriptPath)) {
    throw "배포 스크립트를 찾지 못했습니다: $scriptPath"
}

& $scriptPath -Login:$Login

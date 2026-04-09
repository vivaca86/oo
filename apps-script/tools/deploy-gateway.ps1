param(
    [string]$Title = "stock-eq-gateway",
    [string]$ConfigPath = "..\\config.js",
    [switch]$Login
)

$ErrorActionPreference = "Stop"

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "필수 명령을 찾지 못했습니다: $Name"
    }
}

function Invoke-Clasp {
    param(
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    Push-Location $WorkingDirectory
    try {
        $output = & npx --yes @google/clasp@latest @Arguments 2>&1
        $exitCode = $LASTEXITCODE
        $text = ($output | Out-String).Trim()
        if ($exitCode -ne 0) {
            throw ($text ? $text : "clasp 명령이 실패했습니다.")
        }
        return $text
    }
    finally {
        Pop-Location
    }
}

function Ensure-ClaspProject {
    param(
        [string]$ProjectDirectory,
        [string]$ProjectTitle,
        [switch]$ShouldLogin
    )

    $claspFile = Join-Path $ProjectDirectory ".clasp.json"
    $homeClasp = Join-Path $HOME ".clasprc.json"
    $localClasp = Join-Path $ProjectDirectory ".clasprc.json"

    if ($ShouldLogin -or ((-not (Test-Path $homeClasp)) -and (-not (Test-Path $localClasp)))) {
        Write-Host "clasp 로그인 진행"
        Invoke-Clasp -Arguments @("login", "--no-localhost") -WorkingDirectory $ProjectDirectory | Out-Null
    }

    if (Test-Path $claspFile) {
        return
    }

    Write-Host "Apps Script 프로젝트 생성"
    $tempDir = Join-Path ([IO.Path]::GetTempPath()) ("stock-eq-clasp-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $tempDir | Out-Null

    try {
        Invoke-Clasp -Arguments @("create-script", "--type", "standalone", "--title", $ProjectTitle) -WorkingDirectory $tempDir | Out-Null
        $tempClasp = Join-Path $tempDir ".clasp.json"
        if (-not (Test-Path $tempClasp)) {
            throw ".clasp.json 생성에 실패했습니다."
        }
        Copy-Item $tempClasp $claspFile -Force
    }
    finally {
        if (Test-Path $tempDir) {
            Remove-Item $tempDir -Recurse -Force
        }
    }
}

function Read-DeploymentState {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        return $null
    }
    try {
        return Get-Content -Encoding UTF8 $Path | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Extract-DeploymentId {
    param([string]$Text)
    if ($Text -match '(AKf[\w-]+)\s*@\s*\d+') {
        return $Matches[1]
    }
    if ($Text -match '(AKf[\w-]+)') {
        return $Matches[1]
    }
    throw "배포 ID를 clasp 출력에서 찾지 못했습니다. 출력: $Text"
}

function Update-ConfigGatewayUrl {
    param(
        [string]$ConfigFilePath,
        [string]$ExecUrl
    )

    if (-not (Test-Path $ConfigFilePath)) {
        Write-Warning "config.js를 찾지 못해 gatewayUrl 갱신을 건너뜁니다: $ConfigFilePath"
        return
    }

    $content = Get-Content -Raw -Encoding UTF8 $ConfigFilePath
    $updated = [regex]::Replace($content, 'gatewayUrl:\s*"[^"]*"', ('gatewayUrl: "' + $ExecUrl + '"'))
    if ($updated -ne $content) {
        Set-Content -Encoding UTF8 -Path $ConfigFilePath -Value $updated
    }
}

Require-Command node
Require-Command npm
Require-Command npx

$toolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Resolve-Path (Join-Path $toolDir "..")
$configFile = Resolve-Path (Join-Path $projectDir $ConfigPath) -ErrorAction SilentlyContinue
$deploymentStatePath = Join-Path $projectDir ".deployment.json"

Ensure-ClaspProject -ProjectDirectory $projectDir -ProjectTitle $Title -ShouldLogin:$Login

Write-Host "Apps Script 코드 업로드"
Invoke-Clasp -Arguments @("push", "--force") -WorkingDirectory $projectDir | Out-Null

$existingDeployment = Read-DeploymentState -Path $deploymentStatePath
$description = "stock-eq-gateway web app"
$deployArgs = @("create-deployment", "--description", $description)
if ($existingDeployment -and $existingDeployment.deploymentId) {
    $deployArgs += @("--deploymentId", [string]$existingDeployment.deploymentId)
}

Write-Host "웹앱 배포"
$deployOutput = Invoke-Clasp -Arguments $deployArgs -WorkingDirectory $projectDir
$deploymentId = Extract-DeploymentId -Text $deployOutput
$execUrl = "https://script.google.com/macros/s/$deploymentId/exec"

@{
    deploymentId = $deploymentId
    execUrl = $execUrl
    updatedAt = (Get-Date).ToString("s")
} | ConvertTo-Json | Set-Content -Encoding UTF8 -Path $deploymentStatePath

if ($configFile) {
    Update-ConfigGatewayUrl -ConfigFilePath $configFile -ExecUrl $execUrl
}

Write-Host ""
Write-Host "배포 완료"
Write-Host "deploymentId: $deploymentId"
Write-Host "execUrl     : $execUrl"
Write-Host ""
Write-Host "다음 확인"
Write-Host "1. Apps Script 프로젝트의 Script Properties에 KIS_APP_KEY, KIS_APP_SECRET 설정"
Write-Host "2. 필요하면 웹앱 권한을 Anyone로 다시 확인"
Write-Host "3. 프론트에서 config.js의 gatewayUrl 반영 여부 확인"

param(
    [string]$Title = "stock-eq-gateway",
    [string]$ConfigPath = "..\\config.js",
    [switch]$Login
)

$ErrorActionPreference = "Stop"
$script:ClaspCommand = $null

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

function Invoke-Clasp {
    param(
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    Push-Location $WorkingDirectory
    try {
        if (-not $script:ClaspCommand) {
            throw "clasp command path is not initialized."
        }
        $previousPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            $output = & $script:ClaspCommand @Arguments 2>&1
            $exitCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previousPreference
        }
        $text = ($output | Out-String).Trim()
        if ($exitCode -ne 0) {
            if ([string]::IsNullOrWhiteSpace($text)) {
                throw "clasp command failed."
            }
            throw $text
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
        Write-Host "Running clasp login"
        Invoke-Clasp -Arguments @("login", "--no-localhost") -WorkingDirectory $ProjectDirectory | Out-Null
    }

    if (Test-Path $claspFile) {
        return
    }

    Write-Host "Creating standalone Apps Script project"
    $tempDir = Join-Path ([IO.Path]::GetTempPath()) ("stock-eq-clasp-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $tempDir | Out-Null

    try {
        Invoke-Clasp -Arguments @("create", "--type", "standalone", "--title", $ProjectTitle) -WorkingDirectory $tempDir | Out-Null
        $tempClasp = Join-Path $tempDir ".clasp.json"
        if (-not (Test-Path $tempClasp)) {
            throw "Failed to create .clasp.json"
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
        return Get-Content -Raw -Encoding UTF8 $Path | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Extract-DeploymentId {
    param([string]$Text)
    if ($Text -match '(AKf[\w-]+)') {
        return $Matches[1]
    }
    throw "Could not find deployment ID in clasp output: $Text"
}

function Update-ConfigGatewayUrl {
    param(
        [string]$ConfigFilePath,
        [string]$ExecUrl
    )

    if (-not (Test-Path $ConfigFilePath)) {
        Write-Warning "config.js not found: $ConfigFilePath"
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

$claspCmdCandidate = Join-Path $env:APPDATA "npm\\clasp.cmd"
if (Test-Path $claspCmdCandidate) {
    $script:ClaspCommand = $claspCmdCandidate
}
else {
    Require-Command clasp
    $script:ClaspCommand = "clasp"
}

$toolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = (Resolve-Path (Join-Path $toolDir "..")).Path
$configCandidate = Join-Path $projectDir $ConfigPath
$configFile = if (Test-Path $configCandidate) { (Resolve-Path $configCandidate).Path } else { $null }
$deploymentStatePath = Join-Path $projectDir ".deployment.json"

Ensure-ClaspProject -ProjectDirectory $projectDir -ProjectTitle $Title -ShouldLogin:$Login

Write-Host "Pushing Apps Script files"
Invoke-Clasp -Arguments @("push", "-f") -WorkingDirectory $projectDir | Out-Null

$existingDeployment = Read-DeploymentState -Path $deploymentStatePath
$description = "stock-eq-gateway web app"

if ($existingDeployment -and $existingDeployment.deploymentId) {
    Write-Host "Updating web app deployment"
    $deployOutput = Invoke-Clasp -Arguments @("update-deployment", [string]$existingDeployment.deploymentId) -WorkingDirectory $projectDir
    $deploymentId = [string]$existingDeployment.deploymentId
}
else {
    Write-Host "Creating web app deployment"
    $deployOutput = Invoke-Clasp -Arguments @("deploy", "--description", $description) -WorkingDirectory $projectDir
    $deploymentId = Extract-DeploymentId -Text $deployOutput
}

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
Write-Host "Deploy complete"
Write-Host "deploymentId: $deploymentId"
Write-Host "execUrl     : $execUrl"
Write-Host ""
Write-Host "Next steps"
Write-Host "1. Set KIS_APP_KEY and KIS_APP_SECRET in Script Properties"
Write-Host "2. Confirm the web app access scope if needed"
Write-Host "3. Check config.js gatewayUrl"

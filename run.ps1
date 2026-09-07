<#
   Run:  .\run.ps1 [-SkipInstall] [-ApplicationId <id>] [-CategorySeed <id>]

   - Installs npm packages in bff/ and productpage-vue/ when node_modules is missing
   - Warns when bff\.env is missing
   - Starts the BFF (http://localhost:3000) and the frontend (http://localhost:5173)

   Examples:
     .\run.ps1                                       # whatever bff\.env says
     .\run.ps1 -ApplicationId <your-app> -CategorySeed <your-root-category>
     .\run.ps1 -ApplicationId 1042 -CategorySeed 5   # Norce Open Demo

   The arguments are set as environment variables before the processes start.
   Neither dotenv nor Vite's loadEnv overrides a variable that is already in the
   environment, so what is passed here wins over the .env files without touching
   them.
#>

param(
    [switch]$SkipInstall,

    # Norce application id. The application id decides which tenant you reach,
    # not the host name - the same API host answers with the right tenant's
    # data, and the image CDN follows via the client id from GetApplication.
    [int]$ApplicationId,

    # Root category that the product list and the filters are scoped to.
    [int]$CategorySeed
)

$ErrorActionPreference = "Stop"

function Assert-Tool {
    param([string]$name, [string]$versionArg = "--version")
    try {
        $null = & $name $versionArg
    } catch {
        Write-Error "Could not find '$name' in PATH. Install it first."
    }
}

function Ensure-NpmDeps {
    param([string]$projPath)

    if (-not (Test-Path (Join-Path $projPath "package.json"))) {
        Write-Warning "Skipping '$projPath' (no package.json)."
        return
    }

    if ($SkipInstall) {
        Write-Host "⏭  Skipping npm install in '$projPath' (-SkipInstall)."
        return
    }

    $nodeModules = Join-Path $projPath "node_modules"
    $lockFile    = Join-Path $projPath "package-lock.json"

    Push-Location $projPath
    try {
        if (-not (Test-Path $nodeModules)) {
            if (Test-Path $lockFile) {
                Write-Host "📦 Running 'npm ci' in $projPath ..."
                npm ci
            } else {
                Write-Host "📦 Running 'npm install' in $projPath ..."
                npm install
            }
        } else {
            Write-Host "✅ npm packages already installed in $projPath"
        }
    } finally {
        Pop-Location
    }
}

function Start-NpmApp {
    param(
        [string]$projPath,
        [string]$scriptName
    )

    if (-not (Test-Path (Join-Path $projPath "package.json"))) {
        Write-Warning "Skipping start in '$projPath' (no package.json)."
        return $null
    }

    Write-Host "🚀 Starting '$scriptName' in $projPath ..."
    $cmd = "cd `"$projPath`" && npm run $scriptName"
    $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $cmd `
       -NoNewWindow -PassThru
    return $p
}


# --- Prerequisites ----------------------------------------------------
Assert-Tool -name "node" -versionArg "--version"
Assert-Tool -name "npm"  -versionArg "--version"

$root = $PSScriptRoot
$bffPath = Join-Path $root "bff"
$fePath  = Join-Path $root "productpage-vue"

# --- .env check for the BFF -------------------------------------------
$envFile = Join-Path $bffPath ".env"
$envExample = Join-Path $bffPath ".env.example"
if (-not (Test-Path $envFile)) {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    Write-Host "  'bff\.env' is missing — the BFF starts in MOCK mode." -ForegroundColor Yellow
    Write-Host "  Product data comes from the local JSON files in /mockdata." -ForegroundColor Yellow
    Write-Host "" -ForegroundColor Yellow
    Write-Host "  To use the real Norce APIs:" -ForegroundColor Yellow
    Write-Host "    1. Copy the example file:  cp bff\.env.example bff\.env" -ForegroundColor White
    Write-Host "    2. Fill in your Norce OAuth credentials (OAUTH_ID, OAUTH_SECRET)" -ForegroundColor White
    Write-Host "    3. Set MOCK_DATA=false (or remove the line)" -ForegroundColor White
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    Write-Host ""
} else {
    # .env exists — check whether MOCK_DATA=true
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match '(?m)^\s*MOCK_DATA\s*=\s*true') {
        Write-Host ""
        Write-Host "ℹ  MOCK_DATA=true in bff\.env — the BFF starts in mock mode." -ForegroundColor Cyan
        Write-Host "   Set MOCK_DATA=false to use the real Norce APIs." -ForegroundColor Cyan
        Write-Host ""
    }
}

# --- Command-line overrides -------------------------------------------
if ($ApplicationId) { $env:APPLICATION_ID = "$ApplicationId" }
if ($CategorySeed)  { $env:CATEGORY_SEED  = "$CategorySeed" }

if ($ApplicationId -or $CategorySeed) {
    Write-Host ""
    Write-Host "Overridden from the command line:" -ForegroundColor Cyan
    if ($ApplicationId) { Write-Host "   APPLICATION_ID = $ApplicationId" -ForegroundColor Cyan }
    if ($CategorySeed)  { Write-Host "   CATEGORY_SEED  = $CategorySeed"  -ForegroundColor Cyan }
    Write-Host ""
}

# --- Install dependencies when needed ---------------------------------
Ensure-NpmDeps -projPath $bffPath
Ensure-NpmDeps -projPath $fePath

# --- Start both apps --------------------------------------------------
# "dev" rather than "start": node --watch reloads the BFF when index.js or
# mockBasket.js changes, so editing the backend does not mean restarting by
# hand. Note that a reload resets the in-memory mock basket.
$bffProc = Start-NpmApp -projPath $bffPath -scriptName "dev"
$feProc  = Start-NpmApp -projPath $fePath  -scriptName "dev"

# --- Open the frontend in the browser ---------------------------------
try {
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:5173"
} catch { }

Write-Host ""
Write-Host "✅ BFF:      http://localhost:3000" -ForegroundColor Green
Write-Host "✅ Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop."

# Keep the script alive while the processes run
if ($bffProc -or $feProc) {
    try {
        while ($true) {
            Start-Sleep -Seconds 1
            if ($bffProc -and $bffProc.HasExited) { $bffProc = $null; Write-Warning "The BFF process exited." }
            if ($feProc  -and $feProc.HasExited)  { $feProc  = $null; Write-Warning "The frontend process exited." }
            if (-not $bffProc -and -not $feProc) { break }
        }
    } finally {
        Write-Host "`nShutting down..." -ForegroundColor Yellow
        foreach ($proc in @($bffProc, $feProc)) {
            if ($proc -and -not $proc.HasExited) {
                try {
                    # taskkill /T kills the entire process tree (cmd + node children)
                    taskkill /T /F /PID $proc.Id 2>$null | Out-Null
                } catch { }
            }
        }
        # Reset console mode so the terminal works normally again
        [Console]::TreatControlCAsInput = $false
        Write-Host "Done." -ForegroundColor Green
    }
} else {
    Write-Warning "No processes were started. Check the output above."
}

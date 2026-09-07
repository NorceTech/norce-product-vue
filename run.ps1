<#
   Kör:  .\run.ps1 [-SkipInstall] [-ApplicationId <id>] [-CategorySeed <id>]

   - Installerar npm-paket i bff/ och productpage-vue/ om node_modules saknas
   - Varnar om bff\.env saknas
   - Startar BFF (http://localhost:3000) och Frontend (http://localhost:5173)

   Exempel:
     .\run.ps1                                       # som bff\.env säger
     .\run.ps1 -ApplicationId 1417 -CategorySeed 8
     .\run.ps1 -ApplicationId 1042 -CategorySeed 5   # annan tenant, samma värd

   Argumenten sätts som miljövariabler innan processerna startar. Varken dotenv
   eller Vites loadEnv skriver över variabler som redan finns i miljön, så det
   som anges här vinner över .env-filerna utan att röra dem.
#>

param(
    [switch]$SkipInstall,

    # Norce application-id. Det är app-id, inte värdnamnet, som avgör vilken
    # tenant man når - samma API-värd svarar med rätt tenants data, och
    # bild-CDN:n följer med via klient-id:t i GetApplication.
    [int]$ApplicationId,

    # Rotkategori som produktlistan och filtren scopas till.
    [int]$CategorySeed
)

$ErrorActionPreference = "Stop"

function Assert-Tool {
    param([string]$name, [string]$versionArg = "--version")
    try {
        $null = & $name $versionArg
    } catch {
        Write-Error "Kunde inte hitta '$name' i PATH. Installera det först."
    }
}

function Ensure-NpmDeps {
    param([string]$projPath)

    if (-not (Test-Path (Join-Path $projPath "package.json"))) {
        Write-Warning "Hoppar över '$projPath' (ingen package.json)."
        return
    }

    if ($SkipInstall) {
        Write-Host "⏭  Skippar npm-install i '$projPath' (flaggan -SkipInstall)."
        return
    }

    $nodeModules = Join-Path $projPath "node_modules"
    $lockFile    = Join-Path $projPath "package-lock.json"

    Push-Location $projPath
    try {
        if (-not (Test-Path $nodeModules)) {
            if (Test-Path $lockFile) {
                Write-Host "📦 Kör 'npm ci' i $projPath ..."
                npm ci
            } else {
                Write-Host "📦 Kör 'npm install' i $projPath ..."
                npm install
            }
        } else {
            Write-Host "✅ npm-paket redan installerade i $projPath"
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
        Write-Warning "Hoppar över start i '$projPath' (ingen package.json)."
        return $null
    }

    Write-Host "🚀 Startar '$scriptName' i $projPath ..."
    $cmd = "cd `"$projPath`" && npm run $scriptName"
    $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $cmd `
       -NoNewWindow -PassThru
    return $p
}


# --- Förkrav ----------------------------------------------------------
Assert-Tool -name "node" -versionArg "--version"
Assert-Tool -name "npm"  -versionArg "--version"

$root = $PSScriptRoot
$bffPath = Join-Path $root "bff"
$fePath  = Join-Path $root "productpage-vue"

# --- .env-check för BFF ----------------------------------------------
$envFile = Join-Path $bffPath ".env"
$envExample = Join-Path $bffPath ".env.example"
if (-not (Test-Path $envFile)) {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    Write-Host "  'bff\.env' saknas — BFF:en startar i MOCK-läge." -ForegroundColor Yellow
    Write-Host "  Produktdata kommer från lokala JSON-filer i /mockdata." -ForegroundColor Yellow
    Write-Host "" -ForegroundColor Yellow
    Write-Host "  För att använda riktiga Norce-API:er:" -ForegroundColor Yellow
    Write-Host "    1. Kopiera exempelfilen:  cp bff\.env.example bff\.env" -ForegroundColor White
    Write-Host "    2. Fyll i dina Norce OAuth-credentials (OAUTH_ID, OAUTH_SECRET)" -ForegroundColor White
    Write-Host "    3. Sätt MOCK_DATA=false (eller ta bort raden)" -ForegroundColor White
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    Write-Host ""
} else {
    # .env finns — kolla om MOCK_DATA=true
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match '(?m)^\s*MOCK_DATA\s*=\s*true') {
        Write-Host ""
        Write-Host "ℹ  MOCK_DATA=true i bff\.env — BFF:en startar i mock-läge." -ForegroundColor Cyan
        Write-Host "   Sätt MOCK_DATA=false för att använda riktiga Norce-API:er." -ForegroundColor Cyan
        Write-Host ""
    }
}

# --- Överstyrningar från kommandoraden --------------------------------
if ($ApplicationId) { $env:APPLICATION_ID = "$ApplicationId" }
if ($CategorySeed)  { $env:CATEGORY_SEED  = "$CategorySeed" }

if ($ApplicationId -or $CategorySeed) {
    Write-Host ""
    Write-Host "Overstyrt fran kommandoraden:" -ForegroundColor Cyan
    if ($ApplicationId) { Write-Host "   APPLICATION_ID = $ApplicationId" -ForegroundColor Cyan }
    if ($CategorySeed)  { Write-Host "   CATEGORY_SEED  = $CategorySeed"  -ForegroundColor Cyan }
    Write-Host ""
}

# --- Installera deps om nödvändigt -----------------------------------
Ensure-NpmDeps -projPath $bffPath
Ensure-NpmDeps -projPath $fePath

# --- Starta båda apparna ---------------------------------------------
# "dev" rather than "start": node --watch reloads the BFF when index.js or
# mockBasket.js changes, so editing the backend does not mean restarting by
# hand. Note that a reload resets the in-memory mock basket.
$bffProc = Start-NpmApp -projPath $bffPath -scriptName "dev"
$feProc  = Start-NpmApp -projPath $fePath  -scriptName "dev"

# --- Öppna frontend i webbläsaren ------------------------------------
try {
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:5173"
} catch { }

Write-Host ""
Write-Host "✅ BFF:      http://localhost:3000" -ForegroundColor Green
Write-Host "✅ Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host ""
Write-Host "Tryck Ctrl+C för att avsluta."

# Behåll skriptet igång om processer körs
if ($bffProc -or $feProc) {
    try {
        while ($true) {
            Start-Sleep -Seconds 1
            if ($bffProc -and $bffProc.HasExited) { $bffProc = $null; Write-Warning "BFF-processen avslutades." }
            if ($feProc  -and $feProc.HasExited)  { $feProc  = $null; Write-Warning "Frontend-processen avslutades." }
            if (-not $bffProc -and -not $feProc) { break }
        }
    } finally {
        Write-Host "`nStänger ner..." -ForegroundColor Yellow
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
        Write-Host "Klart." -ForegroundColor Green
    }
} else {
    Write-Warning "Inga processer startades. Kontrollera loggen ovan."
}

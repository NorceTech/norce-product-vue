<#
   Run:  .\run.ps1 [-SkipInstall] [-a <id>] [-c <id>] [-s <slug>] [-e <environment>]

   - Installs npm packages in bff/ and productpage-vue/ when node_modules is missing
   - Warns when bff\.env is missing
   - Starts the BFF (http://localhost:3000) and the frontend (http://localhost:5173)

   Examples:
     .\run.ps1                              # whatever bff\.env says
     .\run.ps1 -a 1042 -c 5                 # Norce Open Demo on playground
     .\run.ps1 -a <your-app> -c <your-root-category>
     .\run.ps1 -a 1234 -c 7 -e stage        # same slug, stage instead
     .\run.ps1 -a 1234 -c 7 -s acme -e prod # a single-tenant customer

   The arguments are set as environment variables before the processes start.
   Neither dotenv nor Vite's loadEnv overrides a variable that is already in the
   environment, so what is passed here wins over the .env files without touching
   them.

   Passing an application or a host also selects live mode, because asking for a
   specific tenant and being served the fixtures is never what was meant.
#>

param(
    [switch]$SkipInstall,

    # Norce application id. The application id decides which tenant you reach,
    # not the host name - the same API host answers with the right tenant's
    # data, and the image CDN follows via the client id from GetApplication.
    [Alias('a')]
    [int]$ApplicationId,

    # Root category that the product list and the filters are scoped to.
    [Alias('c')]
    [int]$CategorySeed,

    # Tenant slug in the API host name. Defaults to the multi-tenant
    # `norcecommerce` slug, which reaches most tenants because the application
    # id selects the tenant. Single-tenant customers have their own deployment
    # and have to be named here.
    [Alias('s')]
    [string]$Slug,

    # Which environment to reach. Production has no environment segment in the
    # host name, which is why this is a set rather than free text.
    [Alias('e')]
    [ValidateSet('playground', 'stage', 'prod')]
    [string]$Environment
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
$namesATarget = $ApplicationId -or $Slug -or $Environment

if (-not (Test-Path $envFile)) {
    # The BFF only ever enters mock mode when MOCK_DATA=true, so a fresh clone
    # with no .env would otherwise exit at the configuration check. Asking for
    # the fixtures on its behalf keeps `git clone` + `.\run.ps1` working, and
    # saying so out loud keeps mock mode something that was chosen rather than
    # something that happened. Naming a tenant means the opposite was meant, so
    # that case is left to fail with the BFF's own message.
    if (-not $namesATarget) { $env:MOCK_DATA = 'true' }

    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    if ($namesATarget) {
        Write-Host "  'bff\.env' is missing, and a tenant was named on the command line." -ForegroundColor Yellow
        Write-Host "  The BFF needs API_BASE, OAUTH_ID and OAUTH_SECRET to reach it," -ForegroundColor Yellow
        Write-Host "  and will say so and stop." -ForegroundColor Yellow
    } else {
        Write-Host "  'bff\.env' is missing, so MOCK_DATA=true was set for this run." -ForegroundColor Yellow
        Write-Host "  Product data comes from the local JSON files in /mockdata," -ForegroundColor Yellow
        Write-Host "  which are a capture of Norce Open Demo." -ForegroundColor Yellow
    }
    Write-Host "" -ForegroundColor Yellow
    Write-Host "  To use the real Norce APIs:" -ForegroundColor Yellow
    Write-Host "    1. Copy the example file:  cp bff\.env.example bff\.env" -ForegroundColor White
    Write-Host "    2. Fill in your Norce OAuth credentials (OAUTH_ID, OAUTH_SECRET)" -ForegroundColor White
    Write-Host "    3. Set MOCK_DATA=false" -ForegroundColor White
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

# -Slug and -Environment compose the API host. Production has no environment
# segment: <slug>.api-se.norce.tech rather than <slug>.api-se.<env>.norce.tech.
$apiHost = $null
if ($Slug -or $Environment) {
    $hostSlug = if ($Slug) { $Slug } else { 'norcecommerce' }
    $hostEnv  = if ($Environment) { $Environment } else { 'playground' }

    $apiHost = if ($hostEnv -eq 'prod') {
        "https://$hostSlug.api-se.norce.tech"
    } else {
        "https://$hostSlug.api-se.$hostEnv.norce.tech"
    }

    $env:API_BASE = $apiHost

    # Norce Checkout has its own base URL but lives on the same host. Moving one
    # without the other puts Commerce and Checkout in different environments,
    # which fails deep inside the order flow instead of at startup. The
    # storefront branch has no checkout code and ignores this variable.
    $env:NCO_BASE = $apiHost

    # Images come from a third host, which Vite reads on its own. Leaving it
    # behind gives working API calls and 404 on every product image - the kind
    # of half-switched state that looks like a data problem.
    $mediaHost = if ($hostEnv -eq 'prod') {
        "https://media.cdn-norce.tech"
    } else {
        "https://media.$hostEnv.cdn-norce.tech"
    }
    $env:VITE_MEDIA_CDN_HOST = $mediaHost

    # The identity scope follows the environment. Stage is mid-rename from `lab`
    # to `stage` in Norce, so that one is left to bff\.env rather than guessed.
    if ($hostEnv -eq 'playground') { $env:OAUTH_SCOPE = 'playground' }
    if ($hostEnv -eq 'prod')       { $env:OAUTH_SCOPE = 'prod' }
}

# Asking for a tenant or a host means asking for live data. The BFF cannot make
# this call itself: by the time index.js reads process.env, a value from the
# command line and one from bff\.env look identical, so the precedence has to be
# applied here, where the command line is still visible.
if ($namesATarget) { $env:MOCK_DATA = 'false' }

if ($ApplicationId -or $CategorySeed -or $apiHost) {
    Write-Host ""
    Write-Host "Overridden from the command line:" -ForegroundColor Cyan
    if ($ApplicationId) { Write-Host "   APPLICATION_ID       = $ApplicationId" -ForegroundColor Cyan }
    if ($CategorySeed)  { Write-Host "   CATEGORY_SEED        = $CategorySeed"  -ForegroundColor Cyan }
    if ($apiHost)       { Write-Host "   API_BASE             = $apiHost"       -ForegroundColor Cyan }
    if ($apiHost)       { Write-Host "   NCO_BASE             = $apiHost"       -ForegroundColor Cyan }
    if ($mediaHost)     { Write-Host "   VITE_MEDIA_CDN_HOST  = $mediaHost"     -ForegroundColor Cyan }
    # Only when a tenant or host was actually named: -c alone changes the slice
    # of the catalogue, not which tenant, and must not claim otherwise.
    if ($namesATarget)  { Write-Host "   MOCK_DATA            = false (a tenant was named)" -ForegroundColor Cyan }
    Write-Host ""

    if ($Environment -eq 'stage') {
        Write-Host "OAUTH_SCOPE is left as bff\.env has it - Norce is renaming the stage scope" -ForegroundColor Yellow
        Write-Host "from 'lab' to 'stage', so check which one your credentials expect." -ForegroundColor Yellow
        Write-Host ""
    }

    if ($Environment -eq 'prod') {
        Write-Host "Production. Reads are reads, but the checkout flow on the main branch writes:" -ForegroundColor Yellow
        Write-Host "it creates baskets and initiates NCO orders in whatever tenant it is pointed at." -ForegroundColor Yellow
        Write-Host ""
    }
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

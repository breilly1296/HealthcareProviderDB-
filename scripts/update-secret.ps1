# PowerShell script to update DATABASE_URL secret in Google Cloud Secret Manager
#
# Usage:
#   .\scripts\update-secret.ps1 -DatabaseUrl "postgresql://user:pass@host:5432/db"
#
# Or set via environment variable:
#   $env:NEW_DATABASE_URL = "postgresql://..."
#   .\scripts\update-secret.ps1

param(
    [Parameter(Mandatory=$false)]
    [string]$DatabaseUrl
)

# Get database URL from parameter or environment variable
$newDatabaseUrl = if ($DatabaseUrl) { $DatabaseUrl } else { $env:NEW_DATABASE_URL }

if (-not $newDatabaseUrl) {
    Write-Host "ERROR: Database URL is required" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\scripts\update-secret.ps1 -DatabaseUrl `"postgresql://user:pass@host:5432/db`"" -ForegroundColor White
    Write-Host ""
    Write-Host "Or set via environment variable:" -ForegroundColor Yellow
    Write-Host "  `$env:NEW_DATABASE_URL = `"postgresql://...`"" -ForegroundColor White
    Write-Host "  .\scripts\update-secret.ps1" -ForegroundColor White
    exit 1
}

Write-Host "Updating DATABASE_URL secret in Google Cloud Secret Manager..." -ForegroundColor Cyan
Write-Host ""

# Check if gcloud is installed
$gcloudExists = Get-Command gcloud -ErrorAction SilentlyContinue

if (-not $gcloudExists) {
    Write-Host "ERROR: gcloud CLI is not installed or not in PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Google Cloud SDK from:" -ForegroundColor Yellow
    Write-Host "https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or update the secret manually in Google Cloud Console:" -ForegroundColor Yellow
    Write-Host "1. Go to: https://console.cloud.google.com/security/secret-manager" -ForegroundColor White
    Write-Host "2. Find and click 'DATABASE_URL'" -ForegroundColor White
    Write-Host "3. Click 'NEW VERSION'" -ForegroundColor White
    Write-Host "4. Paste the new database URL" -ForegroundColor White
    Write-Host "5. Click 'ADD NEW VERSION'" -ForegroundColor White
    exit 1
}

# Update the secret
try {
    $newDatabaseUrl | gcloud secrets versions add DATABASE_URL --data-file=-

    if ($LASTEXITCODE -eq 0) {
        Write-Host "SUCCESS: DATABASE_URL secret updated!" -ForegroundColor Green
        Write-Host ""
        Write-Host "The new database connection will be used on the next Cloud Run deployment." -ForegroundColor Cyan
        Write-Host "Push your changes to GitHub to trigger auto-deployment." -ForegroundColor Cyan
    } else {
        throw "gcloud command failed with exit code $LASTEXITCODE"
    }
} catch {
    Write-Host "ERROR: Failed to update secret" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Try updating manually in Google Cloud Console:" -ForegroundColor Yellow
    Write-Host "1. Go to: https://console.cloud.google.com/security/secret-manager" -ForegroundColor White
    Write-Host "2. Find and click 'DATABASE_URL'" -ForegroundColor White
    Write-Host "3. Click 'NEW VERSION'" -ForegroundColor White
    Write-Host "4. Paste the new database URL" -ForegroundColor White
    Write-Host "5. Click 'ADD NEW VERSION'" -ForegroundColor White
    exit 1
}

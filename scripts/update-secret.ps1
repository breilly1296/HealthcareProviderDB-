# PowerShell script to update DATABASE_URL secret in Google Cloud Secret Manager

$newDatabaseUrl = "postgresql://postgres:vMp`$db2026!xKq9Tz@35.223.46.51:5432/providerdb"

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
    Write-Host "4. Paste this value:" -ForegroundColor White
    Write-Host "   $newDatabaseUrl" -ForegroundColor Green
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
    Write-Host "4. Paste this value:" -ForegroundColor White
    Write-Host "   $newDatabaseUrl" -ForegroundColor Green
    Write-Host "5. Click 'ADD NEW VERSION'" -ForegroundColor White
    exit 1
}

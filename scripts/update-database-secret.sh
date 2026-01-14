#!/bin/bash
# Update the DATABASE_URL secret in Google Cloud Secret Manager

# The new database connection string
NEW_DATABASE_URL="postgresql://postgres:vMp\$db2026!xKq9Tz@35.223.46.51:5432/providerdb"

echo "Updating DATABASE_URL secret in Google Cloud Secret Manager..."
echo "$NEW_DATABASE_URL" | gcloud secrets versions add DATABASE_URL --data-file=-

if [ $? -eq 0 ]; then
  echo "✅ Successfully updated DATABASE_URL secret"
  echo "The new database URL will be used on the next Cloud Run deployment."
else
  echo "❌ Failed to update secret"
  echo "Please ensure you have gcloud CLI installed and authenticated."
  exit 1
fi

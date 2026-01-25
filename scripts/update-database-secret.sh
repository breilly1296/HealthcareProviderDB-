#!/bin/bash
# Update the DATABASE_URL secret in Google Cloud Secret Manager
#
# Usage:
#   ./scripts/update-database-secret.sh "postgresql://user:pass@host:5432/db"
#
# Or set via environment variable:
#   NEW_DATABASE_URL="postgresql://..." ./scripts/update-database-secret.sh

# Get the new database URL from argument or environment variable
NEW_DATABASE_URL="${1:-$NEW_DATABASE_URL}"

if [ -z "$NEW_DATABASE_URL" ]; then
  echo "ERROR: Database URL is required"
  echo ""
  echo "Usage:"
  echo "  $0 \"postgresql://user:pass@host:5432/db\""
  echo ""
  echo "Or set via environment variable:"
  echo "  NEW_DATABASE_URL=\"postgresql://...\" $0"
  exit 1
fi

echo "Updating DATABASE_URL secret in Google Cloud Secret Manager..."
echo "$NEW_DATABASE_URL" | gcloud secrets versions add DATABASE_URL --data-file=-

if [ $? -eq 0 ]; then
  echo "Successfully updated DATABASE_URL secret"
  echo "The new database URL will be used on the next Cloud Run deployment."
else
  echo "Failed to update secret"
  echo "Please ensure you have gcloud CLI installed and authenticated."
  exit 1
fi

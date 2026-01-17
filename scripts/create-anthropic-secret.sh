#!/bin/bash
# Create/update the ANTHROPIC_API_KEY secret in Google Cloud Secret Manager
#
# Usage:
#   ./scripts/create-anthropic-secret.sh
#   # Then paste your API key when prompted
#
# Or with environment variable:
#   ANTHROPIC_API_KEY=sk-ant-... ./scripts/create-anthropic-secret.sh

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "Enter your Anthropic API key (input hidden):"
  read -s ANTHROPIC_API_KEY
  echo ""
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "❌ No API key provided"
  exit 1
fi

echo "Creating/updating ANTHROPIC_API_KEY secret in Google Cloud Secret Manager..."

# Check if secret exists
if gcloud secrets describe ANTHROPIC_API_KEY &>/dev/null; then
  echo "Secret exists, adding new version..."
  echo "$ANTHROPIC_API_KEY" | gcloud secrets versions add ANTHROPIC_API_KEY --data-file=-
else
  echo "Creating new secret..."
  echo "$ANTHROPIC_API_KEY" | gcloud secrets create ANTHROPIC_API_KEY --data-file=-
fi

if [ $? -eq 0 ]; then
  echo "✅ Successfully created/updated ANTHROPIC_API_KEY secret"
  echo ""
  echo "Next steps:"
  echo "1. Grant Cloud Run service account access to this secret:"
  echo "   gcloud secrets add-iam-policy-binding ANTHROPIC_API_KEY \\"
  echo "     --member='serviceAccount:YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com' \\"
  echo "     --role='roles/secretmanager.secretAccessor'"
  echo ""
  echo "2. Push to main branch to trigger deployment with the new secret"
else
  echo "❌ Failed to create/update secret"
  echo "Please ensure you have gcloud CLI installed and authenticated."
  exit 1
fi

#!/bin/bash
#
# Setup Cloud Logging with 30-day retention for VerifyMyProvider
#
# Usage:
#   ./scripts/setup-logging.sh [--project PROJECT_ID]
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Project owner or Logging Admin role
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BUCKET_NAME="verifymyprovider-logs"
SINK_NAME="verifymyprovider-sink"
RETENTION_DAYS=30
LOCATION="global"

# Parse arguments
PROJECT_ID="${PROJECT_ID:-verifymyprovider-prod}"
while [[ $# -gt 0 ]]; do
  case $1 in
    --project)
      PROJECT_ID="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [--project PROJECT_ID]"
      echo ""
      echo "Sets up Cloud Logging with 30-day retention."
      echo ""
      echo "Options:"
      echo "  --project    GCP Project ID (default: verifymyprovider-prod)"
      echo "  --help       Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

echo "════════════════════════════════════════════════════════════"
echo "  Cloud Logging Setup for VerifyMyProvider"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Project:    ${PROJECT_ID}"
echo "Bucket:     ${BUCKET_NAME}"
echo "Retention:  ${RETENTION_DAYS} days"
echo "Location:   ${LOCATION}"
echo ""

# Set project
echo -e "${YELLOW}Setting project...${NC}"
gcloud config set project "${PROJECT_ID}"

# Check if bucket already exists
echo -e "${YELLOW}Checking for existing bucket...${NC}"
if gcloud logging buckets describe "${BUCKET_NAME}" --location="${LOCATION}" &>/dev/null; then
  echo -e "${GREEN}✓ Bucket '${BUCKET_NAME}' already exists${NC}"

  # Update retention if needed
  CURRENT_RETENTION=$(gcloud logging buckets describe "${BUCKET_NAME}" --location="${LOCATION}" --format='value(retentionDays)')
  if [[ "${CURRENT_RETENTION}" != "${RETENTION_DAYS}" ]]; then
    echo -e "${YELLOW}Updating retention from ${CURRENT_RETENTION} to ${RETENTION_DAYS} days...${NC}"
    gcloud logging buckets update "${BUCKET_NAME}" \
      --location="${LOCATION}" \
      --retention-days="${RETENTION_DAYS}"
    echo -e "${GREEN}✓ Retention updated${NC}"
  else
    echo -e "${GREEN}✓ Retention already set to ${RETENTION_DAYS} days${NC}"
  fi
else
  # Create bucket
  echo -e "${YELLOW}Creating log bucket...${NC}"
  gcloud logging buckets create "${BUCKET_NAME}" \
    --location="${LOCATION}" \
    --retention-days="${RETENTION_DAYS}" \
    --description="VerifyMyProvider application logs with ${RETENTION_DAYS}-day retention"
  echo -e "${GREEN}✓ Bucket created${NC}"
fi

# Check if sink already exists
echo -e "${YELLOW}Checking for existing sink...${NC}"
if gcloud logging sinks describe "${SINK_NAME}" &>/dev/null; then
  echo -e "${GREEN}✓ Sink '${SINK_NAME}' already exists${NC}"

  # Update sink filter
  echo -e "${YELLOW}Updating sink filter...${NC}"
  gcloud logging sinks update "${SINK_NAME}" \
    --log-filter='resource.type="cloud_run_revision" OR resource.type="cloud_scheduler_job"'
  echo -e "${GREEN}✓ Sink updated${NC}"
else
  # Create sink
  echo -e "${YELLOW}Creating log sink...${NC}"
  DESTINATION="logging.googleapis.com/projects/${PROJECT_ID}/locations/${LOCATION}/buckets/${BUCKET_NAME}"
  gcloud logging sinks create "${SINK_NAME}" \
    "${DESTINATION}" \
    --log-filter='resource.type="cloud_run_revision" OR resource.type="cloud_scheduler_job"'
  echo -e "${GREEN}✓ Sink created${NC}"
fi

# Grant sink service account permission to write to bucket
echo -e "${YELLOW}Configuring sink permissions...${NC}"
SINK_SA=$(gcloud logging sinks describe "${SINK_NAME}" --format='value(writerIdentity)')
if [[ -n "${SINK_SA}" ]]; then
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="${SINK_SA}" \
    --role="roles/logging.bucketWriter" \
    --condition=None \
    --quiet 2>/dev/null || true
  echo -e "${GREEN}✓ Permissions configured${NC}"
fi

# Verify setup
echo ""
echo -e "${YELLOW}Verifying configuration...${NC}"
echo ""

echo "Bucket Details:"
echo "───────────────"
gcloud logging buckets describe "${BUCKET_NAME}" --location="${LOCATION}" \
  --format='table(name,retentionDays,lifecycleState)'

echo ""
echo "Sink Details:"
echo "─────────────"
gcloud logging sinks describe "${SINK_NAME}" \
  --format='table(name,destination,filter)'

echo ""
echo "════════════════════════════════════════════════════════════"
echo -e "${GREEN}  Setup Complete!${NC}"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Verify logs are flowing to the bucket:"
echo "     gcloud logging read 'logName:\"${BUCKET_NAME}\"' --limit=5"
echo ""
echo "  2. Test log query:"
echo "     gcloud logging read 'resource.type=\"cloud_run_revision\" AND severity>=ERROR' --limit=10"
echo ""
echo "  3. Set up alerts (see docs/operations/LOGGING.md)"
echo ""

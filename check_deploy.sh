#!/bin/bash
REGION="us-central1"
# Tier-6 Endpoint
DASHBOARD_URL="https://seekreap-backend-tif2gmgi4q-uc.a.run.app"

echo "🚀 [Tier-6] Checking Dashboard/API Status..."
echo "----------------------------------------"
gcloud run services describe seekreap-backend --region=$REGION --format="table(status.conditions[0].status,status.address.url)"
curl -s -o /dev/null -w "Health Check Status: %{http_code}\n" "$DASHBOARD_URL/health"

echo ""
echo "⚙️ [Tier-5] Checking Worker Pool Status..."
echo "----------------------------------------"
gcloud run services describe seekreap-worker --region=$REGION --format="table(status.conditions[0].status,status.address.url)"

echo ""
echo "📜 Latest Worker Activity (Last 5 events):"
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=seekreap-worker" --limit=5 --format="value(textPayload)"

#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "🧘 Starting Vipassana UCENLIST Streamlit UI deployment to Google Cloud..."

# Load environment variables if .env file exists
ENV_FILE="chatbot_agent/.env"
if [ -f "$ENV_FILE" ]; then
    echo "Loading environment from $ENV_FILE..."
    # Read variables ignoring comments
    export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

# Configuration and Defaults
GCP_REGION=${GCP_REGION:-"asia-southeast1"}
SERVICE_NAME=${SERVICE_NAME:-"vipassana-ucenlist-streamlit"}
REPOSITORY_NAME=${REPOSITORY_NAME:-"vipassana-chatbot"}
AGENT_MODEL=${AGENT_MODEL:-"gemini-3.5-flash"}
GOOGLE_CLOUD_LOCATION=${GOOGLE_CLOUD_LOCATION:-"asia-southeast1"}

# Prerequisite Checks
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI is not installed. Please install it first: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Error: docker is not installed. Please install and start Docker."
    exit 1
fi

# Detect GCP Project
GCP_PROJECT=$(gcloud config get-value project 2>/dev/null)
if [ -z "$GCP_PROJECT" ]; then
    echo "❌ Error: No default GCP project set. Run: gcloud config set project <PROJECT_ID>"
    exit 1
fi

if [ -z "$GOOGLE_API_KEY" ]; then
    echo "❌ Error: GOOGLE_API_KEY is not defined in environment or $ENV_FILE."
    exit 1
fi

echo "----------------------------------------"
echo "Project ID:      $GCP_PROJECT"
echo "Region:          $GCP_REGION"
echo "Service Name:    $SERVICE_NAME"
echo "Repository:      $REPOSITORY_NAME"
echo "----------------------------------------"

# Ensure Artifact Registry Repository Exists
echo "Checking if Artifact Registry repository '$REPOSITORY_NAME' exists..."
if ! gcloud artifacts repositories describe "$REPOSITORY_NAME" --project="$GCP_PROJECT" --location="$GCP_REGION" &>/dev/null; then
    echo "Creating Artifact Registry repository '$REPOSITORY_NAME'..."
    gcloud artifacts repositories create "$REPOSITORY_NAME" \
        --repository-format=docker \
        --location="$GCP_REGION" \
        --description="Docker repository for Vipassana UCENLIST Chatbot" \
        --project="$GCP_PROJECT"
else
    echo "Repository exists."
fi

# Authenticate Docker to Registry
REGISTRY_HOST="${GCP_REGION}-docker.pkg.dev"
echo "Authenticating Docker to $REGISTRY_HOST..."
gcloud auth configure-docker "$REGISTRY_HOST" --quiet

# Define Image URL
IMAGE_URL="${REGISTRY_HOST}/${GCP_PROJECT}/${REPOSITORY_NAME}/${SERVICE_NAME}:latest"

# Build Image
echo "Building Docker image using Dockerfile.streamlit..."
docker build -t "$IMAGE_URL" -f Dockerfile.streamlit .

# Push Image
echo "Pushing Docker image to registry..."
docker push "$IMAGE_URL"

# Deploy to Cloud Run
echo "Deploying to Google Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
    --image "$IMAGE_URL" \
    --platform managed \
    --region "$GCP_REGION" \
    --allow-unauthenticated \
    --set-env-vars "GOOGLE_API_KEY=${GOOGLE_API_KEY},GOOGLE_CLOUD_LOCATION=${GOOGLE_CLOUD_LOCATION},AGENT_MODEL=${AGENT_MODEL}" \
    --project "$GCP_PROJECT"

# Deploy Agent to Vertex AI Agent Runtime
echo "Deploying the ADK agent to Vertex AI Agent Runtime..."
agents-cli deploy --project "$GCP_PROJECT"

echo "🎉 Deployment successful!"
echo "You can access your Streamlit UI on the URL printed by Cloud Run above."


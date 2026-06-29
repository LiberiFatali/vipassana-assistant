## Why

The Streamlit UI and the chatbot agent are configured to run locally but lack a unified, automated script to deploy them to Google Cloud. A deployment script is needed to containerize the Streamlit application and deploy it to Google Cloud Run, enabling public or internal web access.

## What Changes

- Add a deploy script `deploy_gcp.sh` in the root folder.
- Ensure the script automates:
  - Building the Docker container for the Streamlit UI (using `Dockerfile.streamlit`).
  - Pushing the image to Google Artifact Registry.
  - Deploying the container to Google Cloud Run with appropriate environment variables (like `GOOGLE_API_KEY`, model configs, etc.).

## Capabilities

### New Capabilities
- `gcp-deployment`: Auto-provisioning and deploy script to compile the Streamlit UI and push it to Google Cloud Run.

### Modified Capabilities
<!-- None -->

## Impact

- **Files**: New `deploy_gcp.sh` in the root directory.
- **Infrastructure**: Requires a GCP project, Artifact Registry, and Cloud Run permissions.

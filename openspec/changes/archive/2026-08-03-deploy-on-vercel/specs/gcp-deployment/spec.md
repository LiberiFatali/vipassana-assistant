# gcp-deployment Specification

## ADDED Requirements

### Requirement: GCP Deployment is Discontinued
The chatbot SHALL NOT be deployed to GCP (Cloud Run / Vertex AI / Streamlit / FastAPI), GCP deployment artifacts SHALL be removed from the repository, and those artifacts SHALL NOT be reintroduced.

#### Scenario: No GCP deployment artifacts remain
- **WHEN** a contributor searches the repository for GCP deployment artifacts (`deploy_gcp.sh`, `Dockerfile`, `Dockerfile.streamlit`, `deployment/`, `agents-cli-manifest.yaml`, `deployment_metadata.json`)
- **THEN** none of these files or deployment references remain in the tracked source tree

## REMOVED Requirements

### Requirement: Automated Docker Build and Push
**Reason**: The chatbot is no longer containerized or deployed to Google Cloud. Deployment moved to a Vercel project (Node serverless functions + static hosting) which requires no Docker image.
**Migration**: Use the Vercel workflow (`vercel deploy`) described in `vercel-deployment`. All GCP deployment artifacts (`deploy_gcp.sh`, `Dockerfile`, `Dockerfile.streamlit`, `deployment/`, `agents-cli-manifest.yaml`, `deployment_metadata.json`) are removed from the repository.

### Requirement: Cloud Run Service Provisioning
**Reason**: Google Cloud Run is replaced by Vercel Functions/static hosting as the runtime for the chatbot.
**Migration**: Deploy via Vercel. Environment configuration (API keys, model) is set as Vercel project environment variables instead of Cloud Run env vars.

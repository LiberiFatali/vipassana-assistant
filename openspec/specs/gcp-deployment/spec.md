# gcp-deployment Specification

## Purpose
TBD - created by archiving change deploy-streamlit-gcp. Update Purpose after archive.
## Requirements
### Requirement: GCP Deployment is Discontinued
The chatbot SHALL NOT be deployed to GCP (Cloud Run / Vertex AI / Streamlit / FastAPI), GCP deployment artifacts SHALL be removed from the repository, and those artifacts SHALL NOT be reintroduced.

#### Scenario: No GCP deployment artifacts remain
- **WHEN** a contributor searches the repository for GCP deployment artifacts (`deploy_gcp.sh`, `Dockerfile`, `Dockerfile.streamlit`, `deployment/`, `agents-cli-manifest.yaml`, `deployment_metadata.json`)
- **THEN** none of these files or deployment references remain in the tracked source tree


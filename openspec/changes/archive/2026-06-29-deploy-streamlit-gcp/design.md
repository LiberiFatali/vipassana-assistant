## Context

Currently, the Streamlit app can be run locally using `streamlit run`. We need a repeatable, scripted way to build and deploy the containerized Streamlit application to GCP (specifically Google Cloud Run) so users can access the interface over the web.

## Goals / Non-Goals

**Goals:**
- Provide a `deploy_gcp.sh` bash script.
- Automate building the Docker image using `Dockerfile.streamlit`.
- Automate pushing the image to Artifact Registry.
- Automate deploying/updating the Cloud Run service.

**Non-Goals:**
- Writing complex Terraform infrastructure configurations.
- Setting up VPCs or custom domains (handled out-of-band).

## Decisions

### Decision 1: Deployment Method
- **Option A**: Use Terraform to define resources.
- **Option B (Chosen)**: Use a Bash script wrapper calling `gcloud` CLI commands.
- **Rationale**: A bash script is lightweight, easy to run, requires no state file management, and directly aligns with the user's request.

### Decision 2: Environment Variables Passing
- **Option A**: Hardcode credentials in the script.
- **Option B (Chosen)**: Load `GOOGLE_API_KEY` from the local environment or a `.env` file and feed it into `--set-env-vars` dynamically.
- **Rationale**: Security best practices (no hardcoded keys in version control).

## Risks / Trade-offs

- **Risk**: User lacks necessary GCP permissions (Artifact Registry / Cloud Run).
- **Mitigation**: Add checks in the script for command existence and output readable error messages if a step fails.

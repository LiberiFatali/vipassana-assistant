# streamlit-ui Specification

## ADDED Requirements

### Requirement: Vercel Static Hosting
The application SHALL serve the chat UI as a static frontend hosted by Vercel from the `public/` directory, requiring no application server or container.

#### Scenario: Serve the chat page
- **WHEN** a user opens the deployed application root URL
- **THEN** Vercel serves `public/index.html` with its bundled assets, and the page is usable without any additional server process.

## REMOVED Requirements

### Requirement: Docker Deployment Setup
**Reason**: The Streamlit app and its containerized deployment are removed. The UI is now a static HTML page hosted by Vercel.
**Migration**: Static hosting replaces the Docker image; no port/container configuration is needed. See `vercel-deployment`.

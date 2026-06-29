## ADDED Requirements

### Requirement: Interactive Chat Interface
The UI SHALL provide a conversational interface for end users to interact with the Vipassana UCENLIST chatbot in both English and Vietnamese.

#### Scenario: User sends a message
- **WHEN** the user types a query in the chat input and presses Enter
- **THEN** the system SHALL send the query to the Vipassana agent, retrieve the response, and display the response within the chat history.

#### Scenario: Restart conversation
- **WHEN** the user clicks the "Clear Chat" or "Reset Session" button
- **THEN** the system SHALL reset the agent session and clear the visual chat history.

### Requirement: Course Discovery Display
The UI SHALL display course schedules returned by the agent.

#### Scenario: Fallback schedule warning
- **WHEN** the agent provides course schedule information marked as "fallback" data
- **THEN** the UI SHALL display a warning banner stating: "⚠️ Note: These are approximate schedule dates from our fallback data. Please verify the actual dates at https://schedule.vridhamma.org before making plans."

### Requirement: Safe Domain Gating
The UI SHALL only display and link to trusted domains.

#### Scenario: Verify links in agent responses
- **WHEN** the agent outputs text containing URLs
- **THEN** the UI SHALL ensure only links to ucenlist.org or *.vridhamma.org are displayed, filtering or removing any other links.

### Requirement: Official Registration Handoff
The UI SHALL direct users to the official registration site when they request course registration.

#### Scenario: Registration url provided
- **WHEN** the user asks to register and the agent returns a registration link
- **THEN** the UI SHALL prompt the user to complete their registration on the official website with a link to the official URL.

### Requirement: Docker Deployment Setup
The application configuration SHALL support running the Streamlit app in a containerized environment.

#### Scenario: Deploy to Cloud Run
- **WHEN** the Docker container is built and run with default environment variables
- **THEN** the Streamlit server SHALL start and listen on port 8080 or a port defined by the PORT environment variable.

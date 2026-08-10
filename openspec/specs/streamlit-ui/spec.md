# streamlit-ui Specification

## Purpose
TBD - created by archiving change build-streamlit-ui. Update Purpose after archive.
## Requirements
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

### Requirement: Vercel Static Hosting
The application SHALL serve the chat UI as a static frontend hosted by Vercel from the `public/` directory, requiring no application server or container.

#### Scenario: Serve the chat page
- **WHEN** a user opens the deployed application root URL
- **THEN** Vercel serves `public/index.html` with its bundled assets, and the page is usable without any additional server process.

### Requirement: Responsive Mobile Layout
The static chat UI SHALL adapt to small screens (≤ 720px): the center-info sidebar SHALL be hidden from the layout, the header SHALL compact to icon-only controls, agent-rendered tables SHALL reflow into stacked list-style cards, and the composer SHALL remain above the viewport's safe areas.

#### Scenario: Mobile viewport hides the sidebar
- **WHEN** the page is rendered at a viewport width of 720px or less
- **THEN** `aside.sidebar` is not displayed
- **AND** the chat area and composer fill the full viewport width and height.

#### Scenario: Center info available in the welcome message on mobile
- **WHEN** a user first opens the page (or clears the chat) at a viewport width of 720px or less
- **THEN** the welcome message in the chat area includes the center details (Dhamma Virocana and Dhamma Vutthi names, addresses, phones, emails, and official links) in the selected language
- **AND** the desktop welcome message (concise, without center details) is shown at wider viewports.

#### Scenario: Compact header on mobile
- **WHEN** the page is rendered at a viewport width of 720px or less
- **THEN** the header subtitle is hidden
- **AND** the Clear action is displayed as an icon-only button with a translated `aria-label`
- **AND** the header does not wrap to multiple rows.

#### Scenario: Tables reflow into lists on narrow screens
- **WHEN** an agent response contains a markdown table rendered at a viewport width of 720px or less
- **THEN** the table is displayed as stacked rows with each cell labeled by its column header
- **AND** the content does not overflow the horizontal viewport.

#### Scenario: Composer respects mobile safe areas
- **WHEN** the page is rendered on a device with `dvh` support (e.g. iOS Safari)
- **THEN** the page uses the dynamic viewport height so the composer stays fully visible above the URL bar
- **AND** composer padding accounts for the bottom safe-area inset.


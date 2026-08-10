## ADDED Requirements

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

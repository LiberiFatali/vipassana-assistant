# Specification: UCENLIST Knowledge

The UCENLIST knowledge capability encapsulates Vipassana meditation course information, center details, rules, and contact info for the chatbot agent.

## Requirements

### Requirement: Bilingual Knowledge Retrieval
The agent SHALL retrieve and present UCENLIST course and center information in both English and Vietnamese depending on the user's language.

#### Scenario: User greets in English
- **WHEN** user asks "What is Vipassana?"
- **THEN** agent responds with the English definition of Vipassana.

#### Scenario: User greets in Vietnamese
- **WHEN** user asks "Thiền Vipassana là gì?"
- **THEN** agent responds with the Vietnamese definition of Vipassana.

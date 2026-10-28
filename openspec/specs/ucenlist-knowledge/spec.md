# Specification: UCENLIST Knowledge

## Purpose
The UCENLIST knowledge capability encapsulates Vipassana meditation course information, center details, rules, and contact info for the chatbot agent.

## Requirements

### Requirement: Bilingual Knowledge Retrieval
The agent SHALL retrieve and present UCENLIST course, center, and practice activities information in both English and Vietnamese depending on the user's language, including offline group sittings.

#### Scenario: User greets in English
- **WHEN** user asks "What is Vipassana?"
- **THEN** agent responds with the English definition of Vipassana.

#### Scenario: User greets in Vietnamese
- **WHEN** user asks "Thiền Vipassana là gì?"
- **THEN** agent responds with the Vietnamese definition of Vipassana.

#### Scenario: User inquires about offline group sittings in Vietnamese
- **WHEN** user asks "Có thiền chung ở Hà Nội không?" or "Thông tin thiền chung offline"
- **THEN** agent responds in Vietnamese explaining that UCENLIST Hanoi (Dhamma Virocana) organizes group sittings with assistant teachers, and provides the Zalo group link `https://zalo.me/g/udknri223`.

#### Scenario: User inquires about group sittings in English
- **WHEN** user asks "Is there a group sitting in Hanoi?"
- **THEN** agent responds in English explaining UCENLIST Hanoi's offline group sittings with assistant teachers and provides the Zalo group link `https://zalo.me/g/udknri223`.

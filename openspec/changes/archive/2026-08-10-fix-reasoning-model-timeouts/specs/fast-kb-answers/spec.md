# Delta Spec: Fast KB Answers

## MODIFIED Requirements

### Requirement: Curated bilingual definition for Vipassana
The system SHALL answer "Vipassana là gì?" / "What is Vipassana?" / "meaning of Vipassana" style questions — including paraphrase variants such as "kể cho tôi về Vipassana", "giới thiệu về Vipassana", "thiền Vipassana", "giới thiệu về thiền Vipassana", "tell me about Vipassana", and "vipassana meditation is" — with a concise curated definition in the user's language, without calling an LLM, routed only on the knowledge path.

#### Scenario: Vietnamese definition
- **WHEN** the user asks "Vipassana là gì?" and the request routes to the knowledge path
- **THEN** the system returns a concise Vietnamese definition of Vipassana without calling an LLM

#### Scenario: English definition
- **WHEN** the user asks "What is Vipassana?"
- **THEN** the system returns a concise English definition of Vipassana without calling an LLM

#### Scenario: Paraphrased definition question
- **WHEN** the user asks "Kể cho tôi về Vipassana" or "tell me about Vipassana" and the request routes to the knowledge path
- **THEN** the system returns the curated definition without calling an LLM

#### Scenario: Definition question with inserted descriptor
- **WHEN** the user asks "Giới thiệu về thiền Vipassana" and the request routes to the knowledge path
- **THEN** the system returns the curated definition without calling an LLM

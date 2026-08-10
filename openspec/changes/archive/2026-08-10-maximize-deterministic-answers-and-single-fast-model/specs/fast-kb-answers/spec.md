## ADDED Requirements

### Requirement: Deterministic FAQ answers
The system SHALL answer high-frequency knowledge questions about course cost (free / `miễn phí` / donation / `cúng dường`), diet (`ăn chay` / vegetarian), and eligibility (`ai có thể tham gia` / who can attend / `điều kiện`) with curated bilingual answers directly from the knowledge base, without calling an LLM, when the request routes to the knowledge path.

#### Scenario: Free-of-charge question in Vietnamese
- **WHEN** the user asks "Khóa thiền có miễn phí không?" and the request routes to the knowledge path
- **THEN** the system returns a curated answer noting courses are run entirely on donations, without calling an LLM

#### Scenario: Diet question in English
- **WHEN** the user asks "Is the food vegetarian?" and the request routes to the knowledge path
- **THEN** the system returns a curated answer about the vegetarian meals served, without calling an LLM

#### Scenario: Eligibility question in Vietnamese
- **WHEN** the user asks "Ai có thể tham gia khóa thiền?" and the request routes to the knowledge path
- **THEN** the system returns a curated answer about eligibility, without calling an LLM

## MODIFIED Requirements

### Requirement: Curated bilingual definition for Vipassana
The system SHALL answer "Vipassana là gì?" / "What is Vipassana?" / "meaning of Vipassana" style questions — including paraphrase variants such as "kể cho tôi về Vipassana", "giới thiệu về Vipassana", "tell me about Vipassana", and "vipassana meditation is" — with a concise curated definition in the user's language, without calling an LLM, routed only on the knowledge path.

#### Scenario: Vietnamese definition
- **WHEN** the user asks "Vipassana là gì?" and the request routes to the knowledge path
- **THEN** the system returns a concise Vietnamese definition of Vipassana without calling an LLM

#### Scenario: English definition
- **WHEN** the user asks "What is Vipassana?"
- **THEN** the system returns a concise English definition of Vipassana without calling an LLM

#### Scenario: Paraphrased definition question
- **WHEN** the user asks "Kể cho tôi về Vipassana" or "tell me about Vipassana" and the request routes to the knowledge path
- **THEN** the system returns the curated definition without calling an LLM

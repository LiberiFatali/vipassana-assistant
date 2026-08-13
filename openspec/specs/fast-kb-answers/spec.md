# Specification: Fast KB Answers

## Purpose
The Fast KB Answers capability enables low-latency answers on the knowledge fast path by resolving high-confidence factual queries with deterministic structured data and a curated bilingual definition without an LLM call, caching repeated LLM answers in memory, and using a configurable faster model — all while preserving the existing safety model.

## Requirements

### Requirement: Deterministic structured answers for factual queries
The system SHALL answer high-confidence factual queries about UCENLIST meditation centers directly from `lib/centers.js` without calling an LLM. This SHALL only apply when the request is routed to the knowledge path and the query mentions a center (Dhamma Virocana / Hà Nội or Dhamma Vutthi / TP. HCM) together with a supported information keyword (address, phone, email, website). The answer SHALL be produced in the user's detected language, return in under 100ms, and never fire a tool call.

#### Scenario: Address of the Hanoi center in Vietnamese
- **WHEN** the user asks "Địa chỉ trung tâm Hà Nội?" and the request routes to the knowledge path
- **THEN** the system returns the Dhamma Virocana address from `lib/centers.js` in Vietnamese without calling an LLM
- **AND** the response completes in under 100ms

#### Scenario: Contact details of the HCMC center in English
- **WHEN** the user asks "What is the phone and email for Dhamma Vutthi?"
- **THEN** the system returns the Dhamma Vutthi phone and email from `lib/centers.js` in English without calling an LLM

#### Scenario: Both centers when no single center is named
- **WHEN** the user asks "Địa chỉ các trung tâm thiền?" without naming a single center
- **THEN** the system returns the address of both Dhamma Virocana and Dhamma Vutthi

#### Scenario: Unmatched question falls through to the LLM fast path
- **WHEN** a knowledge-path question does not confidently match a deterministic intent
- **THEN** the system answers via the normal single-call LLM fast path

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

### Requirement: In-memory answer caching for repeated questions
The system SHALL cache generated LLM fast-path answers in memory keyed by `lang|normalized question`, so that a repeated knowledge question on a warm instance returns the cached answer instantly instead of making another LLM call. Cached entries SHALL expire after a bounded TTL and the cache SHALL be size-capped to prevent unbounded growth.

#### Scenario: Repeated question served from cache
- **WHEN** the user asks the same knowledge question twice on the same instance
- **THEN** the second response is served from the in-memory cache without an additional LLM call

### Requirement: Safety invariants preserved
All fast answer paths SHALL preserve the existing safety model: the knowledge fast path MUST NOT attach tools, every response text (deterministic, cached, or LLM) MUST pass through `sanitize_urls()`, and the tool path MUST continue to inject the full knowledge base.

#### Scenario: Deterministic answer is sanitized
- **WHEN** a deterministic structured answer contains URLs
- **THEN** the URLs are passed through `sanitize_urls()` and only trusted `ucenlist.org` / `*.vridhamma.org` links survive

#### Scenario: No tools on the knowledge fast path
- **WHEN** a deterministic or cached answer is served on the knowledge path
- **THEN** no tool call is made and no `tools` payload is attached

### Requirement: Retrieval-based knowledge section selection
The system SHALL select the knowledge sections injected into the fast-path prompt by BM25 retrieval over the full section text rather than a fixed keyword-to-section map, SHALL select sections in the user's detected language when a language-specific section exists, and SHALL fall back to the general default sections (ABOUT UCENLIST and WHAT IS VIPASSANA) when no section clears the score floor.

#### Scenario: English timetable paraphrase selects the English timetable section
- **WHEN** the user asks "How does the daily timetable work during a course?" (a paraphrase whose tokens match the timetable section text)
- **THEN** the fast-path prompt includes the English daily-timetable section

#### Scenario: Vietnamese discipline question selects the Vietnamese section
- **WHEN** the user asks "Nội quy giới luật của khóa thiền 10 ngày là gì?"
- **THEN** the fast-path prompt includes the Vietnamese discipline section

#### Scenario: Unmatched query falls back to the general default
- **WHEN** a query clears no section score floor
- **THEN** the fast-path prompt includes the ABOUT UCENLIST and WHAT IS VIPASSANA sections

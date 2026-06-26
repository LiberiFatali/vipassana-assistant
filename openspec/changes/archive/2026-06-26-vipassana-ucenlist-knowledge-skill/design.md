# Design: Vipassana UCENLIST Knowledge Skill

## Architecture

### File Location

```
.agents/
└── skills/
    └── vipassana-ucenlist-knowledge/
        └── SKILL.md          ← Single-file skill (knowledge base)
```

The skill is a single `SKILL.md` file following the standard agent skill format:
- **YAML frontmatter**: `name` + `description` fields (used for skill matching/triggering)
- **Markdown body**: Structured knowledge sections in both English and Vietnamese

### Language Structure

The skill uses a **parallel-section approach**: each major topic has an English section followed immediately by its Vietnamese counterpart. This keeps related content co-located for easy maintenance.

```
## 1. ABOUT UCENLIST         ← English
## 1-VI. GIỚI THIỆU UCENLIST ← Vietnamese
## 2. WHAT IS VIPASSANA?
## 2-VI. THIỀN VIPASSANA LÀ GÌ?
...
```

A dedicated **Language Behavior** section at the end instructs the chatbot agent on:
- Detecting user language from their message
- Responding in the detected language
- Default fallback language

### Content Sections

| # | English Section | Vietnamese Section |
|---|---|---|
| 1 | About UCENLIST | Giới thiệu UCENLIST |
| 2 | What Is Vipassana? | Thiền Vipassana là gì? |
| 3 | The Tradition | Truyền thống |
| 4 | S.N. Goenka — Biography | S.N. Goenka — Tiểu sử |
| 5 | The Art of Living | Nghệ thuật sống |
| 6 | The Code of Discipline | Giới luật |
| 7 | Daily Timetable | Thời khóa biểu hàng ngày |
| 8 | FAQ | Hỏi & Đáp |
| 9 | Course Registration & Centers | Đăng ký khóa học & Trung tâm |
| 10 | Contact Information | Thông tin liên hệ |
| 11 | Chatbot Principles | Nguyên tắc chatbot |
| 12 | Quick Reference | Tham khảo nhanh |
| 13 | Language Behavior Guide | — (meta-instruction only) |

### Frontmatter Description Strategy

The `description` field in YAML frontmatter is what the skill system uses to determine when to load the skill. It will reference both English and Vietnamese trigger phrases:

```yaml
description: >
  Use this skill when you need comprehensive knowledge about Vipassana meditation
  as taught at UCENLIST (ucenlist.org), including: what Vipassana is, the biography
  of S.N. Goenka, the Art of Living philosophy, the Code of Discipline for courses,
  the daily timetable, FAQs, UCENLIST organization details, course registration,
  and contact information. This is the primary knowledge base for a Vipassana
  meditation chatbot that supports UCENLIST users.
  Also use this skill for Vietnamese queries about Vipassana, UCENLIST courses,
  thiền Vipassana, đăng ký khóa thiền, S.N. Goenka, thiền 10 ngày.
```

### Data Source

All content is sourced from `https://ucenlist.org/en` (English) and `https://ucenlist.org/vi` (Vietnamese). No external APIs or databases are used — the skill is entirely self-contained static knowledge.

## Implementation Approach

Since the English `SKILL.md` already exists, the implementation task is:

1. **Add Vietnamese knowledge sections** inline after each English section
2. **Add a Language Behavior section** with chatbot language-detection instructions
3. **Update the frontmatter description** to include Vietnamese trigger phrases

This is a pure content editing task — no code, no infrastructure, no dependencies.

## Constraints

- Keep all content factually accurate to the source website
- Do not add opinions, interpretations, or external content
- Vietnamese must be natural and culturally appropriate (not machine-translated)
- The file must remain readable as a standalone Markdown document

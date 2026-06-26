# Proposal: Vipassana UCENLIST Knowledge Skill

## Summary

Create a comprehensive agent skill (`vipassana-ucenlist-knowledge`) that encapsulates all knowledge from [ucenlist.org](https://ucenlist.org/en) to power a Vipassana meditation chatbot. The skill supports both **English and Vietnamese** and covers everything from Vipassana philosophy and the biography of S.N. Goenka, to course rules, daily timetable, FAQ, and UCENLIST-specific registration details.

## Problem

Users interested in Vipassana meditation through UCENLIST currently have no interactive support channel. They must manually browse the website across multiple pages and navigate between Vietnamese/English content. A chatbot powered by structured knowledge would:

- Answer questions instantly and compassionately
- Guide users through registration for courses in Hanoi and Ho Chi Minh City
- Reduce the burden on UCENLIST staff answering repetitive inquiries

## Why Now

The UCENLIST website content is complete and stable. The exploration phase has already verified all page content and the skill has been created in English. The next step is to formalize this work as an OpenSpec change and extend it with full Vietnamese language support.

## Goals

1. **Finalize** the English-language knowledge skill (`SKILL.md`) with all content scraped from ucenlist.org/en
2. **Add Vietnamese-language support** — add a parallel Vietnamese knowledge section covering all the same topics (Vipassana là gì?, tiểu sử S.N. Goenka, Quy tắc Giới luật, Thời khóa biểu, Hỏi & Đáp, Đăng ký khóa học, v.v.)
3. **Bilingual chatbot behavior** — the skill should guide chatbot agents to detect user language and respond accordingly

## Non-Goals

- Building the actual chatbot agent (a separate future change)
- Scraping the Vietnamese-language version of the site for any content not already known
- Real-time course availability lookup

## Success Criteria

- `SKILL.md` exists at `.agents/skills/vipassana-ucenlist-knowledge/SKILL.md`
- The file covers all 10+ topic areas in **both English and Vietnamese**
- The frontmatter `description` accurately triggers the skill for both languages
- The skill includes language-detection guidance for the chatbot

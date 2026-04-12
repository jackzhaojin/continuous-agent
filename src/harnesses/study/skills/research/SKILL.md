---
name: research
description: Researches a topic using web search and documentation, producing structured reference notes
---

# Research

Conduct thorough research on a topic and produce structured reference notes.

## Inputs

- `{{TOPIC_ID}}` — Unique identifier for this topic.
- `{{TOPIC_TITLE}}` — Human-readable title of the topic.
- `{{TOPIC_DESCRIPTION}}` — Description of what this topic covers and its scope.
- `{{OUTPUT_PATH}}` — File path where the research markdown will be written.

## Process

1. **Plan the research.**
   - Based on the topic title and description, identify 3-5 specific questions that need answering.
   - Determine what the official/authoritative source would be (e.g., AWS docs, RFC, MDN, vendor documentation).

2. **Search and gather.**
   - Use WebSearch to find relevant documentation, tutorials, and expert content.
   - Prioritize official documentation and well-known technical sources.
   - Use WebFetch to retrieve full content from the most promising results.
   - Collect at least 2-3 distinct sources to cross-reference.

3. **Extract and organize.**
   - Pull out key facts, definitions, and concepts.
   - Note practical patterns, common configurations, and real-world usage.
   - Identify gotchas, edge cases, and common mistakes.
   - Record source URLs for every piece of information.

4. **Write structured output.**

## Output Format

Write a markdown file to `{{OUTPUT_PATH}}` with this structure:

```markdown
# {{TOPIC_TITLE}}

**Topic ID:** {{TOPIC_ID}}
**Researched:** [ISO 8601 timestamp]

## Overview

[2-3 paragraph summary of what this topic is, why it matters, and where it fits
in the broader domain. Use inline citations for key claims, e.g. "The maximum
context window is 200K tokens [1]." Suitable for someone encountering this
topic for the first time.]

## Key Concepts

[Bulleted list of the essential concepts. Each bullet should have a bold term
followed by a clear explanation with inline citations. Aim for 5-10 key concepts.
Example: "- **Tool Use** — Allows Claude to call external functions during a
conversation [2]. Supports up to 128 tools per request [1]."]

## Technical Details

[Deeper technical content: architecture, protocols, APIs, configuration
options, parameters. Include code blocks or command examples where relevant.
Cite the source for each code example or configuration snippet.]

## Common Patterns

[How this topic is typically applied in practice. Real-world scenarios,
standard configurations, best-practice architectures. Include concrete
examples with citations.]

## Gotchas

[Things that commonly trip people up. Misconceptions, subtle distinctions,
easy-to-confuse options, version-specific differences. Cite sources when
noting version-specific or source-specific differences.]

## Sources

[1] **Source Title**
    URL: https://example.com/...
    Accessed: [ISO 8601 date]
    Relevance: primary | supplementary | background
    Extracted: [Brief summary of what facts/concepts were taken from this source]

[2] **Source Title**
    URL: https://example.com/...
    Accessed: [ISO 8601 date]
    Relevance: primary | supplementary | background
    Extracted: [Brief summary of what facts/concepts were taken from this source]
```

## Citation Rules

- **Every key fact, definition, and code example must have an inline citation** using `[n]` format where `n` is the source number from the Sources section.
- Place citations immediately after the claim they support: `Claude supports tool use with up to 128 tools per request [1].`
- When a statement draws from multiple sources, list all: `The recommended approach combines streaming with tool use [1][3].`
- Code examples must cite their origin: `The following pattern is from the official cookbook [2]:` followed by the code block.
- If you synthesize information from multiple sources into an original statement, cite all contributing sources.
- The Sources section must be **numbered** (`[1]`, `[2]`, etc.) and include structured metadata: title, URL, access date, relevance level, and a brief summary of what was extracted.
- Every source listed must be cited at least once in the body. Every citation must have a corresponding source entry.

## Guidelines

- Target **500-1500 words** for the full document.
- Focus on practical understanding, not textbook definitions. Someone reading this should be able to answer scenario-based questions.
- When concepts have trade-offs, explain both sides.
- Use code blocks for commands, configurations, API calls, or structured data.
- Always include the Sources section with real URLs. Never fabricate URLs.
- If information conflicts between sources, note the conflict explicitly in Gotchas and cite both conflicting sources.
- Write in clear, direct prose. Avoid filler phrases.

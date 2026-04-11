---
name: source-extract
description: Fetches a web page and extracts structured content — key facts, code examples, definitions, and best practices
---

# Source Extract

Fetch a web page and extract the most valuable content into clean, structured markdown notes.

## Inputs

- `{{SOURCE_URL}}` — URL of the web page to extract content from.
- `{{OUTPUT_PATH}}` — File path where the cleaned markdown will be written.

## Process

1. **Fetch the source.**
   - Use WebFetch to retrieve the content at `{{SOURCE_URL}}`.
   - If the fetch fails (e.g., 404, paywall, bot-blocked), write a note to the output path indicating the failure and the reason.

2. **Identify valuable content.**
   - Locate the primary article or documentation body.
   - Identify: definitions, explanations, code examples, configuration snippets, architectural diagrams (describe them), best practices, warnings, and important notes.
   - Ignore: navigation menus, sidebars, ads, cookie banners, footers, related articles, comment sections, social sharing buttons.

3. **Structure the extraction.**
   - Organize content under clear headers that reflect the source structure.
   - Preserve code blocks exactly as they appear, with language annotations.
   - Convert important callouts or warnings into blockquotes.
   - Preserve tables if they contain valuable data.
   - For any quoted content, provide proper attribution.

4. **Write the output.**

## Output Format

Write a markdown file to `{{OUTPUT_PATH}}` with this structure:

```markdown
# [Page Title]

**Source:** [URL]
**Extraction ID Prefix:** EXT-[N] (where N is the source number from the manifest)
**Extracted:** [ISO 8601 timestamp]

## Summary

[2-3 sentence summary of what this page covers and its key takeaway.]

## Key Facts

Each fact gets a unique extraction ID for downstream traceability:

- `EXT-[N]-fact-1`: [First important discrete fact from the source]
- `EXT-[N]-fact-2`: [Second important discrete fact]
- `EXT-[N]-fact-3`: [Third important discrete fact]
- ...continue numbering sequentially

## Definitions

[Only if the source contains important term definitions]

- `EXT-[N]-def-1`: **Term** — Definition
- `EXT-[N]-def-2`: **Term** — Definition

## Code Examples

[Only if the source contains code. Preserve original code blocks.]

### `EXT-[N]-code-1`: [Description of what this code does]

\`\`\`language
code here
\`\`\`

## Patterns and Best Practices

- `EXT-[N]-pattern-1`: [Architectural pattern or recommended approach]
- `EXT-[N]-pattern-2`: [Configuration guideline]

## Important Warnings

- `EXT-[N]-warn-1`: [Caveat, deprecation notice, or security concern]
```

The `EXT-[N]-*` IDs create a provenance chain: the research skill can cite `EXT-2-fact-3` to trace a claim back to its exact origin in this extraction.

## Guidelines

- Be selective. Extract only content that has educational or practical value.
- Do not paraphrase code. Preserve code blocks exactly.
- If the page is primarily a reference table or API doc, structure the output to match (use tables).
- Omit sections from the template that have no relevant content from this source.
- Keep the Summary concise. The bulk of value should be in the structured sections.
- If the source is very long, focus on the most important and unique content rather than trying to capture everything.
- Always include the source URL and extraction timestamp at the top.

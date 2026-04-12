---
name: synthesize
description: Cross-references multiple research documents to identify themes, gaps, conflicts, and priority rankings
---

# Synthesize

Analyze multiple research files together to identify cross-cutting themes, knowledge gaps, conflicts, and priorities.

## Inputs

- `{{RESEARCH_DIR}}` — Directory containing all research markdown files.
- `{{OUTPUT_PATH}}` — File path where the synthesis report will be written.

## Process

1. **Discover and read all research files.**
   - Use Glob to find all markdown files in `{{RESEARCH_DIR}}` (pattern: `**/*.md`).
   - Read each file. Track the topic ID, title, and depth of content for each.

2. **Identify cross-cutting themes.**
   - Use Grep to search for recurring concepts, terms, and patterns across files.
   - Group topics that share common underlying principles.
   - Note which concepts appear in 3+ different topic areas — these are likely high-priority.

3. **Detect knowledge gaps.**
   - For each research file, assess whether it has sufficient depth:
     - Does it cover the Overview, Key Concepts, and Technical Details adequately?
     - Are there sections that are thin or vague?
     - Are there referenced subtopics that have no dedicated research file?
   - Flag topics that need additional research.

4. **Find conflicting information.**
   - Look for cases where different research files make contradictory claims.
   - Note version-specific differences that could cause confusion.
   - Identify areas where "it depends" is the real answer and the nuance needs capturing.

5. **Build a dependency graph.**
   - Determine which topics build on others (prerequisites).
   - Identify foundational topics that should be learned first.
   - Note topics that are relatively independent and can be approached in any order.

6. **Rank priorities.**
   - Consider: importance weight, current depth of research, complexity, number of dependencies.
   - Assign each topic area a priority: `critical`, `high`, `medium`, or `low`.

7. **Write the synthesis.**

## Output Format

Write a markdown file to `{{OUTPUT_PATH}}` with this structure:

```markdown
# Synthesis Report

**Generated:** [ISO 8601 timestamp]
**Research files analyzed:** [count]
**Total topics covered:** [count]

## Cross-cutting Themes

[For each theme that spans multiple topics:]

### [Theme Name]

- **Appears in:** [list of topic IDs]
- **Core concept:** [1-2 sentence explanation]
- **Why it matters:** [relevance to the domain]

## Knowledge Gaps

| Topic ID | Topic Title | Gap Description | Sources Consulted | Severity |
|----------|-------------|-----------------|-------------------|----------|
| ...      | ...         | ...             | [n], [m] from topic's research | high/med/low |

Note which source citations were checked when identifying each gap. If a gap exists because no source covered the subtopic, state "no sources found."

## Conflicting Information

### [Conflict Title]

- **Topics involved:** [topic IDs]
- **Source citations:** [cite the specific `[n]` references from each topic's research that conflict]
- **Conflict:** [description of the contradiction, referencing the cited sources]
- **Resolution:** [if known, how to reconcile; otherwise "needs investigation"]

## Topic Relationships

### Dependency Graph

[Describe the dependency ordering. Which topics are foundational? Which
build on others? Use indented lists or ASCII-style tree notation.]

### Independent Topics

[List topics that can be approached in any order without prerequisites.]

## Priority Rankings

| Priority | Topic ID | Topic Title | Rationale |
|----------|----------|-------------|-----------|
| critical | ...      | ...         | ...       |
| high     | ...      | ...         | ...       |
| medium   | ...      | ...         | ...       |
| low      | ...      | ...         | ...       |

## Recommended Order

[Numbered list of topics in the recommended sequence, considering
dependencies and priorities.]
```

## Guidelines

- Be honest about gaps. It is more valuable to flag missing knowledge than to pretend coverage is complete.
- Prioritize actionable insights. Each section should help the reader decide what to focus on next.
- The dependency graph should be practical, not theoretical. Only list dependencies that actually affect comprehension.
- Keep the synthesis focused. This is a decision-making document, not a content summary.

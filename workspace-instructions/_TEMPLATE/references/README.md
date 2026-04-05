# References

Place example code, patterns, or documentation here for the agent to use as context.

## What to Include

- Code snippets showing desired patterns
- Examples from similar projects
- API documentation excerpts
- Configuration examples
- Screenshots or mockups

## Example Structure

```
references/
├── examples/
│   └── similar-implementation.tsx
├── patterns/
│   └── error-handling-pattern.ts
└── docs/
    └── api-notes.md
```

## How to Reference

In PROMPT.md, point the agent to specific files:
```markdown
Follow the pattern in: `./references/patterns/error-handling-pattern.ts`
```

The agent reads these files to understand your preferred approach.

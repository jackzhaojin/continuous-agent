---
name: topic-decompose
description: Breaks a structured document into a hierarchical topic tree with estimated complexity ratings
---

# Topic Decompose

Break a structured document (syllabus, guide, outline, specification) into a hierarchical topic tree.

## Inputs

- `{{INPUT_PATH}}` — Path to the source document. May be a local file path or a URL.
- `{{OUTPUT_PATH}}` — Path where the topic tree JSON file will be written.

## Process

1. **Acquire the source document.**
   - If `{{INPUT_PATH}}` is a URL (starts with `http://` or `https://`), fetch it with WebFetch first, then parse the content.
   - If it is a local file path, read it with Read.

2. **Analyze the document structure.**
   - Identify major domains, sections, or knowledge areas. These become depth-0 nodes.
   - Within each domain, identify distinct topics. These become depth-1 nodes.
   - Within each topic, identify specific subtopics or learning objectives. These become depth-2 nodes (leaf nodes).

3. **Assess complexity.**
   - For every node, estimate complexity as `low`, `medium`, or `high` based on:
     - Breadth of prerequisite knowledge required
     - Number of interrelated concepts
     - Depth of understanding typically needed

4. **Ensure granularity.**
   - Each leaf topic should be specific enough to research thoroughly in a single pass (roughly one focused web search session).
   - Aim for **15-40 leaf topics** total depending on the breadth of the source document.
   - If a subtopic is still too broad, split it further.

5. **Write the output JSON.**

## Output Schema

Write a JSON file to `{{OUTPUT_PATH}}` with this structure:

```json
{
  "examTitle": "string — title of the subject area",
  "sourceDocument": "string — input path or URL",
  "generatedAt": "ISO 8601 timestamp",
  "totalLeafTopics": "number",
  "topics": [
    {
      "id": "string — unique identifier, e.g. 'domain-1'",
      "title": "string — concise topic title",
      "description": "string — 1-2 sentence description of what this covers",
      "depth": 0,
      "estimatedComplexity": "low | medium | high",
      "subtopics": [
        {
          "id": "string — e.g. 'domain-1.topic-1'",
          "title": "string",
          "description": "string",
          "depth": 1,
          "estimatedComplexity": "low | medium | high",
          "subtopics": [
            {
              "id": "string — e.g. 'domain-1.topic-1.sub-1'",
              "title": "string",
              "description": "string",
              "depth": 2,
              "estimatedComplexity": "low | medium | high",
              "subtopics": []
            }
          ]
        }
      ]
    }
  ]
}
```

## Guidelines

- Use hierarchical dot-notation for IDs (e.g., `networking.dns.record-types`).
- Descriptions should clarify scope — what is included and what is not.
- Do not invent topics that are not represented in the source document.
- If the source document has explicit weightings or percentages, capture those in the description.
- Validate the JSON is well-formed before writing.

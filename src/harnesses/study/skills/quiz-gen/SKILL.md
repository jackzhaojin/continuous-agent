---
name: quiz-gen
description: Generates scenario-based multiple-choice quiz questions from research content
---

# Quiz Generator

Generate scenario-based multiple-choice quiz questions that test understanding, not memorization.

## Inputs

- `{{RESEARCH_DIR}}` — Directory containing all research markdown files.
- `{{SYNTHESIS_PATH}}` — Path to the synthesis report markdown file.
- `{{OUTPUT_PATH}}` — File path where the quiz JSON for this domain will be written.
- `{{DOMAIN_ID}}` — The domain ID to generate questions for (e.g. `build-deployments`).
- `{{DOMAIN_TITLE}}` — Human-readable domain title (e.g. `Build and Deployments`).
- `{{QUESTIONS_PER_DOMAIN}}` — Number of questions to generate for this domain (default: 8).

## Process

1. **Read source material for this domain only.**
   - Read the synthesis report at `{{SYNTHESIS_PATH}}` — find the section for `{{DOMAIN_TITLE}}` to identify priority topics and key concepts.
   - Use Glob to list files in `{{RESEARCH_DIR}}` matching `{{DOMAIN_ID}}_*.md`. Read up to 5 of the highest-priority files for this domain.
   - Do NOT read files from other domains — stay focused on `{{DOMAIN_ID}}`.

2. **Generate exactly `{{QUESTIONS_PER_DOMAIN}}` questions for `{{DOMAIN_TITLE}}`.**
   - Mix difficulty: roughly 20% easy, 50% medium, 30% hard.
   - Weight harder questions toward topics ranked critical/high in the synthesis.

3. **Write scenario-based questions.**
   - Each question starts with a realistic scenario (2-4 sentences) that sets context.
   - The question asks what action to take, which option to choose, or what the outcome would be.
   - All four answer options must be plausible. Avoid obviously wrong distractors.
   - The rationale must explain why the correct answer is right AND why each incorrect option is wrong.

4. **Cross-reference topics.**
   - Some questions should span multiple topic areas (use the cross-cutting themes from synthesis).
   - The `references` array should list all topic IDs that the question touches.

5. **Write the output JSON to `{{OUTPUT_PATH}}`.**

## Output Schema

Write a JSON file to `{{OUTPUT_PATH}}` with this structure:

```json
{
  "generatedAt": "ISO 8601 timestamp",
  "totalQuestions": 0,
  "difficultyDistribution": {
    "easy": 0,
    "medium": 0,
    "hard": 0
  },
  "questions": [
    {
      "id": "q-001",
      "topic": "Topic area name",
      "difficulty": "easy | medium | hard",
      "scenario": "A company is migrating their monolithic application to a microservices architecture. They need to ensure that services can discover each other dynamically as instances scale up and down. The team wants minimal operational overhead.",
      "question": "Which approach best addresses the team's requirements for service discovery?",
      "options": [
        {
          "label": "A",
          "text": "Option text here",
          "isCorrect": false
        },
        {
          "label": "B",
          "text": "Option text here",
          "isCorrect": true
        },
        {
          "label": "C",
          "text": "Option text here",
          "isCorrect": false
        },
        {
          "label": "D",
          "text": "Option text here",
          "isCorrect": false
        }
      ],
      "rationale": "B is correct because [cite source from research, e.g. 'per the official docs [1] in topic X']. A is incorrect because... C is incorrect because... D is incorrect because...",
      "sourceRefs": ["topic-id:1", "topic-id:3"],
      "references": ["topic-id-1", "topic-id-2"]
    }
  ]
}
```

## Question Design Guidelines

### Scenario Quality

- Scenarios should describe realistic situations: a team making a decision, a system exhibiting a behavior, a requirement that needs to be met.
- Include relevant constraints (budget, scale, compliance, timeline) that narrow the correct answer.
- Avoid scenarios that are just disguised definitions ("Which service does X?").

### Difficulty Levels

- **Easy**: Tests recognition of a concept in a straightforward scenario. One option is clearly best.
- **Medium**: Requires understanding trade-offs. Two options seem viable but one is better given the constraints.
- **Hard**: Requires combining knowledge from multiple concepts. The scenario has subtle constraints that eliminate seemingly correct options.

### Distractor Quality

- Every incorrect option should be a real thing that could plausibly apply.
- Common distractors: correct service but wrong use case, right concept but wrong implementation, option that works but violates a stated constraint.
- Never use "All of the above" or "None of the above."

### Rationale Quality

- Address every option, not just the correct one.
- Explain the reasoning, not just restate the facts.
- For wrong answers, explain specifically what makes them wrong in this scenario (they might be correct in different circumstances).
- **Reference source citations from the research** when explaining why an answer is correct or incorrect. Use the format `[n]` matching the source numbers in the relevant research file. Include the `sourceRefs` array with entries in `"topic-id:source-number"` format (e.g., `"prompt-engineering:1"` means source [1] from the prompt-engineering research file).

## Guidelines

- Validate the JSON is well-formed before writing.
- Exactly one option per question must have `isCorrect: true`.
- Question IDs should be sequential: `q-001`, `q-002`, etc.
- Each question's `topic` field should match a topic title from the research files.
- The `references` array should use topic IDs from the topic tree.

# v3.0 — Agentic Memory ("Second Brain")

Technical-highlight diagrams for the V3.0 mem0-backed memory system. Source `.excalidraw` files render to matching `.png` via the `excalidraw` skill (Jack brand style).

| Diagram | Source | Image | Covers |
|---------|--------|-------|--------|
| Taxonomy & Metadata | [`taxonomy-and-metadata.excalidraw`](taxonomy-and-metadata.excalidraw) | [`.png`](taxonomy-and-metadata.png) | The five memory types (principle / semantic / procedural / episodic / reflective) and the versioned metadata envelope (scope IDs, classification, provenance, env isolation, optional aids). |
| Ingestion ⇄ Retrieval | [`ingestion-and-retrieval.excalidraw`](ingestion-and-retrieval.excalidraw) | [`.png`](ingestion-and-retrieval.png) | The write path (hooks C·E·D* → memory-harvester → validate v1.0.0 → `mem0.add` → poll SUCCEEDED) and read path (hooks A·B·D → memory-reader → **natural-language agentic search** → synthesis / Memory Pack), both centered on the mem0 second brain. Retrieval is a judgment task: the executive decides in natural language which memories serve the goal — iterative queries (not keyword bags) ARE the multi-hop walk. |

**Core pillar (both diagrams):** the executive is the **sole reader & writer** — `agent_id` is always `executive`. Workers receive memory only as static markdown (the Memory Pack) injected into their generated `CLAUDE.md`; they never call mem0.

## Re-rendering

```bash
npx -y excalidraw-brute-export-cli -i <file>.excalidraw -o <file>.png -f png -s 2 -b true
```

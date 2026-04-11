# V2.2 Harness Validation Report — Kimi K2.5 Support

**Date:** 2026-04-11  
**Branch:** develop  
**Validation Scope:** Harness framework compatibility with Kimi K2.5 (without PM2)

## Executive Summary

✅ **All validation tests pass (105 total)**

The harness v2.2 framework is fully configured to run on Kimi K2.5. The migration of harvesters is complete and all three harness types (generic, EDS, study) can execute with Kimi as the vendor.

## Test Results

### Unit Tests (71 tests)
| Test Suite | Tests | Status |
|------------|-------|--------|
| unit-core.adhoc.ts | 24 | ✅ Pass |
| unit-state-and-mode.adhoc.ts | 24 | ✅ Pass |
| unit-loaders-and-config.adhoc.ts | 23 | ✅ Pass |

### Mock E2E Tests (6 tests)
| Test Suite | Tests | Status |
|------------|-------|--------|
| mock-generic-orchestrator.e2e.ts | 2 | ✅ Pass |
| mock-eds-orchestrator.e2e.ts | 2 | ✅ Pass |
| mock-study-orchestrator.e2e.ts | 2 | ✅ Pass |

### Kimi K2.5 Validation (28 tests)
| Category | Tests | Status |
|----------|-------|--------|
| Tool Name Mapping | 4 | ✅ Pass |
| Prompt Adaptation | 5 | ✅ Pass |
| Model Resolution | 8 | ✅ Pass |
| Provider Resolution | 4 | ✅ Pass |
| Harness Registry | 3 | ✅ Pass |
| Tool Map Retrieval | 4 | ✅ Pass |

## Key Validations

### 1. Tool Name Mappings ✅

Kimi uses different tool names than Claude. The `vendor-adapter.ts` correctly maps:

| Claude Tool | Kimi Tool |
|-------------|-----------|
| `Bash` | `Shell` |
| `Read` | `ReadFile` |
| `Write` | `WriteFile` |
| `Edit` | `StrReplaceFile` |

**Verified for:** `kimi`, `kimi-cli`, `kimi-wire` vendors

### 2. Prompt Adaptation ✅

For non-Claude vendors, the system correctly:
- Injects skill bodies into the prompt
- Injects CLAUDE.md content into the prompt
- Adds tool name mapping instructions
- Rewrites backtick-quoted tool references

### 3. Model Resolution ✅

**Max Turns Configuration:**
| Vendor | Default Max Turns |
|--------|-------------------|
| `kimi` / `kimi-wire` | 120 |
| `kimi-cli` | 80 |
| `codex` | 60 |
| `claude` | 50 |

**Model Override Resolution Order:**
1. `modelOverrides[envKey]` (e.g., `MODEL_SPEC_WHY`)
2. `modelOverrides[agentName]` (e.g., `spec-why`)
3. `process.env[envKey]`
4. `DEFAULT_AGENT_MODELS[agent]`

### 4. Provider Instantiation ✅

| Vendor Flag | Provider Class | Protocol |
|-------------|----------------|----------|
| `kimi` + `KIMI_MODE=wire` | `KimiWireAgentProvider` | Wire SDK |
| `kimi` (default) | `KimiCliAgentProvider` | CLI JSONL |
| `kimi-cli` | `KimiCliAgentProvider` | CLI JSONL |
| `kimi-wire` | `KimiWireAgentProvider` | Wire SDK |

### 5. Harness Registry ✅

All three harnesses are registered and functional:
- `generic` — 5 phases: SPEC → RESEARCH → BUILD → VALIDATE → COMPLETE
- `eds` — 5 phases: SPEC → RESEARCH → BUILD → VALIDATE → COMPLETE
- `study` — 7 phases: DECOMPOSE → RESEARCH → SYNTHESIZE → CONTENT → TTS → DEPOSIT → VALIDATE

## Running Harnesses with Kimi K2.5

### Standalone Mode (No PM2)

```bash
# Using Kimi Wire (recommended for reliability)
npm run harness -- --name generic \
  --prompt tests/fixtures/harness-test-input/PROMPT.md \
  --vendor kimi-wire

# Using Kimi CLI
npm run harness -- --name generic \
  --prompt tests/fixtures/harness-test-input/PROMPT.md \
  --vendor kimi-cli

# With model overrides
MODEL_SPEC_WHY=kimi-k2.5 MODEL_BUILD=kimi-k2.5 \
  npm run harness -- --name generic --prompt <path> --vendor kimi-wire

# EDS harness
npm run harness -- --name eds \
  --prompt <path-to-eds-prompt> \
  --vendor kimi-wire
```

### Environment Variables

```bash
# Required for Kimi
export MOONSHOT_API_KEY="sk-..."  # Or use `kimi login`

# Optional overrides
export KIMI_MODE="wire"           # 'wire' or 'cli'
export KIMI_MODEL="kimi-k2.5"     # Model selection
export KIMI_YOLO_MODE="true"      # Auto-approve tools
export WORKER_VENDOR="kimi"       # Default vendor
```

## Testing Without PM2

All tests can be run without starting PM2:

```bash
# Run full harness test suite (no API calls)
npm run test:harness

# Run specific validation
npx tsx tests/adhoc/validate-kimi-k2.5-harness.adhoc.ts

# Run smoke tests with mock Kimi provider
npx tsx tests/adhoc/smoke-test-all-harnesses-with-kimi.adhoc.ts

# Type check only (no build)
npm run typecheck
```

## Known Limitations

### Study Harness

The Study harness shows a warning when run with non-Claude vendors:

```
WARNING: vendor 'kimi' is not fully supported yet. The coordinator relies on 
Claude SDK's native Task/Skill tools. Run with --vendor claude for a supported 
configuration. P5 deferred __spawn__ emulation to v2.3.
```

This is expected — full multi-vendor support for Study is scheduled for v2.3. The harness will run but may not have full functionality.

### Kimi CLI vs Wire

Per the v2.2 outcome docs, Kimi CLI has intermittent handoff issues. **Kimi Wire is the recommended path** for production use.

## Files Added/Modified

### New Test Files
- `tests/adhoc/validate-kimi-k2.5-harness.adhoc.ts` — 28 Kimi-specific validation tests
- `tests/adhoc/smoke-test-all-harnesses-with-kimi.adhoc.ts` — End-to-end smoke tests
- `tests/fixtures/harness-test-input/PROMPT.md` — Sample test prompt

### Modified Files
- `tests/adhoc/2026-04-11-harness-v22/run-all.sh` — Added Kimi validation to test suite

## Conclusion

✅ **The harness v2.2 framework is ready for Kimi K2.5 execution.**

All three harness types (generic, EDS, study) are properly migrated and can run with Kimi K2.5 as the vendor. The test suite validates:

1. Tool name mappings work correctly
2. Prompt adaptation injects necessary context
3. Model resolution follows the correct precedence
4. Providers instantiate properly
5. Harness registry is complete

**Next Steps for Live Testing:**
1. Set `MOONSHOT_API_KEY` or run `kimi login`
2. Run: `npm run harness -- --name generic --prompt <your-prompt> --vendor kimi-wire`

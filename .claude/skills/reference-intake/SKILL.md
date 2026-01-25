---
name: reference-intake
description: |
  Acquire external references using Mode A (Mirror), B (Patch), or C (Fork). Use when a task requires external material (SDKs, documentation, examples), cloning official documentation, annotating reference code with patches, forking templates, or registering new references in reference-registry.yaml.
---

# Reference Intake

Acquire external references using the appropriate mode.

## Mode Selection

```
Need to modify the code?
├── No → Mode A (Mirror)
└── Yes → Minor annotations only?
    ├── Yes → Mode B (Patch)
    └── No → Mode C (Fork)
```

## Mode A: Mirror (Read-Only)

For official docs, API references, tutorials.

```bash
cd references/sources
git clone --depth 1 <url> <reference-id>
```

Register: `mode: A` in reference-registry.yaml

## Mode B: Patch (Read + Annotate)

For code you need to annotate while keeping source pristine.

```bash
# Clone source (Mode A)
cd references/sources && git clone --depth 1 <url> <reference-id>
# Create patches folder
mkdir -p references/patches/<reference-id>
```

Register: `mode: B`, list patches in registry

## Mode C: Fork (Read + Modify)

For templates you'll heavily customize.

```bash
cd references/forks
git clone --depth 1 <url> <reference-id>
cd <reference-id> && git remote remove origin
```

Register: `mode: C`, track upstream_commit

## Checklist

Before: Verify license, check if similar exists, determine mode
After: Add to registry, run integrity verifier, commit changes

## Anti-Patterns

- Modify Mode A references (use B or C)
- Forget to register references
- Clone without verifying license

---
title: Conversational Chat Interface
slug: chatbot-ui-react
priority: P2
status: pending
complexity: medium
created: 2026-01-28
tags: [react, tailwind, frontend, ui-ux, chatbot]
output_path:
branch:
---

## Problem

Need a polished chatbot-style conversational UI to demonstrate frontend delivery capability. The interface should feel like a real chat product (think iMessage/WhatsApp quality) but return randomized witty responses instead of real AI. This tests layout composition, animation polish, state management, and responsive design.

## Definition of Done

- [ ] React + Tailwind project scaffolded with Vite
- [ ] Message bubble layout with distinct user/bot styling (alignment, color, avatar)
- [ ] Typing indicator animation (three bouncing dots) appears before bot responds
- [ ] Bot selects from a curated pool of 30+ witty/humorous responses (randomized)
- [ ] Dark/light mode toggle with smooth transition
- [ ] Auto-scroll to newest message with smooth scroll behavior
- [ ] Message timestamps (relative: "just now", "2m ago")
- [ ] Emoji reaction picker on long-press/hover of any message
- [ ] Mobile-first responsive layout (works on 375px through 1440px)
- [ ] Input bar with send button, Enter-to-send, and Shift+Enter for newline
- [ ] Empty state with welcome message and suggested quick-reply chips
- [ ] All code compiles, no TypeScript errors
- [ ] Git committed with clean status

## Approach

- Use Vite + React + TypeScript + Tailwind CSS
- Component structure: ChatWindow > MessageList > MessageBubble, InputBar, TypingIndicator
- State: useReducer for message list, useEffect for auto-scroll, setTimeout for simulated bot delay (1-3s random)
- Response pool: JSON array of categorized responses (greetings, jokes, questions, observations)
- Dark mode: Tailwind `dark:` classes with CSS variable theme, toggle stored in localStorage
- Animations: Tailwind + CSS keyframes for typing dots, message entrance (slide-up + fade-in)
- No external UI library - pure Tailwind for maximum control over aesthetics

## Open Questions

- Should quick-reply chips trigger specific response categories or remain random?
- Include sound effects for message send/receive?

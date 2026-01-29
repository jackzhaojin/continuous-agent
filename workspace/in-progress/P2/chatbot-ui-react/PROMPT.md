---
title: Full-Stack Conversational Chat Application
slug: chatbot-ui-react
status: pending
priority: P2
complexity: high
created: 2026-01-28T00:00:00.000Z
tags:
  - react
  - nextjs
  - tailwind
  - frontend
  - ui-ux
  - chatbot
  - api
  - database
  - authentication
  - full-stack
  - responsive
  - animation
output_path: /Users/jackjin/dev/agent-outputs/projects/nextjs/2026-01-29/1769671611924
branch: null
---

## Problem

Build a full-stack multi-room chat application with user authentication, conversation persistence, and a polished conversational UI. Users can create accounts, start chat rooms, invite others (simulated), and have persistent conversations. Bot responses are randomized from a curated pool. This tests end-to-end full-stack delivery: database schema design, API development, authentication, real-time-feeling updates, and pixel-perfect chat UI with animations.

## Definition of Done

### Authentication & User System
- [ ] Login and registration pages with email/password
- [ ] Session-based authentication with JWT tokens in httpOnly cookies
- [ ] Protected routes — redirect to login if unauthenticated
- [ ] User profile page: avatar (generated gradient), username, email, conversations count, member since date
- [ ] User settings page: display name, theme preference (dark/light), notification toggle

### Database & Schema
- [ ] SQLite database with better-sqlite3 (or Prisma + SQLite)
- [ ] Schema: Users (id, username, email, passwordHash, avatarColor, createdAt), Conversations (id, title, createdBy, createdAt, updatedAt), ConversationMembers (conversationId, userId, role), Messages (id, conversationId, senderId, content, type, createdAt), Reactions (messageId, userId, emoji)
- [ ] Seed script creating 3+ conversations with 20+ messages each, simulating realistic chat flow
- [ ] Migrations or schema initialization script

### API Endpoints
- [ ] POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
- [ ] GET /api/conversations — list user's conversations (sorted by last message)
- [ ] POST /api/conversations — create new conversation (title, initial message)
- [ ] GET /api/conversations/:id — conversation details with members
- [ ] GET /api/conversations/:id/messages — paginated messages (newest first, cursor-based)
- [ ] POST /api/conversations/:id/messages — send message (triggers bot response after delay)
- [ ] DELETE /api/conversations/:id — delete conversation (owner only)
- [ ] POST /api/messages/:id/reactions — add emoji reaction to message
- [ ] DELETE /api/messages/:id/reactions/:emoji — remove reaction
- [ ] PUT /api/users/me — update profile (display name, theme preference)
- [ ] GET /api/conversations/:id/search?q= — search within conversation

### Frontend UI
- [ ] Two-panel layout: conversation sidebar (list + search) and main chat area
- [ ] Conversation list in sidebar: avatar, title, last message preview, unread indicator, timestamp
- [ ] Message bubble layout with distinct user/bot styling (alignment, color, rounded corners, avatar)
- [ ] Typing indicator animation (three bouncing dots) appears before bot responds
- [ ] Bot selects from a curated pool of 50+ witty/humorous responses (categorized: greetings, jokes, questions, observations, reactions)
- [ ] Auto-scroll to newest message with smooth scroll behavior
- [ ] Message timestamps (relative: "just now", "2m ago", "Yesterday 3:45 PM")
- [ ] Message grouping: consecutive messages from same sender collapse avatars
- [ ] Emoji reaction picker on hover of any message (6 quick reactions + expandable picker)
- [ ] Dark/light mode toggle with smooth transition (persisted to user settings)
- [ ] Input bar: send button, Enter-to-send, Shift+Enter for newline, character count
- [ ] New conversation modal with title input
- [ ] Empty state with welcome message and suggested quick-reply chips
- [ ] Search within conversation with highlighted matches
- [ ] Mobile-first responsive layout (375px through 1440px, sidebar collapses to drawer)
- [ ] Loading skeletons for conversation list and message history
- [ ] Scroll-to-top "load more" for older messages (infinite scroll)

### Integration & Polish
- [ ] All conversations and messages persist via API (no client-only state)
- [ ] Bot responses arrive after 1-3s simulated delay with typing indicator
- [ ] Optimistic message sending (appears immediately, confirms on API response)
- [ ] Error toasts for failed operations (send failure, network error)
- [ ] Message entrance animations (slide-up + fade-in)
- [ ] Conversation list updates in real-time when new message arrives (polling every 5s)
- [ ] All code compiles, no TypeScript errors
- [ ] Git committed with clean status

## Approach

- Next.js 14 App Router + TypeScript + Tailwind CSS
- Database: SQLite via better-sqlite3
- Auth: Custom JWT with bcrypt password hashing
- Component structure: ConversationSidebar, ChatWindow > MessageList > MessageBubble, InputBar, TypingIndicator
- State: React Context for active conversation + current user, SWR for data fetching with revalidation
- Bot delay: POST to API triggers server-side setTimeout → inserts bot message → client polls or refetches
- Response pool: Server-side JSON array of 50+ categorized responses
- Dark mode: Tailwind `dark:` classes with user preference from DB
- Animations: Tailwind + CSS keyframes for typing dots, message entrance (slide-up + fade-in)
- No WebSocket needed — use SWR polling for "real-time" feel

## Agent Notes

Complex full-stack chat application with relational data, user system, and demanding UI polish. The chat UI requires careful attention to message grouping, animations, and responsive layout. Expect 7-9 implementation steps.

## Steps

### Step 1: Research existing patterns and plan approach
- **Status:** Pending
- **Description:** Analyze requirements for "Full-Stack Conversational Chat Application". Research best practices, existing patterns, and create a technical plan.
- **Est. Turns:** 80
### Step 2: Initialize project with Next.js and TypeScript
- **Status:** Pending
- **Description:** Set up Next.js project with TypeScript, configure ESLint, set up folder structure.
- **Est. Turns:** 100
### Step 3: Design and implement database schema
- **Status:** Pending
- **Description:** Create database models, migrations, and seed data. Set up ORM if needed.
- **Est. Turns:** 110
### Step 4: Implement authentication system
- **Status:** Pending
- **Description:** Set up user authentication with JWT or session-based auth. Create login/logout/register flows.
- **Est. Turns:** 120
### Step 5: Build core API endpoints
- **Status:** Pending
- **Description:** Implement main API routes with CRUD operations. Add validation and error handling.
- **Est. Turns:** 130
### Step 6: Create UI components and pages
- **Status:** Pending
- **Description:** Build React components for the user interface. Create main pages and navigation.
- **Est. Turns:** 140
### Step 7: Integration and feature completion
- **Status:** Pending
- **Description:** Connect all components, ensure data flow works end-to-end. Add any missing features.
- **Est. Turns:** 100
### Step 8: Testing and quality assurance
- **Status:** Pending
- **Description:** Write unit tests, integration tests. Fix bugs and edge cases.
- **Est. Turns:** 100

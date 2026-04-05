# V2.1 Multi-Model Worker Support - Prompt Log

**Date**: 2026-03-31
**Agent**: claude-code
**Status**: Complete
**Deliverable**: [completion.md](./completion.md)

---

## Session 1: Vendor Abstraction & POCs (Mar 31, 2026)

### Prompt 1: Merge & Review (9:20 PM)

> I merged a fairly large PR, can you pull?

→ Response: Pulled latest from remote with the vendor abstraction work.
→ Action: `git pull` on main branch.

---

### Prompt 2: PR Review & Gap Analysis (10:07 PM)

> Alright, can you look at the pull request eleven that we merged to develop and we did some PLCs. Just look at the past four or five commits and then you should see what I'm talking about. Let's have you kinda look at what's done, what's not, we need to get this thing wired end to end.

→ Response: Analyzed PR #11 with Codex/Kimi POCs, identified gaps in vendor registry wiring, auth validation, and per-goal override.
→ Action: Reviewed 5 commits, generated gap analysis.

---

### Prompt 3: Wire Gaps & Skip Auth (10:25 PM)

> Yeah I guess for number one the key gap number one yeah let's remove key mi authentication validation for now let's assume that there's key mi login that just works. For number two yeah no goal per vendor override, let's wire that up.

→ Response: Removed Kimi auth validation, wired per-goal vendor override via PROMPT.md frontmatter.
→ Action: Updated vendor-registry.ts, worker-spawner.ts, kimi-provider.ts.

---

### Prompt 4: E2E Testing (10:25 PM)

> Also write a bunch of end-to-end testing. after what I was asking you is completed, please write a bunch of end-to-end testing in the test n2n folder for Cloude, Kimi K2 as well as codex

→ Response: Created E2E test scripts for all 3 vendors plus the registry.
→ Action: Created tests/e2e/vendor-workers/ with per-vendor test files.

---

### Prompt 5: Kimi Dual Mode (10:36 PM)

> Also we did more PLCs. kind of for Kimi I'm kind of thinking about moving away from the wire model and just use the JSON streaming as well as for Kodaks. Let's the no change there, but let's make sure we support both.

→ Response: Discussed Kimi wire vs CLI modes.
→ Action: No code changes yet.

---

### Prompt 6: Keep Wire + CLI (10:36 PM)

> Let's keep the wire protocol. If we can switch between chimi wire and chemie C L I that'll be great

→ Response: Implemented KIMI_MODE env switch between `wire` and `cli` modes.
→ Action: Updated kimi-provider.ts with dual-mode support.

---

### Prompt 7: Scan & Commit (10:43 PM)

> OK let's Do a scan of all the files, that's outstanding, make sure we don't need to giggle anything. But yeah please click all outstanding files please.

→ Response: Scanned for uncommitted files, verified no secrets exposed.
→ Action: Staged and committed vendor abstraction layer.

---

### Prompt 8: Let's commit (10:43 PM)

> Let's commit.

→ Response: Committed all vendor abstraction work.
→ Action: git commit with vendor layer changes. ✅

---

## Session 2: Multi-Vendor Comparison Run (Mar 31, 2026)

### Prompt 9: Merge & Queue Goals (11:02 PM)

> Alright, let's fast forward in March from develop. And yeah, and add in let's have you maybe put in a few like three medium effort tasks. Let's try putting three medium size goals for each of our three vendors.

→ Response: Merged develop into main, prepared goal bundles for cross-vendor comparison.
→ Action: git merge, created 3 goal bundles with different worker_vendor frontmatter.

---

### Prompt 10: Same Project, Different Vendors (11:04 PM)

> Well, ideally, let's have it be the same project. Maybe have it be a medium complexity React, right? It has to look really nice. Let's have it be a medium complexity React project that we build across all three different models.

→ Response: Designed finance dashboard comparison -- same prompt across Claude, Codex, Kimi CLI, Kimi Wire.
→ Action: Created 4 goal bundles with identical prompts, different vendor overrides.

---

### Prompt 11: Kimi Wire to P3 (11:05 PM)

> Can we move the chimi wire to P3 so that we run out one last in case it breaks?

→ Response: Moved Kimi Wire goal to P3 priority so it runs last as the riskiest vendor.
→ Action: Updated PROMPT.md frontmatter priority.

---

### Prompt 12: Start PM2 & Monitor (11:08 PM)

> /long-agent-monitor Alright. Let's have you start this thing up and then yeah, as always aggressively monitor, especially on the changes. Make sure we are actually using the right model to do this.

→ Response: Started PM2 executive loop to run the 4-vendor comparison.
→ Action: pm2 start, began monitoring.

---

### Prompt 13: Critical Error - Stop & Reset (11:09 PM)

> Yeah, can you stop the PM two and then move things back and then just kinda delete the work and then yeah, fix everything please. And then restart. This is a critical error.

→ Response: Stopped PM2, cleaned up broken state, reset goal bundles.
→ Action: pm2 stop, file cleanup, goal reset.

---

### Prompt 14: Nothing Worked (11:20 PM)

> Can you check again? none of this worked and i see 4 things in complete. Also Pla didn't actually build anything either. Let's slow down, let's take a deep breath, see what's going on.

→ Response: All 4 vendors completed but produced broken/empty output. Root cause analysis started.
→ Action: Inspected ai-sandbox output directories, checked worker logs. ⚠️

---

### Prompt 15: Claude Also Failed (11:22 PM)

> My cloud also failed really badly too. So yeah, I don't know. Claude also failed too

→ Response: Identified that even Claude (the baseline) failed -- problem was in worker spawning, not vendor-specific.
→ Action: Investigated worker-spawner.ts and prompt-builder.ts.

---

### Prompt 16: Kill All Processes (11:23 PM)

> Can you kill all running processes? There's probably a running. It's possible the agent's running, the React stuff is running.

→ Response: Killed all stale processes (PM2, dev servers).
→ Action: pm2 kill, killed node processes.

---

### Prompt 17: Debug & Restart (11:24 PM)

> Okay, let's do some analysis and yeah use the long running agent debugger and start again.

→ Response: Diagnosed issues, fixed worker spawning, restarted with monitoring.
→ Action: Used long-agent-monitor skill, restarted PM2.

---

### Prompt 18: Keep Monitoring (11:31 PM)

> no you're right, keep monitoring /long-agent-monitor

→ Response: Continued monitoring -- vendors were making progress this time.
→ Action: Monitored PM2 logs and ai-sandbox output.

---

### Prompt 19: Stop Mailer, Restart PM2 (11:33 PM)

> OK let's stop the mailer if that's ok, we'll triage and e2e test later, turn off please and restart pm2

→ Response: Disabled Gmail inbox checker, restarted PM2 focused on vendor comparison only.
→ Action: Updated .env.executive, pm2 restart.

---

### Prompt 20: Codex Not Working (11:39 PM)

> it hasn't created the root folder yet, something is wrong with codex. output_path: /Users/jackjin/dev/ai-sandbox/projects/react/2026-03-31/finance-dashboard-codex

→ Response: Codex SDK wasn't creating the output directory. Needed direct SDK intervention.
→ Action: Investigated codex-provider.ts output handling.

---

### Prompt 21: Yolo Codex (11:40 PM)

> for now if we need to yolo codex sdk let's do it

→ Response: Applied direct Codex SDK workaround to get it building.
→ Action: Updated codex-provider.ts with directory creation fix.

---

### Prompt 22: Stop For Tonight (12:13 AM - Apr 1)

> Good work, we can stop now, let's stop pm2 for tonight if we're not running anything else

→ Response: All 4 vendor variants completed. Finance dashboard comparison live on GitHub Pages.
→ Action: pm2 stop. ✅

---

### Prompt 23: Inner Git Repos (12:49 AM - Apr 1)

> OK apparently we've been creating sub innergits? can we look a look? most workers we should be working in mono repos by default, and only when specified do we init git, otherwise we're inside a mono repo.

→ Response: Workers were running `git init` inside ai-sandbox subdirectories, creating nested repos.
→ Action: Updated worker base prompt to clarify monorepo context, added git init instructions. ✅

---

**Session 1-2 Summary**: Built vendor abstraction layer with 3 backends (Claude, Codex, Kimi Wire/CLI), ran same finance dashboard prompt across all 4 modes, deployed comparison to GitHub Pages. Codex ranked 1st (115/130), Kimi CLI 2nd (92/130).

# Task 11 Report: Real Claude CLI adapter (feature-flagged)

**Status:** DONE  
**Date:** 2026-09-20  
**Commit:** `ed6afe1` — feat: optional Claude CLI adapter behind engine setting

---

## Summary

Added `ClaudeCliAdapter` (spawn `claude` with `shell: false`, stream-json stdout → `text_delta` best-effort). `ChatService` picks adapter from `bot.defaultEngine`, falling back to `settings.defaultEngine` (`mock` | `claude` | `codex` stub). Missing binary raises `CliEngineUnavailableError` → HTTP **503** with install/login message (UI surfaces via existing shell `error` banner).

---

## Files

| Path | Change |
|------|--------|
| `packages/runtime/src/cli/claude-adapter.ts` | Real Claude adapter + line parser |
| `packages/runtime/src/cli/claude-adapter.test.ts` | Mocked spawn unit tests |
| `packages/runtime/src/cli/codex-adapter.ts` | Codex stub |
| `packages/runtime/src/cli/errors.ts` | `CliEngineUnavailableError` + messages |
| `packages/runtime/src/cli/resolve-adapter.ts` | Engine → adapter map |
| `packages/runtime/src/services/chat-service.ts` | Per-bot engine pick + 503 rethrow |
| `packages/runtime/src/routes/topics.ts` | Map unavailable engine → 503 |
| `packages/runtime/src/index.ts` | Pass `settingsService` into ChatService |

---

## Tests

```bash
cd packages/runtime && pnpm test
```

| Result | Detail |
|--------|--------|
| 24/24 pass | Includes 5 Claude adapter tests (mocked spawn, no network) |

---

## Concerns / defer

- Windows: `shell: false` may miss `claude.cmd` shims (agent-os uses shell on Win); document if ENOENT appears despite install.
- Verbose stream-json may duplicate final `result` text if assistant blocks also streamed — best-effort accepted for Phase 1.
- No dedicated toast component; errors use existing HomePage error strip.
- Manual `@bot` with real Claude CLI not run in this session.

---

## Next

Task 12 — README + acceptance checklist.

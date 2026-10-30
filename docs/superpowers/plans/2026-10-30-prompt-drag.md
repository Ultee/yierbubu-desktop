# Prompt and Drag Implementation Plan

**Goal:** Apply the user-approved prompt draft and stop drag drift on Windows.

**Architecture:** Keep native window movement in the main process, using the OS cursor and window positions in the same DIP space. Establish the grab offset on pointerdown; move only after the existing gesture threshold. Keep prompt text in a focused module consumed by the real AI request builder.

**Spec:** `outputs/提示词补充草案.md`, plus user report of right/down drift.

**Constraints:** Chinese UI; preserve existing preferences, salary and keys; no real API calls during tests; build a separate versioned release. Keep click actions and native mouse passthrough working.

## Drag

- [x] Inspect renderer/native boundaries and record Windows 150% coordinate rounding.
- [x] Add `tests/drag.cjs`: fixed native cursor plus shifted renderer coordinates must retain position `[180,140]`; observe old behavior `[181,141]`.
- [x] Capture offset at pointerdown; read native cursor for moves; skip redundant native positioning; release/cancel always clears drag state.
- [x] Run deterministic IPC regression and physical cursor integration; update the existing CDP desktop test to substitute only the OS cursor dependency.

## Prompts

- [x] Add real HTTP payload test for full base rules, exactly one selected preset/custom persona, proactive-only brevity and income privacy. Observe old prompt fails.
- [x] Implement approved base, four presets and proactive instruction in `src/ai-prompts.ts`, consumed by `AiService.send`.
- [x] Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build`.

## Delivery

- [x] Run desktop, features, AI and bubble regressions sequentially to avoid GUI interference.
- [x] Independent reviewer checks the diff and requirements; fix material findings.
- [x] Bump 1.3.3, build independent release, run packaged drag/AI/layout/startup checks.
- [x] Update instructions and validation record, create and verify full portable ZIP, commit source.

**Delivery evidence:** 38 unit tests, typecheck/build, source desktop/features/AI/bubble/drag, packaged startup/drag/native-input/bubble/AI passed. Read-only independent review and supplemental test review found no P1/P2. ZIP CRC and all 11 runtime files verified; detailed transient AI test behavior recorded in outputs/验证记录.md.

# AI Companion Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent AI service task and review; integrate remaining UI and main-process work in this session.

**Goal:** Deliver configured AI companionship with explicit income consent and a compact salary card.
**Architecture:** Main process owns encrypted credentials, history and all requests. Renderer pages use a bounded IPC bridge. AI storage stays separate from legacy salary settings.
**Tech Stack:** Electron45, TypeScript, Node fetch, safeStorage, SVG/CSS, Playwright.
**Spec:** ../specs/2026-10-30-ai-companion.md

## Global Constraints

- User approved implementation; no additional design confirmation.
- Keep current feature branch and clean existing checkout; no move of user files or running app.
- No real credentials, wages, external paid calls or plaintext key persistence.
- Main process only network; plain text chat rendering; full legacy compatibility.

### Task 1: Configuration, storage and AI request service

Files: src/ai-config.ts, src/ai-service.ts, tests/ai.test.ts.
Contracts: AIConfig {enabled:boolean;provider:'openai'|'deepseek'|'qwen'|'custom';baseUrl:string;model:string;nickname:string;personaMode:'preset'|'custom';persona:'gentle'|'cute'|'snarky'|'worker';customPrompt:string;proactive:'off'|'schedule'|'occasional';memory:boolean;shareIncome:boolean}. ChatMessage {role:'user'|'assistant';content:string}. AIPublicState {config:AIConfig;hasKey:boolean;warning:string}. AIResult {ok:boolean;text?:string;error?:string}.
AiService constructor(dir:string, cipher:{available():boolean;encrypt(text:string):Buffer;decrypt(buffer:Buffer):string}); getState():AIPublicState; getHistory():ChatMessage[]; save(input:unknown,key?:string,removeKey?:boolean):void; test(input:unknown,key?:string):Promise<AIResult>; send(text:string,context:{config:Config|null;snapshot:Snapshot},kind?:'chat'|'proactive'):Promise<AIResult>; clearHistory():void; cancel():void. Export normalizeAIConfig(input:unknown):AIConfig and provider defaults from ai-config. No Electron import in this service. Main must never expose stored key.

- [ ] Write tests for config defaults/personas, validation, payload consent, encrypted disk/legacy empty, history limits/disable/revoke/clear, local real HTTP protocol, errors and cancellation. Observe missing implementation fail.
- [ ] Implement these modules using spec limits. Failed calls do not append history. Reject endpoint change with retained key unless explicitly reentered. Public state never returns key/ciphertext. Never echo response bodies in errors.
- [ ] Run node --experimental-strip-types --test tests/ai.test.ts. Report interfaces, tests and concerns. Only edit owned files; no shared commits while parent integrates.

### Task 2: Main process and UI

Files: src/main.ts, bridge.ts, preload.ts, settings.ts/html/css, chat.ts/html/css, pet.ts/html/css, pet-behavior.ts, scripts/build.mjs; tests/ai-desktop.cjs and layout expectations.

- [ ] Add Electron integration test showing missing AI settings/chat and compact card. Use local HTTP server with fake credential and isolated app profile. Failure must be missing UI/bridge.
- [ ] Wire service after ready using safeStorage; sender-validate all IPC. Public state config only. Separate saveAI/testAI/getAI/getChat/sendChat/clearChat/openChat. Single outstanding request, cancellation on settings change, consent revocation, clear or quit. Notify updated chat state to windows.
- [ ] Add settings form independently saved; service/model/key fields; presets/custom prompt; proactive/memory/income controls; test result; clear history. Preserve unsaved existing wage fields.
- [ ] Add chat page with safe text nodes, loading state, one outstanding send, error feedback, nickname/persona badge and clear. Add card/context/tray entry.
- [ ] Add proactive scheduler with pure injectable clock policy tests, no startup burst, no overlapping requests or failures retried; bubble expires in12s, clicked opens chat. Alloff/disable prevents calls.
- [ ] Compact card248px/amount28px; unchanged across pet sizes. Update meaningful layout tests to smaller reserved height. Build, UI integration, inspect screenshots and existing regression.

### Task 3: Review and release

- [ ] Independent code review against0c26c0b; fix important findings and verify.
- [ ] Bump1.3.0, npm test/typecheck/build/test:desktop/test:features/test:ai. Package ../release-yier-v1.3; isolated packaged start/save/restart check.
- [ ] Update instructions, screenshots and validation record, create CRC-verified full ZIP with no settings/keys/history. Commit source locally and deliver Chinese links.

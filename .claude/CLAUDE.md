# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend (Angular, port 4200)
npm start              # nx serve
npm run build          # production build via nx
npm test               # nx test (Vitest)

# Backend (Express, port 3000)
npm run server         # tsx watch src/server/server.ts — dev with hot reload
npm run server:build   # tsc -p tsconfig.server.json — compile to dist/server/
npm run server:prod    # node dist/server/server.js — run compiled server
```

Both processes must run simultaneously for local development.

## Architecture

Two-process application: Angular frontend + Express backend.

```
Browser (Angular, port 4200)
  └─ HTTP → Express (port 3000)
       ├─ /api/chat              → Nova 2 Lite (text interview)
       ├─ /api/agent-chat        → Bedrock Agents (adaptive interview orchestration)
       ├─ /api/parse-cv          → mammoth/pdf-parse → text extraction
       ├─ /api/extract-name      → Nova 2 Lite → name from CV
       ├─ /api/generate-document → Nova 2 Lite → identity protocol + bio + CV
       ├─ /api/publish-profile   → S3/CloudFront → hosted HTML profile
       └─ /api/transcribe        → AWS Transcribe Streaming → STT fallback
  └─ WebSocket (Socket.IO)
       └─ sonic:start/audio/text/stop → Nova 2 Sonic → voice interview
```

The Express server is Lambda-ready — no code changes needed to deploy.

### Frontend structure

- `src/app/app.routes.ts` — two routes: `''` → `WelcomeComponent`, `'interview'` → `InterviewComponent`
- `src/app/welcome/` — entry landing page
- `src/app/interview/` — orchestrator component + 4 child state components:
  - `onboarding/` — mode selection (sonic / voice-text / text), CV upload
  - `interview-state/` — active conversation UI
  - `processing/` — animated waiting state while Nova 2 Lite structures protocol
  - `reveal/` — displays identity protocol; copy/download actions
- `src/app/services/sonic.service.ts` — Socket.IO client + AudioWorklet mic bridge for Nova 2 Sonic
- `src/app/interview/interview.types.ts` — shared types: `AppState`, `InterviewMode`, `IdentityDocument`, `Message`, `ProtocolSignals`

The interview flow is state-machine-based (not routing): `InterviewComponent` holds a `currentState = signal<AppState>()` and renders one child at a time.

### Backend structure

- `src/server/server.ts` — entry point: mounts routes, Socket.IO handlers
- `src/server/routes/` — one file per API route group
- `src/server/socket/sonic-handlers.ts` — Socket.IO event handlers for voice sessions
- `src/server/socket/sonic-session.ts` — per-connection Nova 2 Sonic session lifecycle
- `src/server/lib/` — shared utilities (AWS client config, model IDs, slug generation)
- `src/server/prompts/` — all LLM prompt strings (system, document structuring, agent, profile HTML)
- `public/audio-processor.js` — Web Audio API AudioWorklet (runs in browser audio thread)

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Prefer inline templates for small components
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injection

## Speech API Types

TypeScript 5.9 DOM lib does not include `SpeechRecognition`, `SpeechRecognitionEvent`, or `SpeechRecognitionErrorEvent`. Use local interface definitions and cast `window` as `unknown` before accessing these APIs.

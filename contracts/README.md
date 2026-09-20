# Argos wire protocol

`protocol.ts` is the single source of truth for messages exchanged by Argos F,
Argos Home and Argos Cloud. It contains both TypeScript DTOs and runtime schemas;
consumers must import these definitions instead of maintaining handwritten copies.

## Versioning rule

`protocolVersion` identifies wire compatibility. Adding an optional field is
compatible. Removing or renaming a field, making an optional field required,
changing a field's meaning/type, or removing an accepted enum value is breaking
and requires incrementing `PROTOCOL_VERSION`. Receivers reject unsupported
versions with `INCOMPATIBLE_PROTOCOL_VERSION`; they must never silently coerce
them.

`commandId` is the idempotency key and must remain stable across retries.
`correlationId` follows the end-to-end operation and may connect multiple
commands. All timestamps use ISO 8601 UTC strings.

Run the dependency-free round-trip and incompatible-version check with Node 22+:

```sh
node --experimental-strip-types contracts/protocol.selftest.mjs
```

## Action permissions

`actionPermissions.v1.ts` classifies capabilities by risk and evaluates local
presence, explicit per-action confirmation, recent reauthentication and remote
access. Personality is intentionally absent from this contract. Unknown
capabilities default to high risk. Run:

```sh
node --experimental-strip-types contracts/actionPermissions.selftest.mjs
```

## Context and precedence

`context.v1.ts` defines the portable context snapshot and the deterministic
resolution order used by clients and services:

`explicit command > conversation > trusted local context > confirmed preference > inference`

Conflicting candidates at the winning level, missing evidence, and confidence
below the configured threshold return a short clarification request. Run its
dependency-free contract check with Node 22+:

```sh
node --experimental-strip-types contracts/context.selftest.mjs
```

## Voice session (real-time conversational voice, epic #232)

`voiceSession.v1.ts` defines the interfaces phases #235–#242 implement:
`VoiceSession`, `AudioInput`, `WakeWordDetector`, `SpeechRecognizer`,
`TextToSpeech`, `ConversationEngine`, `CommandRouter`, `ToolExecutor`. It
reuses `CommandRoute` from `protocol.ts` instead of redefining local/cloud
routing — see `docs/ai/voz-realtime-auditoria.md` (issue #233) for why.

This file is contracts only — no runtime behavior beyond the local rollout
flag (`isVoiceSessionV2Enabled`/`setVoiceSessionV2Enabled`, default `false`)
and two type guards for the LLM ⇄ executor boundary (`isToolCall`,
`isToolResult`). Every later phase must be gated behind that flag: with it
off, the app behaves exactly as it does today. Run:

```sh
node --experimental-strip-types contracts/voiceSession.selftest.mjs
```

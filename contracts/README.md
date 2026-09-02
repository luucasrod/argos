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

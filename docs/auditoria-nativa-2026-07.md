# Auditoria do Argos nativo — julho/2026

Gerado do journal do workflow `wf_da3e2abd-121`. A auditoria foi interrompida pelo limite de gastos: **15 de 43 agentes concluiram**, entao a coluna de verificacao esta incompleta. Achados abaixo sao dos agentes de investigacao.

---

## Dimensao: Black screen when toggling a light (native APK)

### 1. PRIMARY: useDeviceStore's zustand persist uses web-only localStorage with an `{} as Storage` fallback — on native EVERY set() throws a synchronous TypeError, which RN reports as a FATAL and the bridgeless host tears down the surface, leaving the dark window background

- **Arquivo:** stores/useDeviceStore.ts:641
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

A:\Argos\argos\stores\useDeviceStore.ts:641-643 configures persist with `storage: createJSONStorage(() => typeof localStorage !== 'undefined' ? localStorage : ({} as Storage))`. On Android there is no `localStorage` global (verified: no polyfill anywhere in the repo — the only other localStorage use, A:\Argos\argos\hooks\useArgos.ts:363, correctly guards with `Platform.OS === 'web' &&`). So the adapter is a bare `{}` with no getItem/setItem/removeItem. zustand 5.0.13's createJSONStorage (A:\Argos\argos\node_modules\zustand\middleware.js:280-306) only try/catches the `getStorage()` CALL itself — returning `{}` succeeds, so it hands back a live persistStorage whose setItem does `storage.setItem(name, JSON.stringify(...))` (middleware.js:302) against `{}`. Critically, because a truthy storage IS returned, zustand's graceful '[zustand persist middleware] the given storage is currently unavailable' degradation (middleware.js:348-358) never engages. Then middleware.js:372-379 wraps the `set` handed to the store factory as `(...args) => { set(...args); return setItem(); }` with NO try/catch, and setItem() (middleware.js:360-366) calls `storage.setItem(...)`. Net result: on native, every single mutation in useDeviceStore updates the state and then throws `TypeError: storage.setItem is not a function`.

**Evidencia**

Crash path for the reported symptom: A:\Argos\argos\app\(tabs)\casa.tsx:177 `onValueChange={() => { light(); if (isOnline) toggleDevice(device.id); }}` (and the alternate card at A:\Argos\argos\app\(tabs)\devices.tsx:309 `onToggle={() => { light(); toggleDevice(device.id); }}`) -> A:\Argos\argos\stores\useDeviceStore.ts:110 `set((state) => ({ devices: ... }))` throws -> nothing in toggleDevice (useDeviceStore.ts:108-162) or in the Switch handler catches it -> RN's callback guard reports it as fatal (A:\Argos\argos\node_modules\react-native\Libraries\BatchedBridge\MessageQueue.js:371 `ErrorUtils.reportFatalError(error)`; A:\Argos\argos\node_modules\react-native\Libraries\Core\ExceptionsManager.js:151-177 routes it to `global.RN$handleException(e, /*isFatal*/ true, ...)`, and in release ExceptionsManager.js:122-133 goes straight to NativeExceptionsManager.reportException with isFatal). Under Expo SDK 54 / RN 0.81.5, New Architecture (bridgeless) is mandatory and the fatal handler destroys the React instance and detaches the surface rather than killing the process — the Activity survives showing only its window background, which app.json sets to `#050810`. That is exactly 'app not closed, but everything dark'. The ErrorBoundary at A:\Argos\argos\app\_layout.tsx:17-42 is structurally incapable of catching this: React boundaries only catch render/lifecycle throws, never event-handler throws. TWO CONFIRMING CONSEQUENCES OF THE SAME LINE: (1) The throw at useDeviceStore.ts:110 happens BEFORE line 121 `controlTuyaDevice(device.tuyaDeviceId, 'isOn', !device.isOn)` — and likewise line 166 throws before line 184's controlTuyaDevice — so the Tuya HTTP request is never even sent; the lamp physically never changes. (2) It is also the root cause of the reported 'Executando... forever': A:\Argos\argos\hooks\useArgos.ts:146-163 does `updateExecutionStep(i,'running')` then `toggleDevice(action.deviceId)` at :153; the throw aborts the loop inside the async processIntent, so `updateExecutionStep(i,'success')` (:162) and the cleanup `setShowExecutionOverlay(false)` / `setStatus('idle')` (:183-187) never run. There the throw lands in a promise (unhandled rejection, not fatal), which is why the voice path HANGS while the direct tap path BLANKS. PROOF THIS IS A COPY/PASTE SLIP: all four sibling stores use the correct native adapter — useSettingsStore.ts:74, useAIStore.ts:86, useMemoryStore.ts:211, useAutomationStore.ts:49 all use `createJSONStorage(() => AsyncStorage)`. useDeviceStore is the only outlier. USER-VERIFIABLE PREDICTION: long-press-rename a device, or use 'Mover cômodo' (casa.tsx:222 / :236 call `updateDevice`, which also hits an unguarded set at useDeviceStore.ts:104) — the screen must go black there too, with no Tuya involvement at all. Also note the app starts fine because hydrate()'s getItem throw IS swallowed by zustand's toThenable (middleware.js:307-331, .catch at :435), so the crash only fires on the FIRST mutation.

**Correcao proposta**

OTA-SAFE, JS-ONLY. `@react-native-async-storage/async-storage@2.2.0` is already in node_modules and already imported by four other stores, so the native module is linked in the current APK — no rebuild needed. In A:\Argos\argos\stores\useDeviceStore.ts add `import AsyncStorage from '@react-native-async-storage/async-storage';` and replace lines 641-643 with a never-throwing async adapter:

const safeStorage = {
  getItem: async (k: string) => { try { return await AsyncStorage.getItem(k); } catch { return null; } },
  setItem: async (k: string, v: string) => { try { await AsyncStorage.setItem(k, v); } catch {} },
  removeItem: async (k: string) => { try { await AsyncStorage.removeItem(k); } catch {} },
};
// ...
storage: createJSONStorage(() => safeStorage),

Why this is safe for the PWA too: AsyncStorage's web build writes `window.localStorage` with the raw, UNPREFIXED key (A:\Argos\argos\node_modules\@react-native-async-storage\async-storage\lib\module\AsyncStorage.js:59-71), so the existing `argos-connections` entry is read and written byte-identically — zero migration. Making the adapter async also means any future storage failure becomes an awaited/void'd rejected promise instead of a synchronous fatal. Verified there is no Date-rehydration hazard: `lastSeen` (types/device.types.ts:35) is written at constants/devices.ts:13,30 and never read anywhere, so it turning into a string after JSON round-trip breaks nothing.

### 2. There is no defense against event-handler/async throws: the sole ErrorBoundary only catches render errors, and expo-router adds no per-route boundary — so any uncaught handler throw will keep blanking the app

- **Arquivo:** app/_layout.tsx:17
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

A:\Argos\argos\app\_layout.tsx:17-42 defines a class ErrorBoundary and wraps the tree at :219-244. That covers render and lifecycle throws only. React (19.1.0 here) never routes errors thrown from an onPress/onValueChange callback or from an unawaited async function to an error boundary. expo-router adds nothing: A:\Argos\argos\node_modules\expo-router\build\useScreens.js:128-142 only wraps a route in `<Try catch={ErrorBoundary}>` when the route MODULE EXPORTS a symbol named `ErrorBoundary`, and no route file in this app does (grep for getDerivedStateFromError/componentDidCatch across the repo hits only app/_layout.tsx). So today a single unguarded throw in any handler = permanent black screen with no message, no recovery path, and nothing logged that the user can see.

**Evidencia**

app/_layout.tsx:17 `class ErrorBoundary extends React.Component` used inline at :219 — never exported, so expo-router's Try wrapper (useScreens.js:133-142) is never applied. The store mutations that currently throw on native are all called straight from handlers with no try/catch: useDeviceStore.ts:110 (toggleDevice, from casa.tsx:177 / devices.tsx:309), :166 (updateDeviceState, from casa.tsx:195 / devices.tsx:311-313), :104 (updateDevice, from casa.tsx:222/236/438), :88 (renameDevice, casa.tsx:145), :95 (setDeviceOrder, devices.tsx:283). Same shape in services/automation/automationEngine.ts:17-23.

**Correcao proposta**

Two JS-only additions, both OTA-shippable. (1) Install a global JS error handler in A:\Argos\argos\app\_layout.tsx so a fatal never silently blanks the app — at module scope, native only:

if (Platform.OS !== 'web') {
  const prev = (global as any).ErrorUtils?.getGlobalHandler?.();
  (global as any).ErrorUtils?.setGlobalHandler?.((e: any, isFatal?: boolean) => {
    console.error('[Argos fatal]', isFatal, e?.message, e?.stack);
    if (!isFatal) prev?.(e, isFatal);   // swallow fatals so the host does not tear down the surface
  });
}

This alone converts the black screen into a logged, survivable error and is a good permanent safety net for an OTA-only app. (2) Defensively wrap the two hot store actions so a storage/mapping failure can never abort the control flow: in useDeviceStore.ts:108-162 and :164-271, put the `set(...)` call in its own try/catch (`try { set(...) } catch (e) { if (__DEV__) console.error(e); }`) so the subsequent controlTuyaDevice/controlXiaomiDevice dispatch always runs. Also wrap the body of the hooks/useArgos.ts:146-163 action loop in try/finally so `setShowExecutionOverlay(false)` / `setStatus('idle')` always fire.

### 3. Unguarded device.capabilities / device.state reads in both device cards — latent render crash that becomes REACHABLE on native the moment the persist fix lands and the devices array starts actually rehydrating

- **Arquivo:** app/(tabs)/devices.tsx:72
- **Confianca:** medium | **Exige rebuild nativo:** nao

**Causa raiz**

A:\Argos\argos\app\(tabs)\devices.tsx:72-82 reads `device.capabilities.some(...)` (x2), `device.capabilities.find(...)` (x3) and `device.state.brightness / .speed / .swing / .angle / .mode` unconditionally at the top of the component body — not gated behind `expanded`, so it runs on every render of every card. A:\Argos\argos\app\(tabs)\casa.tsx:189 reads `device.capabilities.length > 0` (the recently added null-guard at casa.tsx:194 `device.state?.[cap.property]` protects `state` but its sibling `capabilities` on line 189 is still bare). Today on native this cannot fire because hydration always fails (so devices === MOCK_DEVICES, which always set both fields — constants/devices.ts) and every sync mapper always emits both (useDeviceStore.ts:289-290, 319-336, 372-389, 420-437, 468-489, 531-543, 604-615). But once storage works, the FULL devices array is persisted (partialize at useDeviceStore.ts:645) and rehydrated by a shallow `merge`, so any schema change, interrupted write, or older payload yields a device without `capabilities` -> TypeError during render -> the ErrorBoundary shows 'Argos — erro ao carregar' and the Casa/Dispositivos tab is permanently unusable until storage is cleared. On the PWA this is already reachable from stale localStorage.

**Evidencia**

devices.tsx:72 `const hasColor = device.capabilities.some((c) => c.property === 'color');` and devices.tsx:74 `const brightness = stateNumber(device.state.brightness, 100);` (note devices.tsx:74/79/80/81/82 all use `device.state.` with no `?.`, unlike the guarded casa.tsx:194). casa.tsx:189 `{isOnline && device.capabilities.length > 0`. Persist round-trip: useDeviceStore.ts:645 `partialize: (state) => ({ devices: state.devices, ... })` and zustand's default shallow merge (node_modules/zustand/middleware.js:337-340) — nothing validates the rehydrated Device shape.

**Correcao proposta**

JS-only. (a) Normalize on rehydrate, which fixes every consumer at once — add to the persist options in useDeviceStore.ts alongside `partialize`:

merge: (persisted: any, current: any) => ({
  ...current,
  ...(persisted ?? {}),
  devices: Array.isArray(persisted?.devices)
    ? persisted.devices.filter((d: any) => d && typeof d.id === 'string').map((d: any) => ({
        ...d,
        capabilities: Array.isArray(d.capabilities) ? d.capabilities : [],
        state: d.state && typeof d.state === 'object' ? d.state : {},
        status: d.status ?? 'offline',
      }))
    : current.devices,
}),

(b) Belt-and-braces at the two call sites: casa.tsx:189 -> `(device.capabilities?.length ?? 0) > 0`; devices.tsx:72-82 -> hoist `const caps = device.capabilities ?? []; const st = device.state ?? {};` and use `caps.some/find` and `st.brightness` etc. Note CapabilityControl itself (casa.tsx:34-122) is already safe — the range branch coerces via `typeof value === 'number'` (:60) with `cap.min ?? 0` / `cap.max ?? 100` fallbacks (:61-62), select is guarded by `cap.options &&` (:84), and color uses a hardcoded palette (:104); the only latent divide-by-zero there is `pct` at casa.tsx:64 when min === max, which yields NaN and a `width: 'NaN%'` — cosmetic, not a crash.

### 4. RULED OUT: UpdateBanner / Updates.reloadAsync and Reanimated worklets are NOT causing the black screen

- **Arquivo:** app/_layout.tsx:159
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

Both hypotheses (c) an unexpected expo-updates reload and (d) a Reanimated worklet crash are eliminated by reading the code. UpdateBanner's effect only downloads; expo-updates never auto-reloads. Casa has no Reanimated at all, and the devices screen only uses a declarative entering animation.

**Evidencia**

A:\Argos\argos\app\_layout.tsx:159-191: the effect at :162-166 calls only `Updates.fetchUpdateAsync().catch(() => {})` — downloading an update never swaps the running bundle. `Updates.reloadAsync()` appears exactly once, at :168-170, inside the `restart` callback bound to the 'Reiniciar' TouchableOpacity at :182, i.e. only on an explicit user press. And the banner only renders at all when `isDownloading || isUpdatePending` (:172), so it is invisible during a normal toggle. Reanimated: `grep reanimated|useSharedValue|useAnimatedStyle|runOnJS` over app/(tabs)/casa.tsx returns nothing; app/(tabs)/devices.tsx:4 is the only hit — `import Animated, { FadeInDown } from 'react-native-reanimated'`, a declarative entering animation with no user worklet that could throw on toggle. Hypothesis (a) 'a React render throw that unmounts the tree' is also wrong as stated: a render throw WOULD be caught by app/_layout.tsx:17-42 and would show the 'Argos — erro ao carregar' text on Colors.bg.primary, not a featureless black screen. Hypothesis (b) is the closest — but the teardown is triggered by JS (see finding 1), not by a native module fault.

**Correcao proposta**

No change needed for these. Do NOT spend an OTA cycle on the UpdateBanner or on Reanimated for this bug. One optional hardening while you are in app/_layout.tsx: `Updates.fetchUpdateAsync()` at :164 is not gated on `Updates.isEnabled`, so it runs (and rejects harmlessly) in dev clients — wrap it in `if (Updates.isEnabled)` to keep the logs clean. Unrelated to the black screen.

---

## Dimensao: Tuya "Executando..." forever hang — end-to-end trace of voice/text device control on native

### 5. ROOT CAUSE: useDeviceStore persists to a bogus `{}` storage on native — every toggleDevice/updateDeviceState throws TypeError, aborting the execution loop before the Tuya command is ever sent

- **Arquivo:** stores/useDeviceStore.ts:641
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

stores/useDeviceStore.ts:641-643 configures zustand persist with `createJSONStorage(() => typeof localStorage !== 'undefined' ? localStorage : ({} as Storage))`. React Native has no `localStorage` global (verified: no polyfill anywhere in app/, services/, utils/, components/, babel/metro config, nor in node_modules/react-native, expo, expo-modules-core, @supabase, react-native-mmkv), so on the APK the storage object is literally `{}`. In zustand 5.0.13 (node_modules/zustand/middleware.js:280-303 + 360-380) persist wraps the store's `set` as `(...args) => { set(...args); return setItem(); }`, and `setItem()` calls `storage.setItem(...)` on that `{}` → synchronous `TypeError: storage.setItem is not a function` thrown OUT OF the store action, AFTER the in-memory state was already applied. Every single mutation of this store throws on native (toggleDevice:110, updateDeviceState:166, renameDevice, setDeviceOrder, all sync* setters). The other four stores (useAIStore:86, useSettingsStore:74, useMemoryStore:211, useAutomationStore:49) correctly use AsyncStorage — only this one was left on localStorage, which is why the PWA works and the APK does not.

**Evidencia**

Empirical repro with the project's own zustand build (node -e against A:/Argos/argos/node_modules/zustand): `createJSONStorage(() => ({}))` + a toggleDevice-shaped action prints `THREW: TypeError - storage.setItem is not a function` and `in-memory devices after throw: [{"id":"tuya:1","isOn":true}]` — the line after `set(...)` is never reached. Two direct consequences, both matching the report exactly: (1) A:/Argos/argos/stores/useDeviceStore.ts:166 `set(...)` throws BEFORE line 184 `controlTuyaDevice(device.tuyaDeviceId, stateKey, value, currentColor)` — the HTTP request to /api/tuya?action=control is NEVER issued, so the lamp never changes (same for toggleDevice: line 110 throws before line 121). (2) A:/Argos/argos/hooks/useArgos.ts:157 `updateDeviceState(action.deviceId, 'isOn', false)` throws inside the for-loop, so lines 162 (`updateExecutionStep(i,'success')`), 165, 167 and 183-187 (`setShowExecutionOverlay(false); clearExecutionSteps(); setStatus('idle')`) never execute → status is frozen at 'executing' → OrbCore.tsx:137 and chat.tsx:61 render "Executando..." forever and the overlay (index.tsx:153 / ExecutionOverlay.tsx:17) stays pinned with the step at ⚡ running. It also explains the reported black screen: the same uncaught TypeError is thrown straight out of the Switch handlers at app/(tabs)/casa.tsx:177 and app/(tabs)/devices.tsx:309, which in a release build is a fatal JS error → RN root unmounts to black. AsyncStorage 2.2.0 is already a linked dependency (package.json) and its web build exists (node_modules/@react-native-async-storage/async-storage/lib/module/AsyncStorage.js), so the fix needs no native module.

**Correcao proposta**

In stores/useDeviceStore.ts:641-643 replace the storage factory with AsyncStorage (already imported/linked, used by 4 other stores): `import AsyncStorage from '@react-native-async-storage/async-storage';` then `storage: createJSONStorage(() => Platform.OS === 'web' && typeof localStorage !== 'undefined' ? localStorage : AsyncStorage)`. createJSONStorage already supports Promise-returning getItem (middleware.js:296-300 `if (str instanceof Promise) return str.then(parse)`), so async storage is safe here. Keeping the localStorage branch for web avoids the one-time cache-key move on the PWA; using AsyncStorage unconditionally also works (its web impl is localStorage-backed) at the cost of one re-sync on web. Pure JS — OTA-deployable.

### 6. processIntent's device_control branch has a single happy-path exit: any throw strands status='executing' and the overlay permanently (fast-intent path and confirmPendingAction have no catch at all)

- **Arquivo:** hooks/useArgos.ts:146
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

hooks/useArgos.ts:137-187: `setStatus('executing')` + `setShowExecutionOverlay(true)` are entered unconditionally, but the ONLY code that clears them is the `setTimeout(..., 900)` at 183-187, reachable solely if the whole action loop completes without throwing. There is no try/catch/finally around the loop, and no other call site in the codebase ever calls setShowExecutionOverlay(false)/clearExecutionSteps() (verified by grep: only useArgos.ts:184-185). Worse, the two paths that invoke processIntent for a device command swallow nothing: the fast-intent path at 474-497 is `try { ... await processIntent(fastIntent) } finally { processingRef.current = false }` — a try/FINALLY with no catch — and confirmPendingAction at 422-427 awaits processIntent bare. Every sendMessage call site is fire-and-forget with no .catch (app/(tabs)/index.tsx:106,113; chat.tsx:31,40; conversar.tsx:28,38; casa.tsx:334; agenda.tsx:61), so the rejection becomes a silently-dropped unhandled promise rejection in release. The AI path (594) is inside try/catch, so it degrades differently: status flips to 'error'→'idle' after 2500ms and a bogus error bubble appears in chat, but the execution overlay still stays on screen forever.

**Evidencia**

A:/Argos/argos/hooks/useArgos.ts:146-163 (loop with unguarded toggleDevice/updateDeviceState calls), :183-187 (sole reset path, inside the happy path), :474-497 (try/finally with no catch on the fast device-command path), :422-427 (confirmPendingAction with no error handling). Grep for setShowExecutionOverlay/clearExecutionSteps across app/, components/, hooks/, services/ returns only useArgos.ts:99-100,144,184-185,413-414 — there is no unmount cleanup, no error cleanup, no dismiss control on the overlay component (components/execution/ExecutionOverlay.tsx has no close affordance).

**Correcao proposta**

Wrap the device_control body in try/catch/finally: mark the current step 'error' in the catch (`updateExecutionStep(i, 'error')`), and in the `finally` always run `setShowExecutionOverlay(false); clearExecutionSteps(); setStatus('idle');` (keep the 900ms delay only for the success case). Change the loop body to per-action try/catch so one failing device does not abort the remaining actions. Add `.catch()` in the fast-intent path (useArgos.ts:474-497) and in confirmPendingAction (422-427) that speaks/renders a real failure message. Also add a mount-scoped `useEffect(() => () => { clearExecutionSteps(); setShowExecutionOverlay(false); }, [])` safety net. JS-only.

### 7. The `status === 'executing'` re-entrancy guard turns a transient stall into a permanent lock with no watchdog; processingRef can also latch forever

- **Arquivo:** hooks/useArgos.ts:452
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

hooks/useArgos.ts:452-453 `const currentStatus = useAIStore.getState().status; if (currentStatus === 'executing') return;` — once status is stuck at 'executing' (finding 1/2), every subsequent voice or text command is dropped silently with no user feedback; only killing the app recovers. Additionally `processingRef.current = true` at 455 is reset only in the `finally` blocks (496, 629), so any await that never settles (see findings 5 and 6) latches the flag true forever and blocks sendMessage at 450 even if status later recovers. And because status is persisted-adjacent state in a store whose 'executing' value has no timestamp, nothing can detect staleness.

**Evidencia**

A:/Argos/argos/hooks/useArgos.ts:450 (`if (processingRef.current) return;`), :452-453 (executing guard), :455 (flag set), :496 and :628-630 (only resets). stores/useAIStore.ts:52 setStatus is a plain setter with no timeout/watchdog and no lastStatusChange timestamp.

**Correcao proposta**

Add a watchdog: store `statusSince: number` in useAIStore whenever setStatus is called, and in sendMessage treat 'executing'/'thinking' older than ~20s as stale (force `setStatus('idle')`, `clearExecutionSteps()`, `setShowExecutionOverlay(false)` and continue instead of returning). Equivalently, set a `setTimeout` when entering 'executing' that force-resets to idle if the flow has not finished (clear it on success). Also guard processingRef with the same timestamp so a latched flag self-heals. JS-only.

### 8. Execution steps are marked 'success' on a 150ms timer without awaiting the Tuya call — the overlay reports success for commands that failed, and real Tuya errors are only console.error'd

- **Arquivo:** hooks/useArgos.ts:150
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

hooks/useArgos.ts:150-162: `await new Promise(r => setTimeout(r, 150))` then the store setter is called synchronously and `updateExecutionStep(i, 'success')` fires immediately. The store setters are fire-and-forget by design: useDeviceStore.ts:121-126 and :184-188 call `controlTuyaDevice(...).catch(err => { if (__DEV__) console.error(...) }).finally(() => delay(1200).then(() => get().syncTuyaDevices()))` and return void. Nothing propagates the HTTP result back to the UI, so a 401 unauthorized or a 502 tuya_error from api/tuya.ts:130-191 is invisible in production (`__DEV__` is false in the release APK — the console.error does not even run). Consequence: even after fixing findings 1-2, the user will see "Executando... ✅" while the lamp does not move, with zero diagnostics.

**Evidencia**

A:/Argos/argos/hooks/useArgos.ts:150-162; A:/Argos/argos/stores/useDeviceStore.ts:121-126 (toggle) and :184-188 (updateDeviceState) — void-returning, `.catch` gated behind `if (__DEV__)`; services/devices/tuyaService.ts:94-97 throws `Falha ao controlar dispositivo` on non-ok, which is exactly the error being swallowed; api/tuya.ts:52 returns 401 when the Authorization header is missing/invalid and :188-191 returns 502 with the Tuya message.

**Correcao proposta**

Make the device-store control paths awaitable: change `toggleDevice`/`updateDeviceState` to `async` returning `Promise<{ ok: boolean; error?: string }>` (or add `controlDeviceAsync`), keeping the optimistic in-memory set, then in useArgos.ts:152-162 `const res = await withTimeout(updateDeviceState(...), 8000, 'timeout')` and call `updateExecutionStep(i, res.ok ? 'success' : 'error')`, appending the failure reason to the assistant message and speech. Also replace the `if (__DEV__) console.error` with an always-on error captured into the step/message so failures are diagnosable in the APK. JS-only.

### 9. No fetch has a timeout/AbortController anywhere in the Tuya path, and React Native Android's OkHttp defaults to NO timeout — an awaited pre-flight sync can hang the flow forever

- **Arquivo:** services/devices/tuyaService.ts:89
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

services/devices/tuyaService.ts issues six fetches (lines 29, 41, 52, 62, 74, 89) with no `signal`/AbortController and no timeout, and each first awaits `authHeaders()` → `getAccessToken()` (services/auth/session.ts:5-15) which itself performs up to three un-timed Supabase network round-trips (getSession/getUser/refreshSession). React Native's Android networking sets connect/read/write timeouts to 0 = infinite (node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/network/OkHttpClientProvider.kt:52-54), unlike the browser, which is why the same code cannot hang on the PWA. hooks/useArgos.ts:527-532 awaits `syncEwelinkDevices()` and `syncTuyaDevices()` in the 'thinking' phase WITHOUT the withTimeout helper that the Anthropic call uses at :546-555 — a stalled socket there freezes status at 'thinking' and leaves processingRef latched true forever (the finally at 628 never runs), permanently deadening the app.

**Evidencia**

A:/Argos/argos/services/devices/tuyaService.ts:74 (`fetch(BASE?action=devices, { headers: await authHeaders() })`) and :89-93 (control POST) — no AbortController; A:/Argos/argos/services/auth/session.ts:5-15; A:/Argos/argos/hooks/useArgos.ts:527-532 (un-timed awaits) vs :25-32 + :546-555 (the withTimeout helper that exists and is used only for the AI call); node_modules/react-native/ReactAndroid/.../OkHttpClientProvider.kt:52-54 `connectTimeout(0)/readTimeout(0)/writeTimeout(0)`. Note the fire-and-forget control call can also hang forever, which is what defers the `.finally(() => delay(1200).then(syncTuyaDevices))` state re-read indefinitely (useDeviceStore.ts:125/188).

**Correcao proposta**

Add a shared helper in services/devices/tuyaService.ts: `async function fetchWithTimeout(url, init, ms = 10000) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); try { return await fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); } }` and use it for all six calls (AbortController is supported by RN's fetch polyfill). Wrap getAccessToken with the same guard. In hooks/useArgos.ts:527-532 wrap both syncs in `withTimeout(..., 4000).catch(() => {})` so a slow integration can never block the message flow. JS-only.

### 10. Native textToSpeech returns a promise that can never resolve (no onStopped, no timeout) — for the automation branch this strands status at 'executing', and it latches processingRef in every branch

- **Arquivo:** services/voice/textToSpeech.ts:26
- **Confianca:** medium | **Exige rebuild nativo:** nao

**Causa raiz**

services/voice/textToSpeech.ts:26-38 resolves only from `onDone` or `onError`; expo-speech 14.0.8 also exposes `onStopped` (node_modules/expo-speech/build/Speech.types.d.ts:38) which is what Android fires when an utterance is cancelled — and this function calls `Speech.stop()` immediately before `Speech.speak()`, so an in-flight utterance's promise is orphaned and a dropped/queued utterance never reports done. Nothing races a timeout. Since `speak()` is awaited (hooks/useArgos.ts:124, called at 135/218/305/319/345/378/391), a never-resolving TTS permanently blocks the flow: for the automation intent the order is `setStatus('executing')` at :190 BEFORE `await speak(...)` at :218, so it displays "Executando..." forever; in all branches the `finally` at :496/:629 never runs, so processingRef stays true and every later command is dropped at :450. Argos is also more exposed than the PWA here because pauseVoiceInput()/waitForMicRelease() (:119-120) hand the mic/audio focus around expo-av + @react-native-voice/voice, which on Android can leave the TTS engine unable to start.

**Evidencia**

A:/Argos/argos/services/voice/textToSpeech.ts:16 (`Speech.stop()`), :26-38 (`new Promise((resolve) => { ... onDone: resolve, onError: () => resolve() })` — no onStopped, no timeout); node_modules/expo-speech/build/Speech.types.d.ts:38,42; A:/Argos/argos/hooks/useArgos.ts:112-127 (speak awaits textToSpeech), :190 vs :218 (executing set before the await), :628-630 (processingRef reset only in finally).

**Correcao proposta**

In services/voice/textToSpeech.ts add `onStopped: () => resolve()` to the SpeechOptions and race the promise against a cap: `await Promise.race([speakPromise, new Promise(r => setTimeout(r, Math.min(20000, 3000 + spoken.length * 90)))])`, clearing the timer on resolve. In hooks/useArgos.ts wrap the speak calls (`await speak(...).catch(() => {})`) and move `setStatus('executing')` in the automation branch (:190) to after the speak, matching the device branch. JS-only.

### 11. Same storage bug silently breaks Tuya hydration and sync reporting: `syncTuyaDevices` always returns count 0, devices reset to MOCK_DEVICES on every cold start, and sendMessage's `if (tuyaConnected)` guard is false on the first message

- **Arquivo:** stores/useDeviceStore.ts:342
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

Because of finding 1, `set(...)` inside syncTuyaDevices (stores/useDeviceStore.ts:342-345) throws and is caught by its own bare `catch { return { count: 0 } }` at :347-349 — the in-memory devices are applied but `return { count: mapped.length }` at :346 never runs. Symmetrically, persist's `hydrate()` fails (storage.getItem is not a function) and zustand swallows it in the thenable catch (middleware.js:392-436), so on every APK launch the store starts as MOCK_DEVICES with `tuyaConnected: false`, until the 10s interval in app/(tabs)/_layout.tsx:29-42 lands a sync. Consequences: the connect screens report 'no devices' (app/(modals)/integracoes.tsx:176-184, app/(tabs)/settings.tsx:276-287, app/integrations/tuya/callback.tsx:31 all read `result.count`), and hooks/useArgos.ts:530-532 skips the pre-flight state refresh on the first command because `tuyaConnected` is still false, so the AI reasons over stale/mock state and can target a mock deviceId that no longer exists (the loop then marks it ✅ with no device touched, since useDeviceStore.ts:165 finds no device).

**Evidencia**

A:/Argos/argos/stores/useDeviceStore.ts:305-350 (syncTuyaDevices try/catch that turns the storage TypeError into `{count: 0}`), :641-643 (broken storage), :644-657 (partialize lists devices/tuyaConnected — none of it can ever be written or read on native); node_modules/zustand/middleware.js:392-436 (hydration errors swallowed); A:/Argos/argos/hooks/useArgos.ts:530-532; A:/Argos/argos/app/integrations/tuya/callback.tsx:31.

**Correcao proposta**

Fixing the storage factory (finding 1) restores both persistence and the real count. Additionally: replace the bare `catch { return { count: 0 } }` blocks in all sync* actions with `catch (err) { if (!__DEV__) { /* surface */ } return { count: 0, error: String(err) } }` so a storage/network failure is never silently reported as 'zero devices'; and in useArgos.ts:527-532 refresh Tuya state based on `devices.some(d => d.source === 'tuya')` rather than the (unhydrated) `tuyaConnected` flag. JS-only.

---

## Dimensao: OTA-vs-native-rebuild boundary for the installed Android APK (channel "preview")

### 12. Background listening is rebuild-only: the microphone foregroundServiceType is declared on a class name that does not exist (typo), so startForeground() throws and kills the process

- **Arquivo:** plugins/withForegroundService.js:25
- **Confianca:** high | **Exige rebuild nativo:** SIM

**Causa raiz**

plugins/withForegroundService.js registers a <service> named com.asterinet.reaction.bgactions.RNBackgroundActionsTask ("reaction"). The real class shipped by react-native-background-actions 4.1.0 is com.asterinet.react.bgactions.RNBackgroundActionsTask ("react"). Because the android:name differs, the AGP manifest merger keeps TWO service entries: the plugin's entry (which carries android:foregroundServiceType="microphone" but points at a nonexistent class) and the library's own entry (the real class, with NO foregroundServiceType). services/voice/backgroundWakeWord.native.ts:139 then passes foregroundServiceType: ['microphone'] (= FOREGROUND_SERVICE_TYPE_MICROPHONE, 0x80), which the platform validates against the *manifest* type of the service actually being started (0). The type is not a subset of 0, so the framework throws IllegalArgumentException inside the service's onStartCommand. RNBackgroundActionsTask.java only catches ForegroundServiceStartNotAllowedException and rethrows everything else, so the exception is uncaught on the service's main thread and the app process dies. BackgroundActionsModule.java resolves the JS promise immediately after ContextCompat.startForegroundService(), so no JS try/catch can ever observe this.

**Evidencia**

Authoritative, plugin-evaluated manifest from `npx expo config --type introspect`: the app manifest contains exactly one <service>: {android:name: 'com.asterinet.reaction.bgactions.RNBackgroundActionsTask', android:enabled:'true', android:exported:'false', android:foregroundServiceType:'microphone'}. Library manifest A:\Argos\argos\node_modules\react-native-background-actions\android\src\main\AndroidManifest.xml declares package="com.asterinet.react.bgactions" and <service android:name=".RNBackgroundActionsTask"/> with no foregroundServiceType. Autolinking confirms the real package: `expo-modules-autolinking react-native-config --platform android` reports react-native-background-actions -> com.asterinet.react.bgactions.BackgroundActionsPackage. Source: node_modules/react-native-background-actions/android/src/main/java/com/asterinet/react/bgactions/RNBackgroundActionsTask.java calls ServiceCompat.startForeground(this, SERVICE_NOTIFICATION_ID, notification, bgOptions.getForegroundServiceType()) inside try/catch that only handles ForegroundServiceStartNotAllowedException and rethrows; BackgroundTaskOptions.java:109-135 maps the JS string 'microphone' to FOREGROUND_SERVICE_TYPE_MICROPHONE for SDK>=Q; BackgroundActionsModule.java start() calls promise.resolve(null) right after startForegroundService. ServiceCompat forwards the type to the platform on API>=29, and the subset check has existed since Android 10, so this fires on every Android 10+ device (targetSdk here is 36 — expo-modules-core/android/ExpoModulesCorePlugin.gradle:69 defaults targetSdkVersion to 36 and app.json sets no override). The JS bundle exported today (dist/_expo/static/js/android/entry-d6e102a799ba21abceed0e907ab4d2c1.hbc, written 2026-07-26 10:40) contains the strings 'ArgosWakeWord', 'microphone' and 'RNBackgroundActions', so this code path is live in what is being published.

**Correcao proposta**

NEW EAS APK REQUIRED. Rewrite plugins/withForegroundService.js to modify the EXISTING service element rather than adding a second one: match/replace android:name === 'com.asterinet.react.bgactions.RNBackgroundActionsTask' (note: react, not reaction) and set android:foregroundServiceType='microphone' plus tools:node='merge' so it merges with the library manifest entry (call AndroidConfig.Manifest.ensureToolsAvailable(manifest) to get the tools namespace). Keep android.permissions RECORD_AUDIO + FOREGROUND_SERVICE + FOREGROUND_SERVICE_MICROPHONE (already correct). Then `npx eas build --platform android --profile preview` and install the new APK. Verify before shipping with `npx expo prebuild -p android --no-install` in a throwaway copy and confirming android/app/src/main/AndroidManifest.xml has exactly one RNBackgroundActionsTask service, correctly named, with foregroundServiceType="microphone".

### 13. There is no OTA-only path to background wake-word listening — removing the foregroundServiceType does not rescue it

- **Arquivo:** services/voice/backgroundWakeWord.native.ts:139
- **Confianca:** high | **Exige rebuild nativo:** SIM

**Causa raiz**

Two independent Android platform rules make the microphone-typed foreground service mandatory, and both are enforced against the AndroidManifest baked into the APK. (a) With targetSdk 34+ (this build targets 36), calling startForeground() with no service type throws MissingForegroundServiceTypeException, so a JS-only 'just drop the type' change trades one crash for another on Android 14+. (b) Since Android 11, an app may only keep microphone access while backgrounded if a foreground service of type microphone is running; with a type-0 service the recorder keeps running but the mic delivers silence, so wake-word detection would silently never fire.

**Evidencia**

targetSdkVersion default 36 confirmed at node_modules/expo-modules-core/android/ExpoModulesCorePlugin.gradle:69 (safeExtGet('targetSdkVersion', 36)) with no override in app.json's expo-build-properties block (app.json:20-28). The FGS type reaches the platform unconditionally on API>=29 via ServiceCompat.startForeground in RNBackgroundActionsTask.java, and the manifest type for the real service is 0 (library manifest has no android:foregroundServiceType). The permission side is already correct — the introspected manifest contains android.permission.RECORD_AUDIO, android.permission.FOREGROUND_SERVICE and android.permission.FOREGROUND_SERVICE_MICROPHONE (app.json:43-48; bare names are auto-prefixed by @expo/config-plugins/build/android/Permissions.js:104-111) — so the ONLY missing piece is the per-service type attribute, which lives in the native manifest.

**Correcao proposta**

Do not spend OTA cycles on demand #1. Ship the manifest fix in a new APK (see the previous finding). Everything else the wake-word loop needs (expo-av recording, metering-based volume gating, Whisper POST) is already native-complete, so once the APK is corrected the wake-word rewrite itself is pure JS and can iterate over OTA afterwards.

### 14. expo-file-system IS compiled into the installed APK (the audit premise is wrong) — it can be made usable through a JS-only OTA

- **Arquivo:** services/voice/backgroundWakeWord.native.ts:21
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

expo-file-system 19.0.22 is a direct dependency of expo@54.0.34 itself, so npm installed it nested at node_modules/expo/node_modules/expo-file-system. Expo autolinking resolves modules through the dependency graph, not only the top level, so its Android native modules were compiled into the APK. What is missing is only Metro/Node resolvability from application code: 'expo-file-system' is not a top-level package, so `import ... from 'expo-file-system'` fails to resolve from app files. That is a package.json/bundle concern, i.e. OTA-fixable.

**Evidencia**

`node node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js resolve --platform android --json` lists expo-file-system 19.0.22 with sourceDir A:\Argos\argos\node_modules\expo\node_modules\expo-file-system\android and native modules expo.modules.filesystem.FileSystemModule + expo.modules.filesystem.legacy.FileSystemLegacyModule. node_modules/expo/package.json declares "expo-file-system": "~19.0.22". Native names match the JS contract: FileSystemModule.kt:33 Name("FileSystem") and src/ExpoFileSystem.ts:22 requireNativeModule('FileSystem'); legacy FileSystemLegacyModule.kt:90 Name("ExponentFileSystem"). Corroboration that the build treated it as installed: the introspected app manifest contains android.permission.READ_EXTERNAL_STORAGE and android.permission.WRITE_EXTERNAL_STORAGE, which in this project can only come from expo-file-system's own config plugin (node_modules/expo/node_modules/expo-file-system/plugin/build/withFileSystem.js adds exactly READ_EXTERNAL_STORAGE/WRITE_EXTERNAL_STORAGE/INTERNET), and the library manifest's FileSystemFileProvider (<provider android:name=".FileSystemFileProvider" android:authorities="${applicationId}.FileSystemFileProvider">) merges in unconditionally. Resolution check: require.resolve('expo-file-system') fails with MODULE_NOT_FOUND from both A:/Argos/argos and A:/Argos/argos/hooks, but succeeds from node_modules/expo. The android bundle exported today contains no 'ExponentFileSystem' string, i.e. the JS is simply not bundled yet.

**Correcao proposta**

OTA-SAFE. Add "expo-file-system": "19.0.22" (exact — must equal the compiled native version) to package.json dependencies and run npm install; npm hoists it to top level and dedupes the nested copy, and autolinking then resolves the identical 19.0.22 native artifact, so the APK's compiled code is unchanged. Then replace the fragile blobToBase64 at services/voice/backgroundWakeWord.native.ts:21-33 (fetch(file://) + Blob + FileReader, which is unreliable on Android's OkHttp-backed fetch) with `import * as FileSystem from 'expo-file-system/legacy'; await FileSystem.readAsStringAsync(uri, { encoding: 'base64' })`, or the new API's File(uri).base64(). Publish with `npx eas update --branch preview --platform android`. Do not bump the version range past 19.0.22 without a rebuild.

### 15. Auto-stop-after-silence (demand #2) is entirely OTA-safe — every native capability it needs is already linked

- **Arquivo:** services/voice/backgroundWakeWord.native.ts:90
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

The native surface for VAD-driven capture on this APK is expo-av's AVModule, which is compiled in; the missing behaviour is purely JS orchestration (no metering enabled, fixed 3s chunks, no silence timer, wrong audio mode).

**Evidencia**

Autolinking resolve reports expo-av 16.0.8 with expo.modules.av.AVModule (and VideoViewModule) from node_modules/expo-av/android. Every native package imported anywhere in app/, hooks/, services/, components/, stores/ is in the linked set: @react-native-async-storage/async-storage, @react-native-voice/voice, expo-av, expo-blur, expo-constants, expo-haptics, expo-linear-gradient, expo-linking, expo-speech, expo-updates, react-native-gesture-handler, react-native-mmkv, react-native-reanimated, react-native-safe-area-context, react-native-screens, react-native-svg (expo-router/expo-status-bar are JS-only). hooks/useVoice.ts:11 already imports { Audio } from 'expo-av'. Also OTA-fixable in the same pass: services/voice/backgroundWakeWord.native.ts:90 sets isMeteringEnabled: false (must be true to get RecordingStatus.metering) and line 57 sets staysActiveInBackground: false.

**Correcao proposta**

OTA-SAFE. Port the working web architecture (services/voice/customCapture.web.ts) onto expo-av: prepareToRecordAsync with isMeteringEnabled: true, setProgressUpdateInterval(~100-150ms), setOnRecordingStatusUpdate to watch status.metering (dBFS) and finalize after ~1200ms of trailing silence following detected speech, then transcribe and dispatch. Ship via `npx eas update --branch preview --platform android`. No rebuild.

### 16. The "whole screen goes black" symptom must be triaged as native process death before assuming it is OTA-fixable

- **Arquivo:** services/voice/backgroundWakeWord.native.ts:132
- **Confianca:** medium | **Exige rebuild nativo:** SIM

**Causa raiz**

The foreground-service type mismatch kills the OS process from a native thread after the JS promise has already resolved, which presents exactly as "the app is not closed but everything goes dark" (Android restarts the activity into a black window). Any JS-side hypothesis for the black screen (render error, crashed effect) is a different fix path, and the two are indistinguishable without a log.

**Evidencia**

BackgroundActionsModule.java start() calls ContextCompat.startForegroundService(...) then promise.resolve(null) immediately, so the later IllegalArgumentException in RNBackgroundActionsTask.onStartCommand is invisible to JS and uncatchable. The bundle currently exported for android contains 'ArgosWakeWord'/'microphone', so the crashing path is reachable in production. There is no android/ directory and no crash log in the repo, so the actual stack trace has not been observed.

**Correcao proposta**

Before writing any fix, capture the truth: `adb logcat -c` then reproduce, then `adb logcat | grep -E "AndroidRuntime|RNBackgroundActions|IllegalArgumentException|MissingForegroundServiceType|ReactNativeJS"`. If the trace shows IllegalArgumentException/MissingForegroundServiceTypeException from RNBackgroundActionsTask, the black screen is the native manifest defect and only a new APK fixes it. If it shows a ReactNativeJS error, it is OTA-fixable. Cheap discriminator without adb: check whether the black screen only ever happens while the "Argos está ouvindo" notification exists / after the orb has been tapped.

### 17. An OTA published to branch preview will reach the installed APK, but only while expo.version stays "1.0.0" and the policy stays appVersion

- **Arquivo:** app.json:57
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

With runtimeVersion policy appVersion, the APK has the literal string "1.0.0" baked into its manifest, and expo-updates only accepts updates whose runtimeVersion matches byte-for-byte. Bumping expo.version, or switching the policy (e.g. to fingerprint), instantly orphans every already-installed APK — the update publishes successfully and simply never arrives.

**Evidencia**

Introspected native config: expo.modules.updates.EXPO_UPDATE_URL = https://u.expo.dev/b55e65c0-b79c-4867-a812-6c7cc7c8c349, expo.modules.updates.EXPO_RUNTIME_VERSION = @string/expo_runtime_version, and the strings resource expo_runtime_version = '1.0.0'; also EXPO_UPDATES_CHECK_ON_LAUNCH = ALWAYS and EXPO_UPDATES_LAUNCH_WAIT_MS = 0. Config source: app.json:5 (version 1.0.0), app.json:57-59 (policy appVersion), app.json:60-62 (updates.url), eas.json:12-16 (preview profile, channel "preview", buildType apk). app.config.js only injects extra.skipAuth/extra.buildTime and never touches version, so config evaluation cannot drift the runtime version. Delivery is user-visible: app/_layout.tsx:159-191 renders an update banner via Updates.useUpdates() + fetchUpdateAsync() + reloadAsync(). Note the channel->branch binding is injected by EAS Build itself, not by the local config (no UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY meta-data appears in the introspected manifest — see the comment at node_modules/@expo/config-plugins/build/android/Updates.js:81, 'ensure the same changes are also made in eas-cli and build-tools'), so it cannot be verified from the repo alone.

**Correcao proposta**

OTA-SAFE. Publish with `npx eas update --branch preview --platform android --message "..."`; confirm the channel is linked to that branch first with `npx eas channel:view preview`. Do not touch expo.version and do not change runtimeVersion.policy. Because LAUNCH_WAIT_MS is 0, the update downloads in the background and applies on the next launch or when the user taps "Reiniciar" in the in-app banner — so a test that closes and reopens the app only once can look like a failed publish. Verify what the device actually runs by logging Updates.channel, Updates.runtimeVersion, Updates.isEmbeddedLaunch, Updates.updateId (all exported by expo-updates and sourced from native).

### 18. The appVersion runtimeVersion policy gives zero protection against JS/native mismatch — an OTA that imports a missing native module ships happily and then crashes

- **Arquivo:** app.json:58
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

appVersion pins the runtime identity to the string "1.0.0", which is unaffected by dependency changes. Unlike the fingerprint policy, it cannot detect that a published bundle now requires native code the installed APK does not contain, so the guardrail has to be manual.

**Evidencia**

app.json:57-59 policy appVersion; strings resource expo_runtime_version = '1.0.0' regardless of package.json contents. Confirmed native whitelist from `expo-modules-autolinking resolve --platform android` (21 Expo modules: expo, expo-asset, expo-av 16.0.8, expo-blur, expo-constants, expo-eas-client, expo-file-system 19.0.22, expo-font, expo-haptics, expo-json-utils, expo-keep-awake, expo-linear-gradient, expo-linking, expo-manifests, expo-modules-core, expo-speech, expo-structured-headers, expo-system-ui, expo-updates 29.0.19, expo-updates-interface, expo-web-browser) plus `react-native-config` (14 RN packages incl. @react-native-voice/voice, react-native-background-actions, react-native-mmkv + react-native-nitro-modules, lottie-react-native, react-native-linear-gradient). Confirmed ABSENT from node_modules and package-lock.json entirely: expo-audio (no entry at all) — it cannot be reached from an OTA under any trick, unlike expo-file-system. Timeline evidence that this whitelist matches the APK: every top-level dependency directory predates 2026-07-21 12:10 except expo-web-browser (installed 22:38 that day); `find node_modules -maxdepth 1 -newermt "2026-07-21 12:10"` returns only expo-web-browser.

**Correcao proposta**

OTA-SAFE as a rule, not a code change: restrict OTA JS to the module list above (expo-file-system may be added per the earlier finding because its native side is already compiled at exactly 19.0.22). Anything else with a native side — expo-audio, expo-notifications, expo-camera, expo-secure-store, a newer major of an existing module — requires a new EAS build. Before each publish, run `node node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js resolve --platform android --json` and diff the module set against this list; if it changed, rebuild instead of publishing.

### 19. On-device Android speech recognition cannot be enabled by OTA: the manifest has no <queries> entry for android.speech.RecognitionService

- **Arquivo:** services/voice/speechToText.ts:4
- **Confianca:** medium | **Exige rebuild nativo:** SIM

**Causa raiz**

Android 11+ package visibility hides RecognitionService implementations unless the app declares <queries><intent><action android:name="android.speech.RecognitionService"/></intent></queries>. Neither app.json nor @react-native-voice/voice's config plugin nor its library manifest adds it, so SpeechRecognizer availability/binding fails — which is exactly the failure the code comments record. The queries element lives in the native manifest, so no JS change can supply it.

**Evidencia**

Introspected manifest's only <queries> block is the https/VIEW/BROWSABLE intent (from expo-linking/expo-web-browser) — no RecognitionService intent. node_modules/@react-native-voice/voice/android/src/main/AndroidManifest.xml declares only RECORD_AUDIO and INTERNET, and its plugin node_modules/@react-native-voice/voice/plugin/build/withVoice.js adds only RECORD_AUDIO on Android plus two iOS Info.plist strings. hooks/useVoice.ts:3-4 comments state the app records via expo-av + Whisper because '@react-native-voice/voice falha'. services/voice/speechToText.ts:4 lazily requires the Voice module but nothing imports speechToText — it is dead code, so the missing queries element is currently harmless.

**Correcao proposta**

Treat @react-native-voice/voice as unavailable for OTA work; keep the expo-av + Whisper path. If the APK is being rebuilt anyway for the foreground-service fix, take the opportunity: add the RecognitionService <queries> intent via a config plugin (or app.json android.queries) in the same build, which would unlock free on-device wake-word recognition and remove per-chunk Whisper cost/latency. Until such a build exists and is verified with Voice.isRecognitionAvailable(), do not route any OTA logic through Voice.

### 20. All native-affecting config is uncommitted, so the next build from a clean checkout would silently produce an APK with no foreground service, no updates URL and no package name

- **Arquivo:** eas.json:2
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

app.json, package.json, eas.json and plugins/withForegroundService.js exist only as working-tree modifications on branch experimento-grande. The committed app.json (HEAD ed90b11) has android.permissions ['RECORD_AUDIO','INTERNET'], no android.package, no plugins entry for withForegroundService, no updates block and no runtimeVersion; the committed package.json has no expo-updates, no react-native-background-actions and no expo-build-properties. Today's builds only work because EAS CLI uploads the dirty working tree (cli.requireCommit is absent, i.e. false, in eas.json:2-5). Anyone who sets requireCommit, builds from CI, or reclones would get an APK that cannot receive OTA at all.

**Evidencia**

`git status --short` lists app.json, package.json, app.config.js among modified files; `git diff HEAD -- app.json` shows the entire android.package / FOREGROUND_SERVICE* / plugins / updates / runtimeVersion / extra.eas block as unstaged additions, and `git diff HEAD -- package.json` shows expo-updates, react-native-background-actions, expo-build-properties, expo-web-browser as unstaged additions. `git log --oneline --all -- package.json app.json eas.json plugins/` shows the last committed change to these files is 7f945bd (initial PWA commit). eas.json:2-5 sets only cli.version and appVersionSource, so requireCommit defaults to false. No .easignore exists; .gitignore ignores /android and /ios (managed workflow, no android/ directory on disk).

**Correcao proposta**

Commit app.json, package.json, package-lock.json, eas.json, app.config.js and plugins/withForegroundService.js on experimento-grande before touching anything else — ideally as the same commit that fixes the service-name typo, so the corrected APK is reproducible. Then build. This also makes `git diff` a usable signal for "did this change require a rebuild?".

### 21. expo-web-browser's native module may be missing from the installed APK; nothing imports it today, so it must stay that way until a rebuild

- **Arquivo:** package.json:36
- **Confianca:** low | **Exige rebuild nativo:** SIM

**Causa raiz**

expo-web-browser was installed on 2026-07-21 at 22:38, roughly ten hours after the config that defines this build lineage (eas update:configure wrote the updates URL/projectId at 12:07-12:08 and the preview channel at 12:09). If the APK was built in that window, WebBrowserModule is not in it, and an OTA that starts importing expo-web-browser would throw at runtime. It is the only dependency whose presence in the installed binary is genuinely uncertain.

**Evidencia**

Directory mtimes: node_modules/react-native-background-actions 2026-07-20 21:52; expo-build-properties 07-21 10:15; plugins/withForegroundService.js 07-21 10:45; expo-updates + expo-eas-client + expo-updates-interface 07-21 12:07:58-59; app.json 07-21 12:08; eas.json 07-21 12:09; expo-web-browser + package-lock.json 07-21 22:38. `find node_modules -maxdepth 1 -newermt "2026-07-21 12:10"` returns only expo-web-browser, so it is the sole post-cutoff addition — every voice-relevant native module predates the build-defining config and is therefore in the APK either way. A grep of app/, hooks/, services/, components/, stores/ finds zero imports of expo-web-browser or WebBrowser, so there is no current runtime exposure. No APK/AAB, no eas build metadata and no android/ directory exist locally to settle it (dist/ is only an `expo export` output — dist/_expo/static/js/{android,ios,web}, regenerated today 2026-07-26 10:40 — not a native artifact).

**Correcao proposta**

Settle it authoritatively with `npx eas build:list --platform android --limit 5` (shows each build's timestamp, profile, channel and commit) — that also confirms whether the installed APK predates or postdates the 22:38 install. Meanwhile: do not introduce any expo-web-browser/WebBrowser import in an OTA. On-device cross-checks: Constants.expoConfig.extra.buildTime is already displayed at app/(tabs)/perfil.tsx:397 and equals the EAS build minute *only if no OTA has been applied yet* (app.config.js:6-7 recomputes it at every config evaluation, so after an update it shows the publish time instead) — pair it with Updates.isEmbeddedLaunch to know which one you are reading.

---

## Dimensao: Adversarial audit of the proposed native voice redesign (expo-av metering VAD + react-native-background-actions foreground service + RN FormData multipart upload) — OTA feasibility on the existing 1.0.0 APK

### 22. HARD BLOCKER: the microphone foreground-service type is declared on a misspelled class name, so the real RNBA service has NO foregroundServiceType — startForeground() throws and crashes the app on Android 14+. Proposal item 3 is impossible via OTA.

- **Arquivo:** plugins/withForegroundService.js:22
- **Confianca:** high | **Exige rebuild nativo:** SIM

**Causa raiz**

plugins/withForegroundService.js:22 injects <service android:name="com.asterinet.reaction.bgactions.RNBackgroundActionsTask" android:foregroundServiceType="microphone">. The library's actual package is com.asterinet.**react**.bgactions (node_modules/react-native-background-actions/android/src/main/AndroidManifest.xml declares package="com.asterinet.react.bgactions" and <service android:name=".RNBackgroundActionsTask"/> with no foregroundServiceType). Manifest merging keys on the fully-qualified class name, so the plugin created a second, inert declaration for a class that does not exist, and the class that actually runs has foregroundServiceType absent (== FOREGROUND_SERVICE_TYPE_NONE).

**Evidencia**

Typo: plugins/withForegroundService.js:22 says 'reaction', library package is 'react' (node_modules/react-native-background-actions/android/src/main/AndroidManifest.xml:1 and the java dir .../com/asterinet/react/bgactions/). services/voice/backgroundWakeWord.native.ts:139 passes foregroundServiceType: ['microphone']; BackgroundTaskOptions.java:getForegroundServiceType() maps that to ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE; RNBackgroundActionsTask.java:~100 calls ServiceCompat.startForeground(this, id, notification, thatType). Android requires the requested type bits to be a subset of the manifest-declared types — with none declared this throws (IllegalArgumentException on API 29–33; InvalidForegroundServiceTypeException on API 34+). Dropping the type is ALSO fatal: apps targeting API 34+ may not start an untyped FGS (MissingForegroundServiceTypeException), and Expo SDK 54 targets 35/36. RNBackgroundActionsTask.java only special-cases `e instanceof ForegroundServiceStartNotAllowedException` (a sibling class) and rethrows everything else out of Service.onStartCommand → uncaught → process crash. Even if it did not crash, an FGS without the microphone type gets silence from the mic in the background on Android 11+.

**Correcao proposta**

Fix the typo in plugins/withForegroundService.js:22 to com.asterinet.react.bgactions.RNBackgroundActionsTask (or, more robustly, use withAndroidManifest to find the existing merged <service> whose name endsWith '.RNBackgroundActionsTask' and set android:foregroundServiceType='microphone' on it), then run a NEW EAS build. Because runtimeVersion policy is appVersion=1.0.0, also bump app.json version so the new APK gets its own runtime channel and old installs don't receive JS that assumes the fixed manifest. Until that build ships, do not enable any background-wake-word code path in an OTA — it will convert today's silent no-op into a crash.

### 23. Background wake word will stall whenever the screen is off: RN's setTimeout on Android is driven by android.view.Choreographer frame callbacks, which stop when the display stops producing vsync. No JS-only fix exists.

- **Arquivo:** node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/core/JavaTimerManager.kt:135
- **Confianca:** high | **Exige rebuild nativo:** SIM

**Causa raiz**

Every timer in the proposed design (the metering poll loop, the chunk-length timers, the wake-word while-loop pacing) is a JS setTimeout. On Android, both bridge and bridgeless runtimes route setTimeout through JavaTimerManager, whose TimerFrameCallback is posted on ReactChoreographer, i.e. android.view.Choreographer. With no visible window and the display asleep there is no vsync, so frame callbacks stop and JS timers do not fire — even though HeadlessJsTaskService holds a PARTIAL_WAKE_LOCK (CPU on, screen off).

**Evidencia**

node_modules/react-native/ReactAndroid/.../modules/core/JavaTimerManager.kt:71-78 (onHostPause → clearFrameCallback), :135-140 (clearFrameCallback is skipped only while headlessJsTaskContext.hasActiveTasks()), :86-104 (onHeadlessJsTaskStart re-posts the choreographer callback). ReactChoreographer.kt:10,107 wraps android.view.Choreographer.postFrameCallback. Bridgeless uses the same object: node_modules/react-native/ReactAndroid/.../runtime/ReactInstance.kt:125-131 constructs JavaTimerManager(context, jsTimerExecutor, ReactChoreographer.getInstance(), ...) and hands it to initHybrid as the platform timer registry (:418-421). HeadlessJsTaskService.kt:175-183 acquires only PowerManager.PARTIAL_WAKE_LOCK.

**Correcao proposta**

Accept the limitation and scope the promise to 'listening while the screen is on / app backgrounded', or move the wake word into native code (a native AudioRecord + on-device keyword engine such as Porcupine or Vosk, driven by a Handler/HandlerThread rather than JS timers) — which is a new native module and a new APK. Two useful JS-side mitigations that do NOT fix screen-off: (a) always keep the RNBA headless task active, since JavaTimerManager only keeps timers alive while hasActiveTasks() is true — this is why active listening must never rely on metering polling while the app is backgrounded without the service running; (b) never assume a timer fired on time — recompute elapsed time from Date.now() on every tick instead of counting ticks.

### 24. Proposal items 2 and 3 are mutually exclusive: expo-av permits exactly ONE Recording, enforced both by a JS module global and by a single native MediaRecorder field. A persistently-open 'volume gate' recorder makes active listening impossible.

- **Arquivo:** node_modules/expo-av/src/Audio/Recording.ts:298
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

Recording.ts holds `let _recorderExists` at module scope and prepareToRecordAsync throws 'Only one Recording object can be prepared at a given time.' if it is set. Worse, if you bypass the JS guard, AVManager has a single `mAudioRecorder` field and prepareAudioRecorder() calls removeAudioRecorder() first — so the second prepare silently stops and releases the first recorder while the first JS Recording object still believes _canRecord === true. Calling stopAndUnloadAsync() on the stale object then stops the NEW recorder.

**Evidencia**

node_modules/expo-av/src/Audio/Recording.ts:27 (`let _recorderExists = false`), :298-299 (throw), :338 (set true), :111 (cleared only in _cleanupForUnloadedRecorder). node_modules/expo-av/android/.../AVManager.java:110 (single `private MediaRecorder mAudioRecorder`), :695 (removeAudioRecorder() at the top of prepareAudioRecorder), :655-670 (removeAudioRecorder stops+releases+nulls).

**Correcao proposta**

Serialize all microphone use through one owner module that exposes a single async mutex. The wake-word gate must fully `await stopAndUnloadAsync()` and then `await` a fresh `new Audio.Recording()` before active listening starts, and active listening must signal completion before the gate loop resumes. Never hold two Audio.Recording objects. In practice: make backgroundWakeWord own the recorder and, on detection, hand the already-running recorder's lifecycle over rather than letting useVoice.ts:78 construct its own — today useVoice.startListening() constructs a second Recording (useVoice.ts:78) directly from the wake-word callback (useVoice.ts:196-200), which only works by accident because the current loop closes its recorder at backgroundWakeWord.native.ts:99 before firing the callback at :109.

### 25. The 'mirror the web AnalyserNode' premise is false on native: expo-av gives no parallel volume tap, so every gated capture needs a stop→prepare→start mic reopen, which systematically clips the wake word.

- **Arquivo:** services/voice/wakeWordDetector.web.ts:96
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

On web, wakeWordDetector.web.ts opens getUserMedia once and attaches BOTH an AnalyserNode and a MediaRecorder to the same live MediaStream, so `new MediaRecorder(stream)` + `.start()` is instantaneous and costs no mic reopen. expo-av exposes only one MediaRecorder whose sole volume signal is getMaxAmplitude() on that same recorder, and offers no API to split or extract a sub-window from an open recording. To get a discrete uploadable chunk you must stopAndUnloadAsync (finalizes the MPEG-4 moov atom), then construct a new MediaRecorder, setOutputFile, prepare(), and start() — two extra async round trips plus MediaRecorder.prepare/start. By the time the new recorder is live, the 'Ei Argos' that tripped the gate is already over.

**Evidencia**

services/voice/wakeWordDetector.web.ts:96-101 (AnalyserNode on the same stream) and :135-165 (new MediaRecorder(stream) on the already-open stream). Native: AVManager.java:710-745 — prepareAudioRecorder constructs `new MediaRecorder()`, setAudioSource, setOutputFile, then prepare(); startAudioRecording is a separate call at :862 that invokes mAudioRecorder.start(). getAudioRecorderLevels (:623-638) reads getMaxAmplitude() off that same recorder — there is no level source when no recorder is open.

**Correcao proposta**

Do not try to gate the mic; gate only the NETWORK. Record continuously in fixed rolling chunks (e.g. 4–5 s), track the per-chunk metering peak, and on stopAndUnloadAsync upload the chunk only if its peak exceeded the speech threshold — otherwise discard the file locally. This preserves the pre-roll (the wake word is inside the chunk, not after the trigger) and keeps Whisper spend low, which was the actual goal. Accept that a wake word straddling a chunk boundary is missed and mitigate by overlapping: after upload-worthy chunks, also send the following chunk. Do not promise web-equivalent latency.

### 26. Permanent, unrecoverable deadlock: stopAndUnloadAsync does not guard `await ExponentAV.unloadAudioRecorder()`, so one rejection leaves _recorderExists === true and every future prepareToRecordAsync throws for the rest of the JS runtime's life.

- **Arquivo:** node_modules/expo-av/src/Audio/Recording.ts:434
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

Recording.stopAndUnloadAsync wraps ExponentAV.stopAudioRecording() in try/catch (so E_AUDIO_NODATA is tolerated) but then calls `await ExponentAV.unloadAudioRecorder()` unguarded at Recording.ts:434. Native unloadAudioRecorder rejects E_AUDIO_NORECORDER whenever mAudioRecorder is already null. If it rejects, _cleanupForUnloadedRecorder() (the only place _recorderExists is reset) never runs. This is not hypothetical in a background-service app: AVManager.onHostDestroy() calls removeAudioRecorder() at AVManager.java:284 WITHOUT emitting 'Expo.Recording.recorderUnloaded', so an Activity destruction while the headless task holds a prepared recorder desyncs JS from native and the next stopAndUnloadAsync bricks recording. onHostDestroy also calls mHybridData.resetNative() (:287), so expo-av itself is torn down under the still-running background task.

**Evidencia**

node_modules/expo-av/src/Audio/Recording.ts:420-437 — stopResult try/catch, then unguarded `await ExponentAV.unloadAudioRecorder()` at :434, then `await this._cleanupForUnloadedRecorder(stopResult)`. Recording.ts:111 is the only `_recorderExists = false`. AVManager.java:943-948 unloadAudioRecorder → checkAudioRecorderExistsOrReject → promise.reject('E_AUDIO_NORECORDER'). AVManager.java:264-288 onHostDestroy → removeAudioRecorder() at :284 with no sendEvent (contrast :674-678 onInfo, which DOES emit 'Expo.Recording.recorderUnloaded' and is only registered when maxFileSize is set).

**Correcao proposta**

Wrap every teardown as `try { await rec.stopAndUnloadAsync() } catch {}` AND then defensively force expo-av's global back to a clean state, because the library will not. Concretely: in a wrapper module, after any failed teardown, call `await ExponentAV.unloadAudioRecorder().catch(()=>{})` yourself and then reach into the instance (`rec._canRecord = false; rec._isDoneRecording = true`) and re-run `rec._cleanupForUnloadedRecorder()` so `_recorderExists` is released; alternatively set `maxFileSize` in RecordingOptionsAndroid so AVManager registers setOnInfoListener and the recorderUnloaded event path exists. Also add an AppState listener that tears the recorder down on 'background'/'inactive' BEFORE Android can destroy the Activity, and never leave a recorder prepared across an Activity teardown.

### 27. status.metering on Android is NOT dBFS — expo-av uses natural log instead of log10, so values are 2.3026x too negative, the real range is about -208..0, and -160 is a non-monotonic sentinel. Any threshold ported from iOS docs or the web analyser will be wrong.

- **Arquivo:** node_modules/expo-av/android/src/main/java/expo/modules/av/AVManager.java:638
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

AVManager.getAudioRecorderLevels() returns `(int)(20 * Math.log(amplitude / 32767d))`. java.lang.Math.log is the NATURAL logarithm; correct dBFS requires Math.log10. So reported = true_dBFS x ln(10) = true_dBFS x 2.302585. Separately, amplitude == 0 (and 'no recorder' / metering disabled) returns the literal -160 sentinel, but real non-zero amplitudes below ~10 compute to values MORE negative than -160 (amplitude 10 → -161.9; amplitude 1 → -207.9). So -160 is not the floor and the scale is not monotonic through it.

**Evidencia**

node_modules/expo-av/android/.../AVManager.java:638 `return (int) (20 * Math.log(((double) amplitude) / 32767d));`, with -160 returned at :624 (no recorder / metering off) and :629 (amplitude == 0). Recording.types.ts:38-42 documents 'ranges from -160 dBFS ... to 0 dBFS', which the Android implementation violates. Worked values: true -20 dBFS reads as -46; true -40 dBFS reads as -94; true -60 dBFS reads as -140. On iOS, metering is genuine AVAudioRecorder averagePower dBFS, so one shared constant behaves completely differently per platform.

**Correcao proposta**

Never hardcode a dB threshold. On Android, either undo the bug in JS (`trueDb = metering / Math.LN10 * Math.log10(Math.E)` — simply `metering / 2.302585`) or keep expo-av's scale but calibrate empirically (speech close to a phone mic lands roughly -10..-50 on this scale, a quiet room roughly -95..-130). Branch the constant on Platform.OS. Treat exactly -160 as 'unknown/silence' rather than as a numeric floor, and treat `metering === undefined` as unknown too (it is omitted entirely unless isMeteringEnabled, AVManager.java:648-650). Never write `(metering + 160) / 160` — it goes negative. Better: implement an adaptive gate (rolling noise-floor estimate over the last ~2 s, trigger at floor + N) so the threshold self-calibrates per device and per environment, which is what the web version effectively gets for free from a normalised 8-bit stream.

### 28. metering is a destructive peak-since-last-read, and expo-av consumes it on every native call — extra getStatusAsync() calls steal VAD samples, and the poll loop schedules its next tick before awaiting, so ticks overlap at 100 ms.

- **Arquivo:** node_modules/expo-av/src/Audio/Recording.ts:122
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

MediaRecorder.getMaxAmplitude() returns the max absolute amplitude since the LAST call and resets. AVManager.getAudioRecorderStatus() (which reads it) is invoked by prepareAudioRecorder, startAudioRecording, stopAudioRecording AND getAudioRecordingStatus — so any manual getStatusAsync(), and expo-av's own setOnRecordingStatusUpdate()/setProgressUpdateInterval() (both call this.getStatusAsync() unawaited), silently drain the peak the VAD is about to sample. Additionally _pollingLoop schedules the next setTimeout at Recording.ts:122 BEFORE awaiting getStatusAsync at :127, so it is fixed-rate, not fixed-delay: if a round trip exceeds the interval, ticks queue up and each one splits the peak window.

**Evidencia**

AVManager.java:627 `int amplitude = mAudioRecorder.getMaxAmplitude();` inside getAudioRecorderLevels, called from getAudioRecorderStatus (:649), which is the resolve value of prepareAudioRecorder (:743), startAudioRecording (:884), stopAudioRecording (:930) and getAudioRecordingStatus (:937). Recording.ts:120-131 (_pollingLoop schedules then awaits), :253-260 setOnRecordingStatusUpdate ends with an unawaited, uncaught this.getStatusAsync(), :268-271 setProgressUpdateInterval likewise.

**Correcao proposta**

Read metering ONLY from the setOnRecordingStatusUpdate callback and never call getStatusAsync() yourself while recording. Call setProgressUpdateInterval BEFORE prepareToRecordAsync/startAsync so its stray getStatusAsync lands while _canRecord is false (it then short-circuits at Recording.ts:230-238 and does not touch native). Debounce your VAD on a rolling window of at least 3 consecutive callbacks (mirroring TRIGGER_POLLS_NEEDED=2 in wakeWordDetector.web.ts:25) rather than a single sample, and drive silence detection off Date.now() deltas rather than tick counts so a stalled or bunched tick cannot fake 1500 ms of silence.

### 29. There is no native minimum for progressUpdateInterval — 100 ms is achievable in the foreground, but it is a pure JS setTimeout chain gated on the same Choreographer, so its real floor is ~1 frame plus one async round trip and it degrades silently under load or in the background.

- **Arquivo:** node_modules/expo-av/src/Audio/Recording.ts:268
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

setProgressUpdateInterval only assigns a JS field; there is no clamp anywhere in JS or native. The value feeds setTimeout in _pollingLoop. On Android, setTimeout resolution is one Choreographer frame (~16 ms at 60 Hz) and each tick additionally costs one async JSI/bridge round trip into getAudioRecordingStatus. The default is 500 ms.

**Evidencia**

node_modules/expo-av/src/Audio/Recording.ts:268-271 (setProgressUpdateInterval — assignment only, no clamp), :102 default from _DEFAULT_PROGRESS_UPDATE_INTERVAL_MILLIS, node_modules/expo-av/src/AV.ts:25 `= 500`. No corresponding clamp exists in AVModule.kt or AVManager.java (getAudioRecordingStatus is a plain AsyncFunction, AVModule.kt:125-127). Timer dispatch: JavaTimerManager.kt TimerFrameCallback on ReactChoreographer.kt:107.

**Correcao proposta**

100 ms is safe to request but do not treat it as a guarantee. Because MediaRecorder.getMaxAmplitude() is peak-since-last-read, a shorter interval reports LOWER peaks for the same speech — so re-tune thresholds if you change the interval. 150 ms matches the proven web CHECK_INTERVAL_MS (wakeWordDetector.web.ts:26) and halves the bridge traffic; prefer it. Always derive elapsed/silence durations from Date.now() timestamps carried in the callback, never from interval x tick count.

### 30. REFUTED PREMISE: fetch(fileUri) -> .blob() -> FileReader.readAsDataURL DOES work on Android RN 0.81. The current base64 upload path is not why the background wake word fails, so item 4 is fixing a non-problem.

- **Arquivo:** services/voice/backgroundWakeWord.native.ts:21
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

RN's fetch is the whatwg-fetch polyfill, which unconditionally sets xhr.responseType = 'blob' whenever Blob+FileReader globals exist (they always do in RN). NetworkingModule then consults its registered UriHandlers before touching OkHttp, and BlobModule's UriHandler claims ANY non-http/https scheme when responseType === 'blob' and reads it via ContentResolver.openInputStream, which natively supports file://. So the file:// fetch never reaches OkHttp (which would reject the scheme).

**Evidencia**

node_modules/whatwg-fetch/dist/fetch.umd.js:599-606 (always `xhr.responseType = 'blob'` when support.blob), :15-31 (support.blob = FileReader && Blob present — polyfilled by RN). node_modules/react-native/Libraries/Network/XMLHttpRequest.js:614-616 maps that to nativeResponseType 'blob'. NetworkingModule.kt:253-262 runs uriHandlers BEFORE `Request.Builder().url(...)` at :274. BlobModule.kt:67-73 `supports(uri, responseType) = !isRemote && responseType == "blob"`, :75-89 fetch → getBytesFromUri, :207-210 contentResolver.openInputStream. FileReaderModule.kt:55-70 implements readAsDataURL. Mime for .m4a resolves via BlobModule.kt:261-270 MimeTypeMap fallback.

**Correcao proposta**

Keep the existing JSON+base64 path (services/voice/backgroundWakeWord.native.ts:21-33 and hooks/useVoice.ts:28-40) — it is verified-working, the base64 is produced in native (no JS CPU cost), and a 3-4 s 64 kbps m4a is only ~25-35 KB, far under Vercel's 4.5 MB body limit. Spend the engineering budget on findings 1-5 instead. If you later want multipart for larger clips, ship it as an additive second path behind a flag, not as a replacement.

### 31. FormData with { uri, name, type } does work on Android RN 0.81 — but the Content-Type header MUST be omitted or be exactly multipart/form-data; carrying over the existing 'application/json' header makes OkHttp throw, and `body: { uri }` via fetch silently uploads the string "[object Object]".

- **Arquivo:** services/voice/backgroundWakeWord.native.ts:42
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

NetworkingModule takes contentType from the caller's request header and feeds it straight into MultipartBody.Builder.setType(), which requires type == "multipart" and throws IllegalArgumentException('multipart != application/json') otherwise. When the header is absent it defaults to 'multipart/form-data' and OkHttp's BridgeInterceptor replaces the outgoing header with the body's content type including the generated boundary — which is why omitting it is correct. Separately, whatwg-fetch has no branch for a plain object body and falls through to `this._bodyText = Object.prototype.toString.call(body)`, so RN's `{uri,type}` single-file body form is unusable through fetch (only through raw XMLHttpRequest).

**Evidencia**

NetworkingModule.kt:453-465 (formData branch: `if (contentType == null) contentType = "multipart/form-data"`, then constructMultipartBody(parts, contentType, ...)), :685-697 (`multipartBuilder.setType(MediaType.parse(contentType))`), :719-758 (per-part content-type is required for binary parts and is stripped from the part headers). FormData.js:82-105 getParts emits {uri, name, type, headers:{content-disposition, content-type}}. RequestBodyUtil.kt:50-76 getFileInputStream → contentResolver.openInputStream, so file:// is read natively. RCTNetworking.android.js:71-77 + convertRequestBody.js:34-36 wire `body instanceof FormData` → {formData: parts}. whatwg-fetch/dist/fetch.umd.js:262-264 is the `[object Object]` fallthrough; :266-274 shows content-type is deliberately NOT set for FormData.

**Correcao proposta**

If you do go multipart: build `const fd = new FormData(); fd.append('file', { uri, name: 'audio.m4a', type: 'audio/mp4' }); fd.append('model','whisper-1');` and pass ONLY `{ Authorization }` in headers — delete the `'Content-Type': 'application/json'` currently at services/voice/backgroundWakeWord.native.ts:42 and hooks/useVoice.ts:160. Never hand-set a boundary. Never use `body: { uri }` with fetch. Use the global FormData (RN polyfills it to Libraries/Network/FormData) — a userland FormData shim would fail convertRequestBody's `instanceof` check and be stringified.

### 32. api/transcribe.ts cannot read a multipart body as written: @vercel/node's parser only populates req.body for JSON / urlencoded / text, so a multipart POST arrives with req.body undefined and returns 400 for every request.

- **Arquivo:** api/transcribe.ts:55
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

The handler destructures `const { audio, mimeType } = req.body` and 400s when audio is falsy. Vercel's Node runtime auto-parses req.body by Content-Type; multipart/form-data is not among the parsed types, so req.body is undefined and the raw multipart stream must be parsed explicitly.

**Evidencia**

api/transcribe.ts:55-58 (`const { audio, mimeType } = req.body as {...}` then `if (!audio) return res.status(400)`), :61 `Buffer.from(audio, 'base64')`. There is no busboy/formidable dependency in package.json and no `export const config = { api: { bodyParser: false } }` in the file.

**Correcao proposta**

Only take this on if you actually need it. To support multipart you must add a parser (busboy or formidable) as a new dependency and disable the default body parser, or read the raw stream and reconstruct a Web Request to call `.formData()`. Keep the existing JSON+base64 branch intact and content-negotiate, so an old APK on an old OTA payload keeps working. Note this is the one item in the proposal that is genuinely independent of the APK — it just is not free, and per the previous finding it is also not necessary.

### 33. Audio.requestPermissionsAsync() inside the background loop resolves 'denied' when no Activity exists and writes to SharedPreferences on every iteration — it must not be in the loop and must not gate recording.

- **Arquivo:** services/voice/backgroundWakeWord.native.ts:67
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

expo-modules-core's PermissionsService.askForPermissions does not short-circuit when the permission is already granted; it always goes through delegateRequestToActivity, which — when currentActivity is not a PermissionAwareActivity (app fully backgrounded, Activity destroyed) — immediately invokes the listener with PERMISSION_DENIED. It also calls addToAskedPermissionsCache() first, so each loop iteration does a synchronized block plus a prefs write. Meanwhile the actual gate that matters (AVManager.prepareAudioRecorder → isMissingAudioRecordingPermissions) resolves correctly headlessly via the app Context, so the request call adds only risk.

**Evidencia**

node_modules/expo-av/android/.../AVModule.kt:133-135 requestPermissionsAsync → Permissions.askForPermissionsWithPermissionsManager. node_modules/expo-modules-core/android/.../permissions/PermissionsService.kt:123-160 (askForPermissions → askForManifestPermissions, no granted short-circuit), :243-245 (askForManifestPermissions → delegateRequestToActivity), :256-272 (addToAskedPermissionsCache then, when currentActivity is not PermissionAwareActivity, `listener.onResult(...PERMISSION_DENIED...)`), :195-207 getManifestPermission falls back to getManifestPermissionFromContext for the headless case. Current offending call: services/voice/backgroundWakeWord.native.ts:67, inside the while loop.

**Correcao proposta**

Request RECORD_AUDIO exactly once, from the foreground, on the orb tap — before BackgroundService.start (which Android 12+ requires anyway, since a FGS cannot be started from the background). Delete backgroundWakeWord.native.ts:67. Inside the loop use `Audio.getPermissionsAsync()` at most, or just let prepareToRecordAsync reject with E_MISSING_PERMISSION and treat that as a terminal condition that stops the service and surfaces a UI error, rather than retrying forever.

### 34. The wake word is unreachable on native today: its only entry point is gated behind Platform.OS === 'web'. Wiring it up via OTA is the JS fix the user is asking for — and it is exactly what will trigger the finding-1 crash.

- **Arquivo:** app/(tabs)/index.tsx:61
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

startWakeWordDetection() is called only from handleActivateVoice, which is only rendered when showMicPrompt is true, and showMicPrompt requires Platform.OS === 'web'. The orb press handler only toggles active listening. Additionally the autoListen effect in useVoice.ts early-returns on non-web.

**Evidencia**

app/(tabs)/index.tsx:61-68 (`showMicPrompt = Platform.OS === 'web' && ...`), :196-197 (the Pressable calling handleActivateVoice is inside `{showMicPrompt && ...}`), :93-100 handleOrbPress only calls startListening/stopListening. hooks/useVoice.ts:210-222 (`if (Platform.OS !== 'web') return;` at the top of the autoListen effect, with the comment 'no native, wake word é via foreground service' — but nothing native ever calls it).

**Correcao proposta**

Sequence this deliberately: ship the native rebuild from finding 1 FIRST, then OTA the wiring. The wiring itself is small — on native, handleOrbPress (or a long-press) should request mic permission in the foreground and then call startWakeWordDetection(), and the autoListen effect should run on native too. Do not ship the wiring to installs running the current APK; guard it on a runtime capability check (e.g. Constants.expoConfig version or a native-side probe) so old binaries keep the current silent no-op instead of crashing.

### 35. Auto-stop after ~1.5 s of silence will produce corrupt or rejected clips unless a minimum duration is enforced: stopAndUnloadAsync rejects E_AUDIO_NODATA on short recordings and MPEG-4 needs stop() to write its moov atom.

- **Arquivo:** node_modules/expo-av/android/src/main/java/expo/modules/av/AVManager.java:922
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

AVManager.stopAudioRecording catches the RuntimeException from MediaRecorder.stop() and rejects E_AUDIO_NODATA when no valid audio has been received. The output file in that case is an unplayable partial MPEG-4 (no moov atom) that Whisper will reject. A VAD that can fire very early — e.g. the gate trips on a door slam, then 1500 ms of silence elapses — will hit this. The proposed hard max-duration cap has the mirror-image risk if it races the stop that is already in flight.

**Evidencia**

node_modules/expo-av/android/.../AVManager.java:912-931 (`catch (final RuntimeException e)` → reject 'E_AUDIO_NODATA', 'no valid audio data has been received'). node_modules/expo-av/src/Audio/Recording.ts:406-410 documents this explicitly: 'On Android this method may fail with E_AUDIO_NODATA when called too soon after startAsync ... the recorded file will be invalid and should be discarded.' Recording.ts:420-437 still runs the unload and then re-rejects with stopError, so the caller sees the rejection AFTER cleanup.

**Correcao proposta**

Enforce a hard minimum recording duration (~1000 ms, and require that speech was actually detected) before honouring a silence-triggered stop — mirror `hasSpeechInChunk` from wakeWordDetector.web.ts:186-192. Guard stop with a single in-flight boolean so the silence timer and the max-duration timer cannot both call stopAndUnloadAsync (the second throws 'Cannot unload a Recording that has already been unloaded', Recording.ts:415). On E_AUDIO_NODATA, discard the URI without uploading — but note the recorder IS already unloaded by then, so do not attempt a second teardown. Keep the server's existing `buffer.byteLength < 800` short-circuit (api/transcribe.ts:62-66) as a second line of defence.

### 36. react-native-background-actions silently leaks and mis-sequences: taskName is mutated per start, stop() resolves the headless task while your while-loop keeps running, and a throwing task body wedges the service alive forever.

- **Arquivo:** node_modules/react-native-background-actions/src/index.js:80
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

_normalizeOptions appends an incrementing counter to taskName, so every start registers a NEW headless task name via AppRegistry.registerHeadlessTask (old registrations are never removed). stop() calls _stopTask() (resolving the wrapper promise, which ends the HeadlessJsTask and lets the OS reclaim the FGS) and only then stops the service — but your `while (BackgroundService.isRunning())` loop is not cancelled and will run at least one more iteration with a recorder open and no microphone-typed FGS backing it (→ silence, or a crash on newer Android). And _generateTask does `task(parameters).then(() => self.stop())` with NO .catch(), so if the task body throws, the wrapper promise never resolves: the HeadlessJsTask stays 'active' forever, the notification stays up, and the service is never stopped.

**Evidencia**

node_modules/react-native-background-actions/src/index.js:_normalizeOptions `taskName: options.taskName + this._runnedTasks`; start() → `AppRegistry.registerHeadlessTask(this._currentOptions.taskName, () => finalTask)`; _generateTask → `await new Promise((resolve) => { self._stopTask = resolve; task(parameters).then(() => self.stop()); })` (no catch); stop() → `this._stopTask(); await RNBackgroundActions.stop(); this._isRunning = false;`. Consumer side: services/voice/backgroundWakeWord.native.ts:62 `while (BackgroundService.isRunning())` with the local `isRunning` flag checked only at :63/:103/:106.

**Correcao proposta**

Own cancellation yourself with an explicit generation token: keep a module-level `let generation = 0`, capture `const myGen = ++generation` at start, and check `myGen === generation` after EVERY await inside the loop (not just at the top). In stopBackgroundWakeWord, bump `generation` and tear the recorder down BEFORE awaiting BackgroundService.stop(). Wrap the entire task body in try/catch/finally so it can never reject — the finally must stopAndUnload any recorder and call BackgroundService.stop(). Call BackgroundService.stop() before any restart so you do not stack registrations. RNBA's start/stop/updateNotification are all callable from JS only (BackgroundActionsModule.java @ReactMethod start/stop/updateNotification) and taskName/taskTitle/taskDesc/taskIcon/color/foregroundServiceType all come from JS (BackgroundTaskOptions.java constructor + getForegroundServiceType), so ALL of this is OTA-fixable; only the manifest <service> entry is not.

### 37. staysActiveInBackground is a red herring for Android recording, and the current task actively sets audio-mode flags that break iOS recording and abandon audio focus.

- **Arquivo:** services/voice/backgroundWakeWord.native.ts:54
- **Confianca:** high | **Exige rebuild nativo:** SIM

**Causa raiz**

expo-av's mStaysActiveInBackground only gates playback AudioEventHandlers and audio focus in onHostPause/onHostResume — the recorder is never touched on host pause. What actually decides whether the mic yields audio in the background on Android 11+ is the microphone-typed foreground service (finding 1), not any expo-av audio-mode flag. Meanwhile the current background task sets allowsRecordingIOS: false and staysActiveInBackground: false, which on iOS would prevent recording outright.

**Evidencia**

node_modules/expo-av/android/.../AVManager.java:231-260 (onHostResume/onHostPause both branch on `!mStaysActiveInBackground` and iterate AudioEventHandlers + abandonAudioFocus; mAudioRecorder is never referenced), :428 mStaysActiveInBackground is only assigned from setAudioMode, :344-346 it only guards acquireAudioFocus (used by PlayerData playback, not recording). Offending call: services/voice/backgroundWakeWord.native.ts:54-60 (`allowsRecordingIOS: false, staysActiveInBackground: false`). Note expo-av validates that all five booleans are present (node_modules/expo-av/src/Audio.ts:56-64).

**Correcao proposta**

Set `allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: true, shouldDuckAndroid: false, playThroughEarpieceAndroid: false` for the listening session on both platforms (it is harmless on Android and required on iOS). Do not expect it to enable anything on Android. For iOS you would additionally need UIBackgroundModes: ['audio'] in app.json ios.infoPlist — which is absent today and is a native/plist change requiring a new build; since the shipping target is an Android APK, scope background listening to Android and explicitly do not promise it on iOS.

### 38. Proposal item 1 is already done — @react-native-voice/voice is not used by the native voice path — so 'replace it entirely' buys nothing, and removing it from app.json plugins would force a rebuild for no gain.

- **Arquivo:** hooks/useVoice.ts:1
- **Confianca:** high | **Exige rebuild nativo:** nao

**Causa raiz**

hooks/useVoice.ts was already rewritten to use expo-av + Whisper; its header comment says so explicitly. @react-native-voice/voice remains only as a dependency and an app.json config plugin.

**Evidencia**

hooks/useVoice.ts:1-8 (the file docblock: 'Grava áudio via expo-av e transcreve via Whisper (/api/transcribe) ... @react-native-voice/voice falha silenciosamente') and no import of the package anywhere in hooks/ or services/voice/. app.json:16-19 still lists '@react-native-voice/voice' in expo.plugins and package.json still depends on ^3.2.4.

**Correcao proposta**

Leave the dependency and the plugin alone for now — deleting them changes the native fingerprint and buys nothing. Fold the cleanup into the SAME rebuild that fixes the withForegroundService typo (finding 1), not into a separate build, and verify no residual import remains before removing it from package.json.

### 39. Unverified runtime risk to smoke-test before relying on RNBA: it is an old-architecture ReactPackage module and Expo SDK 54 runs bridgeless, so NativeModules.RNBackgroundActions resolution depends on the TurboModule interop layer.

- **Arquivo:** node_modules/react-native-background-actions/src/RNBackgroundActionsModule.js:1
- **Confianca:** medium | **Exige rebuild nativo:** nao

**Causa raiz**

BackgroundActionsModule extends ReactContextBaseJavaModule with @ReactMethod (legacy), and RNBackgroundActionsModule.js does `const { RNBackgroundActions } = NativeModules` at import time. Under bridgeless this resolves only through the legacy-module interop path. Expo wires DefaultTurboModuleManagerDelegate / ReactPackageTurboModuleManagerDelegate, which does handle legacy ReactPackage modules, so it should work — but it has never actually been exercised in this app because the wake word entry point is web-gated (finding 12), so there is zero runtime evidence. If it were undefined, `new NativeEventEmitter(undefined)` does not throw on Android, and the failure would surface late as 'Cannot read property start of undefined' inside BackgroundService.start.

**Evidencia**

node_modules/react-native-background-actions/src/RNBackgroundActionsModule.js:1-5 (destructures NativeModules at module scope, then `new NativeEventEmitter(RNBackgroundActions)`). node_modules/react-native-background-actions/android/.../BackgroundActionsModule.java extends ReactContextBaseJavaModule with @ReactMethod start/stop/updateNotification (no TurboModule spec). node_modules/expo/android/src/main/java/expo/modules/ExpoReactHostFactory.kt:10,15,32-33 builds a ReactPackageTurboModuleManagerDelegate via DefaultTurboModuleManagerDelegate.Builder(), which is the interop path. HeadlessJsTaskService.kt:127-134 also has a bridgeless branch requiring ReactApplication.reactHost to be non-null.

**Correcao proposta**

Before designing anything else on top of RNBA, run a one-line smoke test on the device against the CURRENT APK: log `typeof require('react-native').NativeModules.RNBackgroundActions?.start`. If it is 'function', the interop works and only the manifest fix from finding 1 is needed. If it is undefined, RNBA cannot be used at all under bridgeless and you need a different mechanism (an Expo-module foreground service, or expo-task-manager) — which would also be a new native build. Do this check first; it changes the whole plan.

---

## Verificacoes que rodaram (11)

### V1 — MANTIDO

Every cited line matches verbatim and the mechanism holds.

useArgos.ts:146-163 — the loop marks step i 'running', sleeps a fixed 150ms (:150), calls the void store setter (:152-160), then unconditionally calls updateExecutionStep(i, 'success') (:162). Nothing observes the network result.

useDeviceStore.ts:35-36 declares `toggleDevice: (id: string) => void` and `updateDeviceState: (id, stateKey, value) => void`. The Tuya branches are exactly as asserted: :120-126 `controlTuyaDevice(device.tuyaDeviceId, 'isOn', !device.isOn).catch(err => { if (__DEV__) console.error('[Tuya] Falha ao controlar dispositivo:', err); }).finally(() => delay(1200).then(() => get().syncTuyaDevices()))` and :180-189 the same shape for updateDeviceState. Same pattern for all 7 providers (ewelink/tuya/alexa/wiz/tapo/wiz-local/xiaomi), so this is not Tuya-specific.

The error that gets swallowed is real: tuyaService.ts:94-97 `if (!res.ok) throw new Error(err.message ?? 'Falha ao controlar dispositivo')`, fed by api/tuya.ts:52 (`401 unauthorized` when getUserFromAuthHeader returns null) and :188-191 (`502 tuya_error` with the Tuya message).

`__DEV__` really is false in the shipped APK — eas.json:11-17, the `preview` profile sets only `distribution: internal` + `channel: preview` + apk buildType, no `developmentClient: true`, so it is a release bundle and those 19 console.error calls are dead code. Even in dev they only reach the Metro console, never the UI.

The false success is double-reported: the overlay (updateExecutionStep 'success') and the chat transcript, which hardcodes `status: 'success'` for every action at useArgos.ts:174-179.

requiresNativeRebuild:false is correct — hooks/useArgos.ts, stores/useDeviceStore.ts, services/devices/tuyaService.ts are all plain JS/TS in the OTA bundle; no native module, permission, or app.json change is involved.

Attempted refutations that failed: (a) no other code path surfaces device-control errors — grep for toggleDevice/updateDeviceState finds only casa.tsx:177,195, devices.tsx:309-313, automationEngine.ts:17-23 and useArgos.ts, all discarding the result; (b) the overlay already supports the 'error' state so the claim isn't asking for impossible UI; (c) there is no .web variant of useArgos.ts or useDeviceStore.ts (hooks/ contains only useVoice.web.ts, stores/ has none), so the bug is present on the "working" PWA too — it just isn't noticed there because the Tuya calls succeed.

Marking valid, with fix-level corrections below (the proposed snippet as literally written would introduce a worse hang).

**Correcao:** Diagnosis is correct as written. Four corrections, all to the fix:

1. `withTimeout` REJECTS — the proposed snippet is wrong and would make things worse. `useArgos.ts:25-32` is `Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))])`. So `const res = await withTimeout(updateDeviceState(...), 8000, 'timeout'); ... res.ok` throws on timeout instead of yielding `{ok:false}`. That throw escapes the `for` loop, skipping `setShowExecutionOverlay(false)`/`setStatus('idle')` at useArgos.ts:183-187 — and in the fast-path at useArgos.ts:492-497 (`try { await processIntent(fastIntent) } finally { processingRef.current = false }`, no `catch`) it escapes `sendMessage` entirely, leaving status pinned at 'executing' with the overlay stuck. I.e. the fix as written would manufacture exactly the "Executando... forever" symptom. Wrap the awaited call in try/catch (or have the store method resolve `{ok:false, error}` and never reject), and move the overlay teardown into a `finally`.

2. Do not await the resync tail. Each Tuya branch ends `.finally(() => delay(1200).then(() => get().syncTuyaDevices()))`. If the new async setter returns that whole chain, every execution step gains 1.2s plus a full device-list fetch. The returned promise must settle when `controlTuyaDevice` settles; keep the resync detached (fire-and-forget) as it is today.

3. Fix the chat transcript too, not just the overlay. useArgos.ts:174-179 hardcodes `status: 'success'` in `metadata.executedActions` for every action, so the message history would still lie after the overlay is corrected. `ExecutedAction.status` (types/ai.types.ts:25-29) already permits `'error'`. Feed the same per-step result into both, and use `error()` from useHaptic instead of `success()` (useArgos.ts:165) when any step failed.

4. Web-build impact: source-compatible, but it is a UX change on the currently-working PWA. Neither `hooks/useArgos.ts` nor `stores/useDeviceStore.ts` has a `.web` variant, so the change ships to web. Widening the return type from `void` to `Promise<{ok:boolean;error?:string}>` does not break the other call sites — app/(tabs)/casa.tsx:177 and :195, app/(tabs)/devices.tsx:309-313, services/automation/automationEngine.ts:17-23 all discard the value inside statement bodies, and TS allows `() => Promise<T>` where `() => void` is declared. There is no eslint config in the repo, so no `no-floating-promises` fallout. What does change on web: each overlay step now sits in 'running' for the real Tuya roundtrip (~1-2s) instead of a flat 150ms. Keep a per-step timeout (~8s) so a hung request degrades to a visible ❌ rather than a frozen overlay. Bonus: automationEngine.ts:17-23 should `await` the new promises so automations stop reporting completion before the devices moved.

Scope note for the parent report: this finding does not explain the user's symptom #3 ("Executando..." forever). This code path guarantees the overlay hides ~900ms after the loop (useArgos.ts:183-187). It explains the opposite failure — a silent, confident false success. Any real stuck-overlay behavior comes from an exception thrown inside `processIntent` under the catch-less fast-path, or from the awaits upstream at useArgos.ts:135 (`await speak(spoken)`) / :527-532 (`syncEwelinkDevices`/`syncTuyaDevices`, neither wrapped in a timeout), and should be filed separately.

### V2 — MANTIDO

Every line citation in the claim is literally accurate, and both conclusions ((c) and (d) ruled out) survive adversarial checking. But two of the stated REASONS are wrong or under-evidenced, and the fix's safety rests on a fact the claim did not establish.

CONFIRMED verbatim in A:\Argos\argos\app\_layout.tsx:
- :160 `const { isUpdateAvailable, isUpdatePending, isDownloading } = Updates.useUpdates();`
- :162-166 the effect body is exactly `if (isUpdateAvailable && !isDownloading) { Updates.fetchUpdateAsync().catch(() => {}); }` — download only, no bundle swap.
- :168-170 `restart` = `Updates.reloadAsync().catch(() => {})`, bound only at :182 `<TouchableOpacity style={updateStyles.row} onPress={restart} ...>`.
- :172 `if (!isDownloading && !isUpdatePending) return null;` — banner invisible during a normal toggle.
- Repo-wide grep for `reloadAsync` returns exactly one source hit, app/_layout.tsx:169 (the only other hits are the prebuilt web bundle under ./dist). No DevSettings, no other restart path anywhere in app/, components/, hooks/, stores/, services/.
- The claim also UNDERSELLS its own case: :241 is `{Platform.OS !== 'web' && <UpdateBanner />}`, so the banner is native-only.

CONFIRMED for Reanimated at the file level: grep for reanimated|useSharedValue|useAnimatedStyle|runOnJS|withTiming|withSpring|Animated over app/(tabs)/casa.tsx returns zero hits (not even RN's own Animated), and app/(tabs)/devices.tsx:4 is `import Animated, { FadeInDown } from 'react-native-reanimated'` used only as `entering={FadeInDown.delay(...)}` at :322,327,354,365.

CONFIRMED for hypothesis (a): no route file under app/ exports `ErrorBoundary`, and expo-router only wraps a route in `Try` when the module exports one (node_modules/expo-router/build/Route.js:128-142, useScreens.js:133). So a render throw below RootLayout does reach the inline boundary at app/_layout.tsx:17-42.

CONFIRMED the API in the fix: `export declare const isEnabled: boolean` at node_modules/expo-updates/build/Updates.d.ts:11 (expo-updates 29.0.19).

requiresNativeRebuild:false is right — the verdict is "no change needed," and the optional guard is pure JS.

Where the claim is wrong: (1) "expo-updates never auto-reloads" is false as written — there is a native auto-relaunch pipeline; it just cannot fire during a toggle, for a narrower reason. (2) The Reanimated evidence is scoped to two screen files, which is not enough to rule out Reanimated, because real worklets do exist elsewhere in the repo. Both details are corrected below; neither flips the conclusion.

**Correcao:** The verdict (do not spend an OTA cycle on UpdateBanner or Reanimated) stands. Three details in the reasoning need replacing.

1) "expo-updates never auto-reloads" is factually wrong. expo-updates 29.0.19 ships an automatic error-recovery relaunch that runs with no JS involvement:
- node_modules/expo-updates/android/src/main/java/expo/modules/updates/errorrecovery/ErrorRecoveryHandler.kt:42-47 defines the pipeline `[WAIT_FOR_REMOTE_UPDATE, LAUNCH_NEW_UPDATE, LAUNCH_CACHED_UPDATE, CRASH]`.
- ErrorRecovery.kt:118 installs itself as RN's `JSExceptionHandler`, so a fatal JS exception can trigger a native relaunch even though nothing in your JS calls `reloadAsync`.
The correct reason (c) is ruled out is time-boxed, not absolute: ErrorRecoveryHandler.kt:75-80 (`handleContentAppeared`) does `pipeline.retainAll(setOf(WAIT_FOR_REMOTE_UPDATE, CRASH))` — dropping both LAUNCH_* relaunch tasks the instant the first root view renders — and ErrorRecovery.kt:83 does `handler.postDelayed({ unregisterErrorHandler() }, 10000)`, removing the handler entirely 10s after content appeared. A user tapping a lamp switch is far outside that window, so no expo-updates relaunch is possible. Also note app.json's `updates` block sets only `url` (no `checkAutomatically`), so the default ON_LOAD check applies — and checking/downloading never swaps the running bundle; it applies on next cold start.

2) The Reanimated grep is too narrow to support the conclusion; it happens to be right anyway. Repo-wide there ARE real worklets, and Reanimated is 4.1.7 (not 3.x), which the claim never established:
- components/orb/OrbCore.tsx:160-233 — useSharedValue, withRepeat/withSequence/withTiming, useAnimatedStyle, interpolate.
- components/orb/OrbRings.tsx:19-35 — same, plus a template-string `rotate`.
- components/devices/DraggableDeviceList.tsx:15 — `LinearTransition` (a layout transition, the riskiest category).
- components/execution/ExecutionOverlay.tsx:3,15 — `SlideInDown.springify()`.
What actually rules (d) out is subtree + call-path analysis:
- casa.tsx's entire subtree is Reanimated-free. Its only first-party component imports are `@/components/ui/SubTabBar` and `@/components/ui/GlassCard` (casa.tsx:20-21), and neither file appears in the repo-wide react-native-reanimated grep.
- The lamp toggle at casa.tsx:177 is `onValueChange={() => { light(); if (isOnline) toggleDevice(device.id); }}` → useDeviceStore.toggleDevice. It never touches useArgos or AIStatus, so it cannot drive the orb worklets into a new state. (Only hooks/useArgos.ts:144 sets showExecutionOverlay, and casa's `useArgos` usage at :323 is `sendMessage` for a different flow.)
- The orb worklets at OrbCore.tsx:230-233 and OrbRings.tsx:33-35 contain only arithmetic, `interpolate`, and string interpolation — no runOnJS, no dereference of possibly-undefined values, nothing throwable.
- app/(tabs)/_layout.tsx:45,55 sets `detachInactiveScreens` and `lazy: true`, so the orb screen is detached while casa is foreground.

3) The hypothesis-(a) rebuttal needs two caveats to be honest:
- Colors.bg.primary is `#050810` (constants/colors.ts:3) — visually indistinguishable from black. The ONLY thing separating the boundary screen from "featureless black" is the white 18px "Argos — erro ao carregar" text. So "not a black screen" is true but thin; if the user glanced at it they could plausibly report it as black.
- React error boundaries do not catch throws from event handlers. A throw inside the Switch's `onValueChange` (casa.tsx:177) or inside toggleDevice would bypass app/_layout.tsx:17-42 completely and hit the native exception handler. (a) is therefore ruled out only for *render* throws, which is how the claim scoped it — but that scoping must be stated explicitly, or the elimination reads as broader than it is.

4) On the proposed `if (Updates.isEnabled)` hardening: the API exists (Updates.d.ts:11) and it is web-safe — but not for the reason a reader would assume. app/_layout.tsx is NOT shared with web: A:\Argos\argos\app\_layout.web.tsx exists as a separate 81-line root layout that never imports expo-updates and never renders UpdateBanner. A side effect worth knowing: every `Platform.OS === 'web'` branch inside app/_layout.tsx is dead code (useMicWarmUp :100, useSwUpdateReload :113 incl. the `window.location.reload()` at :116, useOAuthTabResume :129, rootStyle :57). The guard is cosmetic — `isEnabled` is true in a release APK, so it changes nothing in production and only quiets dev clients. Agreed: not worth an OTA cycle.

5) More productive lead for the black screen than either ruled-out hypothesis (out of scope for this claim, but the evidence surfaced while verifying it): app/(tabs)/_layout.tsx:45 enables `detachInactiveScreens` with react-native-screens 4.16.0 on RN 0.81.5, and native never calls `enableScreens(false)` (only app/_layout.web.tsx:10 does, for web). casa.tsx additionally mounts four RN `Modal`s (:214, :495, :534). Android `Modal` interacting with screen detachment is a well-known blank-surface mechanism and fits "app not closed, everything dark" far better than a worklet fault or an update reload.

### V3 — MANTIDO

Every cited line is exact. A:/Argos/argos/hooks/useArgos.ts:450 `if (processingRef.current) return;`, :452-453 `const currentStatus = useAIStore.getState().status; if (currentStatus === 'executing') return;`, :455 `processingRef.current = true;`, and the only two resets at :496 and :629 — all verbatim. Both early returns are bare `return;` with no addMessage/toast, so the "silently dropped, no user feedback" part is confirmed. A:/Argos/argos/stores/useAIStore.ts:52 is indeed `setStatus: (status) => set({ status })` with no timestamp and no watchdog, and I found no watchdog anywhere else in the app (no AppState listener, no timer-based reset; the only setStatus('idle') calls are inline in useArgos.ts/useVoice.ts/useVoice.web.ts). The latch mechanism is real and I found concrete never-settling awaits (see correction). requiresNativeRebuild:false is correct — every change is in hooks/ and stores/, no native module surface touched, and useArgos.ts has no .web variant so one edit covers both platforms. The claim is directionally right but several load-bearing details are wrong (which status value actually latches, which platform is hardest hit, the scope of processingRef) and the proposed 20s threshold would introduce a duplicate-execution bug — details in correction.

**Correcao:** CONFIRMED VERBATIM
- hooks/useArgos.ts:450, :452-453, :455, :496, :629 all match the claim exactly. useAIStore.ts:52 setStatus is a plain setter, no timestamp, no watchdog. No watchdog exists anywhere in the app.
- requiresNativeRebuild: false is correct.

CORRECTION 1 — 'executing' is the least likely value to latch; the real offenders are 'speaking' and 'thinking'.
The device_control branch cannot hang: useArgos.ts:137 sets 'executing', the loop only awaits a 150ms timer, toggleDevice/updateDeviceState (stores/useDeviceStore.ts:108-162 and :164+) are synchronous with fire-and-forget `.catch()` promises, and :183-187 unconditionally schedules `setShowExecutionOverlay(false); clearExecutionSteps(); setStatus('idle')` after 900ms. So 'executing' self-heals.
What actually never settles:
- services/voice/textToSpeech.ts:25-39 returns `new Promise((resolve) => ...)` resolved ONLY by Speech.speak's `onDone`/`onError`. If the Android TTS engine drops the utterance (very plausible while the mic/foreground service holds audio focus) neither fires and the promise never settles. `speak()` sets status 'speaking' at useArgos.ts:123 before awaiting it, and is awaited at :135, :218, :391, :477 and :578 — so status latches at 'speaking', which the guard at :453 does not even check.
- useArgos.ts:527-532 `await syncEwelinkDevices()` / `await syncTuyaDevices()` are NOT wrapped in withTimeout (unlike createMessage at :546-555). They reach services/devices/tuyaService.ts:74/:89 fetches with no timeout, whose headers await services/auth/session.ts:4-9 getAccessToken → `supabase.auth.getUser()` (a network call, no timeout). RN fetch has no default timeout. A hang here latches status at 'thinking' (set at :501).
Consequence: a watchdog that only covers 'executing' would not fix the dominant failure. It must cover 'speaking' too.

CORRECTION 2 — native voice commands are NOT dropped by the :453 guard.
hooks/useVoice.ts:151 calls `setStatus('thinking')` before dispatching `onAutoSendRef.current?.(text)` at :171, so by the time sendMessage reads status at :452 it is 'thinking', not 'executing'. Native voice therefore passes the guard; only typed text (and the suggestion pills) get dropped by it. Also on native, tapping the orb sets 'listening' (useVoice.ts:109), which overwrites a stuck status — so "only killing the app recovers" is true for the processingRef half, not the status half.

CORRECTION 3 — the blast radius the claim misses is WEB, where it IS a hard lock.
hooks/useVoice.web.ts:100-103 aborts startListening when status is 'thinking' | 'executing' | 'speaking'; :199 requires `status === 'idle'` to start the wake detector; and the store subscription at :252-267 only restarts the detector when status becomes 'idle' (and tears it down on any non-idle). So a stuck non-idle status permanently kills both the web orb and the wake word — the orb becomes a dead button with no way to self-recover. The web PWA is the platform the claim never mentions and the one where this is unrecoverable.

CORRECTION 4 — processingRef is per-hook-instance, not global.
useArgos.ts:110 `useRef(false)`, and useArgos() is instantiated independently by app/(tabs)/index.tsx:39, chat.tsx:29, conversar.tsx:26, casa.tsx:323, agenda.tsx:37, automations.tsx:76, (modals)/memory.tsx:29, (modals)/create-automation.tsx:12. A latch kills only the screen where it happened (and resets on unmount). Still fatal in practice because the home/orb screen stays mounted in the tab navigator, but "blocks sendMessage" is not app-wide — unlike the status guard, which is global store state.

CORRECTION 5 — claim understates the reset gap: lines 456-503 are outside any try.
`pauseVoiceInput()` (:456), `addMessage` (:466), `matchFastDeviceCommand` (:470), `heavy()` (:472, :502) and `setStatus('thinking')` (:501) run with no enclosing try/finally, so a synchronous throw there latches processingRef with no reset at all — not just a hanging await. (Note pauseVoiceInput is a no-op on native: registerVoicePause is only called from useVoice.web.ts:328.)

CORRECTION 6 — the proposed 20s threshold is a bug.
createMessage is wrapped in `withTimeout(..., 60000)` at useArgos.ts:546-555, so 'thinking' can legitimately persist for ~60s plus the unbounded sync at :527-532. A 20s staleness cutoff would force status to 'idle' and admit a second sendMessage while the first is still in flight, producing duplicate assistant messages and, worse, duplicate device execution. Use one of: (a) ~75-90s for 'thinking', ~10s for 'executing'/'speaking'; or (b) keep a short cutoff but make the recovery idempotent by bumping a generation counter that the in-flight flow checks before writing status/messages. The "equivalently, set a setTimeout when entering 'executing'" variant is the weaker option — 'executing' already self-resets at :183-187, so it targets the wrong state.

CORRECTION 7 — status is not persisted.
useAIStore.ts:87 `partialize: (state) => ({ messages: state.messages })` persists only messages. Calling status "persisted-adjacent state" is misleading; it is exactly why an app restart clears the lock. Adding `statusSince` needs no migration for the same reason.

RECOMMENDED FIX (all JS-only, safe for web)
1. Bound the actual hangs with the existing helper at useArgos.ts:25-32: wrap `speak()` in withTimeout (~12s) and wrap the :527-532 sync awaits (~8s each). This removes the root cause rather than the symptom.
2. Make the whole sendMessage body (from :455) sit inside one try/finally so processingRef always resets, including on synchronous throws.
3. Add `statusSince: number` set inside setStatus, and in sendMessage treat 'executing'/'speaking' older than ~10s and 'thinking' older than ~75s as stale: setStatus('idle'), clearExecutionSteps(), setShowExecutionOverlay(false), then continue instead of returning. Pair it with a generation counter so the stalled flow cannot write back.
4. Extend the guard to check 'speaking' as well as 'executing' — otherwise the most common latch still slips through.
5. Give the early returns feedback (a short addMessage or haptic) instead of a bare `return;`.
This helps web rather than breaking it: forcing status back to 'idle' is exactly the transition useVoice.web.ts:252-267 subscribes to in order to restart the wake detector. Nothing here touches native modules, so OTA-deliverable.

### V4 — MANTIDO

STRUCTURAL ASSERTIONS: VERIFIED. hooks/useArgos.ts:137 `setStatus('executing')`, :143-144 `setExecutionSteps(steps)` + `setShowExecutionOverlay(true)`, :146-163 the unguarded action loop, :183-187 the lone `setTimeout(...,900)` reset — all exactly as cited. There is no try/catch/finally anywhere in the device_control branch. Grep across app/, components/, hooks/, services/, stores/ confirms `setShowExecutionOverlay(false)`/`clearExecutionSteps()` are called from exactly one place: useArgos.ts:184-185. No unmount cleanup. components/execution/ExecutionOverlay.tsx (37 lines total) has no close/dismiss affordance — it is a pure `showExecutionOverlay && executionSteps.length` render, same for the inline copies at app/(tabs)/index.tsx:150 and index.web.tsx:173. The fast-intent path IS `try{...}finally{processingRef.current=false}` with no catch (useArgos.ts:473-497) and confirmPendingAction IS a bare `await processIntent(req.intent)` (:426). hooks/useArgos.ts has no .web variant, so it is shared with web.

ROOT CAUSE: REFUTED. The asserted failure scenario ("Tuya toggle fails -> throw -> stranded overlay") cannot occur, because NOTHING between :144 and :187 is capable of throwing:
1. `toggleDevice` and `updateDeviceState` are SYNCHRONOUS zustand actions typed `=> void` (stores/useDeviceStore.ts:35-36, bodies at :108-162 and :164+). Every network call inside has an inline `.catch()` — Tuya specifically at :121-125 (`controlTuyaDevice(...).catch(err => {if (__DEV__) console.error('[Tuya] Falha ao controlar dispositivo:', err)})`) and :184-188. They are fire-and-forget, never awaited, and never propagate a rejection into processIntent's loop. A failing Tuya call is silently swallowed and the step is still marked 'success' at useArgos.ts:162.
2. `success()` cannot throw — hooks/useHaptic.ts:7-10 `run()` early-returns if haptics are disabled and otherwise does `fn().catch(() => {})`.
3. `await new Promise(r => setTimeout(r, 150))` (:150) never rejects; `updateExecutionStep`/`addMessage` are plain zustand `set` calls (stores/useAIStore.ts:54-75).
So the 900ms reset at :183-187 is reached on every reachable execution. The claim's "the AI path degrades differently... overlay still stays on screen forever" is unreachable for the same reason.

Two further inaccuracies: (a) :137/:144 are NOT "entered unconditionally" — `await speak(spoken)` at :135 precedes them, so a throw or hang there means the overlay is never shown at all; (b) "permanently" overstates it — useAIStore's `partialize` persists only `messages` (stores/useAIStore.ts:87), so status/overlay reset on app restart.

ACTUAL CAUSE of "Executando... forever" (bug 3), found while verifying: services/voice/textToSpeech.ts:25-39 returns a Promise settled ONLY by expo-speech's `onDone`/`onError` — no timeout, no fallback. When the Android TTS engine drops the utterance (no pt-BR voice, engine not ready), it never settles. In the AUTOMATION branch that strands `status='executing'` set at :190 across `await speak(spoken)` at :218 before `setStatus('idle')` at :220 — which is literally what renders "Executando..." forever (chat.tsx:60-61, conversar.tsx:58-59). In the device_control branch the same hang at :135 leaves `processingRef.current === true` forever (the finally at :495-497 never runs) and status='speaking', so the device is never toggled and every later command is dropped by the guards at :450 and :453. Neither is a missing-catch problem and neither is fixed by the proposed patch.

ACTUAL CAUSE of the black screen (bug 4): app/_layout.tsx:17-42 has an ErrorBoundary wrapping the whole app (:219-244) whose fallback renders `backgroundColor: Colors.bg.primary` with only `error.message` (:34-37, :44-54) and never resets — an exact match for "app not closed, but everything dark". A render-phase throw (e.g. the overlay/ExecutionStep/reanimated `entering` triggered by `updateExecutionStep(i,'running')` at :148) lands there. Render-phase throws are NOT catchable by a try/catch in processIntent, so the proposed fix cannot address bug 4.

FIX DEFECTS: (1) `updateExecutionStep(i, 'error')` in a catch wrapped around the whole body is a compile error — `i` is `let`-scoped to the `for` at :146 and out of scope. (2) Putting an unconditional `setShowExecutionOverlay(false); clearExecutionSteps(); setStatus('idle')` in a `finally` while "keeping the 900ms delay only for the success case" is self-contradictory: the finally runs synchronously before the 900ms timer fires, so it would hide the overlay instantly on success too — regressing the currently-working web UX in this shared file. (3) Per-action try/catch inside the loop is a no-op given (1) above. (4) The call-site list is incomplete/imprecise: casa.tsx:334, automations.tsx:90 and (modals)/create-automation.tsx:16 are `await sendMessage(...)` inside uncaught async handlers, not bare fire-and-forget; agenda.tsx:99,171 and automations.tsx:216 were missed.

requiresNativeRebuild: false is CORRECT — everything here is JS in hooks/useArgos.ts / services/voice/textToSpeech.ts, fully OTA-deliverable; no native module surface involved.

Verdict: keep as valid but downgrade from "root cause of bugs 3/4" to "defensive hardening / latent fragility", and fix the patch as described.

**Correcao:** DOWNGRADE THIS FROM ROOT CAUSE TO DEFENSIVE HARDENING. The structural defect is real and correctly located (hooks/useArgos.ts:137-187 has a single happy-path exit at :183-187; grep confirms no other code in the repo ever calls setShowExecutionOverlay(false)/clearExecutionSteps(); the fast-intent path at :473-497 is try/finally with no catch; confirmPendingAction at :426 is a bare await; components/execution/ExecutionOverlay.tsx has no dismiss). But the asserted failure trigger does not exist: stores/useDeviceStore.ts:35-36 types toggleDevice/updateDeviceState as synchronous `=> void`, and every transport call inside them carries an inline `.catch()` — Tuya at :121-125 and :184-188. A failed Tuya command is swallowed there and useArgos.ts:162 still marks the step 'success'. Combined with hooks/useHaptic.ts:7-10 (`fn().catch(() => {})`) and the fact that everything else in :144-187 is a zustand `set`, there is NO reachable throw between showing the overlay and resetting it. So it is not correct to say "any throw strands..." as an explanation for the reported symptoms — bugs 3 and 4 have different causes.

Also note :137/:144 are not entered unconditionally — `await speak(spoken)` at :135 runs first — and "permanently" is bounded by app restart, since useAIStore's partialize (stores/useAIStore.ts:87) persists only `messages`.

REAL CAUSE OF BUG 3 ("Executando..." forever / never completes): services/voice/textToSpeech.ts:25-39 returns `new Promise((resolve) => { ... onDone: resolve, onError: () => resolve() ... Speech.speak(spoken, options) })` — settled ONLY by an expo-speech callback, with no timeout and no fallback. When Android's TTS engine silently drops the utterance (missing pt-BR voice, engine not initialized, mic/audio focus contention right after pauseVoiceInput), neither callback fires and the promise never settles. Consequences: (a) in the automation branch, `setStatus('executing')` at :190 is stranded across the hung `await speak(spoken)` at :218 and never reaches `setStatus('idle')` at :220 — this is what actually renders "Executando..." forever at chat.tsx:60-61 and conversar.tsx:58-59; (b) in the device_control branch the hang at :135 happens before the overlay exists, so the device is never toggled at all and `processingRef.current` stays true forever (the finally at :495-497 never runs), after which the guards at :450 and :453 silently drop every subsequent command — the app goes permanently deaf. Note `speak()` early-returns at :116 when lastInputMode === 'text', which is exactly why this reproduces on voice input and not on typed input.
FIX FOR BUG 3: wrap the expo-speech promise in a hard timeout that resolves (do not reject) — e.g. race it against a duration-proportional deadline (~120ms/char, floor 3s, cap 15s) plus `Speech.stop()` on expiry, and guard against double-resolve. Apply the same non-hanging discipline to the whole `speak()` chain in useArgos.ts:112-127. JS-only, OTA-safe. Do this in services/voice/textToSpeech.ts (native-only file — textToSpeech.web.ts is separate, so web is untouched).

REAL CAUSE OF BUG 4 (black screen): app/_layout.tsx:17-42 defines an app-wide ErrorBoundary (mounted at :219-244) whose fallback renders `<View style={errorStyles.container}>` with `backgroundColor: Colors.bg.primary` and only `{this.state.error.message}` (:34-37, :44-54), and it never resets. Any render-phase throw during the overlay update — `updateExecutionStep(i,'running')` at :148 re-renders ExecutionOverlay/ExecutionStep with a reanimated `entering` animation — drops the user into that near-black fallback with the app still running. This is a RENDER-phase error: a try/catch in processIntent cannot intercept it, so the proposed patch does not fix bug 4. Fix separately: make the ErrorBoundary fallback visible and recoverable (show a "Tentar de novo" button that clears `state.error`, plus the stack in __DEV__), and audit ExecutionStep/GlassCard/the `enter.slide` helper for a throw on `status: 'error'` or an empty/undefined label.

CORRECTED PATCH FOR THE ORIGINAL FINDING (worth doing as hardening, not as the bug fix):
1. Hoist the loop index so the catch can reference it: `let currentStep = -1;` before the `for`, assign `currentStep = i` at the top of the body.
2. Wrap :146-181 in try/catch. In the catch: `if (currentStep >= 0) updateExecutionStep(currentStep, 'error');` and add a real assistant `type: 'error'` message so the failure is visible instead of silent.
3. Do NOT put an unconditional reset in a `finally` — it runs synchronously before the 900ms timer and would make the overlay flash-and-vanish on success, regressing the currently-working web UX (hooks/useArgos.ts is shared; there is no useArgos.web.ts). Instead keep the existing `setTimeout(...,900)` reset for the success path and add an immediate `setShowExecutionOverlay(false); clearExecutionSteps(); setStatus('idle');` on the error path only — or gate a single `finally` on a `let settled = false` flag the success path sets.
4. Skip the per-action try/catch — it is dead code, since toggleDevice/updateDeviceState cannot throw. If the goal is genuinely "one failing device does not abort the rest" AND "the user learns it failed", the change belongs in stores/useDeviceStore.ts: surface the swallowed `.catch()` results (:114-160, :171-209) back to the caller instead of only `console.error`ing under __DEV__, then have processIntent mark that step 'error'.
5. Keep the recommended `.catch()` on the fast-intent path (:473-497) and in confirmPendingAction (:426), and the mount-scoped unmount cleanup `useEffect(() => () => { clearExecutionSteps(); setShowExecutionOverlay(false); }, [])`. Both are cheap and correct. Also add a watchdog that force-clears the overlay if it has been visible for more than ~15s.
6. Additionally clear `processingRef.current` and reset a stuck `status` on app foreground/AppState change, so a hung run cannot leave the app permanently deaf.

requiresNativeRebuild: false is correct — all of the above is JavaScript in hooks/useArgos.ts, services/voice/textToSpeech.ts and app/_layout.tsx, deliverable via OTA with no native module changes.

### V5 — MANTIDO

Every code citation in the claim is literally accurate, and I empirically confirmed the persist mechanism. VERIFIED AS STATED: (1) A:\Argos\argos\app\(tabs)\devices.tsx:70-82 does read `device.capabilities.some/find` (5x) and `device.state.brightness/.speed/.swing/.angle/.mode` (5x, no `?.`) unconditionally in the DeviceCard component body — nothing gates them. (2) A:\Argos\argos\app\(tabs)\casa.tsx:189 is bare `device.capabilities.length > 0` while its sibling :194 is guarded `device.state?.[cap.property]`. (3) A:\Argos\argos\types\device.types.ts:31-32 declares both fields required, so TS gives no warning about the rehydrated `any`. (4) partialize at useDeviceStore.ts:644-657 persists the full `devices` array; zustand's default merge at node_modules\zustand\middleware.js:337-340 is exactly `({...currentState, ...persistedState})`, and `set(stateFromStorage, true)` (middleware.js:421) replaces state — nothing validates the Device shape. (5) All 7 sync mappers (useDeviceStore.ts:289-290, 319-336, 372-389, 420-437, 468-489, 531-543, 604-615) and all 8 MOCK_DEVICES (constants/devices.ts) do set both fields. (6) The ErrorBoundary at app\_layout.tsx:17-42 renders literally 'Argos — erro ao carregar' and wraps everything (:219-244). (7) I ran zustand 5.0.13 directly with a storage payload containing a device lacking `capabilities`: hydration installed it verbatim and `.some()` threw `TypeError: Cannot read properties of undefined (reading 'some')`. (8) requiresNativeRebuild:false is correct — pure JS in shared .ts/.tsx, no native module touched. (9) The proposed merge typechecks clean under `strict` against zustand 5's real `PersistOptions.merge` signature (I compiled it; spreading `any` yields `any`, which is assignable to S), and it contains no platform-specific API, so the web build is unaffected. WHERE IT DOES NOT HOLD UP (details, not direction): the reachability and severity arguments are overstated, the primary file anchor is a dead route, and a live call site was missed — see correction. Because the claim explicitly labels itself latent and its code/mechanism assertions all hold, I score it directionally valid with corrections rather than refuted.

**Correcao:** CORRECTIONS TO THE CLAIM

1. The FILE anchor (app/(tabs)/devices.tsx) is a DEAD ROUTE. app\(tabs)\_layout.tsx:91 registers it as `<Tabs.Screen name="devices" options={{ href: null }} />` (hidden from the tab bar) with `lazy: true` (:57), and a repo-wide grep found ZERO in-app navigations to it. It can only be reached by typing /devices in the PWA or via deep link. The 10 unguarded reads there are real but effectively unreachable; the live surface is casa.tsx:189 only.

2. "Permanently unusable until storage is cleared" is wrong for the live site. casa.tsx:189 sits behind `{expanded && (...)}` (casa.tsx:186), so it only throws when the user taps a card open. After the ErrorBoundary trips, a reload renders Casa fine again — the list itself never touches `capabilities`. It is a crash-on-expand, not a permanent lockout.

3. "Interrupted write ... yields a device without capabilities" is FALSE. A truncated payload is invalid JSON, so `JSON.parse` throws inside `createJSONStorage.getItem` (middleware.js:288-300), which is swallowed by the hydrate `.catch` at middleware.js:435 — persisted state is discarded entirely and MOCK_DEVICES survive. Same for a version bump without `migrate` (middleware.js:394-406 logs and falls through to `[false, undefined]`). The only genuine paths are a future schema change or a `migrate` that emits partial devices.

4. "On the PWA this is already reachable from stale localStorage" is NOT DEMONSTRATED. No code path in the repo has ever produced a Device without `capabilities`/`state`: all 7 mappers set both, MOCK_DEVICES set both, and `updateDevice`/`toggleDevice`/`updateDeviceState` only spread (useDeviceStore.ts:105, 111, 168). `useSupabaseSync` touches memories only, never devices. So this is defensive hardening against future schema drift, not a live bug. (The directory is not a git repo, so I could not check whether an older shipped build had a different Device shape.)

5. MISSED LIVE CALL SITE, and it is not a render path: services\ai\fastIntent.ts:34 `d.capabilities.some((c) => c.property === 'brightness')` — bare. It is fed `useDeviceStore.getState().devices` from hooks\useArgos.ts:470, which is OUTSIDE any try/catch (the `try` only starts at :473). A throw there escapes `sendMessage` with `processingRef.current` still true (set at :455) and status never reset — i.e. a stuck assistant, not an ErrorBoundary screen. Any normalization fix must cover this; add it to fix (b).

6. Fix (a) is incomplete in one respect: it spreads `persisted` wholesale, so `customNames`/`customOrder` are still un-normalized, and devices.tsx:308 / casa.tsx read `customNames[device.id]` directly. Coerce them too: `customNames: persisted?.customNames && typeof persisted.customNames === 'object' ? persisted.customNames : current.customNames` (same for customOrder).

7. The `pct` NaN side note should not be labelled "cosmetic". casa.tsx:64 does produce NaN when min === max (only Xiaomi can, since it takes min/max from the API at useDeviceStore.ts:471; all other mappers hardcode 1..100 or 10..100), but I did not verify that React Native's Yoga/Fabric dimension parser tolerates the string 'NaN%' — unparsable percentage strings can hard-throw on native. Treat as unverified.

MUCH BIGGER ADJACENT FINDING the claim's premise walks past — this is almost certainly the parent's real bugs #3 and #4:

useDeviceStore.ts:641-643 uses `createJSONStorage(() => typeof localStorage !== 'undefined' ? localStorage : ({} as Storage))`. On native `localStorage` is undefined (no polyfill in dependencies), so `getStorage()` returns `{}` — which is TRUTHY, so persist does NOT take its "storage unavailable" bail-out branch at middleware.js:348-359. Every other store in the project correctly uses `createJSONStorage(() => AsyncStorage)` (useSettingsStore.ts:74, useAIStore.ts:86, useMemoryStore.ts:211, useAutomationStore.ts:49); useDeviceStore is the lone exception.

Consequence, which I confirmed by running zustand 5.0.13 with `createJSONStorage(() => ({}))`: hydration fails silently (as the claim says), BUT ALSO **every single `set()` throws synchronously** — `TypeError: storage.setItem is not a function` — because the config `set` wrapper is `(...args) => { set(...args); return setItem(); }` (middleware.js:372-376) and `setItem()` (:360-366) is not wrapped in try/catch. State updates first, then it throws. My test output: `set() THREW: TypeError - storage.setItem is not a function` with state already mutated.

That means on the native APK today, `toggleDevice`, `updateDeviceState`, `renameDevice` and `setDeviceOrder` ALL throw after mutating. Trace for the reported symptoms:
- hooks\useArgos.ts:129-163 `processIntent` sets status 'executing' (:137) and opens the overlay (:144), then calls `toggleDevice`/`updateDeviceState` at :152-160 with NO try/catch. The throw aborts the loop before `updateExecutionStep(i,'success')` (:162) and before the `setTimeout` that closes the overlay and returns to idle (:183-187) => "Executando..." forever, exactly demand #3.
- The rejection then propagates out of `await processIntent(fastIntent)` (useArgos.ts:493), whose only handling is `finally { processingRef.current = false }` (:495-497) => unhandled rejection / uncaught error in a touch handler (casa.tsx:177 `onValueChange`) => plausible cause of demand #4, the all-dark screen. Note the ErrorBoundary cannot catch this class of error (it is not thrown during render), which fits "app not closed, but everything dark".

So the ordering is: fix the storage (`createJSONStorage(() => AsyncStorage)`) to stop the throw-on-every-set, and land the claim's `merge` normalization in the SAME edit, since the storage fix is precisely what makes the rehydration path live. Both are JS-only; AsyncStorage is already a linked dependency (`@react-native-async-storage/async-storage` in package.json) and already used by four other stores, so no EAS rebuild is required. One behavioural note for the parent: AsyncStorage.getItem returns a Promise, so on native hydration becomes async — the first render shows MOCK_DEVICES and is then replaced, which is fine but changes first-paint timing versus web's synchronous localStorage.

### V6 — MANTIDO

CONFIRMED — the cited code, the asserted zustand behavior, and the primary consequence all check out; I reproduced the throw empirically against the project's own zustand build. Details verified:

1. CITED CODE IS EXACT. A:/Argos/argos/stores/useDeviceStore.ts:641-643 reads `storage: createJSONStorage(() => typeof localStorage !== 'undefined' ? localStorage : ({} as Storage))`. Store name 'argos-connections' (line 640), partialize at 644-657.

2. NO localStorage ON NATIVE — verified, not assumed. `grep -rln "globalThis.localStorage=|global.localStorage=|localStorage:"` across all of node_modules returns only two TYPE files (@types/node/web-globals/storage.d.ts, typescript/lib/lib.dom.d.ts) — zero runtime polyfills. node_modules/react-native/Libraries/Core/ has no localStorage reference at all; setUpXHR.js:21-41 polyfills XHR/FormData/fetch/Blob/File/FileReader/URL/AbortController but not Storage. Nothing in expo/src, expo/build, expo-modules-core/src either. The codebase itself already knows this: hooks/useArgos.ts:363 guards with `Platform.OS === 'web' && typeof localStorage !== 'undefined'` before touching it, and stores/useDeviceStore.ts:642 is the ONLY localStorage reference in stores/ — useAIStore.ts:86, useSettingsStore.ts:74, useMemoryStore.ts:211, useAutomationStore.ts:49 all use `createJSONStorage(() => AsyncStorage)`.

3. ZUSTAND MECHANISM IS EXACTLY AS ASSERTED (zustand 5.0.13, verified in package.json). middleware.js:280-306 `createJSONStorage` only try/catches `getStorage()` itself (282-286), which does not throw here, so it returns a live persistStorage whose setItem (line 302) calls `storage.setItem` on `{}`. Because a storage object IS returned, the graceful-degradation branch at middleware.js:348-358 (which would only console.warn) is never taken. middleware.js:372-376 wraps the config `set` as `(...args) => { set(...args); return setItem(); }`, and setItem (360-366) calls `storage.setItem(...)` → synchronous TypeError thrown out of the action AFTER in-memory state was applied.

4. EMPIRICAL REPRO REPRODUCED against A:/Argos/argos/node_modules/zustand with a toggleDevice-shaped action:
   - storage = {} → `TypeError: storage.setItem is not a function`; in-memory `[{"id":"tuya:1","isOn":true}]`; **tuya HTTP issued: false**; hydrate error: `storage.getItem is not a function`
   - AsyncStorage-shaped async storage → no throw, tuya HTTP issued: true, blob persisted
   - sync localStorage-shaped → no throw, tuya HTTP issued: true
   So the line after `set(...)` is genuinely unreachable on native.

5. PRIMARY CONSEQUENCE CONFIRMED: useDeviceStore.ts:166 `set(...)` throws before :184 `controlTuyaDevice(device.tuyaDeviceId, stateKey, value, currentColor)`; :110 throws before :121 `controlTuyaDevice(device.tuyaDeviceId, 'isOn', !device.isOn)`. The Tuya HTTP request is never issued. This is a real, load-bearing root cause.

6. ALL CITED LINE NUMBERS ARE ACCURATE: useArgos.ts:153/155/157 (toggleDevice/updateDeviceState in the for-loop), :162 updateExecutionStep(i,'success'), :183-187 cleanup; casa.tsx:177 `onValueChange={() => { light(); if (isOnline) toggleDevice(device.id); }}`; devices.tsx:309 `onToggle={() => { light(); toggleDevice(device.id); }}`; OrbCore.tsx:137 and chat.tsx:61 render 'Executando...'; index.tsx:150-153 overlay block. (ExecutionOverlay.tsx:17 is the title Text; the guard is :12 — trivial.)

7. FIX IS SOUND. AsyncStorage 2.2.0 is in package.json:17, its Android native module is present (node_modules/@react-native-async-storage/async-storage/android/), and it is already imported by 4 stores in the same JS bundle — so the native module is already linked in the shipped APK. createJSONStorage handles Promise-returning getItem (middleware.js:296-300). requiresNativeRebuild:false is CORRECT; this is pure-JS, OTA-deployable.

Corrections needed on three secondary points (see correction field): the "status frozen forever" consequence only holds on one of two code paths; "every single mutation throws out of the store" is overstated for the sync* actions; and the black-screen attribution plus two details of the fix snippet are wrong.

**Correcao:** The root cause and the fix are right. Four corrections:

(A) "status frozen at 'executing' forever" holds on ONE path only — but that IS the reported path. hooks/useArgos.ts has two entry paths into processIntent:
  - FAST path (useArgos.ts:470-499): `try { ... await processIntent(fastIntent) } finally { processingRef.current = false }` — line 473 try, line 493 call, line 495 `finally` with NO `catch`. The TypeError escapes processMessage entirely → status stays 'executing', step stays 'running', overlay stays pinned. This matches the report exactly. And it is the path a lamp command takes: services/ai/fastIntent.ts:84-129 `matchFastDeviceCommand` matches any ≤10-word phrase containing an ON/OFF/TOGGLE word plus a device name, so "liga a lâmpada" never reaches the AI.
  - AI path (useArgos.ts:504-630): `catch (err)` at :596 sets status 'error', posts an error bubble, and `setTimeout(() => setStatus('idle'), 2500)` at :615. So on this path status is NOT frozen — the user would see an error message. However :596-627 never calls `setShowExecutionOverlay(false)`, so the execution overlay stays pinned forever on BOTH paths. Reword the consequence as: overlay pinned forever on both paths; "Executando..." frozen specifically on the fast-intent path.

(B) "Every single mutation of this store throws on native (… all sync* setters)" is overstated. The six sync* actions wrap their whole body in try/catch, so the TypeError is swallowed there, not propagated. Verified in syncTuyaDevices (useDeviceStore.ts:305-349): `set(...)` at the end throws, the bare `catch { return { count: 0 } }` eats it, and `return { count: mapped.length }` is skipped — so on native the integrations screen reports 0 Tuya devices even though the devices DO appear in the list (in-memory state was applied before the throw). Same shape in syncEwelinkDevices, syncWizDevices, syncTapoDevices, syncXiaomiDevices, syncAlexaDevices. Only the synchronous actions (toggleDevice:108, updateDeviceState:164, updateDevice:103, renameDevice, setDeviceOrder:94) let the TypeError escape to the caller. Add a second confirmed symptom: hydration also throws (`storage.getItem is not a function`, swallowed by zustand's toThenable at middleware.js:307-331/435-440), so on the APK nothing has EVER persisted — every restart loses connections, customNames and customOrder and falls back to MOCK_DEVICES.

(C) The black-screen attribution is not supported and should be dropped or downgraded to "plausible, unproven". There IS an ErrorBoundary (app/_layout.tsx:17-42, wrapping the tree at :219/:244), but its fallback renders visible text ("Argos — erro ao carregar" plus error.message) on Colors.bg.primary — a caught error yields a message screen, not a blank black one. And React does not route errors thrown from a Switch `onValueChange` handler to error boundaries anyway (they are not render/commit-phase); they go to RN's ExceptionsManager global handler, which in a release build reports a fatal JS exception. A JS fatal leaving the Activity up with a dark empty root is plausible, but it is not the "boundary unmounts to black" mechanism the claim asserts. Treat the black screen as a separate open item.

(D) Two fix-snippet errors:
  1. `Platform` is NOT imported in stores/useDeviceStore.ts (imports are lines 1-11: zustand, types, constants, six device services — no `react-native` import). The proposed `Platform.OS === 'web'` would be a ReferenceError. Either add `import { Platform } from 'react-native';` or drop Platform entirely: `storage: createJSONStorage(() => (typeof localStorage !== 'undefined' ? localStorage : AsyncStorage))` — the existing ternary already discriminates correctly, only the fallback is wrong.
  2. The stated rationale for keeping the localStorage branch on web ("avoids the one-time cache-key move on the PWA") is wrong. async-storage's web build (node_modules/@react-native-async-storage/async-storage/lib/module/AsyncStorage.js:57-70) calls `window.localStorage.getItem/setItem(key)` with the RAW key, no prefix — unconditional AsyncStorage would read the exact same 'argos-connections' entry, so there is no key move and no data loss. The real reason to keep the sync branch on web is hydration TIMING: with sync localStorage, `hydrate()` completes synchronously inside create() and persistImpl returns `stateFromStorage` (middleware.js:471-474), so the PWA's first render already has the persisted devices; switching web to AsyncStorage makes hydration async, so the first paint would briefly show MOCK_DEVICES and then flip. Keep the web branch — but for that reason.

Recommended hardening alongside the one-line fix (both pure JS, OTA-safe): wrap the fast-intent path at useArgos.ts:473-497 in a real `catch` that calls setShowExecutionOverlay(false)/clearExecutionSteps()/setStatus('error'), and add `setShowExecutionOverlay(false); clearExecutionSteps();` to the AI-path catch at :596 — otherwise any future throw inside processIntent re-freezes the overlay. Note also that this fix only guarantees `controlTuyaDevice` is actually CALLED; whether the /api/tuya?action=control round-trip then succeeds is a separate question that this analysis does not settle.

### V7 — MANTIDO

VERIFIED — the primary defect is real, and every load-bearing code citation checks out. I tried hard to refute it and could only find mis-citations in the intermediate crash trace, not in the defect or the fix.

CONFIRMED IN SOURCE:

1. A:\Argos\argos\stores\useDeviceStore.ts:641-643 reads exactly:
   `storage: createJSONStorage(() =>`
   `  typeof localStorage !== 'undefined' ? localStorage : ({} as Storage)`
   `),`
   Imported at :2 from 'zustand/middleware'. Confirmed verbatim.

2. No localStorage on native. Grepped the whole repo (excluding node_modules): the only other localStorage use is hooks/useArgos.ts:363, correctly guarded with `Platform.OS === 'web' &&`. Grepped node_modules/react-native/Libraries (incl. Core/setUpGlobals.js) and node_modules/expo/src + /build for any `global.localStorage =` / `globalThis.localStorage =` / string "localStorage" — ZERO hits. I specifically checked the SDK 54 "winter" polyfill dir (node_modules/expo/src/winter/: FormData, TextDecoder, TextDecoderStream, url, fetch, ImportMetaRegistry) — no localStorage. So on Hermes the ternary takes the `{} as Storage` branch.

3. zustand 5.0.13 behavior — verified in BOTH builds (node_modules/zustand/middleware.js:280-306 and node_modules/zustand/esm/middleware.mjs:278-306, identical):
   - createJSONStorage try/catches ONLY `getStorage()`; returning `{}` succeeds, so a truthy persistStorage is returned.
   - `setItem: (name, newValue) => storage.setItem(name, JSON.stringify(...))` — called against the bare `{}`.
   - Because storage is truthy, the graceful `if (!storage)` degradation path with the '[zustand persist middleware] ... storage is currently unavailable' warn (middleware.js:348-358) is NEVER taken.
   - `const configResult = config((...args) => { set(...args); return setItem(); }, get, api)` (middleware.js:372-379 / mjs:370-377) — NO try/catch. Also `api.setState` is wrapped the same way.
   - So every sync mutation updates state and THEN throws `TypeError: storage.setItem is not a function`. Confirmed.
   - Hydration failure IS swallowed: `toThenable(storage.getItem.bind(storage))(...)` (middleware.js:307-331) catches the TypeError and the chain terminates in `.catch` at :435 → app boots fine, first mutation is the trigger. Confirmed.

4. Call sites all verbatim at the cited lines: app/(tabs)/casa.tsx:177 `onValueChange={() => { light(); if (isOnline) toggleDevice(device.id); }}`; app/(tabs)/devices.tsx:309 `onToggle={() => { light(); toggleDevice(device.id); }}`; useDeviceStore.ts:108-162 toggleDevice with the throwing `set` at :110-112 strictly BEFORE `controlTuyaDevice(...)` at :121 (and :166 before :184) — so the Tuya HTTP call is genuinely never issued; casa.tsx:222 and :236 both call `updateDevice` (the prediction holds).

5. "Executando… forever" confirmed: hooks/useArgos.ts:146 `updateExecutionStep(i,'running')`, :153 `toggleDevice(action.deviceId)`, :162 `updateExecutionStep(i,'success')`, cleanup at :183-187. A Tuya on/off phrase takes the FAST path at :493 `await processIntent(fastIntent)`, wrapped in `try { … } finally { processingRef.current = false }` with NO catch → rejected promise, `setShowExecutionOverlay(false)` never runs → the "Executando ações" overlay (app/(tabs)/index.tsx:150 / components/execution/ExecutionOverlay.tsx:12, driven by useAIStore.showExecutionOverlay) is stuck forever. The AI path at :594 does have a catch (:596-628) but it also never clears showExecutionOverlay, so the overlay hangs there too. Both match the symptom.

6. Copy/paste-slip proof exact: useSettingsStore.ts:74, useAIStore.ts:86, useMemoryStore.ts:211, useAutomationStore.ts:49 all `createJSONStorage(() => AsyncStorage)`. useDeviceStore is the sole outlier. Confirmed.

7. lastSeen: only written at constants/devices.ts:13,30, declared at types/device.types.ts:35, read NOWHERE. No Date-rehydration hazard. Confirmed.

8. requiresNativeRebuild: false — CORRECT. package.json has @react-native-async-storage/async-storage 2.2.0; node_modules/.../async-storage/android exists (autolinked); four stores already import it at module scope, so the TurboModule is definitively in the shipped APK. Fix is pure JS → OTA-safe.

9. Web safety — CORRECT. node_modules/@react-native-async-storage/async-storage/lib/module/AsyncStorage.js uses `window.localStorage.getItem/setItem/removeItem(key)` with the RAW, unprefixed key, so `argos-connections` round-trips byte-identically. Zero migration.

WHAT I COULD NOT REFUTE but had to re-derive (see correction): the black-screen mechanism. The claim's conclusion (uncaught event-handler throw → treated as FATAL → bridgeless tears the surface down → Activity shows only the #050810 window background) is CORRECT and I traced it end-to-end in the shipped native sources — but the specific files it cites (MessageQueue.js __guard, ExceptionsManager.js's global.RN$handleException) are the legacy-bridge path and are NOT what executes under bridgeless. The real path is different and, if anything, stronger.

Also verified: app.json has no `newArchEnabled:false` in expo-build-properties (only enableJetifier / enableProguardInReleaseBuilds), so SDK 54 bridgeless is on; RN 0.81.5, React 19.1.0, expo 54.0.34. app.json:9/14/40 all set backgroundColor "#050810". app/_layout.tsx:17-41 ErrorBoundary uses only getDerivedStateFromError/componentDidCatch — structurally cannot catch an event-handler throw. casa.tsx and devices.tsx have no .web variants, so they are the native screens.

**Correcao:** The defect, the file, the line, and the fix are all correct. Four corrections/additions:

(A) THE CRASH TRACE IS MIS-CITED (conclusion right, path wrong). MessageQueue.js:364-374 `__guard`/`ErrorUtils.reportFatalError` and ExceptionsManager's `global.RN$handleException` are the LEGACY BRIDGE path; under bridgeless they are not in the event path at all. The actual, verified path is:

  1. RN's Switch calls `onValueChange` from its internal `onChange` listener, dispatched by the Fabric renderer: node_modules/react-native/Libraries/Renderer/implementations/ReactFabric-prod.js:10270 `registerEventHandler && registerEventHandler(dispatchEvent)`.
  2. ReactFabric-prod.js:299-306 `executeDispatch` catches the listener throw into `caughtError`, then `dispatchEvent` RE-THROWS it at ReactFabric-prod.js:1567 (`if (hasError) throw ...`), inside `batchedUpdates$1` whose `finally` lets it escape. So it leaves JS entirely.
  3. node_modules/react-native/ReactCommon/react/runtime/ReactInstance.cpp:85-90 — the RuntimeExecutor wraps every JS callback in `catch (jsi::JSError& originalError) { jsErrorHandler->handleError(jsiRuntime, originalError, /*isFatal=*/true); }`. isFatal is hardcoded TRUE.
  4. ReactAndroid/.../runtime/ReactInstance.kt:274-288 `ReactJsExceptionHandlerImpl.reportJsException` → `ExceptionsManagerModule.reportException`.
  5. ReactAndroid/.../modules/core/ExceptionsManagerModule.kt:47-56: `if (isFatal) { throw JavascriptException(...) }` — unconditionally, in release too.
  6. That throw is caught by ReactInstance.kt:285-287 → `queueThreadExceptionHandler.handleException(e)`, which is the lambda installed at ReactHostImpl.kt:925 `{ e: Exception -> this.handleHostException(e) }`.
  7. ReactHostImpl.kt:661-671 `handleHostException`: release → `reactHostDelegate.handleInstanceException(e)` then `destroy(method, e)`.
  8. node_modules/expo/android/src/main/java/expo/modules/ExpoReactHostFactory.kt:64-73: rethrows (= process crash) ONLY if `reactNativeHostHandlers` is empty. expo-updates registers one (node_modules/expo-updates/android/.../UpdatesPackage.kt:47-48), so it does NOT rethrow → the process survives and `destroy()` tears down the ReactInstance and all surfaces → the Activity is left showing only its window background, #050810. Exactly "app not closed, but everything dark".
  9. BONUS confirmation the dark screen is PERMANENT: expo-updates ErrorRecovery.kt:83 does `handler.postDelayed({ unregisterErrorHandler() }, 10000)` after CONTENT_APPEARED, and ErrorRecovery.kt:138-139 sets `shouldHandleReactInstanceException = false`. Any crash more than ~10s after launch (i.e. the user tapping a switch) gets NO relaunch and NO rollback — just log + destroy. No auto-recovery, must force-kill.

(B) Small mis-citation inside the user-verifiable prediction: RENAME does not go through `updateDevice` (useDeviceStore.ts:103-106). devices.tsx:310 `onRename` → `renameDevice`, which is useDeviceStore.ts:87-90 — also an unguarded `set`, so the prediction still holds, just cite :88 for rename and :104 only for 'Mover cômodo' (casa.tsx:222/:236, which is exact). `setDeviceOrder` (:94-101, drag-to-reorder) is a third unguarded sync setter with the same fate.

(C) AsyncStorage web line numbers are slightly off: getItem/setItem/removeItem are at lib/module/AsyncStorage.js ~:56-71 (not 59-71). Immaterial — the unprefixed-raw-key claim is correct.

(D) ONE REAL BEHAVIORAL SIDE EFFECT OF THE FIX ON WEB, not mentioned in the claim: today on web `localStorage.getItem` returns a STRING synchronously, so zustand's `toThenable` runs the entire hydrate chain SYNCHRONOUSLY inside `create()` — the very first render already sees persisted devices/flags. AsyncStorage's web `getItem` always returns a Promise (lib/module/AsyncStorage.js:56-58 `createPromise(...)`), so after the fix web hydration becomes asynchronous: one tick where `devices === MOCK_DEVICES` and `tuyaConnected === false`. I checked every consumer of those flags (app/(modals)/integracoes.tsx:81-87/351-490, app/(tabs)/settings.tsx:129-135/558-722, hooks/useArgos.ts:108/527/530) — all are render-time or callback-time reads with no mount-time destructive branch, and the four sibling stores already hydrate async on web, so this is at worst a one-frame flash. Accept it, or if you want literally zero web delta, keep web synchronous:

  storage: createJSONStorage(() =>
    Platform.OS === 'web' && typeof localStorage !== 'undefined' ? localStorage : safeStorage
  ),

(E) Fix is necessary but not quite sufficient for demand #3's fragility. Once the storage throw is gone, hooks/useArgos.ts:146-187 completes and reaches :183-187, so "Executando… forever" resolves. But the overlay cleanup still lives only on the happy path — hooks/useArgos.ts:493 is `try { await processIntent(...) } finally { processingRef.current = false }` with no catch, and the catch at :596 never touches `showExecutionOverlay`. Add `setShowExecutionOverlay(false); clearExecutionSteps();` to both the :495 finally and the :596 catch so any future throw inside processIntent can never re-hang the overlay. Also worth noting: after the fix, `devices` starts persisting on native for the first time, so stale/offline device rows will now be restored at launch before the first sync — same as existing web behavior, and `partialize` (useDeviceStore.ts:644-657) already excludes nothing problematic.

### V8 — MANTIDO

Every load-bearing citation checks out, and the API behavior is stronger than claimed.

CONFIRMED — cited code says what is claimed:
- A:/Argos/argos/services/devices/tuyaService.ts — six `fetch` calls at exactly lines 29, 41, 52, 62, 74, 89. None passes `signal`; there is no AbortController, no timeout, no wrapper. Every one of them evaluates `await authHeaders()` (line 31/43/52/64/74/91) inside the init object, so `getAccessToken()` runs before the socket is even opened.
- A:/Argos/argos/services/auth/session.ts:4-18 — `getAccessToken()` does `getSession()` → `getUser()` → `refreshSession()` with no timeout on any of them.
- A:/Argos/argos/hooks/useArgos.ts:527-532 — `if (ewelinkConnected) await syncEwelinkDevices();` / `if (tuyaConnected) await syncTuyaDevices();`, bare awaits. The `withTimeout` helper does exist at :25-32 and is used ONLY for the Anthropic call at :546-555 (60000ms). Both awaits sit inside the `try` at :504 whose `finally { processingRef.current = false }` is at :628-630 — an infinite hang means neither `catch` (:596) nor `finally` ever runs, `status` stays `'thinking'`, and the guard at :450 (`if (processingRef.current) return`) rejects every subsequent message forever. Permanent dead app, correctly described.
- node_modules/react-native/ReactAndroid/.../OkHttpClientProvider.kt:48-58 — literally `// No timeouts by default` then `.connectTimeout(0)/.readTimeout(0)/.writeTimeout(0)` at :52-54. Exact match.

The API claim is actually understated — I found two more layers confirming truly infinite:
- node_modules/react-native/Libraries/Network/XMLHttpRequest.js:152 `timeout: number = 0;` and whatwg-fetch 3.6.20 never sets `xhr.timeout`.
- NetworkingModule.kt:239 `/** @param timeout value of 0 results in no timeout */` and :329-330 only applies `callTimeout` when `timeout != client.callTimeoutMillis()`. So no connect, read, write, OR call timeout. Nothing bounds the request.

Fix feasibility CONFIRMED:
- AbortController is polyfilled in JS: react-native/Libraries/Core/setUpXHR.js:38-43 lazy-requires `abort-controller/dist/abort-controller`, and node_modules/abort-controller is present.
- whatwg-fetch 3.6.20 honors it: dist/fetch.umd.js:626-632 wires `request.signal.addEventListener('abort', abortXhr)`.
- XMLHttpRequest.js:656-659 `abort()` → `RCTNetworking.abortRequest`, and NetworkingModule.kt:666 `override fun abortRequest(...)` is already compiled into the APK. So abort genuinely cancels, OTA-only.

requiresNativeRebuild: false is CORRECT. Nothing here touches a native module; the polyfill and the abort bridge method already ship in the APK.

Web safety CONFIRMED: there is no tuyaService.web.ts and no useArgos.web.ts (only useArgos.ts in hooks/, only the 7 plain .ts files in services/devices/), so both files are shared with the PWA — but AbortController/`signal` is native in browsers, so the fix is safe unguarded.

No existing helper to reuse: grepping services/devices for `AbortController|signal|timeout` returns ZERO matches across all seven services; the only AbortController uses in the whole repo are customCapture.web.ts:63 and wakeWordDetector.web.ts:61.

I could not refute the mechanism. What I did refute is the symptom mapping and two fix details — see correction.

**Correcao:** The mechanism is real and severe, but four details are wrong and the fix is incomplete.

1. IT DOES NOT EXPLAIN SYMPTOM #3 ("Executando..." forever). "Executando..." renders only for `status === 'executing'` (components/orb/OrbCore.tsx:137, app/(tabs)/chat.tsx:61, app/(tabs)/conversar.tsx:59). In the execute path, `controlTuyaDevice` is fire-and-forget — never awaited (stores/useDeviceStore.ts:121 and :184) — and the overlay + status are released by an UNCONDITIONAL `setTimeout(..., 900)` at hooks/useArgos.ts:183-187. So a hanging control POST cannot freeze that label. What this bug actually produces is "Pensando..." forever (OrbCore.tsx:136) plus the permanent `processingRef` latch. Re-label the finding accordingly; the "Executando... forever" symptom needs a separate root cause (look at `speak()`/textToSpeech and the pre-`setStatus('executing')` await at useArgos.ts:135).

2. "the same code cannot hang on the PWA" is FALSE. hooks/useArgos.ts and services/devices/tuyaService.ts have no .web variants — the identical un-timed awaits run on web. Browsers also impose no default fetch timeout; they merely give up on a stalled socket eventually (~OS/Chrome network timeout) instead of never. The difference is permanence, not existence. Drop the "browser can't hang" framing.

3. "up to three un-timed Supabase network round-trips" overstates it. In auth-js 2.107.0 the default path is lockless (GoTrueClient.js:171-173) and `getSession()` (GoTrueClient.js:2289-2302) is a local storage read via `_useSession` unless the token is expired. It is up to TWO network round-trips (`getUser`, `refreshSession`). Still un-timed: grepping auth-js for `AbortController|signal:` in GoTrueClient.js returns nothing, and services/auth/supabase.ts:8-16 passes no custom `fetch`, so those calls ride the same 0-timeout OkHttp stack.

4. THE FIX AS WRITTEN LEAVES THE BIGGEST HOLE OPEN. `fetchWithTimeout` cannot help the `getAccessToken()` stall, because `await authHeaders()` is evaluated BEFORE `fetch` is ever called (tuyaService.ts:31/43/52/64/74/91) — the AbortController is created after the code has already blocked. And "wrap getAccessToken with the same guard" is not implementable with AbortController: supabase-js 2.107 auth methods accept no `signal`. Use a `Promise.race` timeout there instead, e.g. in services/auth/session.ts:
   `const withDeadline = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<T>((_, rj) => setTimeout(() => rj(new Error('auth timeout')), ms))]);`
   wrapping each of the three `supabase.auth.*` calls (~5s each). The orphaned socket stays open but the JS flow unblocks, which is what matters.

5. ADDITIONS THE FIX MUST INCLUDE:
   a. app/(tabs)/_layout.tsx:29-42 runs `syncAll()` — including `syncTuyaDevices()` at :34 — on a `setInterval(syncAll, 10_000)` with NO in-flight guard. With 0-timeout sockets this stacks a new hung request every 10s indefinitely. Add an in-flight/`isSyncing` ref guard here; this is the real amplifier and the claim omits it.
   b. All seven services in services/devices/ (ewelink, alexa, wiz, wizLocalBridge, tapo, xiaomi, tuya) have zero timeout handling — put `fetchWithTimeout` in a shared module (e.g. services/net/fetchWithTimeout.ts) and use it everywhere, not just tuyaService.
   c. At useArgos.ts:527-532 the proposed `withTimeout(..., 4000).catch(() => {})` is right, and the `.catch(() => {})` is MANDATORY — without it the rejection is caught by the outer `catch` at :596 and surfaces a spurious error message + possible `handleSessionExpired()` at :625. Note also that `withTimeout` at :25-32 never clears its `setTimeout`, so it keeps a timer alive per call (harmless, but worth cleaning up if you touch it).
   d. A 10s abort on the control POST will surface a false "Falha ao controlar dispositivo" when Tuya is merely slow — acceptable, and it is actually the desired outcome, because the abort makes the `.catch`/`.finally` at useDeviceStore.ts:122-125 and :185-188 run, so the `delay(1200).then(syncTuyaDevices)` state re-read finally happens instead of being deferred forever. Suggest ~10s for control, ~6s for the device list.

### V9 — MANTIDO

Every cited line was verified against the actual files, and the asserted native mechanism was traced end-to-end through react-native's C++/JS sources. Nothing in the claim's structural argument could be refuted; two details in the evidence and the proposed fix are wrong/incomplete and are corrected below.

WHAT CHECKS OUT

1. A:\Argos\argos\app\_layout.tsx:17-42 — `class ErrorBoundary extends React.Component` with `static getDerivedStateFromError` (:23) and `componentDidCatch` (:27). No `export`. Used inline at :219 / closed at :244. Confirmed verbatim.
2. Repo-wide grep for `getDerivedStateFromError|componentDidCatch|ErrorBoundary` across app/, components/, hooks/, services/, stores/ hits ONLY app/_layout.tsx (lines 17, 23, 27, 28, 219, 244). No route module exports an `ErrorBoundary` symbol. Confirmed.
3. A:\Argos\argos\node_modules\expo-router\build\useScreens.js:128 `function fromImport(value, { ErrorBoundary, ...component })`, :133 `if (ErrorBoundary) {`, :139 `return <Try_1.Try catch={ErrorBoundary}>{children}</Try_1.Try>;`. The per-route Try wrapper is applied only when the route MODULE exports `ErrorBoundary`. Confirmed exactly as asserted. (And `Try` is itself only a render-phase boundary, so even exporting it would not catch handler throws — the claim is right for two independent reasons.)
4. Versions: react 19.1.0, react-native 0.81.5, expo-router 6.0.23, zustand 5.0.13. React does not route event-handler or unawaited-async throws to error boundaries. Correct.
5. Call sites verified line-exact: casa.tsx:145 renameDevice (inside handleRename), :177 `onValueChange={() => { light(); if (isOnline) toggleDevice(device.id); }}`, :195 `onUpdate={(key, val) => updateDeviceState(...)}`, :222 and :236 updateDevice inside onPress, :438 updateDevice inside onDelete; devices.tsx:309 onToggle, :311/:312/:313 updateDeviceState. services/automation/automationEngine.ts:17-23 is exactly the toggleDevice/updateDeviceState block. hooks/useArgos.ts:146-163 is exactly the action loop, with the overlay opened at :144 and only cleared in a setTimeout after the loop.
6. The premise that those store actions throw on native is CONFIRMED at the source: stores/useDeviceStore.ts:641-643 `storage: createJSONStorage(() => typeof localStorage !== 'undefined' ? localStorage : ({} as Storage))`. There is no localStorage polyfill anywhere in react-native/Libraries, expo, or @supabase, so on native getStorage() returns `{}`. zustand's createJSONStorage (node_modules/zustand/esm/middleware.mjs) only bails out when getStorage() *throws* — it doesn't validate the object — so persist receives a storage whose `setItem` does `{}.setItem(...)`. Both the config `set` wrapper and `api.setState` are `(...args) => { set(...args); return setItem(); }`, so EVERY `set()` in this store raises an uncaught TypeError after the state update lands. useDeviceStore is the only store with this pattern; useAIStore.ts:86, useAutomationStore.ts:49, useMemoryStore.ts:211, useSettingsStore.ts:74 all use `createJSONStorage(() => AsyncStorage)`.
7. The asserted API and the black-screen path both verified in native sources: `global.ErrorUtils` with `setGlobalHandler`/`getGlobalHandler` exists (node_modules/@react-native/js-polyfills/error-guard.js:36-42). RN installs its default handler at Libraries/Core/setUpErrorHandling.js:33, gated on `global.RN$useAlwaysAvailableJSErrorHandling !== true`; that flag's default is **false** (ReactCommon/react/featureflags/ReactNativeFeatureFlagsDefaults.h:230), so the ErrorUtils path is live and overridable. A throw escaping an event handler is caught in C++ at ReactCommon/react/renderer/runtimescheduler/RuntimeScheduler_Modern.cpp:382-387 → `onTaskError_` → RuntimeScheduler.cpp:46-49 `handleJSError(runtime, error, /*isFatal*/ true)` → ReactCommon/cxxreact/ErrorUtils.h:44 `ErrorUtils.reportFatalError(error)`. So the fix's interception point is real, isFatal really is true, and not re-reporting genuinely prevents Libraries/Core/ExceptionsManager.js:126-132 `NativeExceptionsManager.reportException(...)` — the native fatal report that tears down the surface (matches "everything dark, app not closed").
8. No recursion hazard from `console.error` inside the handler: ExceptionsManager.js:279 patches console.error, but reactConsoleErrorHandler routes through `global.RN$handleException`, which returns `false` early when the flag is off and the runtime is ready (ReactCommon/react/runtime/ReactInstance.cpp:494-499), then reports a NON-fatal. It never re-enters the ErrorUtils global handler.
9. requiresNativeRebuild: false is CORRECT. `global.ErrorUtils` is a JS polyfill already in the bundle; AsyncStorage 2.2.0 is already a dependency and already linked (four stores use it); everything proposed is pure JS.

WHAT IS WRONG (details, not direction) — see correction.

**Correcao:** Claim stands, but four things need fixing before shipping it.

(1) "async throws" is NOT covered by the proposed global handler — and that is precisely the stuck-"Executando..." path. In RN 0.81, unhandled promise rejections never reach `ErrorUtils`: they go to `rejectionTrackingOptions.onUnhandled` (A:\Argos\argos\node_modules\react-native\Libraries\promiseRejectionTrackingOptions.js:44-62), which is LogBox in `__DEV__` and a plain `console.warn` in release. `hooks/useArgos.ts:493` does `await processIntent(fastIntent)` inside a `try { } finally { processingRef.current = false }` with no `catch`, so the store TypeError becomes a rejected promise, not a fatal — no black screen there, just the overlay stuck (opened at useArgos.ts:144, cleared only in the `setTimeout` after the loop) and `status` pinned to `'executing'`, which is what renders "Executando..." at components/orb/OrbCore.tsx:137 and app/(tabs)/chat.tsx:61 / conversar.tsx:59. So the global handler fixes symptom 4 (sync handler throw from casa.tsx:177 / devices.tsx:309 → fatal → black screen) but NOT symptom 3. Part (3) of the fix (try/finally around useArgos.ts:146-163) is the one that matters there and must not be treated as optional. Retitle: the global handler defends against event-handler throws only.

(2) Fix part (2) treats the symptom and is incomplete. The actual root cause is one line: stores/useDeviceStore.ts:641-643. Change it to match the other four stores:
    storage: createJSONStorage(() => AsyncStorage)
(import AsyncStorage from '@react-native-async-storage/async-storage'). This is web-safe with zero migration: AsyncStorage's web build writes directly to `window.localStorage` under the unmodified key (node_modules/@react-native-async-storage/async-storage/lib/module/AsyncStorage.js:64-66), so `argos-connections` keeps the same key and the same JSON payload the web app already persists. zustand handles the now-Promise-returning getItem (`if (str instanceof Promise) return str.then(parse)`).
    Wrapping only the two hot actions leaves the same TypeError live in `setWizLocalBridgeUrl` (useDeviceStore.ts:561-563), `clearWizLocalDevices` (:631-637), and the two unguarded `set` calls in `syncWizLocalDevices` (:592, :623) — the first two are called straight from handlers, so the black screen would survive the proposed patch. Keep the try/catch wrappers if you want belt-and-braces, but fix :641 or the bug stays.

(3) The `Platform.OS !== 'web'` guard in part (1) is genuinely load-bearing, not decorative — keep it. `app/_layout.tsx` is shadowed as a ROUTE by `app/_layout.web.tsx` on web, but it is still in the web bundle: expo-router's `node_modules/expo-router/_ctx.web.js` require.context regex matches plain `.tsx` files, and the shipped `dist/_expo/static/js/web/entry-*.js` contains the `Argos ErrorBoundary` and `Argos — erro ao carregar` strings. Module-scope side effects in that file can therefore execute on web. With the guard (and the optional chaining) the change is inert on web. Related: note that `app/_layout.web.tsx` has NO error boundary at all, so "the sole ErrorBoundary" is native-only — web has zero.

(4) Do not swallow fatals unconditionally. `if (!isFatal) prev?.(e, isFatal)` kills the LogBox red box for every fatal, which on an OTA-only app is the main debugging surface, and it leaves React running after a possibly half-committed update. Prefer: always log, always call `prev` when `__DEV__`, swallow only in release, and flip a module-level flag that renders a visible "algo deu errado — recarregar" recovery view (with `Updates.reloadAsync()`) instead of leaving the user on a silently-degraded screen.

### V10 — MANTIDO

CORE DEFECT CONFIRMED, but the asserted symptom ("Executando..." forever via the automation branch) is REFUTED, and two of the three asserted mechanisms are wrong.

VERIFIED AGAINST SOURCE:
1. A:/Argos/argos/services/voice/textToSpeech.ts:25-39 — `return new Promise((resolve) => { ... onDone: resolve, onError: () => resolve() ... Speech.speak(spoken, options) })`. No `onStopped`, no timer, nothing races it. `Speech.stop()` is at line 18 (claim said :16 — minor drift).
2. onStopped exists and is dispatched: node_modules/expo-speech/build/Speech.types.d.ts:38 declares `onStopped?`; build/Speech.js:49-56 handles `Exponent.speakingStopped` by calling `options.onStopped` (if any) and then `delete _CALLBACKS[id]` — so a stopped utterance with no onStopped handler is permanently un-resolvable. Android emits it from UtteranceProgressListener.onStop (android/src/main/java/expo/modules/speech/SpeechModule.kt:164-166). Version confirmed 14.0.8.
3. Additional never-resolve paths (stronger than the claim's, all in vendor code): (a) if TTS init returns != SUCCESS, the utterance sits in `delayedUtterances` forever and no event is ever emitted (SpeechModule.kt:67-74 + 139-180); (b) `ExponentSpeech.speak(...)` is an AsyncFunction whose promise is discarded fire-and-forget in Speech.js:78, so `SpeechInputIsToLongException` for text > getMaxSpeechInputLength (SpeechModule.kt:63-65) never surfaces and the JS promise hangs; (c) the int return of `textToSpeech.speak(...)` is ignored (SpeechModule.kt:126-131), so an ERROR return yields no callback at all. So "no timeout" is a genuine hang risk independent of onStopped.
4. Downstream consequence confirmed: `await textToSpeech` at hooks/useArgos.ts:124, `await speak(...)` at :135/218/238/271/284/305/319/345/378/391/477/512/578/603. A hang means the `finally` blocks at :495-497 and :628-630 never run, so `processingRef` stays true and every later call is dropped at :450. (Scope nuance: `processingRef` is a per-hook-instance useRef and 8 components each call useArgos — app/(tabs)/index.tsx:39, chat.tsx:29, conversar.tsx:26, casa.tsx:323, automations.tsx:76, agenda.tsx:37, (modals)/create-automation.tsx:12, memory.tsx:29 — so the latch blocks the screen that issued the command, not literally the whole app; the only global latch is the store-level `status === 'executing'` check at :453.)
5. requiresNativeRebuild:false is CORRECT. textToSpeech.ts is native-only because services/voice/textToSpeech.web.ts shadows it (metro.config.js is the stock Expo config, platform extensions apply), expo-speech ~14.0.8 is already a dependency (package.json:32) and already imported, and the fix is a JS callback + a JS timer. hooks/useArgos.ts IS shared with web (no useArgos.web.ts), so edits there do reach the PWA.

REFUTED — the claimed symptom and two mechanisms:
A. "the order is setStatus('executing') at :190 BEFORE await speak(...) at :218, so it displays 'Executando...' forever" is FALSE. `speak` itself calls `setStatus('speaking')` at useArgos.ts:123 immediately before awaiting textToSpeech at :124. Any hang inside TTS therefore strands status at 'speaking' -> components/orb/OrbCore.tsx:138 renders "Falando...", never "Executando..." (OrbCore.tsx:137). The setStatus('executing') at :190 is always superseded before the awaited TTS call, so the proposed reordering is cosmetic and fixes nothing.
B. This claim also cannot explain user symptom #3 (Tuya lamp -> "Executando..." forever): that is the device_control branch, where speak is awaited at :135 BEFORE 'executing' is set at :137, and stores/useDeviceStore.ts:108-126 / :164-189 show toggleDevice/updateDeviceState are synchronous fire-and-forget (`controlTuyaDevice(...).catch(...).finally(...)`), so Tuya latency cannot stall the loop and the 900ms setTimeout at :183-187 always clears overlay+status.
C. "calls Speech.stop() immediately before Speech.speak(), so an in-flight utterance's promise is orphaned" is only theoretically reachable: stop() is separated from speak() by `await getVoices()` (:20), textToSpeech is imported only by useArgos.ts, speak calls are serialized by await, and `stopSpeaking()` has zero callers anywhere in app code. So onStopped is hardening; the timeout is the part that actually fixes the hang.
D. "pauseVoiceInput()/waitForMicRelease() hand the mic/audio focus around" is factually wrong but the real situation is worse: registerVoicePause is called ONLY in hooks/useVoice.web.ts:328 — native hooks/useVoice.ts never registers it — so services/voice/voiceSession.ts:14-16 makes pauseVoiceInput() a NO-OP on native and nothing releases the mic before TTS, while backgroundWakeWord.native.ts:53-62ff keeps an expo-av Recording running in a while loop. Whether that produces a silent hang or an onError (which resolves) is unverified speculation.

Net: a real, OTA-fixable never-resolving-promise bug with a wrong symptom attribution and a partly wrong fix.

**Correcao:** Keep the finding, restate it as: "services/voice/textToSpeech.ts:25-39 can hang forever (no onStopped, no timeout), stranding status at 'speaking' and latching processingRef so the screen accepts no further commands." Do NOT attribute the Tuya "Executando..." symptom to it, and drop the :190 reordering.

Corrected facts to carry over:
- Stuck status is 'speaking' ("Falando..." at components/orb/OrbCore.tsx:138), because hooks/useArgos.ts:123 sets 'speaking' before awaiting TTS at :124. The setStatus('executing') at :190 is irrelevant to the hang.
- The dominant hang triggers are NOT the self-inflicted Speech.stop() (no overlapping callers: textToSpeech is imported only by useArgos.ts and stopSpeaking() has no callers). They are: TTS engine init failure parking the utterance in delayedUtterances with no event ever (SpeechModule.kt:67-74, 139-180); the swallowed rejection of the AsyncFunction in Speech.js:78 (e.g. text longer than Speech.maxSpeechInputLength -> SpeechModule.kt:63-65); and the ignored ERROR return of textToSpeech.speak (SpeechModule.kt:126). So the TIMEOUT is the load-bearing part of the fix; onStopped is correct hardening (verified at Speech.types.d.ts:38, Speech.js:49-56, SpeechModule.kt:164-166).
- Fix in services/voice/textToSpeech.ts only (native-only file — textToSpeech.web.ts shadows it, so the PWA is untouched). Implement inside the existing promise, not as an outer Promise.race, so the timer can be cleared:
  const settle = (() => { let done = false; return () => { if (done) return; done = true; clearTimeout(t); resolve(); }; })();
  options: { ...same..., onDone: settle, onError: settle, onStopped: settle }
  wrap `Speech.speak(...)` in try/catch and call settle() in catch (it can throw synchronously if the native module is missing), and truncate `spoken` to Speech.maxSpeechInputLength - 1 before speaking.
- Do NOT use `Math.min(20000, 3000 + spoken.length * 90)`: that caps any utterance over ~190 chars, and typical Argos replies (200-600 chars) take 15-45s to speak, so the race would resolve mid-speech, flip status to idle and let the always-on wake-word recorder hear Argos's own voice. Use the web file's word-based estimate (services/voice/textToSpeech.web.ts:10-14: max(3000, words/(150*rate)*60000 + 1500)) with a ~60s ceiling.
- In hooks/useArgos.ts (shared with web) the only worthwhile change is defensive: `await speak(...).catch(() => {})` at the 14 call sites, or better, wrap the body of `speak` (:112-127) in try/catch so a TTS failure can never skip the finally blocks at :495-497 / :628-630. Leave :190 alone.
- Two adjacent JS-only facts found while verifying, worth folding in: (1) `setLastInputMode` is never called anywhere (defined at stores/useAIStore.ts:82, default 'voice' at :81), so the guard at useArgos.ts:116 never short-circuits and TTS runs for typed input too — this hang sits on the critical path of every command; (2) native never calls registerVoicePause (only hooks/useVoice.web.ts:328), so pauseVoiceInput() at useArgos.ts:119 is a no-op on Android and the background wake-word Recording loop keeps the mic open during TTS — registering a native pause is a separate JS-only fix.
- requiresNativeRebuild: false is correct.

### V11 — MANTIDO

The core mechanism is CONFIRMED line-by-line, but three of the claim's asserted consequences are factually wrong (two wrong file citations, one consequence that is the exact opposite of what happens), and two of the three proposed fixes are wrong or non-compiling. Per the instruction to keep a directionally-correct claim and put the corrections in `correction`, stillValid:true.

CONFIRMED — the storage factory is broken on native:
- A:/Argos/argos/stores/useDeviceStore.ts:641-643 is exactly as quoted: `createJSONStorage(() => typeof localStorage !== 'undefined' ? localStorage : ({} as Storage))`.
- There is no `localStorage` global on native. Grepped node_modules/react-native/Libraries, node_modules/@react-native/js-polyfills, node_modules/expo/src, node_modules/@expo for `localStorage` and for `(global|globalThis|window).localStorage =` — zero hits (RN 0.81.5 / Expo ~54.0.33, package.json). No project-side polyfill either, and there is no stores/useDeviceStore.native.ts. So the ternary always yields `{}` in the APK.
- node_modules/zustand/middleware.js:280-306 (`createJSONStorage`) only try/catches `getStorage()` itself (:282-286); the returned `persistStorage.getItem` (:296) and `.setItem` (:302) call `storage.getItem`/`storage.setItem` unguarded → TypeError on every call.
- Corroboration that this is a one-off mistake, not intentional: all four sibling stores use `createJSONStorage(() => AsyncStorage)` — useAIStore.ts:86, useAutomationStore.ts:49, useMemoryStore.ts:211, useSettingsStore.ts:74. useDeviceStore is the only outlier.

CONFIRMED — `set` throws after applying state, and syncTuyaDevices always returns count 0:
- middleware.js:372-379 wraps the store's `set` as `set(...args); return setItem();`, and `setItem` (:360-366) calls `storage.setItem(...)` with no try. So in-memory state IS applied, then the wrapped `set` throws.
- useDeviceStore.ts:342-345 (`set`), :346 (`return { count: mapped.length }`), :347-349 (`catch { return { count: 0 } }`) match the claim exactly. `return {count: mapped.length}` is unreachable on native. Stronger than claimed: the `!connected` branch's `set({tuyaConnected:false})` at :309 also throws, so even the early `return {count:0}` at :310 is unreachable — control always lands in the bare catch.

CONFIRMED — hydration failure is silently swallowed:
- middleware.js:392 does `toThenable(storage.getItem.bind(storage))(options.name)`; the inner call throws, `toThenable` (:307-330) converts it to an error-thenable whose `.then` returns itself, so the chain skips to `.catch` at :435-440. No `onRehydrateStorage` is passed in useDeviceStore.ts:639-658, so `postRehydrationCallback` is `undefined` (:391) and the error is fully discarded. `set(stateFromStorage, true)` at :423 never runs; `hydrate()` is invoked unguarded at :471-473 but cannot throw. So the store boots at initial state (MOCK_DEVICES, all `*Connected: false`) on every launch, and nothing was ever written anyway.

CONFIRMED — requiresNativeRebuild: false. @react-native-async-storage/async-storage 2.2.0 is in node_modules (with android/) and is already imported by four stores in the shipped bundle, so the native module is already linked into the APK. The fix is pure JS/OTA.

**Correcao:** The mechanism holds; these details in the claim are wrong and the fix needs rework.

1. TWO OF THE THREE "connect screens report no devices" CITATIONS ARE WRONG. `app/(modals)/integracoes.tsx:176` and `:184`, and `app/(tabs)/settings.tsx:276` and `:287`, are bare `await syncTuyaDevices();` — the return value is discarded. They never read `.count`. The only reader of `syncTuyaDevices().count` in the whole repo is `app/integrations/tuya/callback.tsx:31-38` (verified with a repo-wide grep for `.count`). The other `.count` readers — integracoes.tsx:241-243 and settings.tsx:339-342 — call `syncWizLocalDevices`, a different action with NO wrapping try/catch (useDeviceStore.ts:565-629): its `set` at :623 throws, so the caller lands in its own `catch` (integracoes.tsx:245) showing "Erro ao procurar: storage.setItem is not a function", not "count 0". Worse and unmentioned: `setWizLocalBridgeUrl(wizBridgeUrl)` at integracoes.tsx:238 sits OUTSIDE that try and throws synchronously (useDeviceStore.ts:562), so `handleScanWizLocal` dies before line 240 and `finally { setScanningWizLocal(false) }` never runs — the "Descobrir" button spins forever.

2. THE useArgos CONSEQUENCE IS BACKWARDS, AND THE REAL ONE IS MUCH WORSE. The claim says the executor "marks it ✅ with no device touched". It does the opposite. `toggleDevice` (useDeviceStore.ts:108-112) and `updateDeviceState` (:164-170) have unguarded `set` calls, so they THROW — including on the device-not-found path, since `set` at :166 runs regardless. In hooks/useArgos.ts:146-163 the throw happens at :153/:155/:157/:159, so `updateExecutionStep(i, 'success')` at :162 is NEVER reached; the rejection escapes `processIntent`, is awaited at :594 and caught at :596. Critically, `setShowExecutionOverlay(false)` and `clearExecutionSteps()` at :183-187 never run, and that overlay state lives in useAIStore (useAIStore.ts:66-75) whose persist DOES work — so the overlay stays mounted with the step frozen on "running". That is precisely user complaint #3 ("Executando..." forever), and it fires for EVERY device command from the AI, not just Tuya. Separately, `app/(tabs)/casa.tsx:177` (`onValueChange={() => { light(); if (isOnline) toggleDevice(device.id); }}`) and `app/(tabs)/devices.tsx:309-313` call these mutators directly from press handlers with no guard → uncaught TypeError inside a React event handler → fatal JS error / blank root view, which matches user complaint #4 (screen goes black when toggling a light). This finding is therefore a direct cause of two of the four reported bugs, which the claim does not connect.

3. "GUARD IS FALSE ON THE FIRST MESSAGE" IS OVERSTATED. `app/(tabs)/_layout.tsx:39` calls `syncAll()` immediately at mount, not only on the 10s tick (:40), and `set({ ...tuyaConnected: true })` at useDeviceStore.ts:344 DOES apply in memory before throwing. So `tuyaConnected` is normally true within one network round-trip of the tabs mounting — long before a voice command completes. It is a cold-start race window, not a systematic first-message failure. Also, the system prompt is built from `useDeviceStore.getState().devices` (useArgos.ts:539), i.e. the live in-memory list, so the AI never reads a persisted stale snapshot; and `devices` is in sendMessage's dep array (:636) while `devices` and `tuyaConnected` are written in the same `set()` call, so there is no stale-closure problem either.

4. FIX PART A (storage) is right but needs the concrete form and a web caveat. Use `createJSONStorage(() => AsyncStorage)` to match the other four stores. Web is safe: AsyncStorage's web implementation is a thin, UNPREFIXED wrapper over `window.localStorage` using the same key (node_modules/@react-native-async-storage/async-storage/src/AsyncStorage.ts:80-98, resolved via the package's `"react-native": "src/index.ts"` entry + Metro's `.native.ts` extension), so existing PWA users keep their `argos-connections` data. The one real behavior change on web: `getItem` becomes a Promise, so hydration turns async and there is a one-render flash of MOCK_DEVICES / `tuyaConnected:false` that does not exist today (useDeviceStore.ts has no .web variant, so it is shared). If that flash matters, platform-guard it: `storage: createJSONStorage(() => (Platform.OS === 'web' ? localStorage : AsyncStorage))`.

5. FIX PART B (the catch blocks) does not compile as written. Returning `{ count: 0, error: String(err) }` violates the declared `Promise<{ count: number }>` at useDeviceStore.ts:38-42 — object-literal excess-property checking applies to a contextually-typed return — so the interface must be widened in the same change. `if (!__DEV__) { /* surface */ }` is inverted relative to the codebase convention (`if (__DEV__) console.error(...)`, e.g. :116) and is a no-op. "All sync* actions" is imprecise: `syncEwelinkDevices` returns `Promise<void>` with a bare `catch {}` (:300-302), and `syncWizLocalDevices` (:565-629) has no wrapping try/catch at all.

6. FIX PART B is also missing the change that actually matters. The unguarded `set` call sites that crash the UI must be handled: toggleDevice (:110), updateDeviceState (:166), setWizLocalBridgeUrl (:562), renameDevice (:88), setDeviceOrder (:95), clearWizLocalDevices (:632). The robust version is to wrap the persist storage adapter itself so getItem/setItem/removeItem can never throw, so a storage failure can never again take down a React event handler or abort an execution loop.

7. FIX PART C is wrong. Replacing the `tuyaConnected` guard at useArgos.ts:530-532 with `devices.some(d => d.source === 'tuya')` does not fix the stated cold-start problem: at cold start `devices` is MOCK_DEVICES, which contains no `source === 'tuya'` entry, so the new condition is false in exactly the same window. Once storage is fixed, `tuyaConnected` hydrates from disk and is the strictly better signal. If a guaranteed pre-flight refresh is wanted, just always `await syncTuyaDevices()` — it early-returns cheaply when `!connected` (:308-311).

8. UNDERSTATED SCOPE. partialize (:644-657) also lists `customNames`, `customOrder`, `wizLocalBridgeUrl` and `wizLocalSavedDevices`, none of which persist on native either — so device renames, drag-and-drop order, and the WiZ bridge URL are lost on every APK launch, not just devices/tuyaConnected.

requiresNativeRebuild: false is CORRECT — AsyncStorage is already linked in the APK (imported by useAIStore.ts:3, useAutomationStore.ts:3, useMemoryStore.ts:3, useSettingsStore.ts:3), so this is OTA-shippable. Note react-native-mmkv is also in package.json and wired up at services/storage/mmkvStorage.ts, but do NOT reach for it here without verifying it is linked in the installed APK; AsyncStorage is provably already there.


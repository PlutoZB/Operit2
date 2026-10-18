# ToolPkg Compose runtime

The Rust SDK packages these JavaScript modules at build time. `sources.json` is the ordered
source manifest shared by `build.rs` and `tools/runtime/compose_scripts.mjs`. Runtime engines
receive the prepared context and execution scripts through the existing Rust builders;
page engines never read this directory or assemble a second runtime.

| Module | Responsibility |
| --- | --- |
| `Compiler.js`, `Parser.js` | Produce portable artifacts with hoisted UI templates; lazily initialize Acorn for legacy source. |
| `Generation.js` | Compare dynamic template values, retain current closures, and observe node mutations. |
| `Actions.js` | Own callback closures and action IDs, bind mounted occurrences, and release detached registrations. |
| `Retained.js` | Reconcile mounted nodes and emit ordered flat revisions. |
| `Reactive.js` | Track state dependencies and schedule only affected expressions. |
| `Nodes.js` | Normalize public UI properties, child slots, modifiers, and callback references. |
| `State.js` | Own keyed hooks and state-change subscriptions. |
| `Theme.js` | Validate host snapshots and deliver theme changes. |
| `WebView.js` | Own controller requests and accepted JavaScript-interface methods. |
| `Host.js` | Adapt required native environment, tool, package, navigation, and picker bindings. |
| `Context.js` | Assemble a single SDK context and preserve its stores for its session. |
| `Session.js` | Resolve entries and create or refresh the exact owning session. |
| `Dispatch.js` | Run actions, drain intermediate work, and retire listeners when ownership ends. |
| `Responses.js`, `Exports.js` | Deliver each revision through the owning response sink and publish host entry points. |

## Ownership rules

A context has one action registry. Generated nodes hold weak references to callback ownership,
so cached nodes can mount again after their old transport IDs have expired. A callback from
another context cannot be rebound just because its string ID happens to match. Generation
owns expression caching and mutation observation; it does not keep a second callback registry.

A screen must keep the original SDK context. Local modal drafts use distinct hook keys,
not cloned context objects. Generation rejects a copied context at the boundary.

A command owns its response sink and final revision. Intermediate delivery must finish before
the final response is built. Synchronous callbacks render once in their final response;
asynchronous callbacks can publish intermediate revisions. Work scheduled immediately before
an action settles is coalesced into its final evaluation. Pending asynchronous work still
streams without waiting for a host event or a Flutter frame. Unchanged intermediate trees
publish no update and allocate no revision; every successful command retains its final
completion response and contiguous published revisions. Node transport IDs are compact
session-owned handles; keyed occurrence matching and ancestor paths stay inside the runtime.
Host input updates render the current root and run its `onInputsChanged` callback in the same
command. The callback uses the normal action pipeline, including awaited asynchronous work,
intermediate revisions and errors; hosts do not send a second action command for it.
Detached asynchronous work may keep its listener only while the
host still owns its pending references. Render and state-flush failures propagate to that
command; detached failures report through its host sink. They do not become successful empty
responses.

## Compilation and reuse

The compiler hoists fixed UI argument structure into module-level factories. Each call passes
only its dynamic values; generation reuses the prior node until those values change. Opaque
objects retain detached, copy-on-change snapshots, so in-place mutations remain observable.
Callback cells replace their captured handler on each evaluation, including a reused template.
Property forms with observable enumeration or access semantics remain opaque. Argument spreads
use the existing expression path. Version 2 artifacts use templates; version 1 artifacts remain
executable without source recompilation.

A memo factory owns a generation region and a reactive execution unit. Skipping it retains
its node occurrences, state subscriptions, and effects; a sibling cannot borrow those occurrences
or callback cells. Removing the branch releases its subscriptions and effects, and remounting a
node-producing memo executes its factory again. Source replacement invalidates generated-node
memos while preserving ordinary keyed data memo identity.

`ctx.lazyItems` exposes list identity, count, extent and initial window size. Content invalidation
is engine-owned; plugins do not declare a second set of builder dependencies. SDK-created range
callbacks are recognized privately by the action registry, including generation trampolines. Their
final evaluation uses the existing dependency-drain path and reopens only viewport layout. Ordinary
callbacks (including no-render callbacks), observable state writes, host input changes, theme changes,
explicit renders and source replacement invalidate the content revision. This conservative boundary
also observes plain JS closures, mutable refs and in-place object changes without inventing an
immutability contract for arbitrary plugin objects. It does not implement Kotlin's full compiler
stability inference or promise to skip builders on unrelated business actions.

Each item owns a memo region identified by its absolute index: viewport overlap retains its nodes,
callbacks, subscriptions and effects; only entering items execute their builders. Count and extent
changes invalidate materialization as well. Leaving items are released by the existing generation
and reactive owners, keeping caches bounded by the window. No second node or callback registry is
involved. A wrapper that invokes a range callback while running business code is an ordinary action;
reusing a callback slot updates its private classification with its current closure. The character
sidebar keeps its stable action table current and memoizes validation of unchanged host snapshots.

Generation indexes a call site once and retains its occurrences in an array. A render pass counter
resets that site's occurrence index and trims removed loop entries without constructing a new
call-site/index string or maintaining a separate live-occurrence set for each node.

The embedded sliver reports an interval that already includes Flutter's cache extent. The DSL
adds only a small refill margin to that interval; a regular list viewport retains its own larger
prefetch window. Applying both buffers to the sliver would trigger an unnecessary initial range
action even when all cached rows were already available.

A host-owned, bounded cache shares compiled module bytecode across page runtimes. Each page
materializes its own factory and executes its own module initialization. Functions, globals,
module instances and callbacks stay in that page's heap. The cache keys exact source, includes
parameter names, retains at most 128 entries / 16 MiB, and never persists engine bytecode as a
portable plugin artifact. Compilation runs outside the shared LRU lock, so a cold page cannot
hold up another page's cached module. Concurrent misses can compile the same source, but the
insertion check retains one entry and charges its memory once. Module compilation errors
propagate without entering the cache.

## Validation

`tools/tests/compose_dsl*.test.mjs` exercise the assembled runtime and compiled artifacts.
Character-card native tests execute the packaged screen modules against the same runtime.
`operit-js-bridge` Compose tests run the Rust-assembled sources in QuickJS. Performance probes
also consume the manifest, so they measure the same module order as production.

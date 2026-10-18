import { composeContextScript } from "../runtime/compose_scripts.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

/** Uses the actual SDK occurrence graph and mutation observer, not a transport mock. */
function retained() {
  const context = vm.createContext({ console });
  vm.runInContext(composeContextScript(), context);
  const actions = context.OperitComposeActions.create();
  const runtime = { actions };
  const graph = context.OperitComposeRetained.create(runtime);
  const node = (type, key, children = []) => context.OperitComposeGeneration.observeNode({
    __composeNode: true, type, props: { key }, children, slots: {},
  });
  return { graph, node, runtime, context, generation: context.OperitComposeGeneration };
}

test('detached dirty branches never remove transient nodes that were not delivered to the client', () => {
  const { graph, node } = retained();
  const branch = node('Box', 'branch', [node('Text', 'old')]);
  const root = node('Column', 'root', [branch]);
  const initial = graph.commit(root);
  const client = new Map(Array.from(initial.upserts, record => [record.id, record]));

  // Matches a popup closing while an async host update has dirtied its descendants.
  // The branch is still queued when the root detaches it, so reconciliation can
  // create a temporary replacement which never belongs to a delivered commit.
  branch.children = [node('Text', 'temporary')];
  root.children = [];
  const update = graph.commit(root);
  for (const record of update.upserts) client.set(record.id, record);
  for (const id of update.removed) {
    assert.ok(client.has(id), `Delta removes a node the client never received: ${id}`);
    client.delete(id);
  }
  assert.equal(client.size, 1);
  assert.equal(client.get(update.rootId).children.length, 0);
  assert.equal(graph.commit(root).removed.length, 0);
});

/** Checks opaque handles, keyed identity, type changes, and removal through real retained commits. */
test('transport handles stay compact across deep nesting and preserve keyed sibling identity', () => {
  const { graph, node } = retained();
  const first = node('Text', 'first-' + 'x'.repeat(1000));
  const second = node('Text', 'second');
  const branch = node('Column', 'branch', [first, second]);
  let root = branch;
  for (let index = 0; index < 40; index++) root = node('Box', 'depth-' + index, [root]);
  const initial = graph.commit(root);
  assert.ok(initial.upserts.every(record => record.id.length < 12));
  const firstId = initial.upserts.find(record => record.props.key === first.props.key).id;
  const secondId = initial.upserts.find(record => record.props.key === second.props.key).id;
  branch.children = [second, first];
  const reordered = graph.commit(root);
  assert.deepEqual(Array.from(reordered.upserts.find(record => record.props.key === 'branch').children), [secondId, firstId]);
  assert.equal(reordered.removed.length, 0);
  const replacement = node('Button', first.props.key);
  branch.children = [replacement, second];
  const changed = graph.commit(root);
  assert.deepEqual(Array.from(changed.removed), [firstId]);
  const replacementId = changed.upserts.find(record => record.nodeType === 'Button').id;
  assert.notEqual(replacementId, firstId);
  branch.children = [second]; graph.commit(root);
  branch.children = [replacement];
  const reopened = graph.commit(root);
  assert.notEqual(reopened.upserts.find(record => record.nodeType === 'Button').id, replacementId);
  assert.ok(reopened.upserts.every(record => record.id.length < 12));
});


test('cached callbacks survive detachment and property observer replacement while detached action IDs expire', () => {
  const { graph, node, runtime, generation } = retained();
  const handler = () => 'the cached callback';
  const reference = runtime.actions.reference(handler);
  const cached = node('Button', 'cached');
  cached.props.onClick = reference;
  const root = node('Column', 'root', [cached]);
  const mounted = graph.commit(root);
  const oldId = mounted.upserts.find(record => record.nodeType === 'Button').props.onClick.__actionId;
  assert.equal(runtime.actions.store[oldId](), 'the cached callback');
  root.children = [];
  graph.commit(root);
  assert.equal(runtime.actions.store[oldId], undefined);
  // Generation replaces an occurrence's props with another observed container.
  const replacement = node('Button', 'replacement');
  replacement.props = cached.props;
  root.children = [replacement];
  const reopened = graph.commit(root);
  const newId = reopened.upserts.find(record => record.nodeType === 'Button').props.onClick.__actionId;
  assert.notEqual(newId, oldId);
  assert.equal(runtime.actions.store[newId](), 'the cached callback');
  root.children = [];
  graph.commit(root);
  assert.equal(runtime.actions.store[newId], undefined);
  root.children = [cached];
  const restored = graph.commit(root);
  const restoredId = restored.upserts.find(record => record.nodeType === 'Button').props.onClick.__actionId;
  assert.equal(runtime.actions.store[restoredId](), 'the cached callback');
});

test('callbacks of generated but unmounted nodes remain callable after discarded registration cleanup', () => {
  const { graph, node, runtime, generation } = retained();
  const reference = runtime.actions.reference(() => 'first mount');
  const cached = node('Button', 'cached');
  cached.props.onClick = reference;
  const root = node('Column', 'root');
  graph.commit(root);
  assert.equal(runtime.actions.store.__action_1, undefined);
  root.children = [cached];
  const mounted = graph.commit(root);
  const action = mounted.upserts.find(record => record.nodeType === 'Button').props.onClick.__actionId;
  assert.equal(runtime.actions.store[action](), 'first mount');
});


test('callbacks cannot be rebound into another SDK context even when transport IDs collide', () => {
  const { graph, node, runtime, context } = retained();
  const reference = runtime.actions.reference(() => 'first owner');
  const cached = node('Button', 'cached');
  cached.props.onClick = reference;
  const foreignActions = context.OperitComposeActions.create();
  foreignActions.register(() => 'second owner');
  const foreignGraph = context.OperitComposeRetained.create({ actions: foreignActions });
  assert.throws(() => foreignGraph.commit(cached), /another context/);
  assert.equal(runtime.actions.invoke(reference.__actionId), 'first owner');
});

test('generation rejects a copied context at the ownership boundary', () => {
  const context = vm.createContext({ console });
  vm.runInContext(composeContextScript(), context);
  const runtime = context.OperitComposeDslRuntime.createContext({});
  assert.throws(() => context.OperitComposeGeneration.begin({ ...runtime.ctx }), /original SDK context/);
  assert.doesNotThrow(() => context.OperitComposeGeneration.begin(runtime.ctx));
});

/** Theme helper methods stay local; only actual UI callbacks own transport actions. */
test('theme color helpers never become mounted callbacks or transport properties', () => {
  const { context } = retained();
  const runtime = context.OperitComposeDslRuntime.createContext({});
  const ctx = runtime.ctx;
  const primary = ctx.MaterialTheme.colorScheme.primary;
  const faded = primary.copy({ alpha: 0.5 });
  assert.equal(typeof faded.copy, 'function');
  assert.equal(faded.copy({ alpha: 0.25 }).alpha, 0.25);
  const root = ctx.UI.Text({
    text: 'actual role', color: primary, background: faded,
    modifier: ctx.Modifier.border(1, faded, { cornerRadius: 4 }),
    onClick: () => 'clicked',
  });
  const update = runtime.composition.commit(root);
  const props = update.upserts.find(record => record.id === update.rootId).props;
  assert.equal(Object.hasOwn(props.color, 'copy'), false);
  assert.equal(Object.hasOwn(props.background, 'copy'), false);
  assert.equal(Object.hasOwn(props.modifier.__modifierOps[0].args[1], 'copy'), false);
  assert.equal(props.color.__colorToken, 'primary');
  assert.equal(props.background.alpha, 0.5);
  assert.equal(runtime.actions.invoke(props.onClick.__actionId), 'clicked');
  assert.equal(Object.keys(runtime.actions.store).filter(id => id.startsWith('__action_')).length, 1);
});

/** Reuses detached snapshots without missing mutable inputs or the latest callback closure. */
test('generation copies only changed argument branches and refreshes callbacks in reused snapshots', () => {
  const { context, generation } = retained();
  const runtime = context.OperitComposeDslRuntime.createContext({});
  const entry = { initialized: false };
  const model = { label: 'first', stable: { padding: [1, 2] }, detail: { value: 1 } };
  let factories = 0;
  const factory = props => { factories++; return runtime.ctx.UI.Text(props); };
  const build = handler => generation.evaluate(entry, [{ model, onClick: handler }], factory);
  const first = build(() => 'old');
  runtime.composition.commit(first);
  const args = entry.args;
  assert.equal(build(() => 'latest'), first);
  assert.equal(entry.args, args, 'unchanged arguments keep their detached snapshot');
  assert.equal(factories, 1);
  const unchanged = runtime.composition.commit(first, true);
  assert.equal(unchanged, null);
  assert.equal(runtime.actions.invoke(first.props.onClick.__actionId), 'latest', 'skipping transport still refreshes captured callbacks');

  model.detail.value = 2;
  assert.equal(build(() => 'after mutation'), first, 'the mounted node handle remains stable');
  assert.equal(factories, 2);
  assert.notEqual(entry.args, args);
  assert.equal(entry.args[0].model.stable, args[0].model.stable);
  assert.notEqual(entry.args[0].model.detail, args[0].model.detail);
  assert.equal(args[0].model.detail.value, 1, 'the old snapshot stays detached from plugin writes');
  assert.equal(first.props.model.detail.value, 2);
  const changed = runtime.composition.commit(first);
  assert.equal(changed.upserts.length, 1);
  assert.equal(runtime.actions.invoke(first.props.onClick.__actionId), 'after mutation');

  delete model.detail.value;
  model.detail.other = undefined;
  build(() => 'changed keys');
  assert.equal(Object.hasOwn(first.props.model.detail, 'value'), false);
  assert.equal(Object.hasOwn(first.props.model.detail, 'other'), true);
  model.stable.padding.push(3);
  build(() => 'changed array');
  assert.deepEqual(Array.from(first.props.model.stable.padding), [1, 2, 3]);
  model.self = model;
  assert.throws(() => build(() => 'cycle'), /must not contain cycles/);
});

/** Nonprimitive dependencies always evaluate their real arguments, so they need no detached dependency copy. */
test('leaf dependencies retain no unused deep snapshot and still observe in-place input changes', () => {
  const { context, generation } = retained();
  const runtime = context.OperitComposeDslRuntime.createContext({});
  const model = { value: 1 };
  Object.defineProperty(model, 'unrelated', { enumerable: true, get() { throw Error('unread dependency field copied'); } });
  const build = () => {
    generation.begin(runtime.ctx);
    try {
      return generation.leaf(runtime.ctx, 'leaf', [model], () => [{ text: String(model.value) }], props => runtime.ctx.UI.Text(props));
    } finally {
      generation.end(runtime.ctx);
    }
  };
  const first = build();
  runtime.composition.commit(first);
  model.value = 2;
  const next = build();
  assert.equal(next, first);
  assert.equal(next.props.text, '2');
});

/** Empty intermediate reconciliation must release bookkeeping without consuming a wire revision. */
test('unchanged intermediate commits preserve contiguous published revisions and final completion fences', () => {
  const { graph, node } = retained();
  const root = node('Column', 'root', [node('Text', 'visible')]);
  assert.equal(graph.commit(root).revision, 1);
  assert.equal(graph.commit(root, true), null);
  root.children[0].props.text = 'changed';
  const changed = graph.commit(root, true);
  assert.equal(changed.revision, 2);
  assert.equal(changed.upserts.length, 1);
  assert.equal(graph.commit(root, true), null);
  const final = graph.commit(root);
  assert.equal(final.revision, 3);
  assert.equal(final.upserts.length, 0);
  root.children = [];
  const removed = graph.commit(root, true);
  assert.equal(removed.revision, 4);
  assert.equal(removed.removed.length, 1);
});

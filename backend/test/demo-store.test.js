import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { hashIdNumber } from '../src/id-number.js';

// Isolate platform storage completely: no local files or real accounts are loaded.
if (!process.execArgv.includes('--experimental-vm-modules')) {
  test('platform account adapter regressions', () => {
    const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--test', import.meta.filename], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
} else {
  async function fixture(initial = { users: [] }) {
    let state = structuredClone(initial);
    let failure;
    let beforeCommit = async () => {};
    const source = readFileSync(new URL('../src/demo-store.js', import.meta.url), 'utf8');
    async function load() {
      const entry = new vm.SourceTextModule(source);
      await entry.link(specifier => {
        const exports = specifier === './id-number.js' ? { hashIdNumber } : {
          readPlatformState() { if (failure) throw failure; return structuredClone(state); },
          async updatePlatformState(mutator) {
            if (failure) throw failure;
            const draft = structuredClone(state);
            const result = mutator(draft);
            await beforeCommit();
            if (failure) throw failure;
            state = structuredClone(draft);
            return structuredClone(result);
          }
        };
        return new vm.SyntheticModule(Object.keys(exports), function () {
          for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
        });
      });
      await entry.evaluate();
      return entry.namespace;
    }
    return { api: await load(), load, state: () => state, fail: error => { failure = error; }, delay: fn => { beforeCommit = fn; } };
  }

  test('only stored accounts resolve, including incomplete profiles and membership', async () => {
    const f = await fixture();
    assert.equal(f.api.getDemoUserById(1), null);
    assert.equal(f.api.findDemoUser('0712345678', 'synthetic-pepper'), null);
    assert.equal(await f.api.updateDemoProfile(1, 'Missing', 'Account'), null);
    f.state().users.push({ id: 101, telephoneNumber: '0000000101', membershipType: 'synthetic', roles: ['Member'], status: 'suspended' });
    const user = f.api.findDemoUser('000 000-0101', 'synthetic-pepper');
    assert.equal(user.id, 101);
    assert.equal(user.first_name, undefined);
    assert.equal(user.membership_type, 'synthetic');
    assert.equal(user.status, 'suspended');
    const updated = await f.api.updateDemoProfile('101', 'Test', 'Member');
    assert.equal(updated.first_name, 'Test');
    assert.equal((await f.load()).getDemoUserById(101).last_name, 'Member');
  });

  test('subscriptions persist, upsert by community, and never return stale fallback data', async () => {
    const f = await fixture();
    await f.api.saveDemoSubscription('101', { serviceCode: 'test', communityId: 'a', userId: 202 });
    await f.api.saveDemoSubscription(101, { serviceCode: 'test', communityId: 'b' });
    await f.api.saveDemoSubscription(202, { serviceCode: 'test', communityId: 'a' });
    const saved = await f.api.saveDemoSubscription(101, { serviceCode: 'test', communityId: 'a', planCode: 'new' });
    assert.equal(saved.status, 'active');
    assert.ok(Number.isFinite(Date.parse(saved.subscribedAt)));
    assert.equal(f.state().serviceSubscriptions.length, 3);
    assert.equal((await f.load()).getDemoSubscriptions('101').length, 2);
    assert.equal(f.api.getDemoSubscriptions(101)[0].planCode, 'new');
    f.state().serviceSubscriptions = [];
    assert.equal(f.api.getDemoSubscriptions(101).length, 0);
  });

  test('applications persist and replace only the matching user and service', async () => {
    const f = await fixture();
    await f.api.saveDemoApplication('101', { serviceCode: 'test', userId: 202, bankConfirmationPath: 'synthetic-a' });
    await f.api.saveDemoApplication(202, { serviceCode: 'test' });
    await f.api.saveDemoApplication(101, { serviceCode: 'other' });
    const saved = await (await f.load()).saveDemoApplication(101, { serviceCode: 'test', bankConfirmationPath: 'synthetic-b' });
    assert.equal(f.state().serviceApplications.length, 3);
    assert.equal(f.state().serviceApplications[0].bankConfirmationPath, 'synthetic-b');
    assert.equal(saved.status, 'submitted');
    assert.ok(Number.isFinite(Date.parse(saved.submittedAt)));
  });

  test('reset persists both collections and preserves other users', async () => {
    const f = await fixture({ users: [], serviceSubscriptions: [{ userId: 101 }, { userId: '202' }], serviceApplications: [{ userId: '101' }, { userId: 202 }] });
    await f.api.resetDemoUserServices('101');
    assert.equal((await f.load()).getDemoSubscriptions(101).length, 0);
    assert.deepEqual(f.state().serviceSubscriptions, [{ userId: '202' }]);
    assert.deepEqual(f.state().serviceApplications, [{ userId: 202 }]);
    await f.api.resetDemoUserServices(101);
    const empty = await fixture();
    await empty.api.resetDemoUserServices(101);
    assert.deepEqual(empty.state().serviceApplications, []);
  });

  test('all writes wait for commit and propagate commit failure without local fallback', async () => {
    for (const write of [
      api => api.updateDemoProfile(101, 'Changed', 'Member'),
      api => api.saveDemoSubscription(101, { serviceCode: 'test' }),
      api => api.saveDemoApplication(101, { serviceCode: 'test' }),
      api => api.resetDemoUserServices(101)
    ]) {
      const f = await fixture({ users: [{ id: 101, firstName: 'Original' }] });
      const original = structuredClone(f.state());
      let release;
      f.delay(() => new Promise(resolve => { release = resolve; }));
      let settled = false;
      const pending = write(f.api);
      pending.then(() => { settled = true; }, () => { settled = true; });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(settled, false);
      const error = new Error('Synthetic commit failure');
      f.fail(error);
      release();
      await assert.rejects(pending, candidate => candidate === error);
      assert.deepEqual(f.state(), original);
      assert.throws(() => f.api.getDemoUserById(101), candidate => candidate === error);
      assert.throws(() => f.api.findDemoUser('0000000101', 'pepper'), candidate => candidate === error);
      assert.throws(() => f.api.getDemoSubscriptions(101), candidate => candidate === error);
    }
  });
}

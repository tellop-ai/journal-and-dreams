/**
 * Who may press what (AGENTS.md rule 1), checked by calling the real code.
 *
 * - The rule in `lib/diary/roles.js` for each role: the owner and a Helper
 *   press everything, a Member writes only a new page, a Viewer only reads,
 *   and an unknown role gets nothing that saves.
 * - `lib/diary/visitor.js` under a stand-in person door: an answer that cannot
 *   be read gives no role, so the screens draw nothing that saves.
 * - The diary's address under a stand-in host that answers as Tellop's online
 *   host does: it refuses every change by a Viewer and a Member's change of one
 *   page the Member did not write, and a Member's removal of such a page
 *   removes nothing. The address answers both with 403 and their own words.
 *
 * The store is a throwaway one (`APP_DATA_FILE` in a fresh temporary folder,
 * removed afterwards). Nothing here reaches the network.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { after, afterEach, test } from 'node:test';

const projectRoot = path.join(import.meta.dirname, '..');
const scratch = mkdtempSync(path.join(os.tmpdir(), 'diary-roles-'));
const startedIn = process.cwd();
process.chdir(projectRoot);
const priorFile = process.env.APP_DATA_FILE;
process.env.APP_DATA_FILE = path.join(scratch, 'app.db');

const roles = await import('../lib/diary/roles.js');
const { canAdd, canChange, dayScreen } = roles;
const { visitor } = await import('../lib/diary/visitor.js');
const { DIARY_OWNER } = await import('../lib/diary/owner.js');
const data = await import('../lib/data/index.js');
const { readPageFor, savePageFor } = await import('../lib/data/diary.js');
const route = await import('../app/api/diary/route.js');
const { MESSAGES, t } = await import('../lib/i18n/index.js');

const PERSON = Symbol.for('tellop.person');
const ACTION = Symbol.for('tellop.internalRecordsAction');
const priorFlag = process.env.TELLOP_INTERNAL_RECORDS;
const DOOR_ID = 'p_abcdefghijklmnopqrstuv';
const WRITES = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
const SINGLE_ROW = new Set(['update', 'delete', 'upsert']);

function restoreFlag() {
  if (priorFlag === undefined) delete process.env.TELLOP_INTERNAL_RECORDS;
  else process.env.TELLOP_INTERNAL_RECORDS = priorFlag;
}

afterEach(() => {
  delete globalThis[PERSON];
  delete globalThis[ACTION];
  restoreFlag();
});

after(async () => {
  await data.closeStorage();
  process.chdir(startedIn);
  if (priorFile === undefined) delete process.env.APP_DATA_FILE;
  else process.env.APP_DATA_FILE = priorFile;
  rmSync(scratch, { recursive: true, force: true });
});

/* ---------- the rule ---------- */

test('the owner and a Helper write and change, a Member only writes a new page, a Viewer neither', () => {
  const rows = [
    ['owner', true, true],
    ['helper', true, true],
    ['member', true, false],
    ['viewer', false, false],
  ];
  for (const [role, adds, changes] of rows) {
    assert.equal(canAdd(role), adds, `${role} writes a new page`);
    assert.equal(canChange(role), changes, `${role} changes or deletes a page`);
  }
  for (const unknown of [undefined, null, '', 'Owner', 'admin', ['owner'], { role: 'owner' }]) {
    assert.equal(canAdd(unknown), false, `add for ${JSON.stringify(unknown)}`);
    assert.equal(canChange(unknown), false, `change for ${JSON.stringify(unknown)}`);
  }
});

test('"Write today" shows for a role that may change, and for a Member only when today has no page', () => {
  const rows = [
    // role, today has a page (null: not known), "Write today" drawn
    ['owner', true, true], ['owner', false, true], ['owner', null, true],
    ['helper', true, true], ['helper', false, true], ['helper', null, true],
    ['member', true, false], ['member', false, true], ['member', null, false],
    ['viewer', true, false], ['viewer', false, false], ['viewer', null, false],
    [null, false, false], ['admin', false, false],
  ];
  for (const [role, todayHasPage, shown] of rows) {
    assert.equal(roles.writeTodayShown(role, todayHasPage), shown, `${role} ${todayHasPage}`);
  }
});

test('a person who cannot be read gets one line in the kit’s words; a known role gets none', () => {
  for (const role of ['owner', 'helper', 'member', 'viewer']) assert.equal(roles.personNotice(role), null, role);
  for (const unknown of [null, undefined, '', 'admin']) assert.equal(roles.personNotice(unknown), 'error.storageUnreadable', String(unknown));
  assert.match(t(roles.personNotice(null), 'en'), /unexpected state/u);
});

test('a day shows each role only the presses it may use', () => {
  const rows = [
    // role, the day has a page, the address asks for the writing box, what shows
    ['owner', false, false, { screen: 'write', controls: false }],
    ['owner', true, false, { screen: 'read', controls: true }],
    ['owner', true, true, { screen: 'change', controls: true }],
    ['helper', false, false, { screen: 'write', controls: false }],
    ['helper', true, false, { screen: 'read', controls: true }],
    ['helper', true, true, { screen: 'change', controls: true }],
    ['member', false, false, { screen: 'write', controls: false }],
    ['member', false, true, { screen: 'write', controls: false }],
    ['member', true, false, { screen: 'read', controls: false }],
    ['member', true, true, { screen: 'read', controls: false }],
    ['viewer', false, false, { screen: 'empty', controls: false }],
    ['viewer', false, true, { screen: 'empty', controls: false }],
    ['viewer', true, false, { screen: 'read', controls: false }],
    ['viewer', true, true, { screen: 'read', controls: false }],
    [null, false, false, { screen: 'empty', controls: false }],
    [null, true, true, { screen: 'read', controls: false }],
  ];
  for (const [role, hasPage, edit, shows] of rows) {
    assert.deepEqual(dayScreen(role, hasPage, edit), shows, `${role} ${hasPage ? 'page' : 'no page'}${edit ? ' edit' : ''}`);
  }
});

/* ---------- the person ---------- */

test('outside Tellop the one person is the owner, with every press', async () => {
  assert.deepEqual(await visitor(), { role: 'owner', preview: false });
});

test('the host’s person gives the role, and the owner looking as a Member is a preview', async () => {
  process.env.TELLOP_INTERNAL_RECORDS = '1';
  globalThis[PERSON] = async () => ({ id: DOOR_ID, name: 'A reader', role: 'viewer' });
  assert.deepEqual(await visitor(), { role: 'viewer', preview: false });
  globalThis[PERSON] = async () => ({ id: 'owner', name: null, role: 'member', preview: true });
  assert.deepEqual(await visitor(), { role: 'member', preview: true });
  globalThis[PERSON] = async () => ({ id: 'owner', name: null, role: 'owner' });
  assert.deepEqual(await visitor(), { role: 'owner', preview: false });
});

test('an answer about the person that cannot be read gives no role, so nothing that saves is drawn', async () => {
  process.env.TELLOP_INTERNAL_RECORDS = '1';
  const answers = [
    undefined,
    async () => { throw new Error('door down'); },
    async () => null,
    async () => ({ id: DOOR_ID, name: null, role: 'admin' }),
    async () => ({ id: DOOR_ID, name: null, role: 'owner' }),
    async () => ({ id: 'someone', name: null, role: 'member' }),
    async () => ({ id: DOOR_ID, name: null, role: 'member', extra: true }),
  ];
  for (const door of answers) {
    if (door === undefined) delete globalThis[PERSON];
    else globalThis[PERSON] = door;
    const seen = await visitor();
    assert.deepEqual(seen, { role: null, preview: false });
    assert.equal(canAdd(seen.role), false);
    assert.deepEqual(dayScreen(seen.role, false, false), { screen: 'empty', controls: false });
  }
});

/* ---------- the address, under a host that refuses ---------- */

/**
 * Tellop's online host, simplified to what these checks touch. It keeps who
 * wrote each page. A Viewer's every write is refused (`records-forbidden`)
 * before anything runs. A Member's write of ONE row (`update`, `delete`,
 * `upsert` by a unique where) that would change a page the Member did not
 * write is refused the same way; an upsert that finds no page adds one. A
 * Member's `updateMany` or `deleteMany` is never refused: it skips the pages
 * the Member did not write and counts only the rest. The owner and a Helper
 * write everything. The steps run on the throwaway store, all or none.
 *
 * @param {'owner' | 'helper' | 'member' | 'viewer'} role
 * @param {Set<number>} [written] the pages this person wrote
 */
function host(role, written = new Set()) {
  globalThis[ACTION] = async (steps) => {
    delete process.env.TELLOP_INTERNAL_RECORDS;
    try {
      if (role === 'viewer' && steps.some((step) => WRITES.has(step.action))) throw new Error('records-forbidden');
      const run = [];
      for (const step of steps) {
        if (role !== 'member' || !WRITES.has(step.action)) run.push(step);
        else if (SINGLE_ROW.has(step.action)) {
          const where = step.args.where?.ownerId_book_day ?? step.args.where;
          const there = await data.modelAction('DiaryPage', 'findMany', { where, select: { id: true } });
          if (there.some((row) => !written.has(row.id))) throw new Error('records-forbidden');
          run.push(step);
        } else if (step.action === 'updateMany' || step.action === 'deleteMany') {
          run.push({ ...step, args: { ...step.args, where: { AND: [step.args.where ?? {}, { id: { in: [...written] } }] } } });
        } else run.push(step);
      }
      const answers = await data.modelBatch(run);
      for (const [at, step] of steps.entries()) {
        if (step.action === 'upsert' && typeof answers[at]?.id === 'number') written.add(answers[at].id);
      }
      return answers;
    } finally {
      process.env.TELLOP_INTERNAL_RECORDS = '1';
    }
  };
  process.env.TELLOP_INTERNAL_RECORDS = '1';
}

/**
 * @param {string} method
 * @param {unknown} body
 */
async function send(method, body) {
  const request = new Request('http://app.invalid/api/diary', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const response = await (method === 'POST' ? route.POST(request) : route.DELETE(request));
  return { status: response.status, body: await response.json() };
}

/** The owner's page for a day, written straight to the throwaway store. */
async function ownersPage(book, day, text) {
  await savePageFor(DIARY_OWNER, { book, day, text });
}

const REFUSED_CHANGE = { status: 403, body: { problem: 'error.cannotChange' } };

test('a Viewer’s save or delete is refused with 403 and its own words, and nothing changes', async () => {
  await ownersPage('journal', '2026-03-01', 'The owner’s page.');
  host('viewer');
  assert.deepEqual(await send('POST', { book: 'journal', day: '2026-03-02', text: 'A new page.' }), REFUSED_CHANGE);
  assert.deepEqual(await send('POST', { book: 'journal', day: '2026-03-01', text: 'Changed.' }), REFUSED_CHANGE);
  assert.deepEqual(await send('DELETE', { book: 'journal', day: '2026-03-01' }), REFUSED_CHANGE);
  restoreFlag();
  assert.equal(await readPageFor(DIARY_OWNER, 'journal', '2026-03-02'), null);
  assert.equal((await readPageFor(DIARY_OWNER, 'journal', '2026-03-01'))?.text, 'The owner’s page.');
  assert.equal(t('error.cannotChange', 'en'), 'You cannot change this.');
  assert.equal(t('error.cannotChange', 'tr'), 'Bunu değiştiremezsiniz.');
});

test('a Member writes a page on a day with none, and changing or deleting the owner’s page is refused with 403', async () => {
  await ownersPage('dreams', '2026-03-10', 'The owner’s dream.');
  host('member');
  const added = await send('POST', { book: 'dreams', day: '2026-03-11', text: 'A Member’s dream.' });
  assert.equal(added.status, 200);
  assert.equal(added.body.page.text, 'A Member’s dream.');
  assert.deepEqual(await send('POST', { book: 'dreams', day: '2026-03-10', text: 'Changed.' }), REFUSED_CHANGE);
  assert.deepEqual(await send('DELETE', { book: 'dreams', day: '2026-03-10' }), REFUSED_CHANGE);
  restoreFlag();
  assert.equal((await readPageFor(DIARY_OWNER, 'dreams', '2026-03-10'))?.text, 'The owner’s dream.');
  assert.equal((await readPageFor(DIARY_OWNER, 'dreams', '2026-03-11'))?.text, 'A Member’s dream.');
});

test('the stand-in host answers a Member’s removal of a page they did not write as the real host does: nothing removed, not refused', async () => {
  await ownersPage('journal', '2026-04-01', 'The owner’s page.');
  host('member');
  assert.deepEqual(await data.modelAction('DiaryPage', 'deleteMany', { where: { ownerId: DIARY_OWNER, book: 'journal', day: '2026-04-01' } }), { count: 0 });
  await assert.rejects(
    data.modelAction('DiaryPage', 'upsert', {
      where: { ownerId_book_day: { ownerId: DIARY_OWNER, book: 'journal', day: '2026-04-01' } },
      create: { ownerId: DIARY_OWNER, book: 'journal', day: '2026-04-01', text: 'x', createdAt: 'x', updatedAt: 'x' },
      update: { text: 'x' },
    }),
    (error) => error instanceof data.DataError && error.messageKey === 'error.cannotChange',
  );
  restoreFlag();
  assert.equal((await readPageFor(DIARY_OWNER, 'journal', '2026-04-01'))?.text, 'The owner’s page.');
});

test('a Member’s delete answers what is true: refused while the page is still there, "already gone" only when it is gone', async () => {
  await ownersPage('dreams', '2026-04-10', 'The owner’s dream.');
  host('member');
  assert.deepEqual(await send('DELETE', { book: 'dreams', day: '2026-04-10' }), REFUSED_CHANGE);
  assert.deepEqual(await send('DELETE', { book: 'dreams', day: '2026-04-12' }), { status: 200, body: { removed: false, notice: 'diary.alreadyGone' } });
  assert.equal((await send('POST', { book: 'dreams', day: '2026-04-11', text: 'Mine.' })).status, 200);
  assert.deepEqual(await send('DELETE', { book: 'dreams', day: '2026-04-11' }), { status: 200, body: { removed: true } });
  restoreFlag();
  assert.equal((await readPageFor(DIARY_OWNER, 'dreams', '2026-04-10'))?.text, 'The owner’s dream.');
  assert.equal(await readPageFor(DIARY_OWNER, 'dreams', '2026-04-11'), null);
});

test('the owner and a Helper write, change and delete any page', async () => {
  for (const [role, day] of [['owner', '2026-03-20'], ['helper', '2026-03-21']]) {
    await ownersPage('journal', day, 'Written first.');
    host(role);
    const changed = await send('POST', { book: 'journal', day, text: `Changed by the ${role}.` });
    assert.equal(changed.status, 200, role);
    assert.deepEqual(await send('DELETE', { book: 'journal', day }), { status: 200, body: { removed: true } });
    const added = await send('POST', { book: 'journal', day, text: 'Written again.' });
    assert.equal(added.status, 200, role);
    restoreFlag();
    assert.equal((await readPageFor(DIARY_OWNER, 'journal', day))?.text, 'Written again.');
  }
});

test('the new words exist in both languages', () => {
  for (const key of ['diary.noPage', 'diary.backToOwnView', 'error.cannotChange', 'error.saveRefused', 'app.loading']) {
    for (const locale of ['en', 'tr']) assert.ok(typeof MESSAGES[locale][key] === 'string' && MESSAGES[locale][key].trim() !== '', `${locale} ${key}`);
  }
});

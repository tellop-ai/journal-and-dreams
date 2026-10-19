/**
 * The diary's rules, checked by calling the real code.
 *
 * - The bounds on a page (book, day, text) at every edge and one step past it.
 * - The pages themselves, against a throwaway store: `APP_DATA_FILE` points at
 *   a fresh temporary folder, removed afterwards, exactly as
 *   `tests/data.test.mjs` does, so no check touches the store a person uses.
 * - The diary's address, called with real requests.
 * - The words: both languages, every key the screens and refusals use.
 *
 * Nothing here reaches the network.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { after, test } from 'node:test';

// A zone far from UTC (UTC+14), set before any date is made: a day computed through UTC instead of this computer's
// own time lands on the wrong day here, where on a UTC machine it would pass unseen.
process.env.TZ = 'Pacific/Kiritimati';

const projectRoot = path.join(import.meta.dirname, '..');
const scratch = mkdtempSync(path.join(os.tmpdir(), 'diary-checks-'));
const startedIn = process.cwd();
process.chdir(projectRoot);
process.env.APP_DATA_FILE = path.join(scratch, 'app.db');

const bounds = await import('../lib/diary/bounds.js');
const { BOOKS, MAX_TEXT, REFUSED, characterCount, clampMonth, dayOf, dayProblem, firstWords, isBook, isMonth, isRealDay, monthDays, pageProblem, shiftMonth, textProblem, wordCount } = bounds;
const { changedWhen, dayDate, fullDate } = await import('../lib/diary/dates.js');
const { DIARY_OWNER } = await import('../lib/diary/owner.js');
const { MAX_BODY_BYTES } = await import('../lib/diary/request.js');
const { DataError, closeStorage } = await import('../lib/data/index.js');
const { deletePageFor, readMonthDaysFor, readMonthFor, readPageFor, savePageFor } = await import('../lib/data/diary.js');
const route = await import('../app/api/diary/route.js');
const { MESSAGES } = await import('../lib/i18n/index.js');

after(async () => {
  await closeStorage();
  process.chdir(startedIn);
  rmSync(scratch, { recursive: true, force: true });
});

/** @param {string} key */
function refusedWith(key) {
  return (error) => error instanceof DataError && error.messageKey === key;
}

/** A moment a given number of minutes into 2026-10-19, for saves that need a clock. */
function at(minutes) {
  return () => new Date(Date.UTC(2026, 9, 19, 8, minutes));
}

/* ---------- the bounds ---------- */

test('a day must be a real day from 1900-01-01 to 2100-12-31', () => {
  assert.equal(dayProblem('1899-12-31'), REFUSED.dayRange);
  assert.equal(dayProblem('1900-01-01'), null);
  assert.equal(dayProblem('1900-01-02'), null);
  assert.equal(dayProblem('2100-12-30'), null);
  assert.equal(dayProblem('2100-12-31'), null);
  assert.equal(dayProblem('2101-01-01'), REFUSED.dayRange);
  assert.equal(dayProblem('2026-02-29'), REFUSED.day, '2026 is not a leap year');
  assert.equal(dayProblem('2026-02-28'), null);
  assert.equal(dayProblem('2028-02-29'), null, '2028 is a leap year');
  assert.equal(dayProblem('2028-02-30'), REFUSED.day);
  assert.equal(dayProblem('1900-02-29'), REFUSED.day, '1900 is not a leap year');
  assert.equal(dayProblem('2000-02-29'), null, '2000 is a leap year');
  for (const odd of ['2026-04-31', '2026-13-01', '2026-00-10', '2026-10-00', '2026-10-1', '2026/10/19', ' 2026-10-19', '', null, undefined, 20261019]) {
    assert.equal(dayProblem(odd), REFUSED.day, String(odd));
  }
  assert.equal(isRealDay('0001-01-01'), true, 'a real day outside the range is still a real day');
});

test('a page holds 1 to 20,000 characters after the spaces around it are removed', () => {
  assert.equal(MAX_TEXT, 20000);
  assert.equal(textProblem(''), REFUSED.empty, 'zero characters');
  assert.equal(textProblem(' \n\t \r\n '), REFUSED.empty, 'spaces and empty lines only');
  assert.equal(textProblem('a'), null, 'one character');
  assert.equal(textProblem('ab'), null);
  assert.equal(textProblem('a'.repeat(19999)), null);
  assert.equal(textProblem('a'.repeat(20000)), null, 'exactly the limit');
  assert.equal(textProblem('a'.repeat(20001)), REFUSED.long, 'one past the limit');
  assert.equal(textProblem(`  \n${'a'.repeat(20000)}\n\n  `), null, 'the spaces around the text do not count');
  assert.equal(textProblem(`  ${'a'.repeat(20001)}  `), REFUSED.long);
  assert.equal(textProblem('🌙'.repeat(20000)), null, 'an emoji is one character');
  assert.equal(textProblem('🌙'.repeat(20001)), REFUSED.long);
  assert.equal(characterCount('🌙ab'), 3);
  for (const odd of [null, undefined, 7, ['a'], { text: 'a' }]) assert.equal(textProblem(odd), REFUSED.request, String(odd));
});

test('a book is journal or dreams, and nothing else', () => {
  assert.deepEqual([...BOOKS], ['journal', 'dreams']);
  assert.equal(isBook('journal'), true);
  assert.equal(isBook('dreams'), true);
  for (const odd of ['Journal', 'dream', 'journals', 'notes', '', ' journal', null, undefined, 1]) assert.equal(isBook(odd), false, String(odd));
  assert.equal(pageProblem({ book: 'notes', day: '2026-10-19', text: 'a' }), REFUSED.book);
  assert.equal(pageProblem({ book: 'dreams', day: '2101-01-01', text: 'a' }), REFUSED.dayRange);
  assert.equal(pageProblem({ book: 'dreams', day: '2026-10-19', text: '  ' }), REFUSED.empty);
  assert.equal(pageProblem({ book: 'journal', day: '2026-10-19', text: 'a' }), null);
});

test('words are counted between spaces and line breaks, and the calendar shows the first eight', () => {
  assert.equal(wordCount(''), 0);
  assert.equal(wordCount('  \n '), 0);
  assert.equal(wordCount('one'), 1);
  assert.equal(wordCount(' two  words\n\nthree\tfour '), 4);
  assert.equal(firstWords('one two three four five six seven eight'), 'one two three four five six seven eight');
  assert.equal(firstWords('one two three four five six seven eight nine'), 'one two three four five six seven eight…');
  assert.equal(firstWords('  line\n\nbreaks   fold  '), 'line breaks fold');
});

test('months move across years and stay inside the range a page can be written in', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-10', 0), '2026-10');
  assert.equal(clampMonth('1899-12'), '1900-01');
  assert.equal(clampMonth('1900-01'), '1900-01');
  assert.equal(clampMonth('2100-12'), '2100-12');
  assert.equal(clampMonth('2101-01'), '2100-12');
  assert.equal(isMonth('2026-10'), true);
  for (const odd of ['2026-13', '2026-00', '2026-1', '2026-10-01', '', undefined]) assert.equal(isMonth(odd), false, String(odd));
  assert.deepEqual(monthDays('2026-02'), { first: '2026-02-01', last: '2026-02-28' });
  assert.deepEqual(monthDays('2028-02'), { first: '2028-02-01', last: '2028-02-29' });
  assert.deepEqual(monthDays('2026-10'), { first: '2026-10-01', last: '2026-10-31' });
  assert.deepEqual(monthDays('2026-11'), { first: '2026-11-01', last: '2026-11-30' });
  assert.equal(dayOf(new Date(2026, 9, 19, 23, 59)), '2026-10-19');
  assert.equal(dayOf(new Date(2026, 9, 20, 0, 0)), '2026-10-20');
});

test('dates read in the app language, and "last changed" in this computer’s own time', () => {
  assert.equal(fullDate('2026-10-19', 'tr'), '19 Ekim 2026, Pazartesi');
  assert.equal(fullDate('2026-10-19', 'en'), 'Monday, October 19, 2026');
  assert.equal(dayDate('2026-10-17', 'tr'), '17 Ekim 2026');
  assert.equal(dayDate('2026-10-17', 'en'), 'October 17, 2026');
  const changed = new Date(2026, 9, 17, 8, 12).toISOString();
  assert.equal(changedWhen(changed, 'tr', new Date(2026, 9, 19)), '17 Ekim, 08:12');
  assert.equal(changedWhen(changed, 'en', new Date(2026, 9, 19)), 'October 17, 8:12 AM');
  assert.equal(changedWhen(changed, 'tr', new Date(2027, 0, 2)), '17 Ekim 2026, 08:12', 'another year shows its year');
  assert.equal(changedWhen('not a moment', 'tr'), null);
});

/* ---------- the pages ---------- */

test('a page is saved, read back by its day, and kept without the spaces around it', async () => {
  const saved = await savePageFor(DIARY_OWNER, { book: 'journal', day: '2026-10-19', text: '  First line.\n\nSecond line.  \n' }, { now: at(0) });
  assert.equal(saved.text, 'First line.\n\nSecond line.');
  assert.equal(saved.createdAt, saved.updatedAt);
  assert.deepEqual(await readPageFor(DIARY_OWNER, 'journal', '2026-10-19'), saved);
  assert.equal(await readPageFor(DIARY_OWNER, 'dreams', '2026-10-19'), null, 'the other book has its own pages');
  assert.equal(await readPageFor(DIARY_OWNER, 'journal', '2026-10-18'), null);
});

test('one page a day: saving the same day again changes that page', async () => {
  const first = await savePageFor(DIARY_OWNER, { book: 'dreams', day: '2026-10-17', text: 'A ship.' }, { now: at(1) });
  const second = await savePageFor(DIARY_OWNER, { book: 'dreams', day: '2026-10-17', text: 'A lighthouse.' }, { now: at(2) });
  assert.equal(second.text, 'A lighthouse.');
  assert.equal(second.createdAt, first.createdAt, 'the day it was first written stays');
  assert.notEqual(second.updatedAt, first.updatedAt);
  const month = await readMonthFor(DIARY_OWNER, 'dreams', '2026-10');
  assert.deepEqual(month.filter((page) => page.day === '2026-10-17').map((page) => page.text), ['A lighthouse.']);
});

test('a month reads only its own days of one book, earliest first', async () => {
  for (const day of ['2026-09-30', '2026-10-31', '2026-10-01', '2026-11-01']) {
    await savePageFor(DIARY_OWNER, { book: 'journal', day, text: `Page for ${day}` }, { now: at(3) });
  }
  const october = await readMonthFor(DIARY_OWNER, 'journal', '2026-10');
  assert.deepEqual(october.map((page) => page.day), ['2026-10-01', '2026-10-19', '2026-10-31']);
  assert.deepEqual(await readMonthDaysFor(DIARY_OWNER, 'journal', '2026-10'), ['2026-10-01', '2026-10-19', '2026-10-31']);
  assert.deepEqual((await readMonthFor(DIARY_OWNER, 'journal', '2026-12')), []);
  await assert.rejects(readMonthFor(DIARY_OWNER, 'journal', '2026-13'), refusedWith(REFUSED.day));
});

test('deleting a page removes it, and deleting it again answers "already gone"', async () => {
  await savePageFor(DIARY_OWNER, { book: 'journal', day: '2026-10-05', text: 'Morning run.' }, { now: at(4) });
  assert.deepEqual(await deletePageFor(DIARY_OWNER, 'journal', '2026-10-05'), { removed: true });
  assert.equal(await readPageFor(DIARY_OWNER, 'journal', '2026-10-05'), null);
  assert.deepEqual(await deletePageFor(DIARY_OWNER, 'journal', '2026-10-05'), { removed: false });
});

test('every read, save and delete names its owner; one owner never reaches another’s pages', async () => {
  await savePageFor('someone-else', { book: 'journal', day: '2026-10-07', text: 'Not yours.' }, { now: at(5) });
  assert.equal(await readPageFor(DIARY_OWNER, 'journal', '2026-10-07'), null);
  assert.ok(!(await readMonthFor(DIARY_OWNER, 'journal', '2026-10')).some((page) => page.day === '2026-10-07'));
  assert.deepEqual(await deletePageFor(DIARY_OWNER, 'journal', '2026-10-07'), { removed: false });
  assert.equal((await readPageFor('someone-else', 'journal', '2026-10-07'))?.text, 'Not yours.');
  await assert.rejects(readPageFor('', 'journal', '2026-10-07'), refusedWith('error.ownerMissing'));
  await assert.rejects(readMonthFor(undefined, 'journal', '2026-10'), refusedWith('error.ownerMissing'));
});

test('a save or delete the store does not confirm as asked is refused as unconfirmed, never answered as done', async () => {
  const key = Symbol.for('tellop.internalRecordsAction');
  const prior = process.env.TELLOP_INTERNAL_RECORDS;
  process.env.TELLOP_INTERNAL_RECORDS = '1';
  const at = new Date('2026-10-19T09:00:00.000Z');
  const asked = { book: 'journal', day: '2026-10-19', text: 'A page.' };
  const row = { id: 1, ownerId: DIARY_OWNER, book: 'journal', day: '2026-10-19', text: 'A page.', createdAt: at.toISOString(), updatedAt: at.toISOString() };
  const unconfirmed = (error) => error instanceof DataError && error.messageKey === 'error.saveUnconfirmed';
  try {
    globalThis[key] = async () => [row];
    assert.equal((await savePageFor(DIARY_OWNER, asked, { now: () => at })).text, 'A page.', 'the matching row is the control');
    for (const changed of [{ text: 'Another page.' }, { updatedAt: '2026-10-19T09:00:01.000Z' }, { day: '2026-10-18' }, { book: 'dreams' }, { ownerId: 'someone-else' }]) {
      globalThis[key] = async () => [{ ...row, ...changed }];
      await assert.rejects(() => savePageFor(DIARY_OWNER, asked, { now: () => at }), unconfirmed, JSON.stringify(changed));
    }
    globalThis[key] = async () => [{ count: 1 }];
    assert.deepEqual(await deletePageFor(DIARY_OWNER, 'journal', '2026-10-19'), { removed: true });
    for (const count of [2, -1, 'one', undefined]) {
      globalThis[key] = async () => [{ count }];
      await assert.rejects(() => deletePageFor(DIARY_OWNER, 'journal', '2026-10-19'), unconfirmed, String(count));
    }
  } finally {
    delete globalThis[key];
    if (prior === undefined) delete process.env.TELLOP_INTERNAL_RECORDS;
    else process.env.TELLOP_INTERNAL_RECORDS = prior;
  }
});

test('the store refuses what the bounds refuse, in words', async () => {
  await assert.rejects(savePageFor(DIARY_OWNER, { book: 'notes', day: '2026-10-19', text: 'a' }), refusedWith(REFUSED.book));
  await assert.rejects(savePageFor(DIARY_OWNER, { book: 'journal', day: '1899-12-31', text: 'a' }), refusedWith(REFUSED.dayRange));
  await assert.rejects(savePageFor(DIARY_OWNER, { book: 'journal', day: '2026-02-29', text: 'a' }), refusedWith(REFUSED.day));
  await assert.rejects(savePageFor(DIARY_OWNER, { book: 'journal', day: '2026-10-19', text: ' ' }), refusedWith(REFUSED.empty));
  await assert.rejects(savePageFor(DIARY_OWNER, { book: 'journal', day: '2026-10-19', text: 'a'.repeat(20001) }), refusedWith(REFUSED.long));
  await assert.rejects(readPageFor(DIARY_OWNER, 'journal', '2101-01-01'), refusedWith(REFUSED.dayRange));
  await assert.rejects(deletePageFor(DIARY_OWNER, 'dream', '2026-10-19'), refusedWith(REFUSED.book));
  const edgeFirst = await savePageFor(DIARY_OWNER, { book: 'journal', day: '1900-01-01', text: 'a'.repeat(20000) });
  assert.equal(edgeFirst.text.length, 20000);
  assert.equal((await savePageFor(DIARY_OWNER, { book: 'dreams', day: '2100-12-31', text: 'b' })).text, 'b');
  assert.equal((await savePageFor(DIARY_OWNER, { book: 'dreams', day: '2028-02-29', text: 'c' })).day, '2028-02-29');
});

/* ---------- the address ---------- */

/**
 * @param {string} method
 * @param {unknown} body
 * @param {Record<string, string>} [headers]
 */
function call(method, body, headers = { 'content-type': 'application/json' }) {
  return new Request('http://app.invalid/api/diary', { method, headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

/** @param {Response} response */
function assertPrivate(response) {
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  if (response.status !== 405) assert.equal(response.headers.get('cache-control'), 'no-store');
}

test('the address saves a page for the one owner, whatever owner a request names', async () => {
  const response = await route.POST(call('POST', { owner: 'intruder', ownerId: 'intruder', book: 'dreams', day: '2026-10-20', text: ' Flying. ' }));
  assertPrivate(response);
  assert.equal(response.status, 200);
  const { page } = await response.json();
  assert.deepEqual([page.book, page.day, page.text], ['dreams', '2026-10-20', 'Flying.']);
  assert.equal((await readPageFor(DIARY_OWNER, 'dreams', '2026-10-20'))?.text, 'Flying.');
  assert.equal(await readPageFor('intruder', 'dreams', '2026-10-20'), null);
});

test('the address refuses each bound with its message key', async () => {
  const cases = [
    [{ book: 'notes', day: '2026-10-19', text: 'a' }, REFUSED.book],
    [{ book: 'journal', day: '2101-01-01', text: 'a' }, REFUSED.dayRange],
    [{ book: 'journal', day: '2026-02-29', text: 'a' }, REFUSED.day],
    [{ book: 'journal', day: '2026-10-19', text: '   ' }, REFUSED.empty],
    [{ book: 'journal', day: '2026-10-19', text: 'a'.repeat(20001) }, REFUSED.long],
    [{ book: 'journal', day: '2026-10-19' }, REFUSED.request],
  ];
  for (const [body, key] of cases) {
    const response = await route.POST(call('POST', body));
    assertPrivate(response);
    assert.equal(response.status, 400, key);
    assert.deepEqual(await response.json(), { problem: key });
  }
  const atLimit = await route.POST(call('POST', { book: 'journal', day: '2026-10-21', text: 'a'.repeat(20000) }));
  assert.equal(atLimit.status, 200);
});

test('the address reads only a JSON object of a bounded size', async () => {
  const plain = await route.POST(call('POST', { book: 'journal', day: '2026-10-19', text: 'a' }, { 'content-type': 'text/plain' }));
  assert.deepEqual([plain.status, await plain.json()], [400, { problem: REFUSED.request }]);
  for (const body of ['not json', '[1,2]', 'null', '"text"']) {
    const response = await route.POST(call('POST', body));
    assert.deepEqual([response.status, await response.json()], [400, { problem: REFUSED.request }], body);
  }
  const text = 'a'.repeat(MAX_BODY_BYTES);
  const counted = await route.POST(call('POST', { book: 'journal', day: '2026-10-19', text }));
  assert.deepEqual([counted.status, await counted.json()], [413, { problem: REFUSED.long }], 'counted as it arrives');
  const declared = await route.POST(call('POST', '{}', { 'content-type': 'application/json', 'content-length': String(MAX_BODY_BYTES + 1) }));
  assert.deepEqual([declared.status, await declared.json()], [413, { problem: REFUSED.long }], 'refused by its declared size');
  const justUnder = await route.POST(call('POST', '{}', { 'content-type': 'application/json', 'content-length': '2' }));
  assert.deepEqual([justUnder.status, await justUnder.json()], [400, { problem: REFUSED.book }], 'a small body is read');
});

test('the address deletes a page, and answers "already gone" for a page that is not there', async () => {
  await savePageFor(DIARY_OWNER, { book: 'dreams', day: '2026-10-22', text: 'A cat with a map.' });
  const first = await route.DELETE(call('DELETE', { book: 'dreams', day: '2026-10-22', owner: 'intruder' }));
  assertPrivate(first);
  assert.deepEqual([first.status, await first.json()], [200, { removed: true }]);
  const again = await route.DELETE(call('DELETE', { book: 'dreams', day: '2026-10-22' }));
  assert.deepEqual([again.status, await again.json()], [200, { removed: false, notice: 'diary.alreadyGone' }]);
  const badDay = await route.DELETE(call('DELETE', { book: 'dreams', day: '2026-02-29' }));
  assert.deepEqual([badDay.status, await badDay.json()], [400, { problem: REFUSED.day }]);
  const badBook = await route.DELETE(call('DELETE', { book: 'notes', day: '2026-10-22' }));
  assert.deepEqual([badBook.status, await badBook.json()], [400, { problem: REFUSED.book }]);
  const preflight = route.OPTIONS();
  assertPrivate(preflight);
  assert.equal(preflight.status, 405);
});

/* ---------- the words ---------- */

test('every word the diary shows exists in both languages and names no machinery', () => {
  const needed = [
    'app.title', 'app.tagline', 'diary.alreadyGone', 'diary.deleted', 'diary.saved', 'diary.meta', 'diary.lastChanged',
    'diary.words', 'diary.wordsOne', 'diary.emptyMonth', 'diary.writeToday', 'diary.thisMonth', 'diary.backTo',
    ...Object.values(REFUSED),
    ...BOOKS.flatMap((book) => [`diary.book.${book}`, `diary.placeholder.${book}`, `diary.pageOf.${book}`, `diary.deleteBody.${book}`]),
  ];
  for (const key of needed) {
    for (const locale of ['en', 'tr']) assert.ok(typeof MESSAGES[locale][key] === 'string' && MESSAGES[locale][key].trim() !== '', `${locale} ${key}`);
  }
  const banned = /\b(table|column|migration|sql|schema|constraint|index|transaction|rollback|branch|commit|merge|database|record|tablo|sütun|şema|veritabanı)\b/iu;
  for (const locale of ['en', 'tr']) {
    for (const [key, words] of Object.entries(MESSAGES[locale])) {
      if (key.startsWith('diary.') || key.startsWith('app.')) assert.doesNotMatch(words, banned, `${locale} ${key}`);
    }
  }
});

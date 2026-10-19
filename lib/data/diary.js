/**
 * The diary's pages: one page per owner, book and day.
 *
 * Every read, save and delete names its owner, and goes through `modelAction`
 * from `./index.js`, never the generated client. A read never creates a row:
 * a day with no page is simply a day with no page.
 *
 * Values are copied into plain objects before they leave this file, because the
 * records route used inside Tellop answers objects with no prototype.
 */

import { cleanText, dayProblem, isBook, isMonth, monthDays, pageProblem, REFUSED } from '../diary/bounds.js';

import { DataError, modelAction } from './index.js';

/**
 * @typedef {{ book: string, day: string, text: string, createdAt: string, updatedAt: string }} DiaryPageView
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function requireOwner(value) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new DataError('error.ownerMissing');
  return value.trim();
}

/** @param {unknown} value */
function requireBook(value) {
  if (!isBook(value)) throw new DataError(REFUSED.book);
  return /** @type {string} */ (value);
}

/** @param {unknown} value */
function requireDay(value) {
  const problem = dayProblem(value);
  if (problem !== null) throw new DataError(problem);
  return /** @type {string} */ (value);
}

/**
 * A saved row as a plain view.
 *
 * @param {any} row
 * @returns {DiaryPageView}
 */
function view(row) {
  if (row === null || row === undefined || typeof row !== 'object') throw new DataError('error.storageUnreadable');
  const { book, day, text, createdAt, updatedAt } = row;
  for (const value of [book, day, text, createdAt, updatedAt]) {
    if (typeof value !== 'string') throw new DataError('error.storageUnreadable');
  }
  return { book, day, text, createdAt, updatedAt };
}

/**
 * Runs one records call and turns an unexpected failure into words a person can
 * read. A `DataError` passes through as it is.
 *
 * @template T
 * @param {() => Promise<T>} work
 * @param {string} failureKey
 * @returns {Promise<T>}
 */
async function guarded(work, failureKey) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DataError) throw error;
    throw new DataError(failureKey);
  }
}

/**
 * One month's pages of one book, earliest day first (at most 31).
 *
 * @param {unknown} ownerId
 * @param {unknown} book
 * @param {unknown} month `YYYY-MM`
 * @returns {Promise<DiaryPageView[]>}
 */
export async function readMonthFor(ownerId, book, month) {
  const owner = requireOwner(ownerId);
  const chosen = requireBook(book);
  if (!isMonth(month)) throw new DataError(REFUSED.day);
  const { first, last } = monthDays(/** @type {string} */ (month));
  const rows = await guarded(
    () => modelAction('DiaryPage', 'findMany', {
      where: { ownerId: owner, book: chosen, day: { gte: first, lte: last } },
      orderBy: { day: 'asc' },
      take: 31,
      select: { book: true, day: true, text: true, createdAt: true, updatedAt: true },
    }),
    'error.storageUnreadable',
  );
  if (!Array.isArray(rows)) throw new DataError('error.storageUnreadable');
  return rows.map(view);
}

/**
 * Which days of one month have a page, without the pages' words. The month
 * calendar falls back to this when the pages together are too long to read in
 * one go, so the marks still show.
 *
 * @param {unknown} ownerId
 * @param {unknown} book
 * @param {unknown} month `YYYY-MM`
 * @returns {Promise<string[]>}
 */
export async function readMonthDaysFor(ownerId, book, month) {
  const owner = requireOwner(ownerId);
  const chosen = requireBook(book);
  if (!isMonth(month)) throw new DataError(REFUSED.day);
  const { first, last } = monthDays(/** @type {string} */ (month));
  const rows = await guarded(
    () => modelAction('DiaryPage', 'findMany', {
      where: { ownerId: owner, book: chosen, day: { gte: first, lte: last } },
      orderBy: { day: 'asc' },
      take: 31,
      select: { day: true },
    }),
    'error.storageUnreadable',
  );
  if (!Array.isArray(rows) || rows.some((row) => typeof row?.day !== 'string')) throw new DataError('error.storageUnreadable');
  return rows.map((row) => String(row.day));
}

/**
 * One page by its day, or `null` when that day has none.
 *
 * @param {unknown} ownerId
 * @param {unknown} book
 * @param {unknown} day
 * @returns {Promise<DiaryPageView | null>}
 */
export async function readPageFor(ownerId, book, day) {
  const owner = requireOwner(ownerId);
  const chosen = requireBook(book);
  const date = requireDay(day);
  const row = await guarded(
    () => modelAction('DiaryPage', 'findFirst', {
      where: { ownerId: owner, book: chosen, day: date },
      select: { book: true, day: true, text: true, createdAt: true, updatedAt: true },
    }),
    'error.storageUnreadable',
  );
  if (row === null || row === undefined) return null;
  return view(row);
}

/**
 * Saves a day's page in one step: a new page, or the day's page changed. It
 * answers only after the saved page matches what was asked; anything else is
 * an unconfirmed save.
 *
 * @param {unknown} ownerId
 * @param {{ book?: unknown, day?: unknown, text?: unknown }} page
 * @param {{ now?: () => Date }} [options]
 * @returns {Promise<DiaryPageView>}
 */
export async function savePageFor(ownerId, page, options = {}) {
  const owner = requireOwner(ownerId);
  const problem = pageProblem(page ?? {});
  if (problem !== null) throw new DataError(problem);
  const book = /** @type {string} */ (page.book);
  const day = /** @type {string} */ (page.day);
  const text = cleanText(/** @type {string} */ (page.text));
  const at = (options.now?.() ?? new Date()).toISOString();
  const row = await guarded(
    () => modelAction('DiaryPage', 'upsert', {
      where: { ownerId_book_day: { ownerId: owner, book, day } },
      create: { ownerId: owner, book, day, text, createdAt: at, updatedAt: at },
      update: { text, updatedAt: at },
    }),
    'error.saveFailed',
  );
  const saved = view(row);
  if (row.ownerId !== owner || saved.book !== book || saved.day !== day || saved.text !== text || saved.updatedAt !== at) {
    throw new DataError('error.saveUnconfirmed');
  }
  return saved;
}

/**
 * Deletes a day's page. The owner, the book and the day are all inside the
 * delete itself. A page that is not there is "already gone", not an error.
 *
 * @param {unknown} ownerId
 * @param {unknown} book
 * @param {unknown} day
 * @returns {Promise<{ removed: boolean }>}
 */
export async function deletePageFor(ownerId, book, day) {
  const owner = requireOwner(ownerId);
  const chosen = requireBook(book);
  const date = requireDay(day);
  const result = await guarded(
    () => modelAction('DiaryPage', 'deleteMany', { where: { ownerId: owner, book: chosen, day: date } }),
    'error.saveFailed',
  );
  const count = Number(result?.count);
  if (count === 1) return { removed: true };
  if (count === 0) return { removed: false };
  throw new DataError('error.saveUnconfirmed');
}

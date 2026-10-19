/**
 * What a diary page may be, as small pure functions.
 *
 * The page, the writing box and the addresses all ask these, so a bound is
 * written once. Nothing here reads or saves anything, and nothing here imports
 * anything, so the browser can use the same rules as the server.
 *
 * A refusal is a message key under `diary.refused.*` in `lib/i18n/locales/`,
 * never a sentence: the words are chosen in the reader's language where they
 * are shown.
 */

/** The two books, built in. Both look and work the same; only their words differ. */
export const BOOKS = Object.freeze(['journal', 'dreams']);

/** The book a page opens on when the address names none. */
export const DEFAULT_BOOK = 'journal';

/** The first and the last day a page can be written for, both included. */
export const FIRST_DAY = '1900-01-01';
export const LAST_DAY = '2100-12-31';

/** The longest page, in characters after the spaces around it are removed. */
export const MAX_TEXT = 20000;

/** How many words of a page show on the month calendar. */
export const FIRST_WORDS = 8;

/** Every refusal key this module can answer. */
export const REFUSED = Object.freeze({
  book: 'diary.refused.book',
  day: 'diary.refused.day',
  dayRange: 'diary.refused.dayRange',
  empty: 'diary.refused.empty',
  long: 'diary.refused.long',
  request: 'diary.refused.request',
});

const DAY_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const MONTH_SHAPE = /^(\d{4})-(\d{2})$/u;

/** @param {number} value @param {number} width */
function padded(value, width) {
  return String(value).padStart(width, '0');
}

/**
 * Days in a month of the civil calendar.
 *
 * @param {number} year
 * @param {number} month 1 to 12
 */
function daysIn(year, month) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** @param {unknown} value */
export function isBook(value) {
  return typeof value === 'string' && BOOKS.includes(value);
}

/**
 * Whether a value is a real civil day written `YYYY-MM-DD` (any year).
 *
 * @param {unknown} value
 */
export function isRealDay(value) {
  const match = typeof value === 'string' ? DAY_SHAPE.exec(value) : null;
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysIn(year, month);
}

/**
 * Why a day cannot hold a page, or `null` when it can.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function dayProblem(value) {
  if (!isRealDay(value)) return REFUSED.day;
  const day = /** @type {string} */ (value);
  if (day < FIRST_DAY || day > LAST_DAY) return REFUSED.dayRange;
  return null;
}

/**
 * A page's text as it is kept: the spaces and empty lines around it removed.
 *
 * @param {string} value
 */
export function cleanText(value) {
  return value.trim();
}

/**
 * How long a text is, in code points (a single emoji counts once; a joined one, such as a family, counts as several).
 *
 * @param {string} value
 */
export function characterCount(value) {
  let count = 0;
  for (const _ of value) count += 1;
  return count;
}

/**
 * Why a text cannot be saved, or `null` when it can.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function textProblem(value) {
  if (typeof value !== 'string') return REFUSED.request;
  const text = cleanText(value);
  if (text.length === 0) return REFUSED.empty;
  if (characterCount(text) > MAX_TEXT) return REFUSED.long;
  return null;
}

/**
 * The first reason a page cannot be saved, or `null` when it can.
 *
 * @param {{ book?: unknown, day?: unknown, text?: unknown }} page
 * @returns {string | null}
 */
export function pageProblem(page) {
  if (!isBook(page.book)) return REFUSED.book;
  return dayProblem(page.day) ?? textProblem(page.text);
}

/**
 * Words in a text: runs of characters between spaces or line breaks.
 *
 * @param {string} value
 */
export function wordCount(value) {
  const words = value.trim();
  return words.length === 0 ? 0 : words.split(/\s+/u).length;
}

/**
 * The first few words of a page, on one line, for the month calendar.
 *
 * @param {string} value
 */
export function firstWords(value) {
  const words = value.trim().split(/\s+/u).filter((word) => word.length > 0);
  const shown = words.slice(0, FIRST_WORDS).join(' ');
  return words.length > FIRST_WORDS ? `${shown}…` : shown;
}

/**
 * The day a moment falls on in this computer's own time, as `YYYY-MM-DD`.
 *
 * @param {Date} moment
 */
export function dayOf(moment) {
  return `${padded(moment.getFullYear(), 4)}-${padded(moment.getMonth() + 1, 2)}-${padded(moment.getDate(), 2)}`;
}

/**
 * The month `YYYY-MM` a day belongs to.
 *
 * @param {string} day a real day
 */
export function monthOf(day) {
  return day.slice(0, 7);
}

/** The first and the last month a page can be written in. */
export const FIRST_MONTH = monthOf(FIRST_DAY);
export const LAST_MONTH = monthOf(LAST_DAY);

/**
 * Whether a value is a month written `YYYY-MM` (any year).
 *
 * @param {unknown} value
 */
export function isMonth(value) {
  const match = typeof value === 'string' ? MONTH_SHAPE.exec(value) : null;
  if (match === null) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

/**
 * A month moved into the months a page can be written in: one before the first
 * becomes the first, one after the last becomes the last.
 *
 * @param {string} month a valid month
 */
export function clampMonth(month) {
  if (month < FIRST_MONTH) return FIRST_MONTH;
  if (month > LAST_MONTH) return LAST_MONTH;
  return month;
}

/**
 * The month `delta` months away.
 *
 * @param {string} month a valid month
 * @param {number} delta
 */
export function shiftMonth(month, delta) {
  const index = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + delta;
  return `${padded(Math.floor(index / 12), 4)}-${padded((index % 12) + 1, 2)}`;
}

/**
 * The first and the last day of a month, both included.
 *
 * @param {string} month a valid month
 */
export function monthDays(month) {
  const last = daysIn(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
  return { first: `${month}-01`, last: `${month}-${padded(last, 2)}` };
}

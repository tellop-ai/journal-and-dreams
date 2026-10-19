/**
 * Dates as a person reads them, in the app's language.
 *
 * The month and day names come from the date library's own English and Turkish
 * words, which the kit already carries; only the order of the parts is chosen
 * here. A diary day is a civil day: it stays on that day whatever the clock.
 * "Last changed" is a moment, shown in this computer's own time.
 */

import { format } from 'date-fns';
import { enUS, tr } from 'date-fns/locale';

const LANGUAGES = Object.freeze({ en: enUS, tr });

const ORDER = Object.freeze({
  en: Object.freeze({ full: 'EEEE, MMMM d, yyyy', day: 'MMMM d, yyyy', when: 'MMMM d, h:mm a', whenYear: 'MMMM d, yyyy, h:mm a' }),
  tr: Object.freeze({ full: 'd MMMM yyyy, EEEE', day: 'd MMMM yyyy', when: 'd MMMM, HH:mm', whenYear: 'd MMMM yyyy, HH:mm' }),
});

/** @param {string} locale */
function chosen(locale) {
  return locale === 'tr' ? 'tr' : 'en';
}

/**
 * A civil day at noon in this computer's own time, so no clock change moves it.
 *
 * @param {string} day a real `YYYY-MM-DD` day
 */
function noonOf(day) {
  const date = new Date(0);
  date.setFullYear(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  date.setHours(12, 0, 0, 0);
  return date;
}

/**
 * "19 Ekim 2026, Pazartesi" or "Monday, October 19, 2026".
 *
 * @param {string} day
 * @param {string} locale
 */
export function fullDate(day, locale) {
  const language = chosen(locale);
  return format(noonOf(day), ORDER[language].full, { locale: LANGUAGES[language] });
}

/**
 * "17 Ekim 2026" or "October 17, 2026".
 *
 * @param {string} day
 * @param {string} locale
 */
export function dayDate(day, locale) {
  const language = chosen(locale);
  return format(noonOf(day), ORDER[language].day, { locale: LANGUAGES[language] });
}

/**
 * When a page last changed: "17 Ekim, 08:12", with the year only when it is
 * not this year. An unreadable moment answers `null` and shows nothing.
 *
 * @param {string} instant an ISO moment
 * @param {string} locale
 * @param {Date} [now]
 * @returns {string | null}
 */
export function changedWhen(instant, locale, now = new Date()) {
  const moment = new Date(instant);
  if (!Number.isFinite(moment.getTime())) return null;
  const language = chosen(locale);
  const pattern = moment.getFullYear() === now.getFullYear() ? ORDER[language].when : ORDER[language].whenYear;
  return format(moment, pattern, { locale: LANGUAGES[language] });
}

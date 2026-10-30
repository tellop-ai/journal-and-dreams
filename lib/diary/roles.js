/**
 * What each person may press (AGENTS.md rule 1), in one place.
 *
 * The diary is one diary: everyone the owner lets in reads the same pages.
 * Online each of them holds a role, and the host refuses every change by a
 * Viewer, and a Member's change or removal of a page the Member did not write.
 * This app cannot tell who wrote a page, so:
 *
 *  - the owner and a Helper keep every press;
 *  - a Member may write a page on a day that has none (a new page), and never
 *    changes or deletes a page that is already there;
 *  - a Viewer reads, moves between months and books, and saves nothing;
 *  - a role this app does not know, or no answer about the person at all,
 *    gets no press that saves, and one line says the app could not tell who
 *    is here: reading still works.
 *
 * Pure: nothing here reads or saves anything.
 */

const ADDS = Object.freeze(['owner', 'helper', 'member']);
const CHANGES = Object.freeze(['owner', 'helper']);

/**
 * Whether this role may write a new page.
 *
 * @param {unknown} role
 * @returns {boolean}
 */
export function canAdd(role) {
  return typeof role === 'string' && ADDS.includes(role);
}

/**
 * Whether this role may change or delete a page that is already there.
 *
 * @param {unknown} role
 * @returns {boolean}
 */
export function canChange(role) {
  return typeof role === 'string' && CHANGES.includes(role);
}

/**
 * Whether the month draws "Write today". It opens today's page, and the
 * writing box when today has none. A role that may change a page always gets
 * it; a role that may only write a new page gets it only when today is known
 * to have no page (`todayHasPage` is `false`, not `null` for "not known"), so
 * it never opens a page that role can only read.
 *
 * @param {unknown} role
 * @param {boolean | null} todayHasPage
 * @returns {boolean}
 */
export function writeTodayShown(role, todayHasPage) {
  if (canChange(role)) return true;
  return canAdd(role) && todayHasPage === false;
}

/**
 * The words' key for the one line a page shows when the answer about the
 * person could not be read (no role, so nothing that saves is drawn), or
 * `null` for a role this app knows.
 *
 * @param {unknown} role
 * @returns {string | null}
 */
export function personNotice(role) {
  return canAdd(role) || role === 'viewer' ? null : 'error.storageUnreadable';
}

/**
 * What a day's screen shows this role:
 *
 *  - `'write'`: the writing box for a new page (the day has none);
 *  - `'change'`: the writing box holding the page's text (`edit` asked for it);
 *  - `'read'`: the page, with Change and Delete only when `controls` is true;
 *  - `'empty'`: the day has no page and this role cannot write one, so a line
 *    says so.
 *
 * @param {unknown} role
 * @param {boolean} hasPage
 * @param {boolean} edit the address asked for the writing box
 * @returns {{ screen: 'write' | 'change' | 'read' | 'empty', controls: boolean }}
 */
export function dayScreen(role, hasPage, edit) {
  if (!hasPage) return { screen: canAdd(role) ? 'write' : 'empty', controls: false };
  if (!canChange(role)) return { screen: 'read', controls: false };
  return { screen: edit === true ? 'change' : 'read', controls: true };
}

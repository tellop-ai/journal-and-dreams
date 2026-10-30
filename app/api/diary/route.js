import { DataError } from '../../../lib/data/index.js';
import { deletePageFor, savePageFor } from '../../../lib/data/diary.js';
import { dayProblem, isBook, pageProblem, REFUSED } from '../../../lib/diary/bounds.js';
import { DIARY_OWNER } from '../../../lib/diary/owner.js';
import { readJsonBody } from '../../../lib/diary/request.js';

/**
 * A diary page, saved or deleted.
 *
 * **Sharing with other websites is off, and it is off by omission.** No response
 * here carries `Access-Control-Allow-Origin`, so a browser refuses to hand this
 * app's answers to a page on another site. There is no read here: the page reads
 * the diary on the server as it opens.
 *
 * The owner is chosen on the server, never taken from the request. Refusals
 * travel as message keys, never as sentences: the words are chosen in the
 * reader's language where they are displayed.
 *
 * No role is checked here; the screens draw only the presses a role may use
 * (`lib/diary/roles.js`). Online the host refuses a Viewer's save or delete,
 * and a Member's save over a page the Member did not write. A Member's delete
 * of such a page is not refused: the host leaves the page and counts nothing
 * removed, and `deletePageFor` reads it once more and answers that as the same
 * refusal. Either way this address answers 403 with its own words.
 */
export const dynamic = 'force-dynamic';

/**
 * @param {unknown} body
 * @param {number} status
 */
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/**
 * A refusal's status: 403 for a change this person may not make (a Viewer's
 * save or delete, a Member's save over or delete of a page the Member did not
 * write), with its own words, "You cannot change this."; 503 for a save nobody
 * could confirm; 400 for the rest.
 *
 * @param {string} key
 */
function statusOf(key) {
  if (key === 'error.cannotChange') return 403;
  if (key === 'error.saveUnconfirmed') return 503;
  return 400;
}

/** @param {unknown} error */
function refusal(error) {
  if (error instanceof DataError) return json({ problem: error.messageKey }, statusOf(error.messageKey));
  return json({ problem: 'error.saveFailed' }, 500);
}

/**
 * Saves a day's page: `{ book, day, text }`.
 *
 * @param {Request} request
 */
export async function POST(request) {
  const body = await readJsonBody(request);
  if (!body.ok) return json({ problem: body.problem }, body.problem === REFUSED.long ? 413 : 400);
  const { book, day, text } = /** @type {{ book?: unknown, day?: unknown, text?: unknown }} */ (body.value);
  const problem = pageProblem({ book, day, text });
  if (problem !== null) return json({ problem }, 400);
  try {
    return json({ page: await savePageFor(DIARY_OWNER, { book, day, text }) });
  } catch (error) {
    return refusal(error);
  }
}

/**
 * Deletes a day's page: `{ book, day }`. A page that is not there answers
 * "already gone", not an error; a page still there after a delete that removed
 * nothing answers 403, "You cannot change this." (see `deletePageFor`).
 *
 * @param {Request} request
 */
export async function DELETE(request) {
  const body = await readJsonBody(request);
  if (!body.ok) return json({ problem: body.problem }, 400);
  const { book, day } = /** @type {{ book?: unknown, day?: unknown }} */ (body.value);
  if (!isBook(book)) return json({ problem: REFUSED.book }, 400);
  const problem = dayProblem(day);
  if (problem !== null) return json({ problem }, 400);
  try {
    const { removed } = await deletePageFor(DIARY_OWNER, book, day);
    return json(removed ? { removed: true } : { removed: false, notice: 'diary.alreadyGone' });
  } catch (error) {
    return refusal(error);
  }
}

/** No cross-origin preflight is answered: another site's request gets no sharing header. */
export function OPTIONS() {
  return new Response(null, { status: 405, headers: { allow: 'POST, DELETE' } });
}

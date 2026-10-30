/**
 * The person on this visit, as the diary's screens need it. Server only.
 *
 * `role` is what `currentPerson()` answers, or `null` when the host's answer
 * about the person could not be read: then the screens draw no press that
 * saves (`lib/diary/roles.js` gives `null` nothing) and reading still works.
 * `preview` is true only while the owner looks at the app as a Member or a
 * Viewer; the layout then draws the way back to their own view.
 *
 * It never chooses whose pages are read: the diary is one diary
 * (`lib/diary/owner.js`).
 */

import { currentPerson } from '../data/person.js';

/**
 * @returns {Promise<{ role: string | null, preview: boolean }>}
 */
export async function visitor() {
  try {
    const person = await currentPerson();
    return Object.freeze({ role: person.role, preview: person.preview === true });
  } catch {
    return Object.freeze({ role: null, preview: false });
  }
}

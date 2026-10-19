/**
 * Recording a person's own sound in the page, such as a voice note they keep (AGENTS.md rule 6c).
 *
 * A recording is the person's file, kept whole like a photo: the page sends it
 * with `sendFile` (`lib/send-file.js`), the server keeps it with `keepFile`, and
 * a record names it by its digest in a field ending `File`. AI that writes a
 * recording down comes in a later version, so offer no press that asks for it.
 * A browser left to choose often records WebM, so always record in the type
 * `recordingType()` picks:
 *
 *     const type = recordingType();
 *     // No type: this browser cannot record in that type. Rest the record
 *     // button and say so beside it, in words from the locale files.
 *     const recorder = new MediaRecorder(stream, { mimeType: type });
 *     // ...then send new Blob(parts, { type }) with sendFile (lib/send-file.js)
 *     // and keep its digest with the record (rule 6c).
 *
 * Nothing here imports anything, so the browser and a check can both load it
 * (`lib/ai.js` reads the server's files, so the page cannot import it).
 */

/** AAC in MP4, the type Tellop's own window records, then a bare MP4 (Safari's AAC). Never WebM or Ogg. */
export const RECORDING_TYPES = Object.freeze(['audio/mp4;codecs=mp4a.40.2', 'audio/mp4']);

/** A browser that can record Opus in MP4 may answer a bare MP4 with Opus, which Tellop cannot read either. */
const OPUS_IN_MP4 = 'audio/mp4;codecs=opus';

function supports(recorder, type) {
  try {
    return recorder.isTypeSupported(type) === true;
  } catch {
    return false;
  }
}

/**
 * The type to record in, or `undefined` when this browser records nothing Tellop
 * can read (then rest the record button and say so beside it).
 */
export function recordingType(recorder = globalThis.MediaRecorder) {
  if (typeof recorder?.isTypeSupported !== 'function') return undefined;
  if (supports(recorder, RECORDING_TYPES[0])) return RECORDING_TYPES[0];
  if (supports(recorder, RECORDING_TYPES[1]) && !supports(recorder, OPUS_IN_MP4)) return RECORDING_TYPES[1];
  return undefined;
}

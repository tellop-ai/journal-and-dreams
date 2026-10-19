'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button, buttonVariants } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import { cleanText, pageProblem, wordCount } from '../lib/diary/bounds.js';
import { formatDecimal } from '../lib/format.js';
import { t } from '../lib/i18n/index.js';

/**
 * Writing a day's page: plain text, a word count under the box, Save and
 * Cancel.
 *
 * It says what happened after sending, as the kit's form does: the read view
 * opens with "Saved." only after the app answers with the page exactly as it
 * was sent; on a refusal the words stay in the box and the reason shows under
 * it. Cancel leaves without saving, and the unsaved words go with the box.
 */
export function PageForm({ book, day, initialText, label, placeholder, cancelHref, locale }) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [problemKey, setProblemKey] = useState('');
  const count = wordCount(text);

  async function submit(event) {
    event.preventDefault();
    setProblemKey('');
    const problem = pageProblem({ book, day, text });
    if (problem !== null) {
      setProblemKey(problem);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/diary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ book, day, text }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setProblemKey(typeof payload?.problem === 'string' ? payload.problem : 'error.saveUnconfirmed');
        return;
      }
      const page = payload?.page;
      if (page?.book !== book || page?.day !== day || page?.text !== cleanText(text)) {
        setProblemKey('error.saveUnconfirmed');
        return;
      }
      router.push(`/?book=${book}&day=${day}&saved=1`);
    } catch {
      setProblemKey('error.saveUnconfirmed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Textarea
        aria-label={label}
        aria-invalid={problemKey === '' ? undefined : true}
        className="min-h-64 bg-card px-4 py-3 font-heading text-base leading-relaxed md:text-base"
        disabled={busy}
        name="text"
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        value={text}
      />
      <p className="text-[0.8125rem] text-muted-foreground">
        {count === 1 ? t('diary.wordsOne', locale) : t('diary.words', locale, { n: formatDecimal(String(count), locale) })}
      </p>
      {problemKey === '' ? null : (
        <p role="alert" className="problem">
          {t(problemKey, locale)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} type="submit">
          {busy ? t('diary.saving', locale) : t('diary.save', locale)}
        </Button>
        <Link className={buttonVariants({ variant: 'outline' })} href={cancelHref}>
          {t('diary.cancel', locale)}
        </Link>
      </div>
    </form>
  );
}

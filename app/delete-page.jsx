'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

import { t } from '../lib/i18n/index.js';

/**
 * Delete, asked first. The question names the day and the book. After the app
 * answers, the month opens with a line that says what happened: deleted, or
 * already gone (deleted somewhere else first). On any other answer the
 * question stays open with the reason.
 */
export function DeletePage({ book, day, monthHref, body, locale }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problemKey, setProblemKey] = useState('');

  async function remove() {
    setBusy(true);
    setProblemKey('');
    try {
      const response = await fetch('/api/diary', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ book, day }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setProblemKey(typeof payload?.problem === 'string' ? payload.problem : 'error.saveUnconfirmed');
        return;
      }
      if (payload?.removed === true) router.push(`${monthHref}&done=deleted`);
      else if (payload?.removed === false) router.push(`${monthHref}&done=gone`);
      else setProblemKey('error.saveUnconfirmed');
    } catch {
      setProblemKey('error.saveUnconfirmed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setProblemKey('');
      }}
    >
      <AlertDialogTrigger render={<Button variant="outline" className="text-destructive hover:text-destructive" />}>
        {t('diary.delete', locale)}
      </AlertDialogTrigger>
      <AlertDialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('diary.deleteTitle', locale)}</AlertDialogTitle>
            <AlertDialogDescription>{body}</AlertDialogDescription>
          </AlertDialogHeader>
          {problemKey === '' ? null : (
            <p role="alert" className="problem mt-3">
              {t(problemKey, locale)}
            </p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t('diary.cancel', locale)}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={busy}
            onClick={remove}
          >
            {busy ? t('diary.deleting', locale) : t('diary.deleteConfirm', locale)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

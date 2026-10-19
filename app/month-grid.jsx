'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { MonthPlanner } from '@/components/ui/month-planner';

import { dayProblem } from '../lib/diary/bounds.js';
import { fullDate } from '../lib/diary/dates.js';
import { t } from '../lib/i18n/index.js';

/**
 * The month calendar: every day with a page shows a mark and the page's first
 * words. Pressing a day opens it: its page when it has one, the writing box
 * when it has none.
 *
 * The calendar draws its days as plain boxes, so this wrapper makes each day a
 * link a keyboard can reach too (Tab, then Enter), named by its full date and
 * whether it has a page, so a screen reader says more than the day's number
 * (the marks can show without first words). The calendar is drawn afresh
 * for every book and month (`key`), so the days are made reachable once each
 * time. Opening a day only changes the address; nothing is saved.
 */
export function MonthGrid({ book, month, today, entries, locale }) {
  const router = useRouter();
  const holder = useRef(null);

  useEffect(() => {
    const written = new Set(entries.map((entry) => entry.date));
    const days = holder.current?.querySelectorAll('[data-date]') ?? [];
    for (const cell of days) {
      const day = cell.getAttribute('data-date');
      cell.setAttribute('role', 'link');
      cell.tabIndex = 0;
      if (dayProblem(day) === null) cell.setAttribute('aria-label', t(written.has(day) ? 'diary.dayWritten' : 'diary.dayEmpty', locale, { date: fullDate(day, locale) }));
    }
  }, [book, month, entries, locale]);

  function open(target) {
    const cell = target instanceof Element ? target.closest('[data-date]') : null;
    if (cell === null || !holder.current?.contains(cell)) return false;
    const day = cell.getAttribute('data-date');
    if (dayProblem(day) !== null) return false;
    router.push(`/?book=${book}&day=${day}`);
    return true;
  }

  function onKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (open(event.target)) event.preventDefault();
  }

  return (
    <div ref={holder} className="diary-month" onClick={(event) => open(event.target)} onKeyDown={onKeyDown}>
      <MonthPlanner
        key={`${book}-${month}`}
        initialMonth={`${month}-01`}
        today={dayProblem(today) === null ? today : undefined}
        entries={entries}
        locale={locale}
        className="overflow-hidden bg-card"
      />
    </div>
  );
}

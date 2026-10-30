import Link from 'next/link';
import { ChevronLeft, ChevronRight, PenLine } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyDescription } from '@/components/ui/empty';

import { DataError } from '../lib/data/index.js';
import { readMonthDaysFor, readMonthFor, readPageFor } from '../lib/data/diary.js';
import {
  clampMonth,
  dayOf,
  dayProblem,
  DEFAULT_BOOK,
  FIRST_MONTH,
  firstWords,
  isBook,
  isMonth,
  LAST_MONTH,
  monthOf,
  shiftMonth,
  wordCount,
} from '../lib/diary/bounds.js';
import { changedWhen, dayDate, fullDate } from '../lib/diary/dates.js';
import { DIARY_OWNER } from '../lib/diary/owner.js';
import { canAdd, canChange, dayScreen, personNotice, writeTodayShown } from '../lib/diary/roles.js';
import { visitor } from '../lib/diary/visitor.js';
import { formatDecimal, formatMonth } from '../lib/format.js';
import { getLocale, t } from '../lib/i18n/index.js';
import { cn } from '../lib/utils.js';

import { BookTabs } from './book-tabs.jsx';
import { DeletePage } from './delete-page.jsx';
import { MonthGrid } from './month-grid.jsx';
import { PageForm } from './page-form.jsx';

/**
 * The diary: one page, its state in the address.
 *
 *  - `/?book=journal|dreams&month=YYYY-MM`: a book's month.
 *  - `/?book=…&day=YYYY-MM-DD`: a day's page, or the writing box when the day
 *    has none; `&edit=1` opens the writing box with the page's text.
 *
 * `data-tellop-app-marker` is what Tellop's health probe looks for: keep it on
 * the outermost element. Every read goes through `lib/data/` and names the one
 * owner; opening any of these addresses saves nothing.
 *
 * Everyone reads the same diary. What a person may press comes from their role
 * (`lib/diary/roles.js`), asked once per visit before any page is read: a
 * Member writes only on a day with no page, a Viewer only reads, and when the
 * answer about the person cannot be read nobody gets a press that saves and one
 * line says so.
 */
export const dynamic = 'force-dynamic';

/** @param {unknown} value */
function single(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

/** @param {unknown} error */
function problemOf(error) {
  return error instanceof DataError ? error.messageKey : 'error.storageUnreadable';
}

/** @param {string} book @param {string} month */
function monthAddress(book, month) {
  return `/?book=${book}&month=${month}`;
}

/** @param {string} book @param {string} day */
function dayAddress(book, day) {
  return `/?book=${book}&day=${day}`;
}

/** @param {number} count @param {string} locale */
function wordsLine(count, locale) {
  return count === 1 ? t('diary.wordsOne', locale) : t('diary.words', locale, { n: formatDecimal(String(count), locale) });
}

/**
 * "38 words · last changed 17 October, 08:12".
 *
 * @param {{ text: string, updatedAt: string }} page
 * @param {string} locale
 */
function metaLine(page, locale) {
  const words = wordsLine(wordCount(page.text), locale);
  const when = changedWhen(page.updatedAt, locale);
  return when === null ? words : t('diary.meta', locale, { words, changed: t('diary.lastChanged', locale, { when }) });
}

export default async function Page({ searchParams }) {
  const locale = getLocale();
  const params = (await searchParams) ?? {};
  const asked = single(params.book);
  const book = isBook(asked) ? asked : DEFAULT_BOOK;
  const today = dayOf(new Date());
  const askedDay = single(params.day);
  const day = askedDay !== undefined && dayProblem(askedDay) === null ? askedDay : null;
  const askedMonth = single(params.month);
  const month = day !== null ? monthOf(day) : clampMonth(isMonth(askedMonth) ? askedMonth : monthOf(today));
  const { role } = await visitor();
  const notice = personNotice(role);

  return (
    <main className="diary" data-tellop-app-marker="ok">
      <header className="mb-6 flex flex-col gap-1">
        <h1>{t('app.title', locale)}</h1>
        <p className="tagline">{t('app.tagline', locale)}</p>
      </header>
      {notice === null ? null : (
        <p role="alert" className="problem mb-4">
          {t(notice, locale)}
        </p>
      )}
      <BookTabs book={book} month={month} locale={locale}>
        {day === null ? (
          <MonthView book={book} month={month} today={today} done={single(params.done)} role={role} locale={locale} />
        ) : (
          <DayView book={book} day={day} edit={single(params.edit) === '1'} saved={single(params.saved) === '1'} role={role} locale={locale} />
        )}
      </BookTabs>
    </main>
  );
}

async function MonthView({ book, month, today, done, role, locale }) {
  let entries = [];
  let problem = '';
  try {
    const pages = await readMonthFor(DIARY_OWNER, book, month);
    entries = pages.map((page) => ({ id: page.day, date: page.day, name: firstWords(page.text), kind: '', status: '' }));
  } catch {
    // Too long to read in one go, or not readable at all: the days still get
    // their marks when only the days can be read.
    try {
      const days = await readMonthDaysFor(DIARY_OWNER, book, month);
      entries = days.map((day) => ({ id: day, date: day, name: '', kind: '', status: '' }));
    } catch (error) {
      problem = problemOf(error);
    }
  }
  const monthName = formatMonth(month, locale);
  const todayInRange = dayProblem(today) === null;
  // Whether today has a page, asked only for a role that may write a new page
  // but not change one (a Member), so "Write today" never opens a page that
  // role can only read: from this month's marks when today is in it, else by
  // reading the days of today's month once. Not known stays `null` (no button).
  let todayHasPage = null;
  if (todayInRange && canAdd(role) && !canChange(role)) {
    if (monthOf(today) === month) {
      todayHasPage = problem === '' ? entries.some((entry) => entry.date === today) : null;
    } else {
      try {
        todayHasPage = (await readMonthDaysFor(DIARY_OWNER, book, monthOf(today))).includes(today);
      } catch {
        todayHasPage = null;
      }
    }
  }
  const writeToday = todayInRange && writeTodayShown(role, todayHasPage);
  const outline = buttonVariants({ variant: 'outline' });
  const arrow = buttonVariants({ variant: 'outline', size: 'icon' });

  return (
    <section className="flex flex-col gap-4" aria-label={monthName}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          {month > FIRST_MONTH ? (
            <Link className={arrow} href={monthAddress(book, shiftMonth(month, -1))} aria-label={t('diary.previousMonth', locale)}>
              <ChevronLeft aria-hidden="true" />
            </Link>
          ) : (
            <Button variant="outline" size="icon" disabled aria-label={t('diary.previousMonth', locale)}>
              <ChevronLeft aria-hidden="true" />
            </Button>
          )}
          <h2 className="min-w-36 text-center text-xl">{monthName}</h2>
          {month < LAST_MONTH ? (
            <Link className={arrow} href={monthAddress(book, shiftMonth(month, 1))} aria-label={t('diary.nextMonth', locale)}>
              <ChevronRight aria-hidden="true" />
            </Link>
          ) : (
            <Button variant="outline" size="icon" disabled aria-label={t('diary.nextMonth', locale)}>
              <ChevronRight aria-hidden="true" />
            </Button>
          )}
        </div>
        <Link className={outline} href={monthAddress(book, clampMonth(monthOf(today)))}>
          {t('diary.thisMonth', locale)}
        </Link>
        {writeToday ? (
          <Link className={cn(buttonVariants({ size: 'lg' }), 'ml-auto px-3.5')} href={dayAddress(book, today)}>
            <PenLine data-icon="inline-start" aria-hidden="true" />
            {t('diary.writeToday', locale)}
          </Link>
        ) : null}
      </div>
      {done === 'deleted' || done === 'gone' ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t(done === 'deleted' ? 'diary.deleted' : 'diary.alreadyGone', locale)}
        </p>
      ) : null}
      {problem === '' ? null : (
        <p role="alert" className="problem">
          {t(problem, locale)}
        </p>
      )}
      <MonthGrid book={book} month={month} today={today} entries={entries} locale={locale} />
      {problem === '' && entries.length === 0 ? (
        <Empty className="p-4">
          <EmptyDescription>{t('diary.emptyMonth', locale)}</EmptyDescription>
        </Empty>
      ) : null}
    </section>
  );
}

async function DayView({ book, day, edit, saved, role, locale }) {
  let page = null;
  let problem = '';
  try {
    page = await readPageFor(DIARY_OWNER, book, day);
  } catch (error) {
    problem = problemOf(error);
  }
  const month = monthOf(day);
  const monthName = formatMonth(month, locale);
  const heading = fullDate(day, locale);
  // What this role sees of the day: the writing box only for a role that may write it (`lib/diary/roles.js`).
  const { screen, controls } = dayScreen(role, page !== null, edit);

  return (
    <section className="flex flex-col gap-3" aria-label={heading}>
      <Link
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-2 w-fit text-muted-foreground')}
        href={monthAddress(book, month)}
        aria-label={t('diary.backTo', locale, { month: monthName })}
      >
        <ChevronLeft data-icon="inline-start" aria-hidden="true" />
        {monthName}
      </Link>
      <Card>
        <CardContent className="flex flex-col gap-4 px-5">
          <h2 className="text-2xl">{heading}</h2>
          {problem !== '' ? (
            <p role="alert" className="problem">
              {t(problem, locale)}
            </p>
          ) : screen === 'empty' ? (
            <Empty className="p-4">
              <EmptyDescription>{t('diary.noPage', locale)}</EmptyDescription>
            </Empty>
          ) : screen === 'write' || screen === 'change' ? (
            <PageForm
              key={`${book}-${day}`}
              book={book}
              day={day}
              initialText={page?.text ?? ''}
              label={t(`diary.pageOf.${book}`, locale, { date: dayDate(day, locale) })}
              placeholder={t(`diary.placeholder.${book}`, locale)}
              cancelHref={page === null ? monthAddress(book, month) : dayAddress(book, day)}
              locale={locale}
            />
          ) : (
            <>
              <p className="diary-text">{page.text}</p>
              <p className="text-[0.8125rem] text-muted-foreground">
                {metaLine(page, locale)}
              </p>
              {saved ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {t('diary.saved', locale)}
                </p>
              ) : null}
              {controls ? (
                <div className="flex flex-wrap gap-2">
                  <Link className={buttonVariants({ variant: 'outline' })} href={`${dayAddress(book, day)}&edit=1`}>
                    <PenLine data-icon="inline-start" aria-hidden="true" />
                    {t('diary.change', locale)}
                  </Link>
                  <DeletePage
                    book={book}
                    day={day}
                    monthHref={monthAddress(book, month)}
                    body={t(`diary.deleteBody.${book}`, locale, { date: dayDate(day, locale) })}
                    locale={locale}
                  />
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

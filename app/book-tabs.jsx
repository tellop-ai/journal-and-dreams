'use client';

import { useRouter } from 'next/navigation';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { BOOKS, isBook } from '../lib/diary/bounds.js';
import { t } from '../lib/i18n/index.js';

/**
 * The two books as tabs. Choosing the other book opens its month: the month on
 * screen, or the month of the day on screen. The screen below is the open
 * tab's panel.
 */
export function BookTabs({ book, month, locale, children }) {
  const router = useRouter();

  function choose(next) {
    if (next === book || !isBook(next)) return;
    router.push(`/?book=${next}&month=${month}`);
  }

  return (
    <Tabs value={book} onValueChange={choose} className="gap-5">
      <TabsList aria-label={t('diary.books', locale)}>
        {BOOKS.map((name) => (
          <TabsTrigger key={name} value={name} className="px-4">
            {t(`diary.book.${name}`, locale)}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={book} className="text-base">
        {children}
      </TabsContent>
    </Tabs>
  );
}

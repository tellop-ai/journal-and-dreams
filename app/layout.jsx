import { buttonVariants } from '@/components/ui/button';

import { BACK_TO_OWNER } from '../lib/data/person.js';
import { visitor } from '../lib/diary/visitor.js';
import { getLocale, t } from '../lib/i18n/index.js';

import './globals.css';

export function generateMetadata() {
  const locale = getLocale();
  return { title: t('app.title', locale) };
}

/**
 * Every page sits in this layout. While the owner looks at the app as a Member
 * or a Viewer (`preview`), it draws the way back to their own view on every
 * page. A plain link, not Next's: that address is Tellop's, not this app's.
 */
export default async function RootLayout({ children }) {
  const locale = getLocale();
  const { preview } = await visitor();
  return (
    <html lang={locale}>
      <body>
        {preview ? (
          <div data-print-hidden className="flex justify-end px-4 pt-3">
            <a href={BACK_TO_OWNER} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              {t('diary.backToOwnView', locale)}
            </a>
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import HomeDashboard from '@/components/home/HomeDashboard';
import { PublicHomepage } from '@/components/marketing/PublicHomepage';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  HOMEPAGE_FAQ,
  SITE_DESCRIPTION,
  SITE_TITLE,
  faqJsonLd,
  graph,
  openGraphFor,
  softwareApplicationJsonLd,
  twitterFor,
} from '@/lib/seo';

const SEO = { title: SITE_TITLE, description: SITE_DESCRIPTION, path: '/' };

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: openGraphFor(SEO),
  twitter: twitterFor(SEO),
};

const NATIVE_WELCOME_REDIRECT = `(function(){try{var c=window.Capacitor;if(c&&(typeof c.isNativePlatform==='function'?c.isNativePlatform():c.isNative)){location.replace('/welcome'+location.search)}}catch(e){}})();`;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [cookieStore, params] = await Promise.all([cookies(), searchParams]);
  const hasSession = cookieStore.has('token');
  const isGuestPreview = Object.prototype.hasOwnProperty.call(params, 'guest');

  if (hasSession || isGuestPreview) return <HomeDashboard />;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: NATIVE_WELCOME_REDIRECT }} />
      <JsonLd
        data={graph(softwareApplicationJsonLd(), faqJsonLd(HOMEPAGE_FAQ))}
      />
      <PublicHomepage />
    </>
  );
}

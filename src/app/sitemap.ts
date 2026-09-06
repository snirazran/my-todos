import type { MetadataRoute } from 'next';
import { LEGAL_LAST_UPDATED, SITE_URL } from '@/lib/seo';

export const dynamic = 'force-static';

const BUILD_DATE = new Date();

function legalDate(value: string) {
  const parsed = new Date(`${value} 12:00:00 UTC`);
  return Number.isNaN(parsed.getTime()) ? BUILD_DATE : parsed;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: BUILD_DATE,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: BUILD_DATE,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/support`,
      lastModified: legalDate(LEGAL_LAST_UPDATED.support),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/fly-catch`,
      lastModified: BUILD_DATE,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: legalDate(LEGAL_LAST_UPDATED.privacy),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: legalDate(LEGAL_LAST_UPDATED.terms),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/refund-policy`,
      lastModified: legalDate(LEGAL_LAST_UPDATED.refund),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}

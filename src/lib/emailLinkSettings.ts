import type { ActionCodeSettings } from 'firebase/auth';

const APP_BUNDLE_ID = 'io.frog.tasks';
const APP_PACKAGE_NAME = 'io.frog.tasks';

function cleanHost(value?: string) {
  if (!value) return undefined;
  return value.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
}

function emailLinkDomain(callbackUrl: string) {
  const configured = cleanHost(
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_LINK_DOMAIN,
  );
  if (configured) return configured;

  return undefined;
}

export function createEmailLinkSettings(callbackUrl: string): ActionCodeSettings {
  const linkDomain = emailLinkDomain(callbackUrl);

  return {
    url: callbackUrl,
    handleCodeInApp: true,
    iOS: {
      bundleId: APP_BUNDLE_ID,
    },
    android: {
      packageName: APP_PACKAGE_NAME,
      installApp: true,
    },
    ...(linkDomain ? { linkDomain } : {}),
  };
}

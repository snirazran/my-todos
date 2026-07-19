'use client';

import * as Sentry from '@sentry/nextjs';

export async function openBugReport(): Promise<boolean> {
  const feedback = Sentry.getFeedback();
  if (!feedback) return false;
  const form = await feedback.createForm();
  form.appendToDom();
  form.open();
  return true;
}

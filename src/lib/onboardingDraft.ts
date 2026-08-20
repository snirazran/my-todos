export const ONBOARDING_SELECTIONS_KEY = 'onboardingSelections';

export type OnboardingDraft = Record<string, string[]>;

export function loadOnboardingDraft(): OnboardingDraft {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(ONBOARDING_SELECTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as OnboardingDraft)
      : {};
  } catch {
    return {};
  }
}

export function saveOnboardingDraft(selections: OnboardingDraft) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      ONBOARDING_SELECTIONS_KEY,
      JSON.stringify(selections),
    );
  } catch {
    // ignore storage failures (private mode, quota)
  }
}

// Signing into a pre-existing account must drop the draft, or the next visit to
// /onboarding replays those answers over that account's real name and frog name.
export function clearOnboardingDraft() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ONBOARDING_SELECTIONS_KEY);
  } catch {
    // ignore
  }
}

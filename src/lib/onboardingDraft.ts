export const ONBOARDING_SELECTIONS_KEY = 'onboardingSelections';
const ONBOARDING_RESUME_KEY = 'onboardingResumeAt';
const ONBOARDING_RESUME_TTL_MS = 24 * 60 * 60 * 1000;

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

export function keepOnboardingDraftForReturn() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ONBOARDING_RESUME_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

export function takeOnboardingDraft(): OnboardingDraft {
  if (typeof window === 'undefined') return {};
  let planned = false;
  try {
    const at = Number(window.localStorage.getItem(ONBOARDING_RESUME_KEY));
    planned = at > 0 && Date.now() - at < ONBOARDING_RESUME_TTL_MS;
    window.localStorage.removeItem(ONBOARDING_RESUME_KEY);
  } catch {
    // ignore
  }
  if (planned) return loadOnboardingDraft();
  clearOnboardingDraft();
  return {};
}

// Signing into a pre-existing account must drop the draft, or the next visit to
// /onboarding replays those answers over that account's real name and frog name.
export function clearOnboardingDraft() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ONBOARDING_SELECTIONS_KEY);
    window.localStorage.removeItem(ONBOARDING_RESUME_KEY);
  } catch {
    // ignore
  }
}

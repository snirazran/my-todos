let offered: boolean | null = null;

export function notePlusTrialOffered(value: boolean) {
  offered = value;
}

export function plusTrialOffered(): boolean | null {
  return offered;
}

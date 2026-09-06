export type FocusSubjectKind = 'task' | 'area' | 'tag' | 'open';

export const OPEN_FOCUS_ID = 'focus-open';
export const AREA_PREFIX = 'focus-area:';
export const TAG_PREFIX = 'focus-tag:';

export type FocusSubject = {
  kind: FocusSubjectKind;
  id: string;
  label: string;
  accent?: string;
};

export function subjectKindOf(containerId: string): FocusSubjectKind {
  if (containerId === OPEN_FOCUS_ID) return 'open';
  if (containerId.startsWith(AREA_PREFIX)) return 'area';
  if (containerId.startsWith(TAG_PREFIX)) return 'tag';
  return 'task';
}

export function isContainerTaskId(id: string): boolean {
  return subjectKindOf(id) !== 'task';
}

export function containerIdFor(kind: FocusSubjectKind, id: string): string {
  if (kind === 'open') return OPEN_FOCUS_ID;
  if (kind === 'area') return `${AREA_PREFIX}${id}`;
  if (kind === 'tag') return `${TAG_PREFIX}${id}`;
  return id;
}

export function sourceIdOf(containerId: string): string {
  const kind = subjectKindOf(containerId);
  if (kind === 'area') return containerId.slice(AREA_PREFIX.length);
  if (kind === 'tag') return containerId.slice(TAG_PREFIX.length);
  if (kind === 'open') return '';
  return containerId;
}

export const OPEN_FOCUS_LABEL = 'Focus';

export function subjectDisplayLabel(subject: {
  kind: FocusSubjectKind;
  label?: string;
}): string {
  if (subject.kind === 'open') return OPEN_FOCUS_LABEL;
  return (subject.label || '').replace(/^Focus:\s*/i, '') || OPEN_FOCUS_LABEL;
}

export function subjectHeadline(kind: FocusSubjectKind, label: string): string {
  if (kind === 'open') return 'Just focus';
  if (kind === 'area') return label;
  if (kind === 'tag') return `#${label.replace(/^#/, '')}`;
  return label;
}

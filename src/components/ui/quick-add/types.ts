import type { ApiDay } from '@/components/board/helpers';
import type {
  FocusCategoryTagMap,
  MacroCategoryId,
} from '@/lib/quests/types';

export type RepeatChoice = 'this-week' | 'weekly' | 'monthly' | 'custom';

export type ChecklistItem = { id: string; text: string; done: boolean };

export type SavedTag = {
  id: string;
  name: string;
  color: string;
  disabled?: boolean;
};

export type QuickAddSubmit = {
  text: string;
  /** API days: 0..6 (Sun..Sat), -1 for "Later" */
  days: ApiDay[];
  /** Exact calendar dates, YYYY-MM-DD. Used for one-off scheduled tasks. */
  dates?: string[];
  repeat: RepeatChoice;
  tags: string[];
  startTime?: string;
  endTime?: string;
  reminder?: string;
  /** YYYY-MM-DD last date a repeating task should appear; null = never ends. */
  repeatEndDate?: string | null;
  /** Custom recurrence rule (when repeat === 'custom'). */
  repeatRule?: import('./utils').RepeatRule | null;
  /** Carried over when restoring a saved task so its card details survive. */
  notes?: string;
  checklist?: ChecklistItem[];
  /** Today-list section to file the task under. */
  sectionId?: string | null;
};

export type QuickAddSheetProps = Readonly<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: QuickAddSubmit) => Promise<void> | void;
  initialText?: string;
  defaultRepeat?: RepeatChoice;
  defaultPickedDay?: number;
  defaultDateKey?: string;
  daysOrder?: ReadonlyArray<Exclude<ApiDay, -1>>;
  hideDayPicker?: boolean;
  hideRepeatPicker?: boolean;
  /** Overrides the submit button label (default "Add Task"). */
  submitLabel?: string;
  /** Preselect all 7 weekdays so the repeat defaults to "Every day". */
  defaultRepeatDaily?: boolean;
  focusCategoryIds?: MacroCategoryId[];
  categoryTagMap?: FocusCategoryTagMap[];
  /** Today-list sections the task can be filed under (chip hidden when empty). */
  sections?: ReadonlyArray<{ id: string; name: string }>;
}>;

export type ActivePicker = 'tags' | 'date' | 'repeat' | null;

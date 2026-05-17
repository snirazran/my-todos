import type { ApiDay } from '@/components/board/helpers';
import type {
  FocusCategoryTagMap,
  MacroCategoryId,
} from '@/lib/quests/types';

export type RepeatChoice = 'this-week' | 'weekly';

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
  focusCategoryIds?: MacroCategoryId[];
  categoryTagMap?: FocusCategoryTagMap[];
}>;

export type ActivePicker = 'tags' | 'date' | 'repeat' | null;

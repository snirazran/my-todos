import mongoose, { Schema, type Model } from 'mongoose';

export type TaskBondStatus =
  | 'pending'
  | 'active'
  | 'declined'
  | 'expired'
  | 'severed';

/**
 * The subset of task-creation params that define the SHARED schedule. Fed back
 * into createTasksForUser() so the recipient's copy reproduces the inviter's
 * repeat exactly. Tags/notes/checklist/reminder are personal and excluded.
 */
export type BuddyCreateParams = {
  text: string;
  repeat?: 'backlog' | 'this-week' | 'monthly' | 'weekly';
  days?: number[];
  dates?: string[];
  repeatRule?: unknown;
  repeatEndDate?: string;
};

export type PendingRepeatChange = {
  requestedBy: string;
  setRepeat: any;
  date?: string;
  requestedAt: Date;
};

export interface TaskBondDoc {
  _id?: mongoose.Types.ObjectId;
  bondId: string;
  invitedBy: string;
  fromUserId: string;
  toUserId: string;
  status: TaskBondStatus;
  initialText: string;
  /** How to recreate the shared task (schedule only). */
  createParams: BuddyCreateParams;
  /** Human-readable repeat for display (e.g. "daily", "weekdays"). */
  repeatLabel?: string;
  /** Sender's task handle: repeatGroupId for multi-day, else the task id. */
  taskFromId?: string;
  /** Recipient's task handle (after accept). */
  taskToId?: string;
  /** The date (recipient-local) the bond became active — streak window start. */
  activeSince?: string | null;
  /** Occurrence dates (YYYY-MM-DD) each side has completed. */
  completedFrom: string[];
  completedTo: string[];
  /** Occurrence dates where the both-complete 2× bonus has been granted. */
  bonusAwardedDates: string[];
  streak: { count: number; lastDate: string | null };
  pendingRepeatChange?: PendingRepeatChange | null;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const TaskBondSchema = new Schema<TaskBondDoc>(
  {
    bondId: { type: String, required: true, unique: true, index: true },
    invitedBy: { type: String, required: true },
    fromUserId: { type: String, required: true, index: true },
    toUserId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'active', 'declined', 'expired', 'severed'],
      required: true,
      default: 'pending',
      index: true,
    },
    initialText: { type: String, default: '' },
    createParams: { type: Schema.Types.Mixed, required: true },
    repeatLabel: { type: String, default: '' },
    taskFromId: { type: String },
    taskToId: { type: String },
    activeSince: { type: String, default: null },
    completedFrom: { type: [String], default: [] },
    completedTo: { type: [String], default: [] },
    bonusAwardedDates: { type: [String], default: [] },
    streak: {
      type: {
        count: { type: Number, default: 0 },
        lastDate: { type: String, default: null },
      },
      _id: false,
      default: () => ({ count: 0, lastDate: null }),
    },
    pendingRepeatChange: { type: Schema.Types.Mixed, default: null },
    expiresAt: { type: Date, default: null },
  },
  { collection: 'taskBonds', timestamps: true },
);

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.TaskBond;
}

const TaskBondModel: Model<TaskBondDoc> =
  (mongoose.models.TaskBond as Model<TaskBondDoc>) ||
  mongoose.model<TaskBondDoc>('TaskBond', TaskBondSchema);

export default TaskBondModel;

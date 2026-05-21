'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Check, ChevronRight, Heart, X } from 'lucide-react';

export type ProfileField = 'petName' | 'petPronouns' | 'yourName' | 'birthday';

export type ProfileData = {
  petName?: string | null;
  petPronouns?: string | null;
  yourName?: string | null;
  birthday?: string | null;
  isGuest?: boolean;
};

const PRONOUN_OPTIONS = [
  { value: 'he', label: 'he/him' },
  { value: 'she', label: 'she/her' },
  { value: 'they', label: 'they/them' },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatBirthday(value?: string | null) {
  if (!value) return 'Not Set';
  const match = /^(\d{4}-)?(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const monthIdx = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  if (monthIdx < 0 || monthIdx > 11) return value;
  return `${MONTHS[monthIdx]} ${day}`;
}

function formatPronouns(value?: string | null) {
  if (!value) return 'Not set';
  if (value === 'he' || value === 'he/him') return 'He/Him';
  if (value === 'she' || value === 'she/her') return 'She/Her';
  if (value === 'they' || value === 'they/them') return 'They/Them';
  return value;
}

export function ProfileModal({
  open,
  onClose,
  data,
  onSave,
  onCreateAccount,
  onDeleteData,
}: {
  open: boolean;
  onClose: () => void;
  data: ProfileData;
  onSave?: (field: ProfileField, value: string) => void | Promise<void>;
  onCreateAccount?: () => void;
  onDeleteData?: () => void | Promise<void>;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [editing, setEditing] = useState<ProfileField | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (editing) setEditing(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editing, onClose, open]);

  if (!mounted) return null;

  const petRows: { key: ProfileField; label: string; value: string }[] = [
    { key: 'petName', label: 'Pet name', value: data.petName || 'Not set' },
    { key: 'petPronouns', label: 'Pet pronouns', value: formatPronouns(data.petPronouns) },
  ];

  const youRows: { key: ProfileField; label: string; value: string }[] = [
    { key: 'yourName', label: 'Your name', value: data.yourName || 'Not set' },
    { key: 'birthday', label: 'Your birthday', value: formatBirthday(data.birthday) },
  ];

  const handleSave = async (field: ProfileField, value: string) => {
    if (onSave) await onSave(field, value);
    setEditing(null);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            className="fixed inset-0 z-[201] overflow-hidden bg-black/20 shadow-2xl"
          >
            <div className="mx-auto flex h-full w-full flex-col overflow-hidden bg-white md:my-6 md:h-[calc(100dvh-3rem)] md:w-[min(100vw-3rem,56rem)] md:rounded-[32px]">
              <div className="relative flex items-center justify-center px-4 pb-3 pt-5">
                <button
                  type="button"
                  onClick={onClose}
                  className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/80"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
                <h2 className="text-base font-black tracking-tight text-foreground">
                  Profile
                </h2>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-6 pt-2">
                <div className="mx-auto max-w-md space-y-6">
                  <ProfileSection title="Your pet" rows={petRows} onEdit={setEditing} />
                  <ProfileSection title="You" rows={youRows} onEdit={setEditing} />
                </div>
              </div>

              <div
                className="border-t border-border/40 px-4 pt-4"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
              >
                <div className="mx-auto max-w-md space-y-3 text-center">
                  {data.isGuest && (
                    <>
                      <div>
                        <p className="text-sm font-black text-foreground">Guest Mode</p>
                        <p className="mt-1 text-xs font-medium text-muted-foreground">
                          Create an account to save your progress
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onCreateAccount}
                        className="h-12 w-full rounded-2xl border border-border/50 bg-card text-sm font-black tracking-tight text-foreground transition-colors hover:bg-accent/50 active:scale-[0.99]"
                      >
                        Create Account
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="h-12 w-full rounded-2xl border border-border/50 bg-card text-sm font-black tracking-tight text-rose-500 transition-colors hover:bg-rose-50 active:scale-[0.99]"
                  >
                    Delete Data
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          {editing === 'petName' && (
            <TextEditDialog
              title="Change pet name"
              initialValue={data.petName ?? ''}
              maxLength={24}
              onClose={() => setEditing(null)}
              onSave={(value) => handleSave('petName', value)}
            />
          )}
          {editing === 'yourName' && (
            <TextEditDialog
              title="Change your name"
              initialValue={data.yourName ?? ''}
              maxLength={40}
              onClose={() => setEditing(null)}
              onSave={(value) => handleSave('yourName', value)}
            />
          )}
          {editing === 'petPronouns' && (
            <PronounsDialog
              currentValue={data.petPronouns ?? null}
              onClose={() => setEditing(null)}
              onSave={(value) => handleSave('petPronouns', value)}
            />
          )}
          {editing === 'birthday' && (
            <BirthdayDialog
              currentValue={data.birthday ?? null}
              onClose={() => setEditing(null)}
              onSave={(value) => handleSave('birthday', value)}
            />
          )}
          {confirmingDelete && (
            <DeleteConfirmDialog
              deleting={deleting}
              onClose={() => {
                if (!deleting) setConfirmingDelete(false);
              }}
              onConfirm={async () => {
                if (deleting) return;
                setDeleting(true);
                try {
                  await onDeleteData?.();
                } finally {
                  setDeleting(false);
                  setConfirmingDelete(false);
                }
              }}
            />
          )}
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function ProfileSection({
  title,
  rows,
  onEdit,
}: {
  title: string;
  rows: { key: ProfileField; label: string; value: string }[];
  onEdit: (field: ProfileField) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="px-1 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </p>
      <div className="overflow-hidden divide-y divide-border/50 rounded-2xl border border-border/50 bg-card">
        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => onEdit(row.key)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/50"
          >
            <span className="flex-1 text-sm font-bold text-foreground">{row.label}</span>
            <span className="text-sm font-bold text-muted-foreground">{row.value}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

function DialogShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[210] bg-black/40"
      />
      <div className="pointer-events-none fixed inset-0 z-[211] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="pointer-events-auto relative w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl"
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/80"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          {children}
        </motion.div>
      </div>
    </>
  );
}

function TextEditDialog({
  title,
  initialValue,
  maxLength,
  onClose,
  onSave,
}: {
  title: string;
  initialValue: string;
  maxLength: number;
  onClose: () => void;
  onSave: (value: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && trimmed !== initialValue.trim();

  const submit = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogShell onClose={onClose}>
      <h3 className="text-center text-lg font-black tracking-tight text-foreground">
        {title}
      </h3>
      <div className="relative mt-4">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          maxLength={maxLength}
          className="h-12 w-full rounded-2xl border border-border/60 bg-muted/30 px-4 pr-10 text-base font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-[#4f9149]/40"
        />
        {value && (
          <button
            type="button"
            onClick={() => setValue('')}
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80"
            aria-label="Clear"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={!canSave || saving}
        className="mt-4 h-12 w-full rounded-2xl bg-[#4f9149] text-base font-black tracking-tight text-white shadow-[0_4px_0_0_#34631f] ring-1 ring-[#34631f]/40 transition-all hover:-translate-y-0.5 hover:shadow-[0_5px_0_0_#34631f] active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:grayscale disabled:pointer-events-none"
      >
        {saving ? 'Saving…' : 'Done'}
      </button>
    </DialogShell>
  );
}

function PronounsDialog({
  currentValue,
  onClose,
  onSave,
}: {
  currentValue: string | null;
  onClose: () => void;
  onSave: (value: string) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState(currentValue ?? 'he');
  const [saving, setSaving] = useState(false);

  const submit = async (value: string) => {
    if (saving) return;
    setSelected(value);
    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogShell onClose={onClose}>
      <h3 className="text-center text-lg font-black tracking-tight text-foreground">
        Change Pet Pronouns
      </h3>
      <div className="mt-4 space-y-3">
        {PRONOUN_OPTIONS.map((opt) => {
          const isSelected = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => submit(opt.value)}
              disabled={saving}
              className={`flex w-full items-center gap-3 rounded-2xl border-2 bg-white px-4 py-3 text-left transition-all ${
                isSelected
                  ? 'border-sky-400 text-foreground'
                  : 'border-border/40 text-muted-foreground'
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  isSelected ? 'bg-sky-100' : 'bg-muted/40'
                }`}
              >
                <Heart
                  className={`h-4 w-4 ${isSelected ? 'text-sky-400' : 'text-muted-foreground/60'}`}
                  fill="currentColor"
                />
              </span>
              <span className="flex-1 text-base font-bold">{opt.label}</span>
              {isSelected && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-400 text-white">
                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </DialogShell>
  );
}

function BirthdayDialog({
  currentValue,
  onClose,
  onSave,
}: {
  currentValue: string | null;
  onClose: () => void;
  onSave: (value: string) => void | Promise<void>;
}) {
  const initial = useMemo(() => {
    const match = currentValue ? /^(\d{4}-)?(\d{2})-(\d{2})$/.exec(currentValue) : null;
    if (match) {
      return { month: parseInt(match[2], 10), day: parseInt(match[3], 10) };
    }
    const now = new Date();
    return { month: now.getMonth() + 1, day: now.getDate() };
  }, [currentValue]);

  const [month, setMonth] = useState(initial.month);
  const [day, setDay] = useState(initial.day);
  const [saving, setSaving] = useState(false);

  const daysInMonth = useMemo(() => {
    return new Date(2024, month, 0).getDate();
  }, [month]);

  useEffect(() => {
    if (day > daysInMonth) setDay(daysInMonth);
  }, [day, daysInMonth]);

  const submit = async () => {
    if (saving) return;
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    setSaving(true);
    try {
      await onSave(`${mm}-${dd}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogShell onClose={onClose}>
      <h3 className="text-center text-lg font-black tracking-tight text-foreground">
        Set your birthday
      </h3>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Wheel
          items={MONTHS.map((m, i) => ({ value: i + 1, label: m }))}
          value={month}
          onChange={setMonth}
        />
        <Wheel
          items={Array.from({ length: daysInMonth }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
          value={day}
          onChange={setDay}
        />
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="mt-5 h-12 w-full rounded-2xl bg-[#4f9149] text-base font-black tracking-tight text-white shadow-[0_4px_0_0_#34631f] ring-1 ring-[#34631f]/40 transition-all hover:-translate-y-0.5 hover:shadow-[0_5px_0_0_#34631f] active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:grayscale disabled:pointer-events-none"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </DialogShell>
  );
}

function DeleteConfirmDialog({
  deleting,
  onClose,
  onConfirm,
}: {
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <DialogShell onClose={onClose}>
      <div className="mt-2 flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-white">
          <AlertCircle className="h-7 w-7" strokeWidth={2.5} />
        </div>
        <h3 className="mt-4 text-lg font-black leading-tight tracking-tight text-foreground">
          Are you sure you want to permanently delete your account &amp; data?
        </h3>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          This is not reversible, and you will not be able to retrieve your account or
          data. This does not cancel any active subscriptions. Go to &quot;Manage Subscription&quot;
          to cancel.
        </p>
      </div>
      <div className="mt-5 space-y-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={deleting}
          className="h-12 w-full rounded-2xl bg-rose-500 text-base font-black tracking-tight text-white shadow-[0_4px_0_0_#9b1c1c] ring-1 ring-rose-700/40 transition-all hover:-translate-y-0.5 hover:shadow-[0_5px_0_0_#9b1c1c] active:translate-y-1 active:shadow-none disabled:opacity-60 disabled:pointer-events-none"
        >
          {deleting ? 'Deleting…' : 'Delete My Data'}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={deleting}
          className="h-12 w-full rounded-2xl bg-muted text-base font-black tracking-tight text-muted-foreground transition-colors hover:bg-muted/80 active:scale-[0.99] disabled:opacity-60 disabled:pointer-events-none"
        >
          Cancel
        </button>
      </div>
    </DialogShell>
  );
}

function Wheel<T extends string | number>({
  items,
  value,
  onChange,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const ITEM_HEIGHT = 36;
  const PADDING = ITEM_HEIGHT * 2;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const scrollTimeout = React.useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const idx = items.findIndex((it) => it.value === value);
    if (idx >= 0) el.scrollTop = idx * ITEM_HEIGHT;
  }, [items, value]);

  const onScroll = () => {
    if (scrollTimeout.current !== null) window.clearTimeout(scrollTimeout.current);
    scrollTimeout.current = window.setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      el.scrollTo({ top: clamped * ITEM_HEIGHT, behavior: 'smooth' });
      const next = items[clamped]?.value;
      if (next !== undefined && next !== value) onChange(next);
    }, 80) as unknown as number;
  };

  return (
    <div className="relative h-[180px] overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-9 -translate-y-1/2 rounded-lg bg-muted/40" />
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="no-scrollbar h-full overflow-y-scroll snap-y snap-mandatory"
        style={{ scrollPaddingTop: PADDING }}
      >
        <div style={{ height: PADDING }} />
        {items.map((it) => {
          const isActive = it.value === value;
          return (
            <div
              key={String(it.value)}
              onClick={() => onChange(it.value)}
              className={`flex h-9 cursor-pointer snap-center items-center justify-center text-base transition-colors ${
                isActive ? 'font-black text-foreground' : 'font-bold text-muted-foreground/60'
              }`}
            >
              {it.label}
            </div>
          );
        })}
        <div style={{ height: PADDING }} />
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import useSWR, { mutate } from 'swr';
import {
  todayDisplayIndex,
  apiDayFromDisplay,
  labelForDisplayDay,
  type ApiDay,
  type DisplayDay,
} from '@/components/board/helpers';
import {
  CalendarDays,
  CalendarCheck,
  RotateCcw,
  Info,
  Plus,
  X,
  Tag,
  Palette,
  Trash2,
} from 'lucide-react';
import Fly from '@/components/ui/fly';
import { AnimatePresence, motion } from 'framer-motion';

type RepeatChoice = 'this-week' | 'weekly';
type WhenChoice = 'pick' | 'later';

type Props = Readonly<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: {
    text: string;
    /** API days: 0..6 (Sun..Sat), -1 for "Later" */
    days: ApiDay[];
    repeat: RepeatChoice;
    tags: string[];
  }) => Promise<void> | void;
  initialText?: string;
  defaultRepeat?: RepeatChoice;
}>;

type SavedTag = {
  id: string;
  name: string;
  color: string;
};

const TAG_COLORS = [
  { name: 'Red', value: '#f87171', bg: 'bg-red-500', text: 'text-red-950' },
  {
    name: 'Orange',
    value: '#fb923c',
    bg: 'bg-orange-500',
    text: 'text-orange-950',
  },
  {
    name: 'Yellow',
    value: '#facc15',
    bg: 'bg-yellow-400',
    text: 'text-yellow-950',
  },
  {
    name: 'Green',
    value: '#4ade80',
    bg: 'bg-green-500',
    text: 'text-green-950',
  },
  { name: 'Teal', value: '#2dd4bf', bg: 'bg-teal-400', text: 'text-teal-950' },
  { name: 'Blue', value: '#60a5fa', bg: 'bg-blue-500', text: 'text-blue-950' },
  {
    name: 'Purple',
    value: '#c084fc',
    bg: 'bg-purple-500',
    text: 'text-purple-950',
  },
  { name: 'Pink', value: '#f472b6', bg: 'bg-pink-500', text: 'text-pink-950' },
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function QuickAddSheet({
  open,
  onOpenChange,
  onSubmit,
  initialText = '',
  defaultRepeat = 'this-week',
}: Props) {
  const [text, setText] = useState(initialText);
  const [repeat, setRepeat] = useState<RepeatChoice>(defaultRepeat);
  const [when, setWhen] = useState<WhenChoice>('pick');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Tag Management State
  const { data: tagsData } = useSWR(open ? '/api/tags' : null, fetcher);
  const savedTags: SavedTag[] = tagsData?.tags || [];
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[5].value); // Default blue
  const [manageTagsMode, setManageTagsMode] = useState(false);
  const [showTagsList, setShowTagsList] = useState(false);
  const tagContainerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        tagContainerRef.current &&
        !tagContainerRef.current.contains(event.target as Node)
      ) {
        setShowTagsList(false);
      }
    };

    if (showTagsList) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showTagsList]);

  useEffect(() => {
    setMounted(true);
    // ... viewport logic
    if (typeof window !== 'undefined' && window.visualViewport) {
      const handleVisualViewportChange = () => {
        const vv = window.visualViewport;
        if (!vv) return;
        const offset = window.innerHeight - vv.height;
        setKeyboardHeight(Math.max(0, offset));
      };
      window.visualViewport.addEventListener(
        'resize',
        handleVisualViewportChange
      );
      window.visualViewport.addEventListener(
        'scroll',
        handleVisualViewportChange
      );
      return () => {
        window.visualViewport?.removeEventListener(
          'resize',
          handleVisualViewportChange
        );
        window.visualViewport?.removeEventListener(
          'scroll',
          handleVisualViewportChange
        );
      };
    }
  }, []);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Indices
  const [pickedDays, setPickedDays] = useState<Array<Exclude<DisplayDay, 7>>>(
    []
  );

  useEffect(() => {
    if (open) {
      setText(initialText);
      setWhen('pick');
      setPickedDays([todayDisplayIndex()]);
      setRepeat(defaultRepeat);
      setTags([]);
      setTagInput('');
      setIsSubmitting(false);
      setShowColorPicker(false);
      setManageTagsMode(false);
    }
  }, [open, initialText, defaultRepeat]);

  useEffect(() => {
    if (open && when === 'pick' && pickedDays.length === 0) {
      setPickedDays([todayDisplayIndex()]);
    }
  }, [open, when, pickedDays.length]);

  const dayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, d) => {
        const full = labelForDisplayDay(d as Exclude<DisplayDay, 7>);
        return { short: full.slice(0, 2), title: full };
      }),
    []
  );

  const toggleDay = (d: Exclude<DisplayDay, 7>) =>
    setPickedDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
      setTagInput('');
      setShowColorPicker(false);
    }
  };

  const createAndSaveTag = async () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;

    // Optimistic update? No, let's wait for safety or just assume success.
    try {
      await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, color: newTagColor }),
      });
      mutate('/api/tags'); // Refresh list
      if (!tags.includes(trimmed)) {
        setTags((prev) => [...prev, trimmed]);
      }
      setTagInput('');
      setShowColorPicker(false);
    } catch (e) {
      console.error('Failed to save tag', e);
    }
  };

  const deleteSavedTag = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/tags?id=${id}`, { method: 'DELETE' });
      mutate('/api/tags');
    } catch (error) {
      console.error('Failed to delete tag', error);
    }
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const getTagColor = (tagName: string) => {
    const found = savedTags.find(
      (t) => t.name.toLowerCase() === tagName.toLowerCase()
    );
    return found ? found.color : undefined;
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const apiDays: ApiDay[] =
      when === 'later'
        ? [-1]
        : pickedDays.slice().sort().map(apiDayFromDisplay);

    if (apiDays.length === 0) return;

    setIsSubmitting(true);
    try {
      const finalRepeat: RepeatChoice = when === 'later' ? 'this-week' : repeat;
      await onSubmit({
        text: trimmed,
        days: apiDays,
        repeat: finalRepeat,
        tags,
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted) return null;

  const repeatsOn = repeat === 'weekly';
  const isLater = when === 'later';

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 z-[999] bg-slate-950/20 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-0 right-0 z-[1000] px-4 py-6 sm:px-6 sm:py-5 pointer-events-none transition-[bottom] duration-200"
            style={{ bottom: keyboardHeight * 0.8 }}
          >
            <div className="pointer-events-auto mx-auto w-full max-w-[820px] pb-[env(safe-area-inset-bottom)]">
              <div className="rounded-[28px] bg-white/95 dark:bg-slate-950/90 backdrop-blur-2xl ring-1 ring-slate-200/80 dark:ring-slate-800/70 shadow-[0_24px_48px_rgba(15,23,42,0.25)] p-4">
                {/* Input Area */}
                <div dir="ltr" className="w-full">
                  <input
                    ref={inputRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="New task?"
                    disabled={isSubmitting}
                    autoFocus
                    spellCheck={false}
                    autoComplete="off"
                    maxLength={45}
                    className="w-full h-12 px-4 mb-1 rounded-[16px] bg-white/95 dark:bg-slate-900/70 text-slate-900 dark:text-white ring-1 ring-slate-200/80 dark:ring-slate-700/70 shadow-[0_1px_0_rgba(255,255,255,.7)_inset] focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:opacity-50 text-lg font-medium text-left"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit();
                      }
                      if (e.key === 'Escape') onOpenChange(false);
                    }}
                  />

                  <div
                    ref={tagContainerRef}
                    className="flex flex-col gap-2 px-2 mb-2"
                  >
                    {/* Selected Tags & Input */}
                    <div className="flex flex-wrap items-center gap-1.5 w-full">
                      {tags.map((tag) => {
                        const color = getTagColor(tag);
                        return (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-colors shadow-sm"
                            style={
                              color
                                ? {
                                    backgroundColor: `${color}20`,
                                    color: color,
                                    borderColor: `${color}40`,
                                  }
                                : undefined
                            }
                          >
                            {!color && (
                              <span className="absolute inset-0 flex items-center w-full h-full gap-1 px-2 text-indigo-700 border-indigo-200 rounded-md pointer-events-none bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-200 dark:border-indigo-800 opacity-10" />
                            )}
                            {!color ? (
                              <span className="relative z-10 text-indigo-700 dark:text-indigo-300">
                                {tag}
                              </span>
                            ) : (
                              tag
                            )}
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              className="relative z-10 hover:opacity-70"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })}

                      <div className="relative flex items-center group">
                        <Tag className="absolute left-1.5 w-3 h-3 text-slate-400 group-focus-within:text-purple-500 transition-colors" />
                        <input
                          value={tagInput}
                          onFocus={() => setShowTagsList(true)}
                          onChange={(e) => {
                            setTagInput(e.target.value);
                            setShowColorPicker(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if (showColorPicker) {
                                createAndSaveTag();
                              } else {
                                handleAddTag();
                              }
                            }
                          }}
                          placeholder="Add tag..."
                          className="h-6 pl-5 pr-2 min-w-[80px] w-auto max-w-[150px] rounded-md bg-transparent text-base md:text-[11px] font-medium text-slate-600 dark:text-slate-300 focus:bg-slate-100 dark:focus:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-300 placeholder:text-slate-400 transition-all"
                        />
                        {tagInput && !showColorPicker && (
                          <button
                            type="button"
                            onClick={() => setShowColorPicker(true)}
                            className="absolute right-0.5 p-0.5 text-slate-400 hover:text-purple-600 hover:bg-purple-100 rounded"
                            title="Create & Color"
                          >
                            <Palette className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Color Picker for New Tag */}
                    <AnimatePresence>
                      {showColorPicker && tagInput && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="flex items-center gap-2 p-1 -m-1 overflow-hidden"
                        >
                          <div className="flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                            {TAG_COLORS.map((c) => (
                              <button
                                key={c.name}
                                type="button"
                                onClick={() => setNewTagColor(c.value)}
                                className={`w-5 h-5 rounded-full ${
                                  c.bg
                                } ring-2 ring-offset-1 ring-offset-slate-100 dark:ring-offset-slate-800 transition-all ${
                                  newTagColor === c.value
                                    ? 'ring-slate-400 scale-110'
                                    : 'ring-transparent hover:scale-110'
                                }`}
                                title={c.name}
                              />
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={createAndSaveTag}
                            className="px-2 py-1 text-[10px] font-bold text-white bg-purple-600 rounded-md shadow-sm hover:bg-purple-700"
                          >
                            Save
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Saved Tags Horizontal List */}
                    {savedTags.length > 0 && showTagsList && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-2 mt-1"
                      >
                        <div className="flex-1 py-2 -my-1 overflow-x-auto overflow-y-hidden no-scrollbar">
                          <div className="flex gap-1.5 px-1">
                            {savedTags.map((st) => {
                              const isSelected = tags.includes(st.name);
                              return (
                                <button
                                  key={st.id}
                                  type="button"
                                  onClick={() => {
                                    if (manageTagsMode) return;
                                    if (isSelected) removeTag(st.name);
                                    else setTags((prev) => [...prev, st.name]);
                                  }}
                                  className={`
                                    relative flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all
                                    border
                                    ${
                                      isSelected
                                        ? 'ring-1 ring-offset-1 ring-offset-white dark:ring-offset-slate-900'
                                        : 'hover:opacity-80'
                                    }
                                  `}
                                  style={{
                                    backgroundColor: `${st.color}20`,
                                    color: st.color,
                                    borderColor: `${st.color}40`,
                                    boxShadow: isSelected
                                      ? `0 0 0 1px ${st.color}`
                                      : 'none',
                                  }}
                                >
                                  {st.name}
                                  {manageTagsMode && (
                                    <div
                                      onClick={(e) => deleteSavedTag(st.id, e)}
                                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm hover:scale-110"
                                    >
                                      <X className="w-2 h-2" />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setManageTagsMode(!manageTagsMode)}
                          className={`p-1.5 rounded-md transition-colors ${
                            manageTagsMode
                              ? 'bg-red-100 text-red-600'
                              : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                          title="Manage Tags"
                        >
                          {manageTagsMode ? (
                            <X className="w-3.5 h-3.5" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Segmented control */}
                <div className="mb-3">
                  <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-slate-100/70 dark:bg-slate-900/80 ring-1 ring-slate-200/80 dark:ring-slate-800/70">
                    <button
                      type="button"
                      aria-pressed={when === 'pick'}
                      data-active={when === 'pick'}
                      onClick={() => {
                        setWhen('pick');
                        setPickedDays((prev) =>
                          prev.length ? prev : [todayDisplayIndex()]
                        );
                      }}
                      className={[
                        'h-10 rounded-xl text-[14px] font-bold inline-flex items-center justify-center gap-2 transition',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300',
                        'data-[active=true]:bg-white dark:data-[active=true]:bg-slate-800 data-[active=true]:shadow-sm data-[active=true]:ring-1 data-[active=true]:ring-slate-200/80 dark:data-[active=true]:ring-slate-700',
                        'data-[active=false]:text-slate-600 dark:data-[active=false]:text-slate-400',
                      ].join(' ')}
                    >
                      <CalendarDays className="w-4 h-4" />
                      Pick day
                    </button>

                    <button
                      type="button"
                      aria-pressed={when === 'later'}
                      data-active={when === 'later'}
                      onClick={() => {
                        setWhen('later');
                        setPickedDays([]);
                        setRepeat('this-week');
                      }}
                      className={[
                        'h-10 rounded-xl text-[14px] font-bold inline-flex items-center justify-center gap-2 transition',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300',
                        'data-[active=true]:bg-white dark:data-[active=true]:bg-slate-800 data-[active=true]:shadow-sm data-[active=true]:ring-1 data-[active=true]:ring-slate-200/80 dark:data-[active=true]:ring-slate-700',
                        'data-[active=false]:text-slate-600 dark:data-[active=false]:text-slate-400',
                      ].join(' ')}
                    >
                      <CalendarCheck className="w-4 h-4" />
                      I'll decide later
                    </button>
                  </div>
                </div>

                {/* PICK MODE */}
                {when === 'pick' && (
                  <div className="flex flex-col gap-2 mt-1 sm:flex-row sm:items-center">
                    <div className="flex-1 min-w-0 px-1 -mx-1 overflow-x-auto overflow-y-visible no-scrollbar">
                      <div className="inline-flex w-max gap-2 pr-2 py-1.5">
                        {dayLabels.map(({ short, title }, idx) => {
                          const d = idx as Exclude<DisplayDay, 7>;
                          const on = pickedDays.includes(d);
                          return (
                            <button
                              key={d}
                              type="button"
                              onClick={() => toggleDay(d)}
                              aria-pressed={on}
                              data-active={on}
                              title={title}
                              className={[
                                'inline-flex items-center justify-center select-none',
                                'h-10 w-10 rounded-full text-sm font-bold',
                                'border border-slate-300/80 dark:border-slate-700/70',
                                'bg-white dark:bg-slate-900/70 text-slate-800 dark:text-white',
                                'data-[active=true]:bg-purple-50 dark:data-[active=true]:bg-purple-900/40 data-[active=true]:border-purple-300 data-[active=true]:text-purple-900 dark:data-[active=true]:text-purple-200',
                                'transition-all duration-200',
                              ].join(' ')}
                            >
                              {short}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="sm:shrink-0 sm:pl-1">
                      <div
                        className={[
                          'inline-flex items-center gap-2 px-3 py-1.5 border rounded-full bg-white/90 dark:bg-slate-900/70 border-slate-300/70 dark:border-slate-800/70',
                          isLater ? 'opacity-50 pointer-events-none' : '',
                        ].join(' ')}
                        aria-disabled={isLater}
                        title={
                          isLater
                            ? 'Repeat is not available for Later'
                            : undefined
                        }
                      >
                        <RotateCcw className="w-4 h-4 text-purple-700/80 dark:text-purple-200" />
                        <span className="text-[13px] font-bold text-slate-700 dark:text-slate-200">
                          Repeat weekly
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={repeatsOn}
                          onClick={() =>
                            setRepeat((r) =>
                              r === 'weekly' ? 'this-week' : 'weekly'
                            )
                          }
                          data-on={repeatsOn}
                          className={[
                            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                            'bg-slate-300/70 data-[on=true]:bg-purple-500',
                          ].join(' ')}
                          title={repeatsOn ? 'Weekly' : 'One-time'}
                          disabled={isLater}
                        >
                          <span
                            className={[
                              'inline-block h-4 w-4 transform rounded-full bg-white shadow ring-1 ring-black/10 transition-transform',
                              repeatsOn ? 'translate-x-4' : 'translate-x-1',
                            ].join(' ')}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {when === 'later' && (
                  <div className="mt-2 flex items-start gap-2 rounded-xl bg-purple-50/75 dark:bg-purple-900/30 ring-1 ring-purple-300/40 p-3 text-[13px] text-purple-900/90 dark:text-purple-100/90">
                    <Info className="w-4 h-4 mt-0.5 shrink-0 text-purple-600 dark:text-purple-400" />
                    <span>
                      Not sure when? We&apos;ll keep it in your{' '}
                      <span className="font-bold">Saved Tasks</span> for later.
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!text.trim() || isSubmitting}
                    className={[
                      'relative h-12 rounded-full text-[15px] font-bold overflow-hidden transition-all',
                      'bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 text-white',
                      'shadow-[0_10px_25px_-4px_rgba(99,102,241,0.4)] ring-1 ring-white/20',
                      'hover:brightness-105 hover:shadow-[0_12px_30px_-4px_rgba(99,102,241,0.5)] active:scale-[0.985]',
                      'disabled:opacity-50 disabled:grayscale disabled:pointer-events-none',
                    ].join(' ')}
                  >
                    <span className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/25 to-transparent" />
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {isSubmitting ? (
                        'Adding...'
                      ) : (
                        <>
                          <Plus className="w-4 h-4 stroke-[3]" />
                          <span>Add Task</span>
                          <Fly size={24} x={-1} y={-3} />
                        </>
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className={[
                      'h-12 rounded-full text-[15px] font-semibold transition-all',
                      'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
                      'hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.985]',
                      'ring-1 ring-slate-200 dark:ring-slate-700',
                    ].join(' ')}
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      <X className="w-4 h-4" />
                      Cancel
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

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
  Loader2,
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

const TAG_MAX_LENGTH = 20;
const MAX_SAVED_TAGS = 15;

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
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Tag Management State
  const { data: tagsData } = useSWR(open ? '/api/tags' : null, fetcher);
  const savedTags: SavedTag[] = tagsData?.tags || [];
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[5].value); // Default blue
  const [manageTagsMode, setManageTagsMode] = useState(false);
  const [isTagPanelOpen, setIsTagPanelOpen] = useState(false);
  
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  
  const tagInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

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
      setIsTagPanelOpen(false);
      setIsCreatingTag(false);
    }
  }, [open, initialText, defaultRepeat]);

  const filteredTags = useMemo(() => {
    if (!tagInput) return savedTags;
    const lower = tagInput.toLowerCase();
    return savedTags.filter(st => st.name.toLowerCase().includes(lower));
  }, [savedTags, tagInput]);
  
  // ... rest of useEffects

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
    if (isCreatingTag) return;
    const trimmed = tagInput.trim();
    if (!trimmed) return;

    // Check if tag exists
    const existing = savedTags.find(t => t.name.toLowerCase() === trimmed.toLowerCase());

    if (existing) {
        // Select existing if not already selected
        if (!tags.includes(existing.id)) {
             setTags(prev => [...prev, existing.id]);
        }
        setTagInput('');
        setShowColorPicker(false);
    } else {
        // New tag
        if (savedTags.length >= MAX_SAVED_TAGS) {
            // Should ideally show a toast or message, but for now just don't open picker
            return;
        }

        if (showColorPicker) {
            // If picker is ALREADY open, save it
             createAndSaveTag();
        } else {
            // Open picker
            setShowColorPicker(true);
        }
    }
  };

  const createAndSaveTag = async () => {
    if (isCreatingTag) return;
    const trimmed = tagInput.trim();
    if (!trimmed) return;

    if (savedTags.length >= MAX_SAVED_TAGS) return;

    setIsCreatingTag(true);
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, color: newTagColor }),
      });
      const data = await res.json();

      mutate('/api/tags'); // Refresh list
      
      if (data.tag && !tags.includes(data.tag.id)) {
        setTags((prev) => [...prev, data.tag.id]);
      }
      setShowColorPicker(false);
      setTagInput('');
    } catch (e) {
      console.error('Failed to save tag', e);
    } finally {
        setIsCreatingTag(false);
    }
  };

  const deleteSavedTag = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // Optimistic Update
    const updatedTags = savedTags.filter(t => t.id !== id);
    
    // 1. Update SWR cache immediately
    mutate('/api/tags', { tags: updatedTags }, false);

    // 2. Remove from currently selected tags immediately
    setTags((prev) => prev.filter((tId) => tId !== id));
    
    // 3. Notify app
    window.dispatchEvent(new Event('tags-updated'));

    try {
      await fetch(`/api/tags?id=${id}`, { method: 'DELETE' });
      mutate('/api/tags');
    } catch (error) {
      console.error('Failed to delete tag', error);
      mutate('/api/tags'); // Revert
    }
  };

  const removeTag = (tagId: string) => {
    setTags((prev) => prev.filter((t) => t !== tagId));
  };

  const getTagDetails = (tagId: string) => {
    return savedTags.find((t) => t.id === tagId);
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
            className="fixed left-0 right-0 z-[1000] px-4 py-6 sm:px-6 sm:py-5 pointer-events-none transition-[bottom] duration-200 bottom-0"
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

                  {/* Selected Tags Display (Inline) */}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-1 mb-3 mt-2">
                       {tags.map((tagId) => {
                        const tag = getTagDetails(tagId);
                        const color = tag?.color;
                        const name = tag?.name || 'Unknown';
                        
                        return (
                          <span
                            key={tagId}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border transition-colors shadow-sm"
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
                               <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800 flex items-center gap-1 h-full w-full absolute inset-0 rounded-md px-2 opacity-10 pointer-events-none" />
                             )}
                             {!color ? <span className="text-indigo-700 dark:text-indigo-300 relative z-10">{name}</span> : name}
                            <button
                              type="button"
                              onClick={() => removeTag(tagId)}
                              className="relative z-10 hover:opacity-70 p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center justify-between px-1 mb-4 mt-1">
                    <button
                        type="button"
                        onClick={() => {
                            setIsTagPanelOpen(!isTagPanelOpen);
                            // Auto-focus input when opening
                            if (!isTagPanelOpen) {
                                setTimeout(() => tagInputRef.current?.focus(), 100);
                            }
                        }}
                        className={`
                            inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-bold transition-all
                            border
                            ${isTagPanelOpen 
                                ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-800' 
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 dark:bg-slate-900/50 dark:text-slate-400 dark:border-slate-800 dark:hover:bg-slate-800'
                            }
                        `}
                    >
                        <Tag className="w-3.5 h-3.5" />
                        {isTagPanelOpen ? 'Close Tags' : 'Add Tags'}
                    </button>
                     <span
                      className={`text-[11px] font-bold ${
                        text.length >= 40 ? 'text-rose-500' : 'text-slate-400'
                      }`}
                    >
                      {text.length}/45
                    </span>
                  </div>

                  {/* Tag Management Panel */}
                  <AnimatePresence>
                    {isTagPanelOpen && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="p-3 mb-3 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-slate-100 dark:border-slate-800/50">
                                {/* Tag Input */}
                                <div className="relative flex items-center mb-3">
                                    <Tag className="absolute left-2.5 w-4 h-4 text-slate-400" />
                                    <input
                                        ref={tagInputRef}
                                        value={tagInput}
                                        onChange={(e) => {
                                            setTagInput(e.target.value);
                                            setShowColorPicker(false);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleAddTag();
                                            }
                                        }}
                                        maxLength={TAG_MAX_LENGTH}
                                        placeholder="Type to create or filter..."
                                        className="w-full h-10 pl-9 pr-2 rounded-xl bg-white dark:bg-slate-800 text-base md:text-sm font-medium text-slate-900 dark:text-white ring-1 ring-slate-200 dark:ring-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-300 placeholder:text-slate-400"
                                    />
                                    {tagInput && (
                                        <button
                                            type="button"
                                            onClick={handleAddTag}
                                            disabled={!savedTags.find(t => t.name.toLowerCase() === tagInput.trim().toLowerCase()) && savedTags.length >= MAX_SAVED_TAGS}
                                            className="absolute right-1.5 p-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 dark:bg-purple-900/50 dark:text-purple-200 disabled:opacity-50 disabled:grayscale"
                                        >
                                            {showColorPicker ? <Palette className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                        </button>
                                    )}
                                </div>

                                {/* Color Picker (Conditionally shown) */}
                                <AnimatePresence>
                                    {showColorPicker && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                                            animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
                                            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700">
                                                <div className="text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Pick a color for "{tagInput}"</div>
                                                <div className="flex gap-2 flex-wrap">
                                                    {TAG_COLORS.map((c) => (
                                                    <button
                                                        key={c.name}
                                                        type="button"
                                                        onClick={() => setNewTagColor(c.value)}
                                                        className={`w-8 h-8 rounded-full ${c.bg} ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-800 transition-all ${
                                                        newTagColor === c.value
                                                            ? 'ring-slate-400 scale-110'
                                                            : 'ring-transparent'
                                                        }`}
                                                        title={c.name}
                                                    />
                                                    ))}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={createAndSaveTag}
                                                    disabled={isCreatingTag}
                                                    className="w-full mt-3 py-2 text-xs font-bold text-white bg-purple-600 rounded-lg shadow-sm hover:bg-purple-700 active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
                                                >
                                                    {isCreatingTag ? 'Saving...' : 'Save Tag'}
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Available Tags (Wrap layout for mobile) */}
                                {savedTags.length > 0 && (
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                                Saved Tags <span className={savedTags.length >= MAX_SAVED_TAGS ? "text-red-500" : ""}>({savedTags.length}/{MAX_SAVED_TAGS})</span>
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setManageTagsMode(!manageTagsMode)}
                                                className={`text-[11px] font-bold px-2 py-0.5 rounded transition-colors ${
                                                    manageTagsMode ? 'bg-red-100 text-red-600' : 'text-slate-400 hover:text-slate-600'
                                                }`}
                                            >
                                                {manageTagsMode ? 'Done' : 'Manage'}
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                          <AnimatePresence>
                                            {filteredTags.map((st) => {
                                                const isSelected = tags.includes(st.id);
                                                return (
                                                    <motion.button
                                                        exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
                                                        key={st.id}
                                                        type="button"
                                                        onClick={(e) => {
                                                            if (manageTagsMode) {
                                                                deleteSavedTag(st.id, st.name, e);
                                                                return;
                                                            }
                                                            if (isSelected) removeTag(st.id);
                                                            else setTags((prev) => [...prev, st.id]);
                                                        }}
                                                        className={`
                                                            relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold uppercase tracking-wider transition-all
                                                            border disabled:opacity-50 disabled:cursor-not-allowed
                                                            ${
                                                            isSelected
                                                                ? 'ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-900'
                                                                : 'hover:opacity-80 opacity-70 bg-white dark:bg-slate-800'
                                                            }
                                                        `}
                                                        style={{
                                                            backgroundColor: isSelected ? `${st.color}20` : undefined,
                                                            color: st.color,
                                                            borderColor: isSelected ? `${st.color}40` : `${st.color}20`,
                                                            boxShadow: isSelected ? `0 0 0 1px ${st.color}` : 'none',
                                                        }}
                                                    >
                                                        {st.name}
                                                        {manageTagsMode && (
                                                            <div
                                                            onClick={(e) => deleteSavedTag(st.id, st.name, e)}
                                                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 shadow-sm hover:scale-110 z-10"
                                                            >
                                                                <X className="w-2.5 h-2.5" />
                                                            </div>
                                                        )}
                                                    </motion.button>
                                                );
                                            })}
                                          </AnimatePresence>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                  </AnimatePresence>
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

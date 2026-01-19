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
  Pencil,
  Check,
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
  defaultPickedDay?: number;
  defaultMode?: WhenChoice;
}>;

type SavedTag = {
  id: string;
  name: string;
  color: string;
};

const TAG_COLORS = [
  { name: 'Red', value: '#ef4444', bg: 'bg-red-500', text: 'text-red-950 dark:text-red-100' },
  { name: 'Orange', value: '#f97316', bg: 'bg-orange-500', text: 'text-orange-950 dark:text-orange-100' },
  { name: 'Amber', value: '#f59e0b', bg: 'bg-amber-500', text: 'text-amber-950 dark:text-amber-100' },
  { name: 'Yellow', value: '#eab308', bg: 'bg-yellow-400', text: 'text-yellow-950 dark:text-yellow-100' },
  { name: 'Lime', value: '#84cc16', bg: 'bg-lime-500', text: 'text-lime-950 dark:text-lime-100' },
  { name: 'Green', value: '#22c55e', bg: 'bg-green-500', text: 'text-green-950 dark:text-green-100' },
  { name: 'Emerald', value: '#10b981', bg: 'bg-emerald-500', text: 'text-emerald-950 dark:text-emerald-100' },
  { name: 'Teal', value: '#14b8a6', bg: 'bg-teal-500', text: 'text-teal-950 dark:text-teal-100' },
  { name: 'Cyan', value: '#06b6d4', bg: 'bg-cyan-500', text: 'text-cyan-950 dark:text-cyan-100' },
  { name: 'Blue', value: '#3b82f6', bg: 'bg-blue-500', text: 'text-blue-950 dark:text-blue-100' },
  { name: 'Indigo', value: '#6366f1', bg: 'bg-indigo-500', text: 'text-indigo-950 dark:text-indigo-100' },
  { name: 'Violet', value: '#8b5cf6', bg: 'bg-violet-500', text: 'text-violet-950 dark:text-violet-100' },
  { name: 'Purple', value: '#a855f7', bg: 'bg-purple-500', text: 'text-purple-950 dark:text-purple-100' },
  { name: 'Fuchsia', value: '#d946ef', bg: 'bg-fuchsia-500', text: 'text-fuchsia-950 dark:text-fuchsia-100' },
  { name: 'Pink', value: '#ec4899', bg: 'bg-pink-500', text: 'text-pink-950 dark:text-pink-100' },
  { name: 'Rose', value: '#f43f5e', bg: 'bg-rose-500', text: 'text-rose-950 dark:text-rose-100' },
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
  defaultPickedDay,
  defaultMode = 'pick',
}: Props) {
  const [text, setText] = useState(initialText);
  const [repeat, setRepeat] = useState<RepeatChoice>(defaultRepeat);
  const [when, setWhen] = useState<WhenChoice>(defaultMode);
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
  const ignoreClickRef = React.useRef(false);

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
      setWhen(defaultMode);
      // Use defaultPickedDay if provided, otherwise fallback to today
      const initialDay = defaultPickedDay !== undefined ? defaultPickedDay : todayDisplayIndex();
      setPickedDays([initialDay as Exclude<DisplayDay, 7>]);
      setRepeat(defaultRepeat);
      setTags([]);
      setTagInput('');
      setIsSubmitting(false);
      setShowColorPicker(false);
      setManageTagsMode(false);
      setIsCreatingTag(false);
    }
    // Always reset tag panel state when open changes to prevent animation flash
    setIsTagPanelOpen(false);
  }, [open, initialText, defaultRepeat, defaultPickedDay, defaultMode]);

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
            className="fixed inset-0 z-[999] bg-background/80 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.4 }}
            className="fixed left-0 right-0 z-[1000] px-4 py-6 sm:px-6 sm:py-5 pointer-events-none bottom-0 will-change-transform"
          >
            <div className="pointer-events-auto mx-auto w-full max-w-[820px] pb-[env(safe-area-inset-bottom)]">
              <div className="rounded-[28px] bg-popover/95 backdrop-blur-2xl ring-1 ring-border/80 shadow-[0_24px_48px_rgba(15,23,42,0.25)] p-4">
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
                    className="w-full h-12 px-4 mb-1 rounded-[16px] bg-muted/50 text-foreground ring-1 ring-border/80 shadow-[0_1px_0_rgba(255,255,255,.1)_inset] focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 text-lg font-medium text-left"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit();
                      }
                      if (e.key === 'Escape') onOpenChange(false);
                    }}
                  />

                  {/* Selected Tags Display (Horizontal Scroll) */}
                  {tags.length > 0 && (
                    <div className="relative mb-3 mt-2 px-1 overflow-visible">
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 pt-1 px-1 -mx-1 mask-fade-right">
                        {tags.map((tagId) => {
                          const tag = getTagDetails(tagId);
                          const color = tag?.color;
                          const name = tag?.name || 'Unknown';
                          
                          return (
                            <button
                              key={tagId}
                              type="button"
                              onClick={() => removeTag(tagId)}
                              className="group shrink-0 relative inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all shadow-sm hover:opacity-75 active:scale-95"
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
                               <span className={!color ? "text-indigo-700 dark:text-indigo-300 relative z-10" : "relative z-10"}>{name}</span>
                               <X className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                            </button>
                          );
                        })}
                      </div>
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
                            inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-bold transition-all
                            border shadow-sm
                            ${isTagPanelOpen 
                                ? 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/15' 
                                : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted/80 hover:text-foreground'
                            }
                        `}
                    >
                        {isTagPanelOpen ? (
                            <>
                                <X className="w-3.5 h-3.5" />  
                                Close Tags
                            </>
                        ) : (
                            <>
                                <Tag className="w-3.5 h-3.5" />
                                Add Tags
                            </>
                        )}
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
                  <AnimatePresence initial={false}>
                    {isTagPanelOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ 
                                opacity: 1, 
                                transition: {
                                    duration: 0,
                                }
                            }}
                            exit={{ 
                                opacity: 0, 
                                transition: {
                                    duration: 0,
                                }
                            }}
                            style={{ transformOrigin: 'top' }}
                            className="overflow-hidden mb-3"
                        >
                            <div className="p-3 mb-3 bg-muted/30 rounded-xl border border-border/50">
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
                                        placeholder="Name your new tag..."
                                        className="w-full h-10 pl-9 pr-10 rounded-xl bg-card text-base md:text-sm font-medium text-foreground ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddTag}
                                        disabled={!tagInput || (!savedTags.find(t => t.name.toLowerCase() === tagInput.trim().toLowerCase()) && savedTags.length >= MAX_SAVED_TAGS)}
                                        className="absolute right-1.5 p-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
                                    >
                                        {showColorPicker ? <Palette className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                    </button>
                                </div>

                                {/* Color Picker (Conditionally shown) */}
                                <AnimatePresence>
                                    {showColorPicker && (
                                        <motion.div
                                            initial={{ opacity: 0, maxHeight: 0 }}
                                            animate={{ opacity: 1, maxHeight: 500, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] } }}
                                            exit={{ opacity: 0, maxHeight: 0, transition: { duration: 0 } }}
                                            className="overflow-hidden mb-3"
                                        >
                                             <div className="p-2 bg-card rounded-lg shadow-sm border border-border">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Pick a color for "{tagInput}"</div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setShowColorPicker(false);
                                                            setTagInput('');
                                                        }}
                                                        className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                                                        title="Cancel"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                                <div className="flex gap-2 flex-wrap">
                                                    {TAG_COLORS.map((c) => (
                                                    <button
                                                        key={c.name}
                                                        type="button"
                                                        onClick={() => setNewTagColor(c.value)}
                                                        className={`w-8 h-8 rounded-full ${c.bg} ring-2 ring-offset-2 ring-offset-card transition-all ${
                                                        newTagColor === c.value
                                                            ? 'ring-primary scale-110'
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
                                                    className="w-full mt-3 py-2 text-xs font-bold text-primary-foreground bg-primary rounded-lg shadow-sm hover:bg-primary/90 active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
                                                >
                                                    {isCreatingTag ? 'Saving...' : 'Save Tag'}
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Available Tags (Wrap layout for mobile) */}
                                <AnimatePresence mode="wait">
                                {savedTags.length > 0 && !showColorPicker && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0 }}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                                    Saved Tags <span className={savedTags.length >= MAX_SAVED_TAGS ? "text-red-500" : ""}>({savedTags.length}/{MAX_SAVED_TAGS})</span>
                                                </span>
                                                {/* Hint text only shown when NOT managing */}
                                                {!manageTagsMode && (
                                                    <span className="hidden sm:inline text-[10px] text-muted-foreground/50 italic">
                                                        (Long press to edit)
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setManageTagsMode(!manageTagsMode)}
                                                className={`p-1.5 rounded-lg transition-colors ${
                                                    manageTagsMode 
                                                        ? 'bg-primary/10 text-primary' 
                                                        : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted'
                                                }`}
                                                title={manageTagsMode ? "Done editing" : "Manage tags"}
                                            >
                                                {manageTagsMode ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
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
                                                        // Long Press Handlers
                                                        onPointerDown={(e) => {
                                                            ignoreClickRef.current = false; // Reset
                                                            const timer = setTimeout(() => {
                                                                setManageTagsMode(true);
                                                                ignoreClickRef.current = true; // Mark to ignore next click
                                                                // Optional: Vibrate if device supports it
                                                                if (navigator.vibrate) navigator.vibrate(50);
                                                            }, 500); // 500ms long press
                                                            (e.target as any)._longPressTimer = timer;
                                                        }}
                                                        onPointerUp={(e) => {
                                                            if ((e.target as any)._longPressTimer) clearTimeout((e.target as any)._longPressTimer);
                                                        }}
                                                        onPointerLeave={(e) => {
                                                            if ((e.target as any)._longPressTimer) clearTimeout((e.target as any)._longPressTimer);
                                                        }}
                                                        onClick={(e) => {
                                                            if (ignoreClickRef.current) {
                                                                ignoreClickRef.current = false;
                                                                return;
                                                            }

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
                                                            ${manageTagsMode ? 'animate-wiggle cursor-pointer' : ''}
                                                            ${
                                                            isSelected
                                                                ? 'ring-2 ring-offset-1 ring-offset-background'
                                                                : 'hover:opacity-80 opacity-70 bg-card'
                                                            }
                                                        `}
                                                        style={{
                                                            backgroundColor: isSelected ? `${st.color}20` : undefined,
                                                            color: manageTagsMode ? '#ef4444' : st.color, // Red text when managing
                                                            borderColor: manageTagsMode ? '#ef4444' : (isSelected ? `${st.color}40` : `${st.color}20`),
                                                            boxShadow: isSelected ? `0 0 0 1px ${st.color}` : 'none',
                                                            opacity: manageTagsMode && !isSelected ? 1 : undefined // Keep visible during manage
                                                        }}
                                                    >
                                                        {st.name}
                                                        {manageTagsMode && (
                                                            <div className="absolute -top-2 -left-2 bg-red-500 text-white rounded-full p-0.5 shadow-sm z-10">
                                                                <X className="w-3 h-3" />
                                                            </div>
                                                        )}
                                                    </motion.button>
                                                );
                                            })}
                                          </AnimatePresence>
                                        </div>
                                    </motion.div>
                                )}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Segmented control */}
                <div className="mb-3" style={{ transform: 'translateZ(0)' }}>
                  <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-muted/50 ring-1 ring-border/50">
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
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        'data-[active=true]:bg-card data-[active=true]:shadow-sm data-[active=true]:ring-1 data-[active=true]:ring-border',
                        'data-[active=false]:text-muted-foreground',
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
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        'data-[active=true]:bg-card data-[active=true]:shadow-sm data-[active=true]:ring-1 data-[active=true]:ring-border',
                        'data-[active=false]:text-muted-foreground',
                      ].join(' ')}
                    >
                      <CalendarCheck className="w-4 h-4" />
                      I'll decide later
                    </button>
                  </div>
                </div>

                {/* PICK MODE */}
                {when === 'pick' && (
                  <div className="flex flex-col gap-4 mt-1 sm:flex-row sm:items-center" style={{ transform: 'translateZ(0)' }}>
                    <div className="flex-1 min-w-0 -mx-2 px-2">
                      <div className="flex justify-start gap-2 sm:gap-2 py-2 px-1 overflow-x-auto no-scrollbar mask-fade-right">
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
                                'shrink-0 inline-flex items-center justify-center select-none',
                                'h-10 w-10 sm:h-11 sm:w-11 rounded-full text-[11px] font-black uppercase tracking-tighter sm:tracking-normal',
                                'border border-border/70 shadow-sm transition-all duration-300',
                                'bg-card text-foreground',
                                'data-[active=true]:bg-primary/20 data-[active=true]:border-primary data-[active=true]:text-primary data-[active=true]:scale-110 data-[active=true]:shadow-md data-[active=true]:shadow-primary/10',
                                'hover:bg-accent/50 hover:border-border',
                              ].join(' ')}
                            >
                              {short}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="sm:shrink-0 sm:pl-1">
                         <button
                          type="button"
                          onClick={() =>
                            setRepeat((r) =>
                              r === 'weekly' ? 'this-week' : 'weekly'
                            )
                          }
                          disabled={isLater}
                          className={`
                            inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-bold transition-all
                            border shadow-sm
                            ${repeatsOn 
                                ? 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/15' 
                                : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted/80 hover:text-foreground'
                            }
                            ${isLater ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                          title={isLater ? 'Repeat is not available for Later' : (repeatsOn ? 'Repeats Weekly' : 'One-time task')}
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${repeatsOn ? 'text-primary' : 'text-muted-foreground'}`} />
                          {repeatsOn ? 'Repeats Weekly' : 'Repeat Weekly'}
                         </button>
                    </div>
                  </div>
                )}

                {when === 'later' && (
                  <div className="mt-2 flex items-start gap-2 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 ring-1 ring-green-200 dark:ring-green-800/50 p-3 text-[13px]">
                    <Info className="w-4 h-4 mt-0.5 shrink-0 text-green-600 dark:text-green-500" />
                    <span className="text-foreground">
                      <span className="font-bold text-green-700 dark:text-green-400">Not sure when?</span> Your task will be saved for later.
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="grid grid-cols-2 gap-3 mt-4" style={{ transform: 'translateZ(0)' }}>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!text.trim() || isSubmitting}
                    className={[
                      'relative h-12 rounded-full text-[15px] font-bold overflow-hidden transition-all',
                      'bg-primary text-primary-foreground',
                      'shadow-sm ring-1 ring-white/20',
                      'hover:brightness-105 active:scale-[0.985]',
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
                      'bg-secondary text-secondary-foreground',
                      'hover:bg-secondary/80 active:scale-[0.985]',
                      'ring-1 ring-border',
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

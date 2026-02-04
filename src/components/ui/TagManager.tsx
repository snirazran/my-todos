'use client';

import React, { useState, useRef, useMemo } from 'react';
import useSWR, { mutate } from 'swr';
import { Tag, Palette, Plus, X, Loader2, Pencil, Check, Lock } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

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
const MAX_SAVED_TAGS = 50;

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type SavedTag = {
  id: string;
  name: string;
  color: string;
  disabled?: boolean;
};

interface TagManagerProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

import { PremiumLimitDialog } from './PremiumLimitDialog';

export default function TagManager({ selectedTags, onTagsChange, open, onOpenChange }: TagManagerProps) {
  const { data: tagsData } = useSWR('/api/tags', fetcher);
  const savedTags: SavedTag[] = tagsData?.tags || [];

  const [tagInput, setTagInput] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[5].value);
  const [manageTagsMode, setManageTagsMode] = useState(false);
  const [showPremiumLimit, setShowPremiumLimit] = useState(false);
  
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  const tagInputRef = useRef<HTMLInputElement>(null);
  const ignoreClickRef = useRef(false);

  // Auto-focus input when opening
  React.useEffect(() => {
    if (open) {
        setTimeout(() => tagInputRef.current?.focus(), 100);
    }
  }, [open]);

  const filteredTags = useMemo(() => {
    if (!tagInput) return savedTags;
    const lower = tagInput.toLowerCase();
    return savedTags.filter(st => st.name.toLowerCase().includes(lower));
  }, [savedTags, tagInput]);

  const handleAddTag = () => {
    if (isCreatingTag) return;
    const trimmed = tagInput.trim();
    if (!trimmed) return;

    // Check if tag exists
    const existing = savedTags.find(t => t.name.toLowerCase() === trimmed.toLowerCase());

    if (existing) {
        // Select existing if not already selected
        if (!selectedTags.includes(existing.id)) {
             onTagsChange([...selectedTags, existing.id]);
        }
        setTagInput('');
        setShowColorPicker(false);
    } else {
        // New tag
        const isPremium = tagsData?.isPremium;
        const limit = isPremium ? 50 : 3;
        
        if (savedTags.length >= limit) {
            setShowPremiumLimit(true);
            return;
        }

        if (showColorPicker) {
             createAndSaveTag();
        } else {
            setShowColorPicker(true);
        }
    }
  };

  const createAndSaveTag = async () => {
    if (isCreatingTag) return;
    const trimmed = tagInput.trim();
    if (!trimmed) return;

    const isPremium = tagsData?.isPremium;
    const limit = isPremium ? 50 : 3;

    if (savedTags.length >= limit) {
        setShowPremiumLimit(true);
        return;
    }

    setIsCreatingTag(true);
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, color: newTagColor }),
      });
      const data = await res.json();
      
      mutate('/api/tags');
      
      if (data.tag && !selectedTags.includes(data.tag.id)) {
        onTagsChange([...selectedTags, data.tag.id]);
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
    if (selectedTags.includes(id)) {
        onTagsChange(selectedTags.filter((tId) => tId !== id));
    }
    
    // 3. Notify app
    window.dispatchEvent(new Event('tags-updated'));

    try {
      await fetch(`/api/tags?id=${id}`, { method: 'DELETE' });
      // Re-validate to sync with server
      mutate('/api/tags');
    } catch (error) {
      console.error('Failed to delete tag', error);
      mutate('/api/tags'); // Revert on error
    }
  };

  const removeTag = (tagId: string) => {
    onTagsChange(selectedTags.filter((t) => t !== tagId));
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden w-full"
        >
            <div className="p-3 mb-3 bg-muted/30 dark:bg-muted/10 rounded-xl border border-border">
                {/* Tag Input */}
                <div className="relative flex items-center mb-3">
                    <Tag className="absolute left-2.5 w-4 h-4 text-muted-foreground" />
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
                        className="w-full h-10 pl-9 pr-10 rounded-xl bg-background text-base md:text-sm font-medium text-foreground ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
                    />
                    <button
                        type="button"
                        onClick={handleAddTag}
                        disabled={!tagInput}
                        className="absolute right-1.5 p-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
                    >
                        {showColorPicker ? <Palette className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    </button>
                </div>

                {/* Color Picker */}
                <AnimatePresence>
                    {showColorPicker && (
                        <motion.div
                            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                            animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
                            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                            className="overflow-hidden"
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

                {/* Available Tags */}
                {savedTags.length > 0 && !showColorPicker && (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                                    Available Tags <span className={savedTags.length >= (tagsData?.isPremium ? 50 : 3) ? "text-destructive" : ""}>({savedTags.length}/{tagsData?.isPremium ? 50 : 3})</span>
                                </span>
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
                                const isSelected = selectedTags.includes(st.id);
                                return (
                                    <motion.button
                                        exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
                                        key={st.id}
                                        type="button"
                                        // Long Press
                                        onPointerDown={(e) => {
                                            ignoreClickRef.current = false;
                                            const timer = setTimeout(() => {
                                                setManageTagsMode(true);
                                                ignoreClickRef.current = true;
                                                if (navigator.vibrate) navigator.vibrate(50);
                                            }, 500); 
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
                                            if (st.disabled) {
                                                setShowPremiumLimit(true);
                                                return;
                                            }

                                            if (isSelected) removeTag(st.id);
                                            else onTagsChange([...selectedTags, st.id]);
                                        }}
                                        className={`
                                            relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold uppercase tracking-wider transition-all
                                            border disabled:opacity-50 disabled:cursor-not-allowed
                                            ${manageTagsMode ? 'animate-wiggle cursor-pointer' : ''}
                                            ${
                                            isSelected
                                                ? 'ring-2 ring-offset-1 ring-offset-background'
                                                : st.disabled
                                                    ? 'opacity-60 grayscale-[0.8] cursor-pointer bg-muted/50 border-dashed hover:opacity-80 hover:bg-muted'
                                                    : 'hover:opacity-80 opacity-70 bg-card'
                                            }
                                        `}
                                        style={{
                                            backgroundColor: isSelected ? `${st.color}20` : undefined,
                                            color: manageTagsMode ? '#ef4444' : st.color,
                                            borderColor: manageTagsMode ? '#ef4444' : (isSelected ? `${st.color}40` : st.disabled ? 'currentColor' : `${st.color}20`),
                                            boxShadow: isSelected ? `0 0 0 1px ${st.color}` : 'none',
                                            opacity: manageTagsMode && !isSelected ? 1 : undefined
                                        }}
                                    >
                                        {st.name}
                                        {st.disabled && <Lock className="w-3 h-3 ml-1.5 opacity-70" />}
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
                    </div>
                )}
            </div>
        </motion.div>
      )}
      <PremiumLimitDialog open={showPremiumLimit} onClose={() => setShowPremiumLimit(false)} />
    </AnimatePresence>
  );
}

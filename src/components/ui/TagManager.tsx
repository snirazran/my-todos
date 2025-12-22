'use client';

import React, { useState, useRef, useMemo } from 'react';
import useSWR, { mutate } from 'swr';
import { Tag, Palette, Plus, X, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

const TAG_COLORS = [
  { name: 'Red', value: '#f87171', bg: 'bg-red-500', text: 'text-red-950' },
  { name: 'Orange', value: '#fb923c', bg: 'bg-orange-500', text: 'text-orange-950' },
  { name: 'Yellow', value: '#facc15', bg: 'bg-yellow-400', text: 'text-yellow-950' },
  { name: 'Green', value: '#4ade80', bg: 'bg-green-500', text: 'text-green-950' },
  { name: 'Teal', value: '#2dd4bf', bg: 'bg-teal-400', text: 'text-teal-950' },
  { name: 'Blue', value: '#60a5fa', bg: 'bg-blue-500', text: 'text-blue-950' },
  { name: 'Purple', value: '#c084fc', bg: 'bg-purple-500', text: 'text-purple-950' },
  { name: 'Pink', value: '#f472b6', bg: 'bg-pink-500', text: 'text-pink-950' },
];

const TAG_MAX_LENGTH = 20;
const MAX_SAVED_TAGS = 15;

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type SavedTag = {
  id: string;
  name: string;
  color: string;
};

interface TagManagerProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TagManager({ selectedTags, onTagsChange, open, onOpenChange }: TagManagerProps) {
  const { data: tagsData } = useSWR('/api/tags', fetcher);
  const savedTags: SavedTag[] = tagsData?.tags || [];

  const [tagInput, setTagInput] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[5].value);
  const [manageTagsMode, setManageTagsMode] = useState(false);
  
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  const tagInputRef = useRef<HTMLInputElement>(null);

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
        if (savedTags.length >= MAX_SAVED_TAGS) {
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

    if (savedTags.length >= MAX_SAVED_TAGS) return;

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
            <div className="p-3 mb-3 bg-muted/30 rounded-xl border border-border">
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
                        placeholder="Type to create or filter..."
                        className="w-full h-10 pl-9 pr-2 rounded-xl bg-background text-base md:text-sm font-medium text-foreground ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
                    />
                    {tagInput && (
                        <button
                            type="button"
                            onClick={handleAddTag}
                            disabled={!savedTags.find(t => t.name.toLowerCase() === tagInput.trim().toLowerCase()) && savedTags.length >= MAX_SAVED_TAGS}
                            className="absolute right-1.5 p-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 disabled:opacity-50 disabled:grayscale"
                        >
                            {showColorPicker ? <Palette className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        </button>
                    )}
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
                                <div className="text-[11px] font-bold text-muted-foreground mb-2 uppercase tracking-wider">Pick a color for "{tagInput}"</div>
                                <div className="flex gap-2 flex-wrap">
                                    {TAG_COLORS.map((c) => (
                                    <button
                                        key={c.name}
                                        type="button"
                                        onClick={() => setNewTagColor(c.value)}
                                        className={`w-8 h-8 rounded-full ${c.bg} ring-2 ring-offset-2 ring-offset-background transition-all ${
                                        newTagColor === c.value
                                            ? 'ring-muted-foreground scale-110'
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
                {savedTags.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                                Saved Tags <span className={savedTags.length >= MAX_SAVED_TAGS ? "text-destructive" : ""}>({savedTags.length}/{MAX_SAVED_TAGS})</span>
                            </span>
                            <button
                                type="button"
                                onClick={() => setManageTagsMode(!manageTagsMode)}
                                className={`text-[11px] font-bold px-2 py-0.5 rounded transition-colors ${
                                    manageTagsMode ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {manageTagsMode ? 'Done' : 'Manage'}
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
                                        onClick={(e) => {
                                            if (manageTagsMode) {
                                                deleteSavedTag(st.id, st.name, e);
                                                return;
                                            }
                                            if (isSelected) removeTag(st.id);
                                            else onTagsChange([...selectedTags, st.id]);
                                        }}
                                        className={`
                                            relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold uppercase tracking-wider transition-all
                                            border disabled:opacity-50 disabled:cursor-not-allowed
                                            ${
                                            isSelected
                                                ? 'ring-2 ring-offset-1 ring-offset-background'
                                                : 'hover:opacity-80 opacity-70 bg-card'
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
                                            className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full p-1 shadow-sm hover:scale-110 z-10"
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
  );
}

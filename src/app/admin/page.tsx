'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcw, ShieldCheck, ChevronRight, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';
import { mutate } from 'swr';

export default function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const router = useRouter();

  const handleResetRecap = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/reset-weekly-recap', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.ok) {
        // Clear SWR cache for recap data
        mutate((key) => typeof key === 'string' && key.startsWith('/api/weekly-recap'));
        setMessage({ type: 'success', text: 'Weekly recap has been reset! Check the home page.' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to reset recap' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An unexpected error occurred' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">Admin Dashboard</h1>
            <p className="text-muted-foreground font-medium">Internal tools and developer settings</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Weekly Recap Reset */}
          <div className="p-6 rounded-3xl border border-border bg-card shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <RefreshCcw className="w-5 h-5" />
              <h2 className="text-lg font-bold">Weekly Wrapped</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Reset your "seen" status for the Weekly Wrapped experience. This will make the "Weekly Wrapped Ready!" indicator reappear on your home page.
            </p>
            <button
              onClick={handleResetRecap}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <RefreshCcw className="w-5 h-5" />
              )}
              Reset "Seen" Status
            </button>
            {message && (
              <p className={`text-sm font-bold ${message.type === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
                {message.text}
              </p>
            )}
          </div>

          {/* Quest Manager Link */}
          <Link href="/admin/quests" className="p-6 rounded-3xl border border-border bg-card shadow-sm space-y-4 hover:border-primary/50 transition-colors group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-500">
                <ShieldCheck className="w-5 h-5" />
                <h2 className="text-lg font-bold text-foreground">Quest Manager</h2>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </div>
            <p className="text-sm text-muted-foreground">
              Manage quest macro-categories, tag mappings, and premium settings.
            </p>
          </Link>

          {/* Background Manager Link */}
          <Link href="/admin/backgrounds" className="p-6 rounded-3xl border border-border bg-card shadow-sm space-y-4 hover:border-primary/50 transition-colors group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sky-500">
                <ImageIcon className="w-5 h-5" />
                <h2 className="text-lg font-bold text-foreground">Background Manager</h2>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </div>
            <p className="text-sm text-muted-foreground">
              Create shop backgrounds with name, cost, rarity, and a photo per screen size.
            </p>
          </Link>
        </div>

        <div className="pt-8 flex justify-center">
          <button 
            onClick={() => router.push('/')}
            className="text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to App
          </button>
        </div>
      </div>
    </div>
  );
}

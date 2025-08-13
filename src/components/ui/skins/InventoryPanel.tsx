'use client';

import useSWR from 'swr';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSkins } from '@/lib/skinsStore';
import type { SkinDef } from '@/lib/skins/catalog';
import { Shirt, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type ApiData = {
  skins: {
    equippedId: string;
    inventory: Record<string, number>;
    flies: number;
  };
  catalog: SkinDef[];
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function InventoryPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, mutate, isLoading } = useSWR<ApiData>(
    open ? '/api/skins/inventory' : null,
    fetcher
  );
  const setEquippedById = useSkins((s) => s.setEquippedById);
  const equippedIdStore = useSkins((s) => s.equippedId);
  const [saving, setSaving] = useState<string | null>(null);

  const equip = async (skinId: string) => {
    setSaving(skinId);
    const res = await fetch('/api/skins/inventory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skinId }),
    });
    setSaving(null);
    if (res.ok) {
      setEquippedById(skinId); // drive all Frogs instantly
      mutate(); // refresh server copy
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shirt className="w-5 h-5" /> Wardrobe — Inventory
          </DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="py-8 text-sm text-center text-slate-500">
            Loading…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-5 gap-3">
              {data.catalog.map((skin) => {
                const owned = (data.skins.inventory[skin.id] ?? 0) > 0;
                const equipped =
                  data.skins.equippedId === skin.id ||
                  equippedIdStore === skin.id;

                return (
                  <div
                    key={skin.id}
                    className={cn(
                      'rounded-xl p-2 border bg-white dark:bg-slate-900 shadow-sm',
                      owned ? 'border-slate-300' : 'border-dashed opacity-60'
                    )}
                  >
                    <div className="grid rounded-lg aspect-square place-items-center bg-slate-50 dark:bg-slate-800">
                      {/* swap to next/image if you have assets */}
                      <img
                        src={skin.icon}
                        alt={skin.name}
                        className="object-contain w-12 h-12"
                      />
                    </div>
                    <div className="mt-1 text-xs font-medium truncate">
                      {skin.name}
                    </div>
                    <div className="mt-2">
                      <Button
                        size="sm"
                        className="w-full h-8"
                        disabled={!owned || saving === skin.id}
                        onClick={() => equip(skin.id)}
                        variant={equipped ? 'default' : 'secondary'}
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        {equipped ? 'Equipped' : owned ? 'Equip' : 'Locked'}
                      </Button>
                    </div>
                    {owned && (
                      <div className="mt-1 text-[11px] text-right text-slate-500">
                        ×{data.skins.inventory[skin.id] ?? 0}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

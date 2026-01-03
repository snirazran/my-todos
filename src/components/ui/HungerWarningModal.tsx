'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FrogMessage } from '@/components/ui/FrogMessage';
import Frog from '@/components/ui/frog';

interface Props {
  stolenFlies: number;
  onAcknowledge: () => void;
  open: boolean;
}

export function HungerWarningModal({ stolenFlies, onAcknowledge, open }: Props) {
  return (
    <Dialog open={open} onOpenChange={(val) => !val && onAcknowledge()}>
      <DialogContent className="sm:max-w-[425px] border-none bg-transparent shadow-none p-0">
        <div className="relative bg-card/95 backdrop-blur-xl border border-border/50 rounded-[32px] p-6 shadow-2xl overflow-hidden">
          
          {/* Header Graphic */}
          <div className="flex flex-col items-center justify-center pt-4 pb-6">
            <div className="relative w-32 h-32 mb-4">
               {/* Sad Frog Placeholder or actual Frog component if it supports emotions */}
               {/* Using the standard Frog for now, maybe we can add a 'sad' prop later */}
               <Frog className="transform scale-125" />
               <div className="absolute -right-4 -top-2 text-4xl animate-bounce">
                 😢
               </div>
            </div>
            
            <DialogHeader className="text-center space-y-2">
              <DialogTitle className="text-2xl font-black text-foreground">
                Oops! I was hungry...
              </DialogTitle>
              <DialogDescription className="text-base font-medium text-muted-foreground">
                Sorry, I was so hungry I ate <span className="font-bold text-rose-500">{stolenFlies} of your flies</span> :(
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="bg-muted/50 rounded-2xl p-4 mb-6 text-center text-sm text-muted-foreground leading-relaxed">
            Completing tasks keeps me full! Don't let me starve, or I might snack on your hard-earned flies again.
          </div>

          <DialogFooter className="sm:justify-center">
            <Button 
              onClick={onAcknowledge}
              className="w-full sm:w-auto min-w-[200px] h-12 rounded-xl text-lg font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all active:scale-95"
            >
              I understand, I'll feed you!
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

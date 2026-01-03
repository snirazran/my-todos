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
          <div className="flex flex-col items-center justify-center pt-2 pb-6 w-full">
            <div className="relative w-full mb-2 flex items-center justify-center">
               <div className="flex items-center justify-center">
                  <Frog width={200} height={150} />
               </div>
            </div>
            
            <DialogHeader className="text-center space-y-2">
              <DialogTitle className="text-3xl font-black text-foreground tracking-tight">
                Oh no... I was so hungry!
              </DialogTitle>
              <DialogDescription className="text-base font-medium text-muted-foreground px-4">
                I'm sorry, I couldn't help it! I had to eat <span className="font-bold text-rose-500">{stolenFlies} of your flies</span> :(
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="bg-muted/50 rounded-2xl p-4 mb-6 text-center text-sm font-medium text-muted-foreground leading-relaxed mx-2">
            Feed me by <span className="text-foreground font-bold italic">completing tasks</span>! It's the only way to keep me full and your flies safe.
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

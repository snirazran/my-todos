'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Copy, Check, Send, Loader2 } from 'lucide-react';
import useSWR, { mutate as swrMutate } from 'swr';
import jsQR from 'jsqr';
import Frog from '@/components/ui/frog';
import { isNativeScan, parseFriendValue } from '@/lib/friends/scan';

type Tab = 'scan' | 'mycode';

type CodeData = { code: string; name: string; frogName: string };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function QRFriendModal({
  open,
  onClose,
  initialTab = 'mycode',
  indices,
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: Tab;
  indices?: Partial<Record<'skin' | 'hat' | 'body' | 'hand_item', number>>;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1500] flex flex-col bg-[#23a6f0] text-white"
          data-qr-modal
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="absolute left-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 flex h-11 w-11 items-center justify-center rounded-full text-white"
          >
            <ChevronLeft className="h-8 w-8" strokeWidth={3} />
          </button>

          <div className="relative flex-1 overflow-hidden">
            {tab === 'mycode' ? (
              <MyCodeView indices={indices} />
            ) : (
              <ScanView active={open && tab === 'scan'} onClose={onClose} />
            )}
          </div>

          <div
            className="relative z-30 bg-[#5bc0f8] px-6 pt-5 text-center"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
          >
            <p className="mx-auto max-w-sm text-lg font-bold leading-snug text-white">
              Scan a Frogress QR code with your phone&apos;s camera to add a new friend!
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <TabButton active={tab === 'scan'} onClick={() => setTab('scan')}>
                SCAN
              </TabButton>
              <TabButton active={tab === 'mycode'} onClick={() => setTab('mycode')}>
                MY CODE
              </TabButton>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-6 py-2.5 text-sm font-black uppercase tracking-[0.12em] transition-colors ${
        active ? 'bg-[#1f7fc0] text-white' : 'bg-white/25 text-white/90'
      }`}
    >
      {children}
    </button>
  );
}

function MyCodeView({
  indices,
}: {
  indices?: Partial<Record<'skin' | 'hat' | 'body' | 'hand_item', number>>;
}) {
  const { data } = useSWR<CodeData>('/api/friends/code', fetcher, {
    revalidateOnFocus: false,
  });
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl =
    data?.code && typeof window !== 'undefined'
      ? `${window.location.origin}/?friend=${encodeURIComponent(data.code)}`
      : '';

  useEffect(() => {
    if (!shareUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        const QRCode = (await import('qrcode')).default;
        const url = await QRCode.toDataURL(shareUrl, {
          width: 720,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
        });
        if (!cancelled) setQr(url);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  const handleShare = useCallback(async () => {
    if (!shareUrl) return;
    const shareData = {
      title: 'Add me on Frogress!',
      text: `Add me as a friend on Frogress — my code is ${data?.code ?? ''}`,
      url: shareUrl,
    };
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share(shareData);
        return;
      }
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {}
  }, [shareUrl, data?.code]);

  const handleCopy = useCallback(async () => {
    if (!data?.code) return;
    try {
      await navigator.clipboard.writeText(data.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  }, [data?.code]);

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="relative w-full max-w-sm">
        <div className="pointer-events-none absolute -top-16 left-1/2 z-10 -translate-x-1/2">
          <Frog width={150} height={169} indices={indices} paused />
        </div>

        <div className="relative rounded-[28px] bg-white px-6 pb-7 pt-12 text-center shadow-2xl">
          <p className="text-xl font-black tracking-tight text-zinc-900">
            {data?.name ? `${data.name} & ${data.frogName}` : data?.frogName ?? 'Your code'}
          </p>
          <button
            type="button"
            onClick={handleCopy}
            className="mx-auto mt-1 flex items-center gap-1.5 text-base font-bold tracking-[0.12em] text-zinc-500"
          >
            {data?.code ?? '··········'}
            {copied ? (
              <Check className="h-4 w-4 text-emerald-500" strokeWidth={3} />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>

          <div className="mx-auto mt-5 flex aspect-square w-full max-w-[260px] items-center justify-center">
            {qr ? (
              <img src={qr} alt="Your friend QR code" className="h-full w-full" />
            ) : (
              <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleShare}
        className="mt-7 flex items-center gap-2.5 rounded-2xl bg-white px-8 py-3.5 text-lg font-black tracking-tight text-[#23a6f0] shadow-[0_5px_0_rgba(0,0,0,0.12)] transition-all active:translate-y-0.5"
      >
        <Send className="h-5 w-5 -rotate-12" />
        Share Link
      </button>
    </div>
  );
}

function ScanView({ active, onClose }: { active: boolean; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handledRef = useRef(false);
  const [status, setStatus] = useState<'idle' | 'scanning' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const submitCode = useCallback(async (raw: string) => {
    if (handledRef.current) return;
    const code = parseFriendValue(raw);
    if (!code) return;
    handledRef.current = true;
    setStatus('sending');
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, source: 'qr' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Could not add friend');
        handledRef.current = false;
        return;
      }
      setStatus('sent');
      setMessage(
        data.alreadyFriends
          ? 'Already friends!'
          : data.autoAccepted
            ? 'Friend added!'
            : 'Friend request sent!',
      );
      swrMutate('/api/friends');
      swrMutate('/api/friends/request');
      setTimeout(onClose, 1200);
    } catch {
      setStatus('error');
      setMessage('Something went wrong');
      handledRef.current = false;
    }
  }, [onClose]);

  // Native (Capacitor) scanning via the in-app ML Kit code scanner.
  useEffect(() => {
    if (!active || !isNativeScan()) return;
    let cancelled = false;

    void (async () => {
      try {
        const { BarcodeScanner, BarcodeFormat } = await import(
          '@capacitor-mlkit/barcode-scanning'
        );
        const perm = await BarcodeScanner.requestPermissions();
        if (cancelled) return;
        if (perm.camera !== 'granted' && perm.camera !== 'limited') {
          setStatus('error');
          setMessage('Camera permission denied');
          return;
        }
        try {
          const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
          if (!available) await BarcodeScanner.installGoogleBarcodeScannerModule();
        } catch {
          /* installation is Android-only / may already be present */
        }
        if (cancelled) return;
        setStatus('scanning');
        const { barcodes } = await BarcodeScanner.scan({
          formats: [BarcodeFormat.QrCode],
        });
        const value = barcodes?.[0]?.rawValue;
        if (value) void submitCode(value);
        else if (!cancelled) onClose();
      } catch {
        if (!cancelled) {
          setStatus('error');
          setMessage('Scanner unavailable');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active, submitCode, onClose]);

  // Web (getUserMedia + jsQR) scanning.
  useEffect(() => {
    if (!active || isNativeScan()) return;
    let cancelled = false;

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(img.data, img.width, img.height, {
            inversionAttempts: 'dontInvert',
          });
          if (result?.data) void submitCode(result.data);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('scanning');
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        setStatus('error');
        setMessage('Could not access camera');
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [active, submitCode]);

  const native = isNativeScan();

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black">
      {!native && (
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <canvas ref={canvasRef} className="hidden" />

      {/* Blue framing reticle */}
      <div className="pointer-events-none relative z-10 h-64 w-64 rounded-[28px] border-[6px] border-[#23a6f0] shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />

      {message && (
        <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/70 px-5 py-2.5 text-sm font-bold text-white">
          {status === 'sending' && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}
          {message}
        </div>
      )}
    </div>
  );
}

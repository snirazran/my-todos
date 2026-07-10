'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, Send, Loader2 } from 'lucide-react';
import useSWR, { mutate as swrMutate } from 'swr';
import jsQR from 'jsqr';
import Frog from '@/components/ui/frog';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { isNativeScan, parseFriendValue } from '@/lib/friends/scan';
import { trackAnalyticsEvent } from '@/lib/analytics/client';

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
  useRegisterOpenSheet(open);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

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
          className="fixed inset-0 z-[1500] flex justify-center sm:items-center sm:bg-black/70 sm:p-6"
          data-qr-modal
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="relative flex h-full w-full flex-col overflow-x-hidden overflow-y-auto bg-[#23a6f0] text-white overscroll-contain sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:w-[24rem] sm:max-w-[calc(100vw-3rem)] sm:rounded-[32px] sm:shadow-2xl">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-40 flex h-10 w-10 items-center justify-center rounded-full bg-black/25 text-white ring-1 ring-white/30 backdrop-blur-sm transition-transform active:scale-95 sm:top-3"
            >
              <X className="h-6 w-6" strokeWidth={3} />
            </button>

            <div className="relative flex-1 overflow-hidden sm:flex-none">
              {!isDesktop && tab === 'scan' ? (
                <ScanView active={open && tab === 'scan'} onClose={onClose} />
              ) : (
                <MyCodeView indices={indices} isDesktop={isDesktop} />
              )}
            </div>

            {!isDesktop && (
              <div
                className="relative z-30 bg-[#5bc0f8] px-6 pt-5 text-center"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
              >
                <p className="mx-auto max-w-sm text-sm font-bold leading-snug text-white min-[400px]:text-base">
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
            )}
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
  isDesktop,
}: {
  indices?: Partial<Record<'skin' | 'hat' | 'body' | 'hand_item', number>>;
  isDesktop?: boolean;
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
        trackAnalyticsEvent('friend_link_shared', { method: 'native_share', share_surface: 'friend_qr' });
        return;
      }
    } catch {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      trackAnalyticsEvent('friend_link_shared', { method: 'copy_link', share_surface: 'friend_qr' });
    } catch {}
  }, [shareUrl, data?.code]);

  const handleCopy = useCallback(async () => {
    if (!data?.code) return;
    try {
      await navigator.clipboard.writeText(data.code);
      trackAnalyticsEvent('friend_link_shared', { method: 'copy_code', share_surface: 'friend_qr' });
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  }, [data?.code]);

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-3 sm:h-auto sm:justify-start sm:py-5 sm:[@media(max-height:760px)]:py-4 sm:[@media(max-height:680px)]:py-3">
      <div className="flex w-full max-w-sm flex-col items-center">
        <div className="pointer-events-none relative z-10 origin-bottom -mb-1.5 translate-y-0 sm:-mb-2 sm:-mt-14 sm:translate-y-1 min-[360px]:max-sm:scale-125 min-[360px]:max-sm:translate-y-0 min-[400px]:max-sm:scale-[1.45] min-[400px]:max-sm:translate-y-1 sm:[@media(max-height:760px)]:-mt-12 sm:[@media(max-height:680px)]:-mt-10 sm:[@media(max-height:680px)]:scale-90">
          <Frog
            width={isDesktop ? 230 : 150}
            height={isDesktop ? 259 : 169}
            indices={indices}
          />
        </div>

        <div className="relative w-full rounded-[28px] border border-border bg-popover px-5 pb-5 pt-6 text-center text-popover-foreground shadow-2xl sm:px-6 sm:pb-7 sm:[@media(max-height:760px)]:pb-5 sm:[@media(max-height:760px)]:pt-5">
          <p className="text-lg font-black leading-tight tracking-tight text-foreground sm:text-xl sm:[@media(max-height:680px)]:text-lg">
            {data?.name ? `${data.name} & ${data.frogName}` : data?.frogName ?? 'Your code'}
          </p>
          <button
            type="button"
            onClick={handleCopy}
            className="mx-auto mt-1.5 flex items-center gap-1.5 text-base font-bold tracking-[0.12em] text-muted-foreground"
          >
            {data?.code ?? '··········'}
            {copied ? (
              <Check className="h-4 w-4 text-emerald-500" strokeWidth={3} />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>

          <div className="mx-auto mt-3 flex aspect-square w-full max-w-[155px] items-center justify-center min-[360px]:max-w-[190px] min-[400px]:max-w-[220px] sm:mt-4 sm:max-w-[210px] sm:[@media(max-height:760px)]:max-w-[180px] sm:[@media(max-height:680px)]:max-w-[150px]">
            {qr ? (
              <img src={qr} alt="Your friend QR code" className="h-full w-full" />
            ) : (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleShare}
        className="mt-4 flex items-center gap-2.5 rounded-2xl bg-white px-8 py-3.5 text-lg font-black tracking-tight text-[#23a6f0] shadow-[0_5px_0_rgba(0,0,0,0.12)] transition-all active:translate-y-0.5 sm:mt-5 sm:[@media(max-height:760px)]:mt-4 sm:[@media(max-height:680px)]:py-3 sm:[@media(max-height:680px)]:text-base"
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

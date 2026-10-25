'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BackgroundImages } from '@/hooks/useBackgrounds';
import { cn } from '@/lib/utils';

type Layer = {
  key: number;
  id: string;
  images: BackgroundImages;
  state: 'loading' | 'entering' | 'shown';
  animate: boolean;
};

export function BackgroundCrossfade({
  id,
  images,
}: {
  id: string;
  images: BackgroundImages;
}) {
  const serial = useRef(0);
  const [layers, setLayers] = useState<Layer[]>(() => [
    { key: 0, id, images, state: 'shown', animate: false },
  ]);

  useEffect(() => {
    setLayers((prev) => {
      const kept = prev.filter((layer) => layer.state !== 'loading');
      if (kept[kept.length - 1]?.id === id) {
        return kept.length === prev.length ? prev : kept;
      }
      serial.current += 1;
      return [
        ...kept,
        { key: serial.current, id, images, state: 'loading', animate: true },
      ];
    });
  }, [id, images]);

  const reveal = useCallback((key: number) => {
    setLayers((prev) =>
      prev.map((layer) =>
        layer.key === key && layer.state === 'loading'
          ? { ...layer, state: 'entering' }
          : layer,
      ),
    );
  }, []);

  const settle = useCallback((key: number) => {
    setLayers((prev) => {
      const index = prev.findIndex((layer) => layer.key === key);
      if (index < 0) return prev;
      return prev
        .slice(index)
        .map((layer, i) => (i === 0 ? { ...layer, state: 'shown' } : layer));
    });
  }, []);

  return (
    <>
      {layers.map((layer) => (
        <BackgroundLayer
          key={layer.key}
          layer={layer}
          onReady={reveal}
          onShown={settle}
        />
      ))}
    </>
  );
}

function BackgroundLayer({
  layer,
  onReady,
  onShown,
}: {
  layer: Layer;
  onReady: (key: number) => void;
  onShown: (key: number) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const loading = layer.state === 'loading';

  useEffect(() => {
    if (!loading) return;
    const img = imgRef.current;
    if (!img) return;
    let cancelled = false;
    const ready = () => {
      if (!cancelled) onReady(layer.key);
    };
    const decode = () => {
      img.decode().then(ready, ready);
    };
    if (img.complete) decode();
    else {
      img.addEventListener('load', decode, { once: true });
      img.addEventListener('error', ready, { once: true });
    }
    return () => {
      cancelled = true;
      img.removeEventListener('load', decode);
      img.removeEventListener('error', ready);
    };
  }, [loading, layer.key, onReady]);

  return (
    <div
      className={cn(
        'absolute inset-0 overflow-hidden',
        loading && 'opacity-0',
        !loading && layer.animate && 'background-layer-enter',
      )}
      onAnimationEnd={(event) => {
        if (event.animationName === 'background-fade-in') onShown(layer.key);
      }}
    >
      <BackgroundPicture images={layer.images} imgRef={imgRef} />
      {!loading && layer.animate && (
        <span className="background-layer-glint pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_30%,rgba(255,255,255,0.22)_50%,transparent_70%)]" />
      )}
    </div>
  );
}

function BackgroundPicture({
  images,
  imgRef,
}: {
  images: BackgroundImages;
  imgRef: React.Ref<HTMLImageElement>;
}) {
  return (
    <picture className="block h-full w-full">
      {images.webLarge && (
        <source media="(min-width: 1920px)" srcSet={images.webLarge} />
      )}
      {images.web && <source media="(min-width: 1280px)" srcSet={images.web} />}
      {images.tablet && (
        <source media="(min-width: 768px)" srcSet={images.tablet} />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={images.mobile}
        alt=""
        draggable={false}
        decoding="async"
        className="h-full w-full object-cover object-top"
      />
    </picture>
  );
}

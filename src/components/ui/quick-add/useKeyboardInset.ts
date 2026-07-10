import { useEffect, useRef, useState } from 'react';

export function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);
  const [height, setHeight] = useState<number | null>(null);
  const layoutHeightRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      layoutHeightRef.current = null;
      setInset(0);
      setHeight(null);
      return;
    }
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const vv = window.visualViewport;
    const update = () => {
      const viewportBottom = vv.height + vv.offsetTop;
      // Some mobile WebViews resize window.innerHeight after the first keyboard
      // cycle. Preserve the full, pre-keyboard layout height so subsequent
      // openings cannot report a smaller inset and push the sheet downward.
      layoutHeightRef.current = Math.max(
        layoutHeightRef.current ?? 0,
        window.innerHeight,
        viewportBottom,
      );
      const nextInset = Math.max(
        0,
        layoutHeightRef.current - viewportBottom,
      );
      setInset(nextInset);
      setHeight(vv.height);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);

  return { inset, height };
}

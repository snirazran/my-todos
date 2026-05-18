import { useEffect, useState } from 'react';

export function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      setInset(0);
      setHeight(null);
      return;
    }
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const vv = window.visualViewport;
    const update = () => {
      const nextInset = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop,
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

import { useRef, useState, useEffect, RefObject } from 'react';

export function useDraggableScroll(
  ref: RefObject<HTMLElement>,
  options: { direction?: 'horizontal' | 'vertical' | 'both' } = {
    direction: 'horizontal',
  },
) {
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const onMouseDown = (e: MouseEvent) => {
      setIsDragging(true);
      setStartX(e.pageX - element.offsetLeft);
      setStartY(e.pageY - element.offsetTop);
      setScrollLeft(element.scrollLeft);
      setScrollTop(element.scrollTop);
      element.style.cursor = 'grabbing';
      element.style.userSelect = 'none';
    };

    const onMouseLeave = () => {
      if (isDragging) {
        setIsDragging(false);
        element.style.cursor = 'grab';
        element.style.userSelect = 'auto';
      }
    };

    const onMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        element.style.cursor = 'grab';
        element.style.userSelect = 'auto';
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      e.preventDefault();

      if (options.direction === 'horizontal' || options.direction === 'both') {
        const x = e.pageX - element.offsetLeft;
        const walkX = (x - startX) * 1.5; // Scroll-fast
        element.scrollLeft = scrollLeft - walkX;
      }

      if (options.direction === 'vertical' || options.direction === 'both') {
        const y = e.pageY - element.offsetTop;
        const walkY = (y - startY) * 1.5;
        element.scrollTop = scrollTop - walkY;
      }
    };

    element.addEventListener('mousedown', onMouseDown);
    element.addEventListener('mouseleave', onMouseLeave);
    element.addEventListener('mouseup', onMouseUp);
    element.addEventListener('mousemove', onMouseMove);

    // Set initial cursor
    element.style.cursor = 'grab';

    return () => {
      element.removeEventListener('mousedown', onMouseDown);
      element.removeEventListener('mouseleave', onMouseLeave);
      element.removeEventListener('mouseup', onMouseUp);
      element.removeEventListener('mousemove', onMouseMove);
      element.style.cursor = 'auto';
      element.style.userSelect = 'auto';
    };
  }, [
    ref,
    isDragging,
    startX,
    startY,
    scrollLeft,
    scrollTop,
    options.direction,
  ]);

  return { isDragging };
}

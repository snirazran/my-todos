function scrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function revealInScroller(el: HTMLElement, padding = 16) {
  const box = scrollParent(el);
  if (!box) return;
  const target = el.getBoundingClientRect();
  const frame = box.getBoundingClientRect();
  if (target.bottom + padding > frame.bottom) {
    box.scrollTop += target.bottom + padding - frame.bottom;
  } else if (target.top - padding < frame.top) {
    box.scrollTop -= frame.top - (target.top - padding);
  }
}

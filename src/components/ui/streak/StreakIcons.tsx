import React from 'react';

export function PrizeMedal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path d="M5.5 1.5h4.6l3 7.5H8.5z" fill="#ef5a4c" />
      <path d="M18.5 1.5h-4.6l-3 7.5h4.6z" fill="#3b82f6" />
      <circle cx="12" cy="15.2" r="7" fill="#ffc531" stroke="#c98b00" strokeWidth="1.6" />
      <path
        d="m12 11.2 1.2 2.5 2.7.4-2 1.9.5 2.7-2.4-1.3-2.4 1.3.5-2.7-2-1.9 2.7-.4z"
        fill="#fff6d6"
      />
    </svg>
  );
}

export function SolidFlame({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="currentColor" className={className}>
      <path d="M12.6 1.8c.5 2.8 2.3 4.6 4 6.4 1.8 1.9 3.2 4 3.2 6.8A7.8 7.8 0 0 1 12 22.8 7.8 7.8 0 0 1 4.2 15c0-2.6 1.1-4.7 2.9-6.3.3 1.8 1.2 3 2.5 3.7-.5-3.9.8-8 3-10.6Z" />
    </svg>
  );
}

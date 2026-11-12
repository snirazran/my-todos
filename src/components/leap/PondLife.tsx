import { cn } from '@/lib/utils';

const FIREFLIES = [
  { left: '9%', top: '22%', size: 5, delay: '0s', duration: '5.6s' },
  { left: '21%', top: '58%', size: 4, delay: '1.4s', duration: '6.4s' },
  { left: '36%', top: '14%', size: 3, delay: '2.6s', duration: '5.2s' },
  { left: '66%', top: '18%', size: 4, delay: '0.8s', duration: '6.8s' },
  { left: '82%', top: '46%', size: 5, delay: '2.1s', duration: '5.9s' },
  { left: '91%', top: '16%', size: 3, delay: '3.3s', duration: '6.1s' },
  { left: '74%', top: '72%', size: 3, delay: '1.9s', duration: '7.2s' },
];

export function PondLife({ className, scene = false }: { className?: string; scene?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', !scene && '-z-10', className)}
    >
      {!scene && (
        <>
          <span className="leap-drift absolute -left-[20%] -top-[30%] h-[85%] w-[80%] rounded-full bg-[radial-gradient(closest-side,rgba(190,255,236,0.34),transparent)]" />
          <span className="leap-drift-slow absolute -bottom-[35%] -right-[25%] h-[90%] w-[85%] rounded-full bg-[radial-gradient(closest-side,rgba(8,44,66,0.5),transparent)]" />
        </>
      )}
      {FIREFLIES.map((fly, index) => (
        <span
          key={index}
          className="leap-firefly absolute rounded-full bg-[#fff3b8] shadow-[0_0_10px_3px_rgba(255,236,150,0.55)]"
          style={{
            left: fly.left,
            top: fly.top,
            width: fly.size,
            height: fly.size,
            animationDelay: fly.delay,
            animationDuration: fly.duration,
          }}
        />
      ))}
    </div>
  );
}

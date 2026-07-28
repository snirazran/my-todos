'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

const css = `
:root {
  --e-bg: #eef4ef;
  --e-glow: rgba(22, 163, 74, 0.22);
  --e-card: rgba(255, 255, 255, 0.85);
  --e-fg: #0f1c15;
  --e-muted: #5b6a61;
  --e-border: rgba(15, 28, 21, 0.12);
  --e-primary: #16a34a;
  --e-on-primary: #ffffff;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --e-bg: #0e1612;
    --e-glow: rgba(52, 211, 153, 0.18);
    --e-card: rgba(24, 36, 30, 0.85);
    --e-fg: #e8f0ea;
    --e-muted: #9aa8a0;
    --e-border: rgba(232, 240, 234, 0.14);
    --e-primary: #34d399;
    --e-on-primary: #08160f;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  background: radial-gradient(ellipse 80% 55% at 50% 22%, var(--e-glow), transparent 70%), var(--e-bg);
  color: var(--e-fg);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.e-wrap { width: 100%; max-width: 420px; text-align: center; }
.e-fly {
  width: 46px;
  height: 46px;
  animation: e-buzz 0.55s ease-in-out infinite, e-hover 4.5s ease-in-out infinite;
}
.e-code {
  margin: 4px 0 0;
  font-size: clamp(52px, 17vw, 96px);
  font-weight: 900;
  letter-spacing: -0.045em;
  line-height: 1;
  color: var(--e-primary);
}
.e-title { margin: 10px 0 0; font-size: 22px; font-weight: 800; letter-spacing: -0.01em; }
.e-msg {
  margin: 8px auto 0;
  max-width: 19rem;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.55;
  color: var(--e-muted);
}
.e-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 56px;
  margin-top: 22px;
  border: none;
  border-radius: 16px;
  background: var(--e-primary);
  color: var(--e-on-primary);
  font-size: 16px;
  font-weight: 800;
  font-family: inherit;
  cursor: pointer;
}
.e-btn:active { transform: scale(0.98); }
.e-rule {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--e-muted);
}
.e-rule::before, .e-rule::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--e-border);
}
.e-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--e-border);
  border-radius: 22px;
  background: var(--e-card);
  text-align: left;
  text-decoration: none;
  color: inherit;
}
.e-card:active { transform: scale(0.99); }
.e-badge {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  background: rgba(250, 204, 21, 0.16);
  box-shadow: 0 0 14px rgba(250, 204, 21, 0.3);
}
.e-badge img { width: 28px; height: 28px; animation: e-hover 2.6s ease-in-out infinite; }
.e-card-title { margin: 0; font-size: 16px; font-weight: 900; letter-spacing: 0.01em; }
.e-card-sub { margin: 3px 0 0; font-size: 12px; font-weight: 500; line-height: 1.4; color: var(--e-muted); }
.e-chev { margin-left: auto; color: var(--e-muted); font-size: 20px; font-weight: 800; }
.e-home {
  display: inline-block;
  margin-top: 18px;
  font-size: 12px;
  font-weight: 700;
  color: var(--e-muted);
}
@keyframes e-buzz {
  0%, 100% { transform: rotate(-8deg) scale(1); }
  50% { transform: rotate(8deg) scale(1.07); }
}
@keyframes e-hover {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-7px); }
}
@media (prefers-reduced-motion: reduce) {
  .e-fly, .e-badge img { animation: none; }
}
`;

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <div className="e-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fly.svg" alt="" className="e-fly" draggable={false} />
          <p className="e-code">OOPS</p>
          <h1 className="e-title">The whole pond went dark.</h1>
          <p className="e-msg">
            Frogress hit an error it couldn&rsquo;t recover from. It was reported
            automatically, and a reload almost always brings it back.
          </p>

          <button
            type="button"
            className="e-btn"
            onClick={() => window.location.reload()}
          >
            Reload Frogress
          </button>

          <div className="e-rule">While you&rsquo;re here</div>

          <a className="e-card" href="/fly-catch?from=error">
            <span className="e-badge">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/fly.svg" alt="" draggable={false} />
            </span>
            <span>
              <p className="e-card-title">FLY CATCH</p>
              <p className="e-card-sub">
                One frog, one swarm, thirty seconds. The red ones bite back.
              </p>
            </span>
            <span className="e-chev">›</span>
          </a>

          <a className="e-home" href="/">
            Take me home
          </a>
        </div>
      </body>
    </html>
  );
}

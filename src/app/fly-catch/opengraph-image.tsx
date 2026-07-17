import { ImageResponse } from 'next/og';

export const alt = 'Frogress high-score challenge — catch one more';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function FlyCatchOpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 76px',
          color: 'white',
          background:
            'radial-gradient(circle at 82% 18%, rgba(167,243,106,.28), transparent 28%), linear-gradient(135deg, #153f27, #07170f 58%, #041009)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: '#a7f36a', fontSize: 34, fontWeight: 900, letterSpacing: 3 }}>
            FROGRESS
          </div>
          <div style={{ display: 'flex', border: '2px solid rgba(167,243,106,.35)', borderRadius: 999, padding: '12px 22px', fontSize: 22, fontWeight: 800 }}>
            30 SECOND CHALLENGE
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 104, lineHeight: 0.92, fontWeight: 1000, letterSpacing: -5 }}>
            HIGH SCORE
          </div>
          <div style={{ marginTop: 24, color: '#dfffd0', fontSize: 42, fontWeight: 800 }}>
            Catch one more. Then do one more.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 25, fontWeight: 700, color: 'rgba(255,255,255,.72)' }}>
          <span style={{ color: '#fde047' }}>GOLD +3</span>
          <span>·</span>
          <span style={{ color: '#67e8f9' }}>TIME +2s</span>
          <span>·</span>
          <span style={{ color: '#fda4af' }}>TRAPS −4</span>
          <span>·</span>
          <span style={{ color: '#a7f36a' }}>CAN YOU TOP THE BOARD?</span>
        </div>
      </div>
    ),
    size,
  );
}

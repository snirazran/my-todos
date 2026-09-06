import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const alt =
  'Frogress — finish a task, feed a frog. A to-do list, weekly planner and focus timer with a pet frog.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const HEADLINE = 'Finish a task. Feed a frog.';
const SUBLINE =
  'A to-do list, weekly planner and focus timer — with a pet frog that eats everything you finish.';
const WORDMARK = 'FROGRESS';
const PILLS = ['Web', 'iOS & Android', 'Free to start'];

const GLYPHS = `${WORDMARK}${HEADLINE}${SUBLINE}${PILLS.join('')}`;

async function googleFont(family: string, weight: number, text: string) {
  try {
    const api = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
      family,
    )}:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await fetch(api).then((res) => (res.ok ? res.text() : ''));
    const url = css.match(
      /src:\s*url\((https:[^)]+)\)\s*format\('(?:opentype|truetype)'\)/,
    )?.[1];
    if (!url) return null;
    const font = await fetch(url);
    if (!font.ok) return null;
    return await font.arrayBuffer();
  } catch {
    return null;
  }
}

function frogDataUri() {
  try {
    const file = readFileSync(join(process.cwd(), 'public', 'frog.png'));
    return `data:image/png;base64,${file.toString('base64')}`;
  } catch {
    return null;
  }
}

export default async function Image() {
  const [black, semibold] = await Promise.all([
    googleFont('Poppins', 800, GLYPHS),
    googleFont('Poppins', 500, GLYPHS),
  ]);

  const fonts = [
    black && { name: 'Poppins', data: black, weight: 800 as const, style: 'normal' as const },
    semibold && { name: 'Poppins', data: semibold, weight: 500 as const, style: 'normal' as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 800 | 500; style: 'normal' }[];

  const frog = frogDataUri();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background:
            'linear-gradient(180deg, #d9f0c2 0%, #ecf8e2 42%, #f9fdf6 68%, #ffffff 84%)',
          fontFamily: fonts.length ? 'Poppins' : 'sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -180,
            right: -120,
            width: 620,
            height: 620,
            borderRadius: 620,
            background: 'rgba(126, 191, 94, 0.22)',
            display: 'flex',
          }}
        />

        {frog ? (
          <img
            src={frog}
            width={470}
            height={303}
            alt=""
            style={{ position: 'absolute', right: 56, bottom: 4 }}
          />
        ) : null}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '68px 72px',
            width: 720,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: 6,
              color: '#1f5526',
            }}
          >
            {WORDMARK}
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: 34,
              fontSize: 82,
              fontWeight: 800,
              lineHeight: 1.03,
              letterSpacing: -3.5,
              color: '#0f2f1e',
            }}
          >
            {HEADLINE}
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: 26,
              fontSize: 29,
              fontWeight: 500,
              lineHeight: 1.42,
              color: '#2b5140',
            }}
          >
            {SUBLINE}
          </div>

          <div style={{ display: 'flex', marginTop: 40, gap: 14 }}>
            {PILLS.map((pill) => (
              <div
                key={pill}
                style={{
                  display: 'flex',
                  padding: '12px 22px',
                  borderRadius: 999,
                  border: '2px solid rgba(31, 85, 38, 0.28)',
                  background: 'rgba(255, 255, 255, 0.7)',
                  fontSize: 22,
                  fontWeight: 800,
                  color: '#1c4432',
                }}
              >
                {pill}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}

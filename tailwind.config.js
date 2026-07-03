/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  // Only apply `hover:` styles on devices that actually support hover (desktop),
  // so touch/mobile doesn't get stuck in a hover state after tapping.
  future: {
    hoverOnlyWhenSupported: true,
  },
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Heebo follows Poppins so Hebrew text (which Poppins lacks) renders in
        // Heebo while Latin stays Poppins.
        sans: [
          'var(--font-sans)',
          'var(--font-hebrew)',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
        display: ['var(--font-display)', 'cursive'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      /* 🔹 animation support ↓↓↓ */
      /* ─── animations used by the logo ─── */
      keyframes: {
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        'logo-line': {
          '0%': { transform: 'translateX(-100%)' },
          '60%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        shine: {
          '0%': { transform: 'translateX(-140%) skewX(-18deg)' },
          '100%': { transform: 'translateX(260%) skewX(-18deg)' },
        },
        'quest-pulse': {
          '0%,100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.06)' },
        },
      },
      animation: {
        float: 'float 3s ease-in-out infinite',
        'logo-line': 'logo-line 3s ease-in-out infinite',
        shimmer: 'shimmer 2s linear infinite',
        shine: 'shine 1.35s ease-in-out infinite',
        'quest-pulse': 'quest-pulse 1.8s ease-in-out infinite',
      },
      colors: {
        // every key here becomes a colour-utility name
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',

        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },

        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },

        /*  ← these two keys are the ones that make
              `border-border` and `ring-ring` utilities exist */
        border: 'hsl(var(--border))',
        ring: 'hsl(var(--ring))',

        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

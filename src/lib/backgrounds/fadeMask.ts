export const BACKGROUND_FADE_MASK = `linear-gradient(to bottom,
  rgb(0 0 0 / 1) 0%,
  rgb(0 0 0 / 1) 70%,
  rgb(0 0 0 / 0.985) 73.5%,
  rgb(0 0 0 / 0.945) 77%,
  rgb(0 0 0 / 0.875) 80%,
  rgb(0 0 0 / 0.775) 83%,
  rgb(0 0 0 / 0.645) 86%,
  rgb(0 0 0 / 0.5) 88.5%,
  rgb(0 0 0 / 0.355) 91%,
  rgb(0 0 0 / 0.225) 93.5%,
  rgb(0 0 0 / 0.125) 95.5%,
  rgb(0 0 0 / 0.055) 97.5%,
  rgb(0 0 0 / 0.015) 99%,
  rgb(0 0 0 / 0) 100%)`;

export const backgroundFadeMaskStyle = {
  WebkitMaskImage: BACKGROUND_FADE_MASK,
  maskImage: BACKGROUND_FADE_MASK,
} as const;

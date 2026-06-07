import type { FC, SVGProps } from 'react';

// Inline SVG icons (via @svgr/webpack). They ship inside the JS bundle, so
// there is no per-icon network request and no flash-in on first paint.
// Original multicolor artwork is preserved.
import Clock from '../../../public/icons/clock.svg';
import Community from '../../../public/icons/Community.svg';
import Compass from '../../../public/icons/Compass.svg';
import DarkMode from '../../../public/icons/DarkMode.svg';
import DateIcon from '../../../public/icons/Date.svg';
import Filter from '../../../public/icons/Filter.svg';
import FrogPlus from '../../../public/frogPlus.svg';
import GoogleCalendar from '../../../public/icons/GoogleCalendar.svg';
import Home from '../../../public/icons/Home.svg';
import InviteFriends from '../../../public/icons/InviteFriends.svg';
import Planner from '../../../public/icons/Planner.svg';
import Quests from '../../../public/icons/Quests.svg';
import Repeat from '../../../public/icons/Repeat.svg';
import Saved from '../../../public/icons/saved.svg';
import Shuffle from '../../../public/icons/Shuffle.svg';
import Wardrobe from '../../../public/icons/Wardrobe.svg';

const ICONS = {
  clock: Clock,
  community: Community,
  compass: Compass,
  darkMode: DarkMode,
  date: DateIcon,
  filter: Filter,
  frogPlus: FrogPlus,
  googleCalendar: GoogleCalendar,
  home: Home,
  inviteFriends: InviteFriends,
  planner: Planner,
  quests: Quests,
  repeat: Repeat,
  saved: Saved,
  shuffle: Shuffle,
  wardrobe: Wardrobe,
} satisfies Record<string, FC<SVGProps<SVGSVGElement>>>;

export type IconName = keyof typeof ICONS;

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
  /** Convenience: sets width & height together. */
  size?: number | string;
  /** Accessible name. Omit for decorative icons (they get aria-hidden). */
  label?: string;
};

export function Icon({ name, size, width, height, label, ...props }: IconProps) {
  const Svg = ICONS[name];
  const a11y = label
    ? { role: 'img' as const, 'aria-label': label }
    : { 'aria-hidden': true as const };
  return (
    <Svg width={width ?? size} height={height ?? size} {...a11y} {...props} />
  );
}

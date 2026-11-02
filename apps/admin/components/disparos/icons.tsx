/** Ícones inline (traço 1.75, 24x24) — sem dependência externa. */
import type { SVGProps } from 'react';

const P: Record<string, string> = {
  play: 'M7 5v14l11-7z',
  pause: 'M8 5v14M16 5v14',
  stop: 'M6 6h12v12H6z',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  checks: 'M2 12.5l4.5 4.5L16 7M10.5 16l1 1L21 7',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  send: 'M4 12l16-8-6 16-2.5-6.5z',
  text: 'M4 6h16M4 12h16M4 18h10',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  buttons: 'M4 5h16v5H4zM4 14h7v5H4zM13 14h7v5h-7z',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
  template: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13l2 2 4-4',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  alert: 'M12 3l10 18H2zM12 10v5M12 18v.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.5',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  megaphone: 'M3 10v4h4l7 5V5L7 10zM17 9a4 4 0 0 1 0 6',
  flow: 'M6 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM18 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6 8v3a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 7',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  zoomIn: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M11 8v6M8 11h6',
  zoomOut: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M8 11h6',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  rocket: 'M5 15c-1.5 1-2 4-2 6 2 0 5-.5 6-2M9 15l-3-3c2-6 7-9 14-9 0 7-3 12-9 14zM15 9.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  gauge: 'M12 21a9 9 0 1 1 9-9M12 12l5-4',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  message: 'M4 5h16v11H8l-4 4z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  grip: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 16, className, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const filled = name === 'play';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden {...rest}>
      <path d={P[name]} />
    </svg>
  );
}

// Ícones do construtor de fluxos (traço fino no estilo SF Symbols; o do WhatsApp é preenchido).
import type { ReactNode } from "react";

const P: Record<string, ReactNode> = {
  play: <path d="M8 5.5v13l10.5-6.5L8 5.5z" />,
  whatsapp: (
    <path
      fill="currentColor" stroke="none"
      d="M12.04 2.5a9.43 9.43 0 0 0-8.1 14.26L2.5 21.5l4.86-1.4A9.43 9.43 0 1 0 12.04 2.5zm0 17.2a7.77 7.77 0 0 1-3.96-1.08l-.28-.17-2.88.83.85-2.8-.19-.29a7.78 7.78 0 1 1 6.46 3.51zm4.27-5.82c-.23-.12-1.38-.68-1.6-.76-.21-.08-.37-.12-.53.12-.15.23-.6.76-.74.92-.14.15-.27.17-.5.06a6.38 6.38 0 0 1-3.17-2.77c-.24-.41.24-.38.68-1.27.08-.15.04-.29-.02-.4-.06-.12-.53-1.27-.72-1.74-.19-.46-.38-.39-.53-.4h-.45a.87.87 0 0 0-.63.29 2.64 2.64 0 0 0-.82 1.96 4.58 4.58 0 0 0 .96 2.43 10.5 10.5 0 0 0 4.02 3.55c1.5.65 2.08.7 2.83.59.46-.07 1.38-.56 1.58-1.11.2-.54.2-1.01.14-1.11-.06-.1-.21-.16-.44-.27z"
    />
  ),
  bubble: <path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 16h-6.2l-4.3 3.5V16H7a2.5 2.5 0 0 1-2.5-2.5v-7z" />,
  reply: <><path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 16h-6.2l-4.3 3.5V16H7a2.5 2.5 0 0 1-2.5-2.5v-7z" /><path d="M8.5 10h.01M12 10h.01M15.5 10h.01" strokeWidth="2.6" /></>,
  filter: <path d="M4 5h16l-6.2 7.4V18l-3.6 1.6v-7.2L4 5z" />,
  bolt: <path d="M13 2.5 4.5 14h6.5l-1 7.5L18.5 10H12l1-7.5z" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  headset: <><path d="M4.5 13.5v-1.5a7.5 7.5 0 0 1 15 0v1.5" /><rect x="3.5" y="13" width="4" height="6" rx="1.6" /><rect x="16.5" y="13" width="4" height="6" rx="1.6" /><path d="M18.5 19c0 1.3-1.6 2-3.5 2h-2" /></>,
  shuffle: <><path d="M3.5 7h3.2c2 0 3.2 1 4.3 2.6l2 3c1.1 1.6 2.3 2.4 4.3 2.4h3.2" /><path d="M3.5 17h3.2c1.4 0 2.4-.5 3.2-1.3M13.8 8.3c.8-.8 1.8-1.3 3.2-1.3h3.5" /><path d="M18 4.5 20.5 7 18 9.5M18 14.5l2.5 2.5-2.5 2.5" /></>,
  stop: <><circle cx="12" cy="12" r="8.5" /><rect x="9" y="9" width="6" height="6" rx="1.2" /></>,
  people: <><circle cx="9" cy="8.5" r="3.3" /><path d="M3.5 19c0-3.2 2.5-5.5 5.5-5.5s5.5 2.3 5.5 5.5" /><path d="M15.5 5.5a3.2 3.2 0 0 1 0 6.2M17.5 13.8c1.9.7 3 2.5 3 5.2" /></>,
  phone: <path d="M6 4h3l1.6 4-2 1.3a10.5 10.5 0 0 0 5.1 5.1L15 12.4l4 1.6v3a2 2 0 0 1-2 2A15 15 0 0 1 4 6a2 2 0 0 1 2-2z" />,
  tag: <><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.4 1.4 0 0 1 0 2l-6.6 6.6a1.4 1.4 0 0 1-2 0L3.5 12.2z" /><circle cx="8" cy="8" r="1.4" /></>,
  list: <><path d="M9 6.5h11M9 12h11M9 17.5h11" /><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" strokeWidth="2.6" /></>,
  field: <><rect x="3.5" y="6" width="17" height="12" rx="2.5" /><path d="M7 12h6M16.5 9.5v5" /></>,
  text: <><path d="M5 6.5h14M5 11h14M5 15.5h9" /></>,
  buttons: <><rect x="4" y="4.5" width="16" height="7" rx="2" /><rect x="4" y="14" width="7.2" height="5.5" rx="1.8" /><rect x="12.8" y="14" width="7.2" height="5.5" rx="1.8" /></>,
  image: <><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.7" /><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4" /></>,
  video: <><rect x="3" y="6" width="13" height="12" rx="2.5" /><path d="m16 10.5 5-3v9l-5-3" /></>,
  doc: <><path d="M7 3.5h7l4.5 4.5v12.5H7z" /><path d="M14 3.5V8h4.5M9.5 13h6M9.5 16.5h6" /></>,
  audio: <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  copyCode: <><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  user: <><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" /></>,
  folder: <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2.2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7.5z" />,
  flow: <><rect x="3" y="4" width="6" height="5" rx="1.5" /><rect x="15" y="4" width="6" height="5" rx="1.5" /><rect x="9" y="15" width="6" height="5" rx="1.5" /><path d="M6 9v3h12V9M12 12v3" /></>,
  // barra de ações
  power: <><path d="M12 3.5v7.5" /><path d="M7.2 6.3a7.5 7.5 0 1 0 9.6 0" /></>,
  powerOff: <><path d="M12 3.5v6" /><path d="M7.2 6.3a7.5 7.5 0 0 0 9.9 11.2M18.6 15.6A7.5 7.5 0 0 0 16.8 6.3" /><path d="M4 4l16 16" /></>,
  save: <><path d="M5 4.5h11.5L19.5 7.5v12H5z" /><path d="M8 4.5v4.5h7.5V4.5M8 19.5v-5.5h8.5v5.5" /></>,
  pencil: <><path d="M15.5 4.5 19.5 8.5 9 19H5v-4L15.5 4.5z" /><path d="M13.5 6.5l4 4" /></>,
  duplicate: <><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5" /><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" /></>,
  download: <><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M4.5 16v2.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V16" /></>,
  upload: <><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4.5 16v2.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V16" /></>,
  page: <><path d="M6 3.5h8l4.5 4.5v12.5H6z" /><path d="M14 3.5V8h4.5" /></>,
  chart: <><path d="M4.5 19.5h15" /><path d="M7.5 16v-5M12 16V7M16.5 16v-3" /></>,
  trash: <><path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l.9 13h9.2l.9-13" /><path d="M10 10.5v6M14 10.5v6" /></>,
  chevronRight: <path d="M9.5 5.5 16 12l-6.5 6.5" />,
  chevronLeft: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  chevronDown: <path d="M5.5 9.5 12 16l6.5-6.5" />,
  chevronUpDown: <><path d="M8 9.5 12 5.5l4 4M8 14.5l4 4 4-4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  fit: <><path d="M4.5 9V5.5a1 1 0 0 1 1-1H9M15 4.5h3.5a1 1 0 0 1 1 1V9M19.5 15v3.5a1 1 0 0 1-1 1H15M9 19.5H5.5a1 1 0 0 1-1-1V15" /></>,
  undo: <><path d="M9 7.5 4.5 12 9 16.5" /><path d="M4.5 12h11a4 4 0 0 1 0 8H13" /></>,
  redo: <><path d="M15 7.5 19.5 12 15 16.5" /><path d="M19.5 12h-11a4 4 0 0 0 0 8H11" /></>,
  arrowLeft: <path d="M19 12H5.5M11 6l-6 6 6 6" />,
  arrowRight: <path d="M5 12h13.5M13 6l6 6-6 6" />,
  send: <path d="M4 12 20 4.5 13.5 20l-2.5-6.5L4 12z" />,
  more: <><circle cx="6" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18" cy="12" r="1.2" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.3-4.3" /></>,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  alert: <><path d="M12 4 2.8 19.5h18.4L12 4z" /><path d="M12 10v4.5M12 17.2h.01" /></>,
  sidebar: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M9.5 4.5v15" /></>,
  braces: <><path d="M8.5 4.5c-2 0-2.5 1-2.5 2.5v2.5c0 1.2-.7 2-2 2.5 1.3.5 2 1.3 2 2.5V17c0 1.5.5 2.5 2.5 2.5M15.5 4.5c2 0 2.5 1 2.5 2.5v2.5c0 1.2.7 2 2 2.5-1.3.5-2 1.3-2 2.5V17c0 1.5-.5 2.5-2.5 2.5" /></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.2" /><path d="M15.5 8.5V6.2a1.7 1.7 0 0 0-1.7-1.7H6.2a1.7 1.7 0 0 0-1.7 1.7v7.6a1.7 1.7 0 0 0 1.7 1.7h2.3" /></>,
  paste: <><rect x="6" y="5" width="12" height="15.5" rx="2.2" /><path d="M9.5 5V3.5h5V5M9 11h6M9 14.5h4" /></>,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2-2.4 3.5M12 16.8h.01" /></>,
  archive: <><rect x="3.5" y="4.5" width="17" height="4.5" rx="1.2" /><path d="M5 9v9.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" /></>,
  plusList: <><path d="M4.5 7h10M4.5 12h10M4.5 17h6" /><path d="M18 14v6M15 17h6" /></>,
  grip: <><circle cx="9" cy="6" r="1.1" /><circle cx="15" cy="6" r="1.1" /><circle cx="9" cy="12" r="1.1" /><circle cx="15" cy="12" r="1.1" /><circle cx="9" cy="18" r="1.1" /><circle cx="15" cy="18" r="1.1" /></>,
};

export function FIcon({ name, size = 18, stroke = 1.8, className, style }: { name: string; size?: number; stroke?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[name] || P.flow}
    </svg>
  );
}

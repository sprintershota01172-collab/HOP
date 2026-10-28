import React from 'react';

/** 線のアイコン（24×24、currentColor） */
const P: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.8V20h13V9.8M10 20v-5.5h4V20',
  fp: 'M12 3a9 9 0 1 0 9 9h-9V3ZM15 3.5A8 8 0 0 1 20.5 9H15V3.5',
  compare: 'M4 20V9l4-3 4 3v11M12 20v-7l4-3 4 3v7M3 20h18M7 13h2M15 15h2',
  loan: 'M4 7h16v12H4zM4 11h16M8 15h3M7 4h10',
  memo: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h5',
  gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM19.4 13.5l1.6 1.2-1.8 3.1-1.9-.6a7 7 0 0 1-2 1.2L15 20.4h-3.6l-.4-2a7 7 0 0 1-2-1.2l-1.9.6-1.8-3.1 1.6-1.2a7 7 0 0 1 0-2.3L5.3 10l1.8-3.1 1.9.6a7 7 0 0 1 2-1.2l.4-2h3.6l.4 2a7 7 0 0 1 2 1.2l1.9-.6 1.8 3.1-1.6 1.2a7 7 0 0 1 0 2.3Z',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5 10 17l9-10',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v6M12 7.5v.5',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 0 13-3v3M16 14h2',
  child: 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8 22l1-7-3-3 3-3h6l3 3-3 3 1 7M10 15h4',
  basket: 'M4 9h16l-2 11H6L4 9ZM8 9l3-5M16 9l-3-5',
  shield: 'M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z',
  chart: 'M4 20V4M4 20h16M8 16l4-5 3 3 5-7',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  house: 'M3 11.5 12 4l9 7.5M5.5 9.8V20h13V9.8',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8L3.5 9.7l5.9-.9L12 3.5Z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  food: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 3-3 6s1 4 3 4v8',
  bolt: 'M13 3 5 14h6l-1 7 8-11h-6l1-7Z',
  phone: 'M8 3h8v18H8zM11 18h2',
  car: 'M5 16h14M6 16l1.5-5h9L18 16M6 16v3M18 16v3M8 13.5h0M16 13.5h0',
  fuel: 'M5 21V5h8v16M5 11h8M13 8l4 3v7a1.5 1.5 0 0 0 3 0V9l-3-3',
  medical: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
  shirt: 'M8 4 4 7l2 4 2-1v10h8V10l2 1 2-4-4-3-2 2h-4L8 4Z',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.5 14a4 4 0 0 0 7 0M9 9.5h0M15 9.5h0',
  plane: 'M10.5 13 3 11l1-2 8 .5L16.5 4a1.5 1.5 0 0 1 2 2L14 11.5l.5 8-2 1-2-7.5Z',
  dots: 'M6 12h0M12 12h0M18 12h0',
  baby: 'M12 21a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM9 13h0M15 13h0M10 16.5a3 3 0 0 0 4 0M12 7c0-2 1-4 3-4',
  ring: 'M12 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM9 4h6l-3 5-3-5Z',
  tool: 'M14 6a4 4 0 0 0 5 5l-9 9-3-3 9-9a4 4 0 0 1-2-2ZM4 20l3-3',
  briefcase: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  coins: 'M12 7c4 0 7-1 7-2.5S16 2 12 2 5 3 5 4.5 8 7 12 7ZM5 4.5v5c0 1.4 3 2.5 7 2.5s7-1.1 7-2.5v-5M5 9.5v5c0 1.4 3 2.5 7 2.5s7-1.1 7-2.5v-5M5 14.5v5c0 1.4 3 2.5 7 2.5s7-1.1 7-2.5v-5',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5',
  pin: 'M9 4h6l-1 6 3 3H7l3-3-1-6ZM12 13v8',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z',
  key: 'M14 10a4 4 0 1 0-1.2 2.8L20 20M17 17l2-2M15 15l2-2',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  sort: 'M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4',
};

export function Icon({ name, size }: { name: string; size?: number }) {
  const d = P[name] ?? P.dots;
  const dotty = name === 'dots' || name === 'car' || name === 'smile' || name === 'baby' || name === 'info';
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={dotty ? 2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function RoofMark() {
  return (
    <svg className="roof" viewBox="0 0 92 70" fill="none" aria-hidden="true">
      <path d="M4 44 46 10l42 34" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 40v28M74 40v28" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <path d="M62 18v-8h8v14" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const LIVING_ICONS = ['food', 'basket', 'bolt', 'phone', 'car', 'fuel', 'medical', 'shirt', 'smile', 'plane', 'wallet', 'dots'];
export const EVENT_ICONS = ['ring', 'plane', 'baby', 'car', 'house', 'tool', 'briefcase', 'flag', 'coins', 'dots'];


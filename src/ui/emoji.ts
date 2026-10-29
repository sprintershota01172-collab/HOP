/**
 * 項目のしるし（アイコンと色）。絵文字の代わりに、アプリの配色に合わせた色つきのアイコンで項目を見分ける。
 * tone は CSS の色（円グラフと同じ色を使う）
 */
export type Mark = { icon: string; tone: string };

export const SLICE_MARK: Record<string, Mark> = {
  living: { icon: 'food', tone: 'var(--c-living)' },
  housing: { icon: 'house', tone: 'var(--green)' },
  education: { icon: 'school', tone: 'var(--c-edu)' },
  insurance: { icon: 'shield', tone: 'var(--c-ins)' },
  saving: { icon: 'piggy', tone: 'var(--c-save)' },
  other: { icon: 'car', tone: 'var(--c-other)' },
  rest: { icon: 'coins', tone: 'var(--orange)' },
};

export const LIVING_MARK: Record<string, Mark> = {
  food: { icon: 'food', tone: 'var(--c-living)' },
  electric: { icon: 'bolt', tone: 'var(--warn)' },
  water: { icon: 'drop', tone: 'var(--c-save)' },
  gas: { icon: 'flame', tone: 'var(--orange)' },
  phone: { icon: 'phone', tone: 'var(--green-2)' },
  other: { icon: 'basket', tone: 'var(--c-ins)' },
};

export const TILE_MARK: Record<string, Mark> = {
  income: { icon: 'wallet', tone: 'var(--green-2)' },
  savings: { icon: 'piggy', tone: 'var(--c-save)' },
  children: { icon: 'child', tone: 'var(--c-edu)' },
  living: { icon: 'food', tone: 'var(--c-living)' },
  insurance: { icon: 'shield', tone: 'var(--c-ins)' },
  invest: { icon: 'chart', tone: 'var(--c-save)' },
  goals: { icon: 'flag', tone: 'var(--orange)' },
  events: { icon: 'plane', tone: 'var(--c-edu)' },
  work: { icon: 'baby', tone: 'var(--c-living)' },
  housing: { icon: 'house', tone: 'var(--green)' },
  assumptions: { icon: 'sliders', tone: 'var(--c-ins)' },
  basis: { icon: 'info', tone: 'var(--green-2)' },
};

/** その他のしるし（数字の見出しなど） */
export const MARK = {
  cash: { icon: 'wallet', tone: 'var(--green-2)' },
  saved: { icon: 'piggy', tone: 'var(--c-save)' },
  fund: { icon: 'plane', tone: 'var(--warn)' },
  invest: { icon: 'chart', tone: 'var(--c-save)' },
  loan: { icon: 'loan', tone: 'var(--orange)' },
  home: { icon: 'house', tone: 'var(--green)' },
  worth: { icon: 'sparkle', tone: 'var(--green-2)' },
  gain: { icon: 'sun', tone: 'var(--warn)' },
  income: { icon: 'coins', tone: 'var(--green-2)' },
  spend: { icon: 'basket', tone: 'var(--c-ins)' },
  smile: { icon: 'smile', tone: 'var(--green-2)' },
  pocket: { icon: 'wallet', tone: 'var(--c-edu)' },
  free: { icon: 'smile', tone: 'var(--c-living)' },
  car: { icon: 'car', tone: 'var(--c-other)' },
  gift: { icon: 'gift', tone: 'var(--orange)' },
  total: { icon: 'coins', tone: 'var(--orange)' },
} satisfies Record<string, Mark>;

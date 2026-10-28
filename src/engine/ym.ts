import type { YM } from './types';

/** 西暦年・月(1-12) → YM */
export const toYM = (year: number, month: number): YM => year * 12 + (month - 1);
export const ymYear = (v: YM): number => Math.floor(v / 12);
export const ymMonth = (v: YM): number => (((v % 12) + 12) % 12) + 1;
export const nowYM = (d: Date = new Date()): YM => toYM(d.getFullYear(), d.getMonth() + 1);

/** 満年齢（誕生月に1歳加算） */
export const ageAt = (birthYM: YM, m: YM): number => Math.floor((m - birthYM) / 12);

/** 年度（4月始まり） */
export const fiscalYear = (m: YM): number => (ymMonth(m) >= 4 ? ymYear(m) : ymYear(m) - 1);

/**
 * 小学1年生になる年度。
 * 4月2日〜12月生まれは「生年 + 7」、1月〜4月1日生まれは「生年 + 6」。
 * 月単位のため 4月生まれは +7 とする（4月1日生まれの早生まれ判定は扱わない）。
 */
export const elemStartFY = (birthYM: YM): number => ymYear(birthYM) + (ymMonth(birthYM) >= 4 ? 7 : 6);

/** 学年（小1=1, 中1=7, 高1=10, 大1=13, 年長=0, 年少=-2） */
export const gradeAt = (birthYM: YM, m: YM): number => fiscalYear(m) - elemStartFY(birthYM) + 1;

/** 「n歳到達後の最初の3月」= その月まで対象 */
export const firstMarchAfterAge = (birthYM: YM, age: number): YM => {
  const reach = birthYM + age * 12;
  const y = ymYear(reach);
  return ymMonth(reach) <= 3 ? toYM(y, 3) : toYM(y + 1, 3);
};

export const formatYM = (v: YM): string => `${ymYear(v)}年${ymMonth(v)}月`;

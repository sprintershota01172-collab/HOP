import type { SimResult } from './simulate';
import type { Goal, Yen, YM } from './types';

export interface GoalStatus {
  id: string;
  name: string;
  target: Yen;
  ym: YM;
  monthsLeft: number;
  /** 目標日までに毎月いくら貯めれば届くか（いまの貯蓄を充てない場合） */
  requiredMonthly: Yen;
  /** その時点の見込み（現金＋投資） */
  projected: Yen;
  achieved: boolean;
  shortfall: Yen;
}

/**
 * 貯蓄目標の判定。目標は「お金を別枠に移す」のではなく、
 * シミュレーション上の残高で達成できるかを確認する（二重計上を避けるため）。
 */
export function goalStatus(goals: Goal[], sim: SimResult): GoalStatus[] {
  return goals.map((g) => {
    const monthsLeft = Math.max(1, g.ym - sim.start);
    const i = Math.min(sim.rows.length - 1, Math.max(0, g.ym - sim.start));
    const row = sim.rows[i];
    const projected = row ? row.cash + row.invest : 0;
    const achieved = projected >= g.target;
    return {
      id: g.id,
      name: g.name,
      target: g.target,
      ym: g.ym,
      monthsLeft,
      requiredMonthly: Math.ceil(g.target / monthsLeft),
      projected,
      achieved,
      shortfall: achieved ? 0 : g.target - projected,
    };
  });
}

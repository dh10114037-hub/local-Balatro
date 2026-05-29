import type { PokerHand } from '../types';

export const POKER_HAND_ORDER: PokerHand[] = [
  'flush_five',
  'flush_house',
  'five_of_a_kind',
  'royal_flush',
  'straight_flush',
  'four_of_a_kind',
  'full_house',
  'flush',
  'straight',
  'three_of_a_kind',
  'two_pair',
  'pair',
  'high_card'
];

export const HAND_SCORES: Record<PokerHand, { name: string; chips: number; mult: number }> = {
  flush_five: { name: '同花五条', chips: 160, mult: 16 },
  flush_house: { name: '同花葫芦', chips: 140, mult: 14 },
  five_of_a_kind: { name: '五条', chips: 120, mult: 12 },
  royal_flush: { name: '皇家同花顺', chips: 100, mult: 8 },
  straight_flush: { name: '同花顺', chips: 100, mult: 8 },
  four_of_a_kind: { name: '四条', chips: 60, mult: 7 },
  full_house: { name: '葫芦', chips: 40, mult: 4 },
  flush: { name: '同花', chips: 35, mult: 4 },
  straight: { name: '顺子', chips: 30, mult: 4 },
  three_of_a_kind: { name: '三条', chips: 30, mult: 3 },
  two_pair: { name: '两对', chips: 20, mult: 2 },
  pair: { name: '对子', chips: 10, mult: 2 },
  high_card: { name: '高牌', chips: 5, mult: 1 }
};

export const HAND_LEVEL_BONUS: Record<PokerHand, { chips: number; mult: number }> = {
  flush_five: { chips: 50, mult: 3 },
  flush_house: { chips: 40, mult: 3 },
  five_of_a_kind: { chips: 35, mult: 3 },
  royal_flush: { chips: 25, mult: 2 },
  straight_flush: { chips: 25, mult: 2 },
  four_of_a_kind: { chips: 20, mult: 2 },
  full_house: { chips: 15, mult: 1 },
  flush: { chips: 15, mult: 1 },
  straight: { chips: 15, mult: 1 },
  three_of_a_kind: { chips: 12, mult: 1 },
  two_pair: { chips: 10, mult: 1 },
  pair: { chips: 8, mult: 1 },
  high_card: { chips: 6, mult: 1 }
};

export function getHandScore(hand: PokerHand, level: number): { name: string; chips: number; mult: number } {
  const base = HAND_SCORES[hand];
  const bonus = HAND_LEVEL_BONUS[hand];
  const extraLevels = Math.max(0, level - 1);

  return {
    name: base.name,
    chips: base.chips + bonus.chips * extraLevels,
    mult: base.mult + bonus.mult * extraLevels
  };
}

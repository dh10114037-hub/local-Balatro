import { HAND_SCORES } from './handScores';
import type { CardEnhancement, ConsumableDefinition, ConsumableInstance, PokerHand, Rank, Suit } from '../types';

const PLANET_HANDS: PokerHand[] = [
  'high_card',
  'pair',
  'two_pair',
  'three_of_a_kind',
  'straight',
  'flush',
  'full_house',
  'four_of_a_kind',
  'five_of_a_kind',
  'straight_flush',
  'royal_flush',
  'flush_house',
  'flush_five'
];

const SUIT_NAMES: Record<Suit, string> = {
  spades: '黑桃',
  hearts: '红心',
  diamonds: '方块',
  clubs: '梅花'
};

const RANKS: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

const RANK_NAMES: Record<Rank, string> = {
  A: 'A',
  K: 'K',
  Q: 'Q',
  J: 'J',
  '10': '10',
  '9': '9',
  '8': '8',
  '7': '7',
  '6': '6',
  '5': '5',
  '4': '4',
  '3': '3',
  '2': '2'
};

export const ENHANCEMENT_NAMES: Record<CardEnhancement, string> = {
  bonus: '奖励牌',
  mult: '倍率牌',
  wild: '万能牌',
  glass: '玻璃牌',
  steel: '钢铁牌',
  gold: '黄金牌',
  stone: '石头牌'
};

export const PLANET_CARDS: ConsumableDefinition[] = PLANET_HANDS.map((hand) => ({
  id: `planet_${hand}`,
  name: `${HAND_SCORES[hand].name}星球`,
  kind: 'planet',
  price: 3,
  description: `提升${HAND_SCORES[hand].name}等级：该牌型之后获得更高基础筹码和倍率。`,
  target: { mode: 'none', min: 0, max: 0 },
  effect: { type: 'level_hand', hand }
}));

export const TAROT_CARDS: ConsumableDefinition[] = [
  ...(['spades', 'hearts', 'diamonds', 'clubs'] as Suit[]).map((suit) => ({
    id: `tarot_suit_${suit}`,
    name: `${SUIT_NAMES[suit]}印记`,
    kind: 'tarot' as const,
    price: 3,
    description: `选择 1-2 张手牌，把它们变成${SUIT_NAMES[suit]}。`,
    target: { mode: 'cards' as const, min: 1, max: 2 },
    effect: { type: 'change_suit' as const, suit }
  })),
  ...RANKS.map((rank) => ({
    id: `tarot_rank_${rank}`,
    name: `${RANK_NAMES[rank]}刻印`,
    kind: 'tarot' as const,
    price: 3,
    description: `选择 1-2 张手牌，把它们变成 ${RANK_NAMES[rank]}。`,
    target: { mode: 'cards' as const, min: 1, max: 2 },
    effect: { type: 'change_rank' as const, rank }
  })),
  {
    id: 'tarot_copy',
    name: '镜像',
    kind: 'tarot',
    price: 4,
    description: '选择 1 张手牌，复制一张到牌组中。',
    target: { mode: 'cards', min: 1, max: 1 },
    effect: { type: 'copy_card' }
  },
  {
    id: 'tarot_destroy',
    name: '裁切',
    kind: 'tarot',
    price: 3,
    description: '选择 1 张手牌，从牌组中删除它。',
    target: { mode: 'cards', min: 1, max: 1 },
    effect: { type: 'destroy_card' }
  },
  {
    id: 'tarot_money',
    name: '赏金',
    kind: 'tarot',
    price: 2,
    description: '立即获得 $6。',
    target: { mode: 'none', min: 0, max: 0 },
    effect: { type: 'gain_money', amount: 6 }
  },
  ...(['bonus', 'mult', 'wild', 'glass', 'steel', 'gold', 'stone'] as CardEnhancement[]).map((enhancement) => ({
    id: `tarot_enhance_${enhancement}`,
    name: ENHANCEMENT_NAMES[enhancement],
    kind: 'tarot' as const,
    price: 4,
    description: `选择 1 张手牌，把它改造成${ENHANCEMENT_NAMES[enhancement]}。`,
    target: { mode: 'cards' as const, min: 1, max: 1 },
    effect: { type: 'enhance_card' as const, enhancement }
  }))
];

export const CONSUMABLES: ConsumableDefinition[] = [...PLANET_CARDS, ...TAROT_CARDS];

export function getConsumableDefinition(definitionId: string): ConsumableDefinition {
  const definition = CONSUMABLES.find((consumable) => consumable.id === definitionId);

  if (!definition) {
    throw new Error(`找不到消耗牌定义：${definitionId}`);
  }

  return definition;
}

export function getConsumableLabel(definitionId: string): string {
  return getConsumableDefinition(definitionId).kind === 'planet' ? '星球牌' : '塔罗牌';
}

export function createConsumableInstance(definitionId: string, instanceNumber: number): ConsumableInstance {
  return {
    instanceId: `consumable-${instanceNumber}`,
    definitionId
  };
}

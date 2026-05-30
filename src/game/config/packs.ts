import type { PackDefinition, SpectralDefinition } from '../types';

export const DEFAULT_PACK_ID = 'standard_pack';

export const PACKS: PackDefinition[] = [
  {
    id: 'standard_pack',
    kind: 'standard',
    name: '标准包',
    description: '从 3 张普通或增强扑克牌中选择 1 张加入牌组。',
    price: 4,
    choiceCount: 3,
    allowSkip: true
  },
  {
    id: 'planet_pack',
    kind: 'planet',
    name: '星球包',
    description: '从 3 张星球牌中选择 1 张放入消耗牌槽，可跳过。',
    price: 4,
    choiceCount: 3,
    allowSkip: true
  },
  {
    id: 'tarot_pack',
    kind: 'tarot',
    name: '塔罗包',
    description: '从 3 张塔罗牌中选择 1 张放入消耗牌槽，可跳过。',
    price: 4,
    choiceCount: 3,
    allowSkip: true
  },
  {
    id: 'joker_pack',
    kind: 'joker',
    name: '小丑包',
    description: '从 3 张小丑中选择 1 张加入槽位，满槽时需要先卖出。',
    price: 6,
    choiceCount: 3,
    allowSkip: true
  },
  {
    id: 'spectral_pack',
    kind: 'spectral',
    name: '幻灵包',
    description: '从 3 张高风险高收益效果中选择 1 张立即生效，可跳过。',
    price: 5,
    choiceCount: 3,
    allowSkip: true
  }
];

export const SPECTRAL_CARDS: SpectralDefinition[] = [
  {
    id: 'spectral_glass_rain',
    name: '玻璃雨',
    description: '随机 3 张牌变成玻璃牌，失去 $2。',
    effects: [{ type: 'enhance_random_cards', enhancement: 'glass', count: 3, moneyDelta: -2 }]
  },
  {
    id: 'spectral_steel_forge',
    name: '钢铁熔炉',
    description: '随机 2 张牌变成钢铁牌，失去 $1。',
    effects: [{ type: 'enhance_random_cards', enhancement: 'steel', count: 2, moneyDelta: -1 }]
  },
  {
    id: 'spectral_mirror_debt',
    name: '镜债',
    description: '复制随机 2 张牌，失去 $3。',
    effects: [{ type: 'copy_random_card', count: 2, moneyDelta: -3 }]
  },
  {
    id: 'spectral_thin_cut',
    name: '薄切',
    description: '随机删除 3 张牌，获得 $6。',
    effects: [{ type: 'destroy_random_cards', count: 3, moneyDelta: 6 }]
  },
  {
    id: 'spectral_orbit_jump',
    name: '轨道跃迁',
    description: '随机 2 个牌型等级 +1，失去 $2。',
    effects: [{ type: 'upgrade_random_hands', count: 2, amount: 1, moneyDelta: -2 }]
  },
  {
    id: 'spectral_gold_dust',
    name: '金尘',
    description: '随机 3 张牌变成黄金牌，失去 $2。',
    effects: [{ type: 'enhance_random_cards', enhancement: 'gold', count: 3, moneyDelta: -2 }]
  },
  {
    id: 'spectral_stone_sleep',
    name: '石眠',
    description: '随机 4 张牌变成石头牌，失去 $1。',
    effects: [{ type: 'enhance_random_cards', enhancement: 'stone', count: 4, moneyDelta: -1 }]
  },
  {
    id: 'spectral_wild_bloom',
    name: '野花',
    description: '随机 3 张牌变成万能牌，失去 $2。',
    effects: [{ type: 'enhance_random_cards', enhancement: 'wild', count: 3, moneyDelta: -2 }]
  },
  {
    id: 'spectral_bonus_tide',
    name: '筹码潮',
    description: '随机 4 张牌变成奖励牌，失去 $1。',
    effects: [{ type: 'enhance_random_cards', enhancement: 'bonus', count: 4, moneyDelta: -1 }]
  },
  {
    id: 'spectral_mult_spark',
    name: '倍率火花',
    description: '随机 3 张牌变成倍率牌，失去 $1。',
    effects: [{ type: 'enhance_random_cards', enhancement: 'mult', count: 3, moneyDelta: -1 }]
  },
  {
    id: 'spectral_clean_cut',
    name: '清切',
    description: '随机删除 6 张牌，获得 $10。',
    effects: [{ type: 'destroy_random_cards', count: 6, moneyDelta: 10 }]
  },
  {
    id: 'spectral_thin_orbit',
    name: '薄轨',
    description: '随机删除 2 张牌，并随机 3 个牌型等级 +1。',
    effects: [
      { type: 'destroy_random_cards', count: 2 },
      { type: 'upgrade_random_hands', count: 3, amount: 1 }
    ]
  },
  {
    id: 'spectral_double_image',
    name: '重影',
    description: '复制随机 4 张牌，失去 $4。',
    effects: [{ type: 'copy_random_card', count: 4, moneyDelta: -4 }]
  },
  {
    id: 'spectral_stranger_mask',
    name: '陌生面具',
    description: '创建 1 张随机普通小丑，并把资金清零。',
    effects: [
      { type: 'create_random_jokers', count: 1, rarity: 'common' },
      { type: 'set_money', amount: 0 }
    ]
  },
  {
    id: 'spectral_rare_flare',
    name: '稀光',
    description: '创建 1 张随机稀有小丑，失去 $6。',
    effects: [{ type: 'create_random_jokers', count: 1, rarity: 'rare', moneyDelta: -6 }]
  },
  {
    id: 'spectral_understudy',
    name: '替身',
    description: '复制 1 张随机已有小丑，失去 $3。',
    effects: [{ type: 'duplicate_random_joker', count: 1, moneyDelta: -3 }]
  },
  {
    id: 'spectral_ash_bargain',
    name: '灰烬交易',
    description: '随机销毁 1 张小丑，获得 $8。',
    effects: [{ type: 'destroy_random_jokers', count: 1, moneyDelta: 8 }]
  },
  {
    id: 'spectral_sealed_cargo',
    name: '封箱货',
    description: '向牌组加入 2 张随机钢铁牌，失去 $2。',
    effects: [{ type: 'add_random_enhanced_cards', enhancement: 'steel', count: 2, moneyDelta: -2 }]
  }
];

export function getPackDefinition(definitionId: string | undefined): PackDefinition {
  const definition = PACKS.find((pack) => pack.id === (definitionId ?? DEFAULT_PACK_ID));

  if (!definition) {
    throw new Error(`找不到补充包定义：${definitionId}`);
  }

  return definition;
}

export function getSpectralDefinition(definitionId: string): SpectralDefinition {
  const definition = SPECTRAL_CARDS.find((spectral) => spectral.id === definitionId);

  if (!definition) {
    throw new Error(`找不到幻灵牌定义：${definitionId}`);
  }

  return definition;
}

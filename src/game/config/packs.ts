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

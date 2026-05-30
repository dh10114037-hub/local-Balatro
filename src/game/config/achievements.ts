import type { AchievementCategory, AchievementDefinition, AchievementRarity } from '../types';

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  progress: '进度',
  scoring: '计分',
  economy: '经济',
  collection: '图鉴',
  challenge: '挑战',
  completion: '完成'
};

export const ACHIEVEMENT_RARITY_LABELS: Record<AchievementRarity, string> = {
  common: '普通',
  uncommon: '进阶',
  rare: '稀有',
  legendary: '传奇'
};

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first_run',
    name: '第一声回响',
    description: '开始第一局正式牌局。',
    points: 5,
    rarity: 'common',
    category: 'progress'
  },
  {
    id: 'first_blind_clear',
    name: '越过小门',
    description: '首次通过一个盲注。',
    points: 10,
    rarity: 'common',
    category: 'progress'
  },
  {
    id: 'first_boss_clear',
    name: '首领退场',
    description: '首次通过首领盲注。',
    points: 20,
    rarity: 'uncommon',
    category: 'progress'
  },
  {
    id: 'reach_ante_2',
    name: '第二层灯亮',
    description: '到达第 2 层。',
    points: 10,
    rarity: 'common',
    category: 'progress',
    target: 2
  },
  {
    id: 'reach_ante_3',
    name: '节奏成形',
    description: '到达第 3 层。',
    points: 15,
    rarity: 'common',
    category: 'progress',
    target: 3
  },
  {
    id: 'reach_ante_5',
    name: '牌桌中段',
    description: '到达第 5 层。',
    points: 25,
    rarity: 'uncommon',
    category: 'progress',
    target: 5
  },
  {
    id: 'reach_ante_8',
    name: '终局门前',
    description: '到达第 8 层。',
    points: 40,
    rarity: 'rare',
    category: 'progress',
    target: 8
  },
  {
    id: 'win_standard_run',
    name: '回响通关',
    description: '赢下一局标准牌局。',
    points: 60,
    rarity: 'legendary',
    category: 'completion'
  },
  {
    id: 'endless_ante_9',
    name: '余音未止',
    description: '在无尽模式到达第 9 层。',
    points: 40,
    rarity: 'rare',
    category: 'completion',
    target: 9
  },
  {
    id: 'first_hand_played',
    name: '第一手牌',
    description: '打出第一手牌。',
    points: 5,
    rarity: 'common',
    category: 'scoring'
  },
  {
    id: 'score_100',
    name: '三位数',
    description: '单手分数达到 100。',
    points: 5,
    rarity: 'common',
    category: 'scoring',
    target: 100
  },
  {
    id: 'score_1000',
    name: '千分起跳',
    description: '单手分数达到 1,000。',
    points: 15,
    rarity: 'uncommon',
    category: 'scoring',
    target: 1000
  },
  {
    id: 'score_10000',
    name: '万点爆开',
    description: '单手分数达到 10,000。',
    points: 30,
    rarity: 'rare',
    category: 'scoring',
    target: 10000
  },
  {
    id: 'score_100000',
    name: '巨响一手',
    description: '单手分数达到 100,000。',
    points: 60,
    rarity: 'legendary',
    category: 'scoring',
    target: 100000,
    hidden: true
  },
  {
    id: 'play_pair',
    name: '对子入门',
    description: '打出对子。',
    points: 5,
    rarity: 'common',
    category: 'scoring'
  },
  {
    id: 'play_two_pair',
    name: '两路成双',
    description: '打出两对。',
    points: 10,
    rarity: 'common',
    category: 'scoring'
  },
  {
    id: 'play_flush',
    name: '同花染桌',
    description: '打出同花。',
    points: 10,
    rarity: 'common',
    category: 'scoring'
  },
  {
    id: 'play_straight',
    name: '顺势而行',
    description: '打出顺子。',
    points: 10,
    rarity: 'common',
    category: 'scoring'
  },
  {
    id: 'play_full_house',
    name: '满屋回声',
    description: '打出葫芦。',
    points: 15,
    rarity: 'uncommon',
    category: 'scoring'
  },
  {
    id: 'play_four_kind',
    name: '四重脉冲',
    description: '打出四条。',
    points: 25,
    rarity: 'rare',
    category: 'scoring'
  },
  {
    id: 'first_shop',
    name: '货架初见',
    description: '首次进入商店。',
    points: 5,
    rarity: 'common',
    category: 'economy'
  },
  {
    id: 'first_joker',
    name: '第一张小丑',
    description: '获得第一张小丑牌。',
    points: 10,
    rarity: 'common',
    category: 'economy'
  },
  {
    id: 'first_voucher',
    name: '长期合约',
    description: '获得第一张优惠券。',
    points: 15,
    rarity: 'uncommon',
    category: 'economy'
  },
  {
    id: 'first_reroll',
    name: '再刷一下',
    description: '首次刷新商店。',
    points: 5,
    rarity: 'common',
    category: 'economy'
  },
  {
    id: 'money_25',
    name: '钱包鼓起',
    description: '持有至少 $25。',
    points: 15,
    rarity: 'uncommon',
    category: 'economy',
    target: 25
  },
  {
    id: 'money_50',
    name: '金库回声',
    description: '持有至少 $50。',
    points: 30,
    rarity: 'rare',
    category: 'economy',
    target: 50
  },
  {
    id: 'five_jokers',
    name: '满槽笑声',
    description: '同时拥有 5 张小丑牌。',
    points: 20,
    rarity: 'uncommon',
    category: 'economy',
    target: 5
  },
  {
    id: 'full_consumables',
    name: '口袋塞满',
    description: '消耗牌槽达到上限。',
    points: 15,
    rarity: 'uncommon',
    category: 'economy'
  },
  {
    id: 'see_10_jokers',
    name: '小丑目录 I',
    description: '图鉴见过 10 张小丑。',
    points: 10,
    rarity: 'common',
    category: 'collection',
    target: 10
  },
  {
    id: 'see_25_jokers',
    name: '小丑目录 II',
    description: '图鉴见过 25 张小丑。',
    points: 25,
    rarity: 'uncommon',
    category: 'collection',
    target: 25
  },
  {
    id: 'see_10_consumables',
    name: '星象与塔罗',
    description: '图鉴见过 10 张星球或塔罗牌。',
    points: 20,
    rarity: 'uncommon',
    category: 'collection',
    target: 10
  },
  {
    id: 'see_5_spectrals',
    name: '幻灵低语',
    description: '图鉴见过 5 张幻灵牌。',
    points: 25,
    rarity: 'rare',
    category: 'collection',
    target: 5
  },
  {
    id: 'see_10_bosses',
    name: '首领档案',
    description: '图鉴见过 10 个首领。',
    points: 25,
    rarity: 'uncommon',
    category: 'collection',
    target: 10
  },
  {
    id: 'see_8_vouchers',
    name: '优惠券夹',
    description: '图鉴见过 8 张优惠券。',
    points: 20,
    rarity: 'uncommon',
    category: 'collection',
    target: 8
  },
  {
    id: 'clear_no_discards',
    name: '不弃而胜',
    description: '不使用弃牌并通过一个盲注。',
    points: 20,
    rarity: 'uncommon',
    category: 'challenge'
  },
  {
    id: 'clear_last_hand',
    name: '最后一搏',
    description: '用最后一次出牌通过盲注。',
    points: 25,
    rarity: 'rare',
    category: 'challenge'
  },
  {
    id: 'overkill_double',
    name: '双倍压过',
    description: '通过盲注时，最后一手至少达到目标分数的 2 倍。',
    points: 30,
    rarity: 'rare',
    category: 'challenge',
    hidden: true
  },
  {
    id: 'first_sell',
    name: '换位思考',
    description: '首次卖出或失去一张小丑。',
    points: 10,
    rarity: 'common',
    category: 'challenge'
  },
  {
    id: 'open_pack',
    name: '打开补充包',
    description: '首次打开补充包。',
    points: 10,
    rarity: 'common',
    category: 'completion'
  },
  {
    id: 'open_spectral_pack',
    name: '凝视幻灵',
    description: '首次打开含有幻灵候选的补充包。',
    points: 20,
    rarity: 'rare',
    category: 'completion'
  }
];

const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));

export function getAchievementDefinition(id: string): AchievementDefinition {
  const definition = ACHIEVEMENT_BY_ID.get(id);

  if (!definition) {
    throw new Error(`Unknown achievement: ${id}`);
  }

  return definition;
}

export function getAchievementTarget(definition: AchievementDefinition): number {
  return definition.target ?? 1;
}

export function getAchievementTotalPoints(ids: string[]): number {
  const unlocked = new Set(ids);
  return ACHIEVEMENTS.reduce((total, achievement) => total + (unlocked.has(achievement.id) ? achievement.points : 0), 0);
}

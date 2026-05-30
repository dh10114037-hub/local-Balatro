import type { JokerDefinition, JokerInstance } from '../types';

export const JOKERS: JokerDefinition[] = [
  {
    id: 'chip_starter',
    name: '筹码小丑',
    rarity: 'common',
    archetypes: ['general'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '无条件',
    price: 2,
    description: '每次出牌额外 +30 筹码。',
    effects: [{ type: 'add_chips', amount: 30 }]
  },
  {
    id: 'mult_starter',
    name: '倍率小丑',
    rarity: 'common',
    archetypes: ['general'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '无条件',
    price: 2,
    description: '每次出牌额外 +4 倍率。',
    effects: [{ type: 'add_mult', amount: 4 }]
  },
  {
    id: 'magnifier',
    name: '放大镜',
    rarity: 'uncommon',
    archetypes: ['general'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '无条件',
    price: 5,
    description: '每次出牌后倍率 x1.5。',
    effects: [{ type: 'multiply_mult', factor: 1.5 }]
  },
  {
    id: 'pair_teacher',
    name: '对子老师',
    rarity: 'common',
    archetypes: ['pair'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '打出对子',
    price: 3,
    description: '打出对子时 +8 倍率。',
    effects: [{ type: 'hand_add_mult', hand: 'pair', amount: 8 }]
  },
  {
    id: 'flush_painter',
    name: '同花画师',
    rarity: 'uncommon',
    archetypes: ['flush', 'suit'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '打出同花',
    price: 5,
    description: '打出同花时 +10 倍率。',
    effects: [{ type: 'hand_add_mult', hand: 'flush', amount: 10 }]
  },
  {
    id: 'straight_runner',
    name: '顺子跑者',
    rarity: 'common',
    archetypes: ['straight'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '打出顺子',
    price: 4,
    description: '打出顺子时 +40 筹码。',
    effects: [{ type: 'hand_add_chips', hand: 'straight', amount: 40 }]
  },
  {
    id: 'heart_drummer',
    name: '红心鼓手',
    rarity: 'common',
    archetypes: ['suit', 'flush'],
    triggerTiming: ['scored_card'],
    triggerText: '计分牌结算时触发',
    conditionText: '红心牌计分',
    price: 3,
    description: '每张计分红心牌 +2 倍率。',
    effects: [{ type: 'scored_suit_add_mult', suit: 'hearts', amount: 2 }]
  },
  {
    id: 'spade_smith',
    name: '黑桃铁匠',
    rarity: 'common',
    archetypes: ['suit', 'flush'],
    triggerTiming: ['scored_card'],
    triggerText: '计分牌结算时触发',
    conditionText: '黑桃牌计分',
    price: 3,
    description: '每张计分黑桃牌 +12 筹码。',
    effects: [{ type: 'scored_suit_add_chips', suit: 'spades', amount: 12 }]
  },
  {
    id: 'face_tax',
    name: '人头税',
    rarity: 'common',
    archetypes: ['face'],
    triggerTiming: ['scored_card'],
    triggerText: '计分牌结算时触发',
    conditionText: 'J、Q、K 计分',
    price: 4,
    description: '每张计分人头牌 +15 筹码。',
    effects: [{ type: 'scored_face_add_chips', amount: 15 }]
  },
  {
    id: 'discard_abacus',
    name: '弃牌算盘',
    rarity: 'common',
    archetypes: ['economy'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '仍有弃牌次数',
    price: 3,
    description: '每剩余 1 次弃牌，出牌时 +2 倍率。',
    effects: [{ type: 'remaining_discards_add_mult', amountPerDiscard: 2 }]
  },
  {
    id: 'money_pouch',
    name: '钱袋小丑',
    rarity: 'uncommon',
    archetypes: ['economy'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '根据当前资金',
    price: 5,
    description: '每拥有 $3，出牌时 +1 倍率，最多 +10。',
    effects: [{ type: 'money_add_mult', amount: 1, divisor: 3, max: 10 }]
  },
  {
    id: 'opening_firework',
    name: '开场烟花',
    rarity: 'common',
    archetypes: ['general'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '本盲注第一次出牌',
    price: 3,
    description: '每个盲注第一次出牌 +8 倍率。',
    effects: [{ type: 'first_hand_add_mult', amount: 8 }]
  },
  {
    id: 'final_push',
    name: '最后一击',
    rarity: 'rare',
    archetypes: ['general'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '本盲注最后一次出牌',
    price: 7,
    description: '最后一次出牌时倍率 x2。',
    effects: [{ type: 'last_hand_multiply_mult', factor: 2 }]
  },
  {
    id: 'counter',
    name: '计数员',
    rarity: 'common',
    archetypes: ['general'],
    triggerTiming: ['scored_card'],
    triggerText: '计分牌结算时触发',
    conditionText: '每张计分牌',
    price: 3,
    description: '每张计分牌 +8 筹码。',
    effects: [{ type: 'scored_cards_add_chips', amountPerCard: 8 }]
  },
  {
    id: 'ace_fan',
    name: 'A 崇拜者',
    rarity: 'uncommon',
    archetypes: ['high_card', 'face'],
    triggerTiming: ['scored_card'],
    triggerText: '计分牌结算时触发',
    conditionText: 'A 计分',
    price: 4,
    description: '每张计分 A +5 倍率。',
    effects: [{ type: 'rank_add_mult', rank: 'A', amount: 5 }]
  },
  {
    id: 'lucky_seven',
    name: '七号藏家',
    rarity: 'common',
    archetypes: ['general'],
    triggerTiming: ['scored_card'],
    triggerText: '计分牌结算时触发',
    conditionText: '7 计分',
    price: 3,
    description: '每张计分 7 +25 筹码。',
    effects: [{ type: 'rank_add_chips', rank: '7', amount: 25 }]
  },
  {
    id: 'high_card_patch',
    name: '高牌补丁',
    rarity: 'common',
    archetypes: ['high_card'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '打出高牌',
    price: 2,
    description: '打出高牌时 +45 筹码。',
    effects: [{ type: 'hand_add_chips', hand: 'high_card', amount: 45 }]
  },
  {
    id: 'triple_singer',
    name: '三条歌手',
    rarity: 'uncommon',
    archetypes: ['pair'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '打出三条',
    price: 5,
    description: '打出三条时 +12 倍率。',
    effects: [{ type: 'hand_add_mult', hand: 'three_of_a_kind', amount: 12 }]
  },
  {
    id: 'echo_joker',
    name: '复读小丑',
    rarity: 'rare',
    archetypes: ['copy'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '右侧有可复制的小丑',
    price: 7,
    description: '复制右侧小丑的基础效果。',
    effects: [{ type: 'copy_right' }]
  },
  {
    id: 'pair_seed',
    name: '对子种子',
    rarity: 'uncommon',
    archetypes: ['pair', 'growth'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发，并在出牌后成长',
    conditionText: '打出对子',
    price: 5,
    description: '每打出一次对子都会成长；之后每级在对子上 +2 倍率。',
    effects: [{ type: 'growth_hand_add_mult', hand: 'pair', amountPerLevel: 2 }],
    growthOnHand: { hand: 'pair', amount: 1 }
  },
  {
    id: 'single_spotlight',
    name: '独牌聚光',
    rarity: 'common',
    archetypes: ['high_card'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '本手只有 1 张计分牌',
    price: 3,
    description: '只有 1 张牌计分时 +9 倍率。',
    effects: [{ type: 'scored_cards_at_most_add_mult', maxCards: 1, amount: 9 }]
  },
  {
    id: 'pair_archivist',
    name: '对子档案员',
    rarity: 'common',
    archetypes: ['pair'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '打出对子',
    price: 3,
    description: '打出对子时 +35 筹码。',
    effects: [{ type: 'hand_add_chips', hand: 'pair', amount: 35 }]
  },
  {
    id: 'two_pair_tuner',
    name: '两对调音师',
    rarity: 'common',
    archetypes: ['pair'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '打出两对',
    price: 4,
    description: '打出两对时 +7 倍率。',
    effects: [{ type: 'hand_add_mult', hand: 'two_pair', amount: 7 }]
  },
  {
    id: 'royal_clerk',
    name: '人头书记',
    rarity: 'uncommon',
    archetypes: ['face'],
    triggerTiming: ['scored_card'],
    triggerText: '计分牌结算时触发',
    conditionText: 'J、Q、K 计分',
    price: 5,
    description: '每张计分人头牌 +3 倍率。',
    effects: [{ type: 'scored_face_add_mult', amount: 3 }]
  },
  {
    id: 'club_drummer',
    name: '梅花鼓手',
    rarity: 'common',
    archetypes: ['suit', 'flush'],
    triggerTiming: ['scored_card'],
    triggerText: '计分牌结算时触发',
    conditionText: '梅花牌计分',
    price: 3,
    description: '每张计分梅花牌 +2 倍率。',
    effects: [{ type: 'scored_suit_add_mult', suit: 'clubs', amount: 2 }]
  },
  {
    id: 'straight_doubler',
    name: '顺子加速器',
    rarity: 'rare',
    archetypes: ['straight'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '打出顺子',
    price: 7,
    description: '打出顺子时倍率 x1.75。',
    effects: [{ type: 'hand_multiply_mult', hand: 'straight', factor: 1.75 }]
  },
  {
    id: 'glass_prism',
    name: '玻璃棱镜',
    rarity: 'rare',
    archetypes: ['glass', 'enhancement'],
    triggerTiming: ['scored_card'],
    triggerText: '计分牌结算时触发',
    conditionText: '玻璃牌计分',
    price: 7,
    description: '每张计分玻璃牌额外使倍率 x1.5。',
    effects: [{ type: 'scored_enhancement_multiply_mult', enhancement: 'glass', factor: 1.5 }]
  },
  {
    id: 'steel_fund',
    name: '钢铁基金',
    rarity: 'uncommon',
    archetypes: ['enhancement', 'economy'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '钢铁牌留在手牌中',
    price: 5,
    description: '每张留在手牌中的钢铁牌额外 +3 倍率。',
    effects: [{ type: 'held_enhancement_add_mult', enhancement: 'steel', amount: 3 }]
  },
  {
    id: 'first_card_echo',
    name: '首牌回声',
    rarity: 'rare',
    archetypes: ['copy', 'high_card'],
    triggerTiming: ['scored_card'],
    triggerText: '计分牌结算时触发',
    conditionText: '至少有 1 张计分牌',
    price: 6,
    description: '重复首张计分牌的筹码贡献。',
    effects: [{ type: 'repeat_first_scored_card' }]
  },
  {
    id: 'cashout_clown',
    name: '收款小丑',
    rarity: 'common',
    archetypes: ['economy'],
    triggerTiming: ['blind_end'],
    triggerText: '通过盲注时触发',
    conditionText: '成功通过当前盲注',
    price: 4,
    description: '通过盲注后额外获得 $2。',
    effects: [{ type: 'blind_clear_money', amount: 2 }]
  },
  {
    id: 'coupon_clip',
    name: '优惠夹',
    rarity: 'uncommon',
    archetypes: ['economy'],
    triggerTiming: ['shop'],
    triggerText: '商店中持续生效',
    conditionText: '刷新商店时',
    price: 5,
    description: '刷新商店费用 -1，最低为 $0。',
    effects: [{ type: 'reroll_discount', amount: 1 }]
  },
  {
    id: 'parting_gift',
    name: '离别礼物',
    rarity: 'common',
    archetypes: ['economy'],
    triggerTiming: ['buy_sell'],
    triggerText: '卖出这张小丑时触发',
    conditionText: '卖出自身',
    price: 4,
    description: '卖出时额外获得 $3。',
    effects: [{ type: 'sell_bonus_money', amount: 3 }]
  },
  {
    id: 'high_card_spur',
    name: '高牌马刺',
    rarity: 'common',
    archetypes: ['high_card'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '打出高牌',
    price: 3,
    description: '打出高牌时 +6 倍率。',
    effects: [{ type: 'hand_add_mult', hand: 'high_card', amount: 6 }]
  },
  {
    id: 'two_pair_bookkeeper',
    name: '两对账本',
    rarity: 'common',
    archetypes: ['pair'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '打出两对',
    price: 4,
    description: '打出两对时 +40 筹码。',
    effects: [{ type: 'hand_add_chips', hand: 'two_pair', amount: 40 }]
  },
  {
    id: 'triple_blacksmith',
    name: '三条铁匠',
    rarity: 'common',
    archetypes: ['pair'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '打出三条',
    price: 4,
    description: '打出三条时 +50 筹码。',
    effects: [{ type: 'hand_add_chips', hand: 'three_of_a_kind', amount: 50 }]
  },
  {
    id: 'flush_cartographer',
    name: '同花制图师',
    rarity: 'common',
    archetypes: ['flush', 'suit'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '打出同花',
    price: 4,
    description: '打出同花时 +45 筹码。',
    effects: [{ type: 'hand_add_chips', hand: 'flush', amount: 45 }]
  },
  {
    id: 'full_house_bell',
    name: '满堂铃',
    rarity: 'uncommon',
    archetypes: ['pair'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '打出葫芦',
    price: 5,
    description: '打出葫芦时 +10 倍率。',
    effects: [{ type: 'hand_add_mult', hand: 'full_house', amount: 10 }]
  },
  {
    id: 'full_house_mason',
    name: '葫芦石匠',
    rarity: 'uncommon',
    archetypes: ['pair'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '打出葫芦',
    price: 5,
    description: '打出葫芦时 +60 筹码。',
    effects: [{ type: 'hand_add_chips', hand: 'full_house', amount: 60 }]
  },
  {
    id: 'four_kind_foundry',
    name: '四条铸炉',
    rarity: 'uncommon',
    archetypes: ['pair'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '打出四条',
    price: 6,
    description: '打出四条时 +80 筹码。',
    effects: [{ type: 'hand_add_chips', hand: 'four_of_a_kind', amount: 80 }]
  },
  {
    id: 'four_kind_booster',
    name: '四条增压器',
    rarity: 'rare',
    archetypes: ['pair'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '打出四条',
    price: 7,
    description: '打出四条时 +14 倍率。',
    effects: [{ type: 'hand_add_mult', hand: 'four_of_a_kind', amount: 14 }]
  },
  {
    id: 'abstract_masks',
    name: '抽象面具',
    rarity: 'common',
    archetypes: ['general'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '根据当前小丑数量',
    price: 4,
    description: '每拥有 1 张小丑，出牌时 +3 倍率。',
    effects: [{ type: 'joker_count_add_mult', amountPerJoker: 3 }]
  },
  {
    id: 'short_hand_banner',
    name: '短手旗',
    rarity: 'common',
    archetypes: ['high_card'],
    triggerTiming: ['on_play'],
    triggerText: '出牌结算时触发',
    conditionText: '本手选择不超过 3 张牌',
    price: 4,
    description: '选择不超过 3 张牌出牌时 +14 倍率。',
    effects: [{ type: 'selected_cards_at_most_add_mult', maxCards: 3, amount: 14 }]
  },
  {
    id: 'even_lantern',
    name: '偶数灯',
    rarity: 'common',
    archetypes: ['general'],
    triggerTiming: ['scored_card'],
    triggerText: '计分牌结算时触发',
    conditionText: '2、4、6、8、10 计分',
    price: 4,
    description: '每张计分偶数牌 +4 倍率。',
    effects: [{ type: 'scored_ranks_add_mult', ranks: ['2', '4', '6', '8', '10'], amount: 4 }]
  },
  {
    id: 'odd_lantern',
    name: '奇数灯',
    rarity: 'common',
    archetypes: ['general'],
    triggerTiming: ['scored_card'],
    triggerText: '计分牌结算时触发',
    conditionText: 'A、3、5、7、9 计分',
    price: 4,
    description: '每张计分奇数牌 +25 筹码。',
    effects: [{ type: 'scored_ranks_add_chips', ranks: ['A', '3', '5', '7', '9'], amount: 25 }]
  },
  {
    id: 'ace_scholar',
    name: '尖牌学者',
    rarity: 'uncommon',
    archetypes: ['high_card', 'face'],
    triggerTiming: ['scored_card'],
    triggerText: '计分牌结算时触发',
    conditionText: 'A 计分',
    price: 5,
    description: '每张计分 A +20 筹码并 +4 倍率。',
    effects: [
      { type: 'rank_add_chips', rank: 'A', amount: 20 },
      { type: 'rank_add_mult', rank: 'A', amount: 4 }
    ]
  },
  {
    id: 'ten_four_radio',
    name: '十四号电台',
    rarity: 'uncommon',
    archetypes: ['general'],
    triggerTiming: ['scored_card'],
    triggerText: '计分牌结算时触发',
    conditionText: '10 或 4 计分',
    price: 5,
    description: '每张计分 10 或 4 +10 筹码并 +4 倍率。',
    effects: [
      { type: 'scored_ranks_add_chips', ranks: ['10', '4'], amount: 10 },
      { type: 'scored_ranks_add_mult', ranks: ['10', '4'], amount: 4 }
    ]
  },
  {
    id: 'diamond_drummer',
    name: '方块鼓手',
    rarity: 'common',
    archetypes: ['suit', 'flush'],
    triggerTiming: ['scored_card'],
    triggerText: '计分牌结算时触发',
    conditionText: '方块牌计分',
    price: 3,
    description: '每张计分方块牌 +2 倍率。',
    effects: [{ type: 'scored_suit_add_mult', suit: 'diamonds', amount: 2 }]
  },
  {
    id: 'heart_smith',
    name: '红心铁匠',
    rarity: 'common',
    archetypes: ['suit', 'flush'],
    triggerTiming: ['scored_card'],
    triggerText: '计分牌结算时触发',
    conditionText: '红心牌计分',
    price: 3,
    description: '每张计分红心牌 +12 筹码。',
    effects: [{ type: 'scored_suit_add_chips', suit: 'hearts', amount: 12 }]
  }
];

export function getJokerDefinition(definitionId: string): JokerDefinition {
  const definition = JOKERS.find((joker) => joker.id === definitionId);

  if (!definition) {
    throw new Error(`找不到小丑定义：${definitionId}`);
  }

  return definition;
}

export function createJokerInstance(definitionId: string, instanceNumber: number): JokerInstance {
  return {
    instanceId: `joker-${instanceNumber}`,
    definitionId,
    level: 0
  };
}

export function getJokerSellValue(definitionId: string): number {
  const definition = getJokerDefinition(definitionId);
  return Math.max(1, Math.floor(definition.price / 2));
}

import { createRng } from '../random';
import type { BossDefinition } from '../types';

export const BOSSES: BossDefinition[] = [
  {
    id: 'crimson_lock',
    name: '红心封锁',
    description: '红心牌可以组成牌型，但计分时不提供筹码，也不触发计分牌效果。',
    advice: '少依赖红心计分牌；可以用红心凑牌型，但把高点数或增强牌留给其他花色。',
    effects: [{ type: 'debuff_suit', suit: 'hearts' }]
  },
  {
    id: 'spade_lock',
    name: '黑桃封锁',
    description: '黑桃牌可以组成牌型，但计分时不提供筹码，也不触发计分牌效果。',
    advice: '黑桃仍能帮你组成顺子或同花，真正得分最好交给其他花色。',
    effects: [{ type: 'debuff_suit', suit: 'spades' }]
  },
  {
    id: 'ace_tax',
    name: '尖牌税',
    description: '所有 A 牌在计分时不提供筹码，也不触发计分牌效果。',
    advice: '不要把 A 当作主要计分牌；更适合用对子、顺子或非 A 高点数牌过关。',
    effects: [{ type: 'debuff_rank', rank: 'A' }]
  },
  {
    id: 'face_silence',
    name: '人头静默',
    description: 'J、Q、K 在计分时不提供筹码，也不触发计分牌效果。',
    advice: '人头牌可以凑牌型，但本盲注更适合数字牌和非人头增强牌。',
    effects: [{ type: 'debuff_face_cards' }]
  },
  {
    id: 'opening_pressure',
    name: '开局压制',
    description: '本盲注第一次出牌的最终倍率减半。',
    advice: '第一手别急着交爆发牌，可以先用较低价值牌探路或整理牌型。',
    effects: [{ type: 'first_hand_score_factor', factor: 0.5 }]
  },
  {
    id: 'pattern_ban',
    name: '旧牌型禁令',
    description: '本盲注中，已经打出过的牌型再次打出时不得分。',
    advice: '提前规划不同牌型路线，例如先对子再同花，避免重复出同一种牌型。',
    effects: [{ type: 'no_repeat_hand' }]
  },
  {
    id: 'narrow_grip',
    name: '窄手牌',
    description: '本盲注手牌上限减少 1 张。',
    advice: '弃牌价值更高，优先保留能直接组成目标牌型的牌。',
    effects: [{ type: 'hand_size_delta', amount: -1 }]
  },
  {
    id: 'dry_well',
    name: '枯井',
    description: '本盲注没有弃牌次数。',
    advice: '只能靠当前抽牌推进，尽量打稳定牌型，不要等太完美的组合。',
    effects: [{ type: 'no_discards' }]
  },
  {
    id: 'full_table',
    name: '满桌考验',
    description: '每次出牌必须正好打出 5 张牌，否则不得分。',
    advice: '每手都选满 5 张；同花、顺子、葫芦会更自然，单张高牌流会受压。',
    effects: [{ type: 'force_five_cards' }]
  },
  {
    id: 'threshold_gate',
    name: '门槛之门',
    description: '第一次出牌至少要达到目标分的 30%，否则本手不得分。',
    advice: '第一手需要认真打分，优先交出能触发小丑或增强牌的组合。',
    effects: [{ type: 'first_hand_min_score_ratio', ratio: 0.3 }]
  },
  {
    id: 'rare_pause',
    name: '稀有停摆',
    description: '稀有小丑在本盲注中暂时不触发。',
    advice: '确认你的主要倍率是否来自稀有小丑；必要时改用普通/罕见小丑撑分。',
    effects: [{ type: 'disable_joker_rarity', rarity: 'rare' }]
  },
  {
    id: 'short_leash',
    name: '短绳',
    description: '本盲注每次最多选择 3 张牌出牌。',
    advice: '高牌、对子、三条更稳定；不要把计划建立在 5 张牌型上。',
    effects: [{ type: 'max_selected_cards', max: 3 }]
  },
  {
    id: 'masked_court',
    name: '宫廷假面',
    description: 'J、Q、K 在手牌中会盖面显示，仍可选择并正常计分。',
    advice: '盖面牌仍是真实牌；记住抽牌顺序，或先用弃牌整理风险。',
    effects: [{ type: 'hide_face_cards' }]
  },
  {
    id: 'diamond_lock',
    name: '方片封锁',
    description: '方片牌可以组成牌型，但计分时不提供筹码，也不触发计分牌效果。',
    advice: '方片只拿来凑形状；把增强牌和高点数留给其他花色。',
    effects: [{ type: 'debuff_suit', suit: 'diamonds' }]
  },
  {
    id: 'club_lock',
    name: '梅花封锁',
    description: '梅花牌可以组成牌型，但计分时不提供筹码，也不触发计分牌效果。',
    advice: '梅花仍能凑顺子或同花，本盲注的主要筹码最好来自其他花色。',
    effects: [{ type: 'debuff_suit', suit: 'clubs' }]
  },
  {
    id: 'king_tax',
    name: '王冠税',
    description: '所有 K 牌在计分时不提供筹码，也不触发计分牌效果。',
    advice: '不要依赖 K 的高点数；人头路线可以转向 Q/J 或数字牌。',
    effects: [{ type: 'debuff_rank', rank: 'K' }]
  },
  {
    id: 'queen_tax',
    name: '后冠税',
    description: '所有 Q 牌在计分时不提供筹码，也不触发计分牌效果。',
    advice: 'Q 可以继续凑牌型，但最好不要让它承担增强牌得分。',
    effects: [{ type: 'debuff_rank', rank: 'Q' }]
  },
  {
    id: 'ten_tax',
    name: '十点税',
    description: '所有 10 牌在计分时不提供筹码，也不触发计分牌效果。',
    advice: '顺子仍能借 10 成形，但最终得分要靠其他计分牌或小丑。',
    effects: [{ type: 'debuff_rank', rank: '10' }]
  },
  {
    id: 'seven_tax',
    name: '七点税',
    description: '所有 7 牌在计分时不提供筹码，也不触发计分牌效果。',
    advice: '如果你的构筑围绕 7 或奇数牌，本盲注需要临时换路线。',
    effects: [{ type: 'debuff_rank', rank: '7' }]
  },
  {
    id: 'common_pause',
    name: '普通停摆',
    description: '普通小丑在本盲注中暂时不触发。',
    advice: '检查前期主力是否都是普通小丑；必要时靠牌型等级和增强牌过关。',
    effects: [{ type: 'disable_joker_rarity', rarity: 'common' }]
  },
  {
    id: 'uncommon_pause',
    name: '罕见停摆',
    description: '罕见小丑在本盲注中暂时不触发。',
    advice: '如果核心倍率来自罕见小丑，优先打基础分更高的 5 张牌型。',
    effects: [{ type: 'disable_joker_rarity', rarity: 'uncommon' }]
  },
  {
    id: 'opening_drag',
    name: '开局拖拽',
    description: '本盲注第一次出牌的最终倍率变为 75%。',
    advice: '第一手少交关键资源，留一手更强牌给后续正常倍率。',
    effects: [{ type: 'first_hand_score_factor', factor: 0.75 }]
  },
  {
    id: 'high_gate',
    name: '高门槛',
    description: '第一次出牌至少要达到目标分的 45%，否则本手不得分。',
    advice: '第一手必须认真爆发；不要用低分手牌试探。',
    effects: [{ type: 'first_hand_min_score_ratio', ratio: 0.45 }]
  },
  {
    id: 'pinched_grip',
    name: '紧握手牌',
    description: '本盲注手牌上限减少 2 张。',
    advice: '弃牌和排序更重要，优先保留能立刻打分的组合。',
    effects: [{ type: 'hand_size_delta', amount: -2 }]
  },
  {
    id: 'tiny_leash',
    name: '细绳',
    description: '本盲注每次最多选择 2 张牌出牌。',
    advice: '高牌和对子路线更稳；同花、顺子和葫芦会被强烈压制。',
    effects: [{ type: 'max_selected_cards', max: 2 }]
  },
  {
    id: 'pair_embargo',
    name: '对子禁令',
    description: '对子和两对在本盲注中不得分。',
    advice: '避开低阶对子路线，改打高牌、三条、顺子或同花。',
    effects: [{ type: 'forbid_hand_types', hands: ['pair', 'two_pair'] }]
  },
  {
    id: 'flush_embargo',
    name: '同花禁令',
    description: '同花类牌型在本盲注中不得分。',
    advice: '不要只按花色收牌；顺子、对子系和人头牌会更可靠。',
    effects: [{ type: 'forbid_hand_types', hands: ['flush', 'straight_flush', 'royal_flush', 'flush_house', 'flush_five'] }]
  },
  {
    id: 'straight_embargo',
    name: '顺子禁令',
    description: '顺子类牌型在本盲注中不得分。',
    advice: '连续点数不再安全，转向对子、同花或增强牌高牌。',
    effects: [{ type: 'forbid_hand_types', hands: ['straight', 'straight_flush', 'royal_flush'] }]
  },
  {
    id: 'pair_order',
    name: '成双命令',
    description: '本盲注只有对子系牌型可以得分。',
    advice: '至少凑出一对再出牌；三条、葫芦和四条也能满足规则。',
    effects: [
      { type: 'require_hand_types', hands: ['pair', 'two_pair', 'three_of_a_kind', 'full_house', 'four_of_a_kind', 'five_of_a_kind', 'flush_house', 'flush_five'] }
    ]
  },
  {
    id: 'simple_order',
    name: '简式命令',
    description: '本盲注只有高牌、对子或两对可以得分。',
    advice: '别追复杂 5 张牌型，用小丑和增强牌放大简单手牌。',
    effects: [{ type: 'require_hand_types', hands: ['high_card', 'pair', 'two_pair'] }]
  }
];

export function getBossDefinition(definitionId: string): BossDefinition {
  const definition = BOSSES.find((boss) => boss.id === definitionId);

  if (!definition) {
    throw new Error(`找不到首领定义：${definitionId}`);
  }

  return definition;
}

export function getBossForAnte(seed: string, ante: number): BossDefinition {
  const rng = createRng(`${seed}:boss:${ante}`);
  return BOSSES[Math.floor(rng.next() * BOSSES.length)];
}

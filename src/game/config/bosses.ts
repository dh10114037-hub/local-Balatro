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

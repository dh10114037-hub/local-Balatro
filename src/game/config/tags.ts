import { createRng } from '../random';
import type { TagDefinition, TagInstance } from '../types';

export const TAGS: TagDefinition[] = [
  {
    id: 'cash_drop',
    name: '现金标记',
    description: '下次进入商店时获得 $6。',
    effects: [{ type: 'gain_money_next_shop', amount: 6 }]
  },
  {
    id: 'big_cash_drop',
    name: '大钞标记',
    description: '下次进入商店时获得 $10。',
    effects: [{ type: 'gain_money_next_shop', amount: 10 }]
  },
  {
    id: 'free_reroll',
    name: '免费刷新标记',
    description: '下次进入商店时，首次刷新费用变为 $0。',
    effects: [{ type: 'free_reroll_next_shop' }]
  },
  {
    id: 'free_shop',
    name: '免费商店标记',
    description: '下次进入商店时，货架商品价格降到 $0。',
    effects: [{ type: 'free_shop_next_shop' }]
  },
  {
    id: 'shelf_discount',
    name: '折扣标记',
    description: '下次进入商店时，货架商品价格 -$1。',
    effects: [{ type: 'discount_next_shop', amount: 1 }]
  },
  {
    id: 'voucher_discount',
    name: '优惠券标记',
    description: '下次进入商店时，优惠券价格 -$4。',
    effects: [{ type: 'voucher_discount_next_shop', amount: 4 }]
  },
  {
    id: 'free_pack',
    name: '补充包标记',
    description: '下次进入商店时，额外出现一个免费补充包。',
    effects: [{ type: 'free_pack_next_shop' }]
  },
  {
    id: 'free_joker',
    name: '小丑标记',
    description: '下次进入商店时，额外出现一个免费普通小丑。',
    effects: [{ type: 'free_common_joker_next_shop' }]
  },
  {
    id: 'rare_joker',
    name: '稀有小丑标记',
    description: '下次进入商店时，额外出现一个免费稀有小丑。',
    effects: [{ type: 'free_rare_joker_next_shop' }]
  },
  {
    id: 'tarot_gift',
    name: '塔罗标记',
    description: '下次进入商店时，若有空槽，获得一张随机塔罗牌。',
    effects: [{ type: 'add_random_tarot_next_shop' }]
  },
  {
    id: 'planet_training',
    name: '训练标记',
    description: '下次进入商店时，随机牌型等级 +1。',
    effects: [{ type: 'upgrade_random_hand_next_shop', amount: 1 }]
  },
  {
    id: 'extra_hand',
    name: '额外出牌标记',
    description: '下一个盲注出牌次数 +1。',
    effects: [{ type: 'extra_hand_next_blind', amount: 1 }]
  },
  {
    id: 'extra_discard',
    name: '额外弃牌标记',
    description: '下一个盲注弃牌次数 +1。',
    effects: [{ type: 'extra_discard_next_blind', amount: 1 }]
  }
];

export function getTagDefinition(definitionId: string): TagDefinition {
  const definition = TAGS.find((tag) => tag.id === definitionId);

  if (!definition) {
    throw new Error(`找不到标记定义：${definitionId}`);
  }

  return definition;
}

export function getTagForBlind(seed: string, ante: number, blindIndex: number): TagDefinition {
  const rng = createRng(`${seed}:tag:${ante}:${blindIndex}`);
  return TAGS[Math.floor(rng.next() * TAGS.length)];
}

export function createTagInstance(definitionId: string, instanceNumber: number): TagInstance {
  return {
    instanceId: `tag-${instanceNumber}`,
    definitionId
  };
}

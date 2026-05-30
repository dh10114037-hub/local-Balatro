import { createRng } from '../random';
import type { VoucherDefinition } from '../types';

export const VOUCHERS: VoucherDefinition[] = [
  {
    id: 'wide_pockets',
    name: '宽口袋',
    price: 8,
    tier: 1,
    pairId: 'joker_slots',
    description: '小丑槽位 +1。',
    effects: [{ type: 'extra_joker_slot', amount: 1 }]
  },
  {
    id: 'wide_locker',
    name: '宽柜格',
    price: 12,
    tier: 2,
    pairId: 'joker_slots',
    requiresVoucherId: 'wide_pockets',
    unlockHint: '购买宽口袋后可能出现。',
    description: '小丑槽位再 +1。',
    effects: [{ type: 'extra_joker_slot', amount: 1 }]
  },
  {
    id: 'deep_satchel',
    name: '深挎包',
    price: 8,
    tier: 1,
    pairId: 'consumable_slots',
    description: '消耗牌槽位 +1。',
    effects: [{ type: 'extra_consumable_slot', amount: 1 }]
  },
  {
    id: 'deep_trunk',
    name: '深箱格',
    price: 11,
    tier: 2,
    pairId: 'consumable_slots',
    requiresVoucherId: 'deep_satchel',
    unlockHint: '购买深挎包后可能出现。',
    description: '消耗牌槽位再 +1。',
    effects: [{ type: 'extra_consumable_slot', amount: 1 }]
  },
  {
    id: 'long_fingers',
    name: '长指节',
    price: 10,
    tier: 1,
    pairId: 'hand_size',
    description: '手牌上限 +1。',
    effects: [{ type: 'extra_hand_size', amount: 1 }]
  },
  {
    id: 'table_reach',
    name: '长桌触及',
    price: 13,
    tier: 2,
    pairId: 'hand_size',
    requiresVoucherId: 'long_fingers',
    unlockHint: '购买长指节后可能出现。',
    description: '手牌上限再 +1。',
    effects: [{ type: 'extra_hand_size', amount: 1 }]
  },
  {
    id: 'steady_pace',
    name: '稳步节奏',
    price: 9,
    tier: 1,
    pairId: 'hands',
    description: '每个盲注出牌次数 +1。',
    effects: [{ type: 'extra_hand_per_blind', amount: 1 }]
  },
  {
    id: 'long_run',
    name: '长线节奏',
    price: 13,
    tier: 2,
    pairId: 'hands',
    requiresVoucherId: 'steady_pace',
    unlockHint: '购买稳步节奏后可能出现。',
    description: '每个盲注出牌次数再 +1。',
    effects: [{ type: 'extra_hand_per_blind', amount: 1 }]
  },
  {
    id: 'spare_throw',
    name: '备用弃牌',
    price: 7,
    tier: 1,
    pairId: 'discards',
    description: '每个盲注弃牌次数 +1。',
    effects: [{ type: 'extra_discard_per_blind', amount: 1 }]
  },
  {
    id: 'recycle_plan',
    name: '回收计划',
    price: 10,
    tier: 2,
    pairId: 'discards',
    requiresVoucherId: 'spare_throw',
    unlockHint: '购买备用弃牌后可能出现。',
    description: '每个盲注弃牌次数再 +1。',
    effects: [{ type: 'extra_discard_per_blind', amount: 1 }]
  },
  {
    id: 'cheap_shuffle',
    name: '廉价刷新',
    price: 7,
    tier: 1,
    pairId: 'reroll',
    description: '商店刷新费用 -$1，最低为 $0。',
    effects: [{ type: 'reroll_discount', amount: 1 }]
  },
  {
    id: 'soft_shuffle',
    name: '柔性刷新',
    price: 10,
    tier: 2,
    pairId: 'reroll',
    requiresVoucherId: 'cheap_shuffle',
    unlockHint: '购买廉价刷新后可能出现。',
    description: '商店刷新费用再 -$1，最低为 $0。',
    effects: [{ type: 'reroll_discount', amount: 1 }]
  },
  {
    id: 'wholesale',
    name: '批发价',
    price: 10,
    tier: 1,
    pairId: 'shop_price',
    description: '商店普通商品价格 -$1。',
    effects: [{ type: 'shop_discount', amount: 1 }]
  },
  {
    id: 'warehouse_deal',
    name: '仓储价',
    price: 13,
    tier: 2,
    pairId: 'shop_price',
    requiresVoucherId: 'wholesale',
    unlockHint: '购买批发价后可能出现。',
    description: '商店普通商品价格再 -$1。',
    effects: [{ type: 'shop_discount', amount: 1 }]
  },
  {
    id: 'pack_coupon',
    name: '开包券',
    price: 7,
    tier: 1,
    pairId: 'pack_price',
    description: '补充包价格 -$2。',
    effects: [{ type: 'pack_discount', amount: 2 }]
  },
  {
    id: 'pack_broker',
    name: '开包经纪',
    price: 11,
    tier: 2,
    pairId: 'pack_price',
    requiresVoucherId: 'pack_coupon',
    unlockHint: '购买开包券后可能出现。',
    description: '补充包价格再 -$2。',
    effects: [{ type: 'pack_discount', amount: 2 }]
  },
  {
    id: 'bonus_contract',
    name: '奖金合同',
    price: 8,
    tier: 1,
    pairId: 'blind_reward',
    description: '通过每个盲注时额外获得 $1。',
    effects: [{ type: 'bonus_blind_reward', amount: 1 }]
  },
  {
    id: 'gold_contract',
    name: '金字合同',
    price: 12,
    tier: 2,
    pairId: 'blind_reward',
    requiresVoucherId: 'bonus_contract',
    unlockHint: '购买奖金合同后可能出现。',
    description: '通过每个盲注时再额外获得 $2。',
    effects: [{ type: 'bonus_blind_reward', amount: 2 }]
  },
  {
    id: 'boss_notes',
    name: '首领笔记',
    price: 9,
    tier: 1,
    pairId: 'boss_target',
    description: '首领盲注目标分降低 10%。',
    effects: [{ type: 'boss_target_discount', ratio: 0.1 }]
  },
  {
    id: 'boss_blueprint',
    name: '首领蓝图',
    price: 13,
    tier: 2,
    pairId: 'boss_target',
    requiresVoucherId: 'boss_notes',
    unlockHint: '购买首领笔记后可能出现。',
    description: '首领盲注目标分再降低 10%。',
    effects: [{ type: 'boss_target_discount', ratio: 0.1 }]
  },
  {
    id: 'extra_shelf',
    name: '加宽货架',
    price: 10,
    tier: 1,
    pairId: 'shop_size',
    description: '商店商品槽位 +1。',
    effects: [{ type: 'extra_shop_offer', amount: 1 }]
  },
  {
    id: 'crowded_shelf',
    name: '满陈货架',
    price: 14,
    tier: 2,
    pairId: 'shop_size',
    requiresVoucherId: 'extra_shelf',
    unlockHint: '购买加宽货架后可能出现。',
    description: '商店商品槽位再 +1。',
    effects: [{ type: 'extra_shop_offer', amount: 1 }]
  },
  {
    id: 'pack_preview',
    name: '开包预览',
    price: 8,
    tier: 1,
    pairId: 'pack_choice',
    description: '补充包候选数量 +1。',
    effects: [{ type: 'extra_pack_choice', amount: 1 }]
  },
  {
    id: 'pack_spread',
    name: '开包展开',
    price: 12,
    tier: 2,
    pairId: 'pack_choice',
    requiresVoucherId: 'pack_preview',
    unlockHint: '购买开包预览后可能出现。',
    description: '补充包候选数量再 +1。',
    effects: [{ type: 'extra_pack_choice', amount: 1 }]
  },
  {
    id: 'money_ladder',
    name: '存款阶梯',
    price: 8,
    tier: 1,
    pairId: 'interest_cap',
    description: '利息上限 +$2。',
    effects: [{ type: 'interest_cap_bonus', amount: 2 }]
  },
  {
    id: 'money_tower',
    name: '存款高塔',
    price: 12,
    tier: 2,
    pairId: 'interest_cap',
    requiresVoucherId: 'money_ladder',
    unlockHint: '购买存款阶梯后可能出现。',
    description: '利息上限再 +$3。',
    effects: [{ type: 'interest_cap_bonus', amount: 3 }]
  },
  {
    id: 'small_savings',
    name: '小额储蓄',
    price: 8,
    tier: 1,
    pairId: 'interest_step',
    description: '每 $4 存款给 $1 利息，仍受利息上限限制。',
    effects: [{ type: 'interest_step_reduction', amount: 1 }]
  },
  {
    id: 'tight_savings',
    name: '密集储蓄',
    price: 12,
    tier: 2,
    pairId: 'interest_step',
    requiresVoucherId: 'small_savings',
    unlockHint: '购买小额储蓄后可能出现。',
    description: '每 $3 存款给 $1 利息，仍受利息上限限制。',
    effects: [{ type: 'interest_step_reduction', amount: 1 }]
  },
  {
    id: 'star_notice',
    name: '星图布告',
    price: 8,
    tier: 1,
    pairId: 'planet_weight',
    description: '商店中星球牌更常出现。',
    effects: [{ type: 'shop_item_weight_bonus', category: 'planet', amount: 10 }]
  },
  {
    id: 'star_chart',
    name: '星图索引',
    price: 12,
    tier: 2,
    pairId: 'planet_weight',
    requiresVoucherId: 'star_notice',
    unlockHint: '购买星图布告后可能出现。',
    description: '商店中星球牌进一步更常出现。',
    effects: [{ type: 'shop_item_weight_bonus', category: 'planet', amount: 15 }]
  },
  {
    id: 'arcana_notice',
    name: '秘仪布告',
    price: 8,
    tier: 1,
    pairId: 'tarot_weight',
    description: '商店中塔罗牌更常出现。',
    effects: [{ type: 'shop_item_weight_bonus', category: 'tarot', amount: 10 }]
  },
  {
    id: 'arcana_index',
    name: '秘仪索引',
    price: 12,
    tier: 2,
    pairId: 'tarot_weight',
    requiresVoucherId: 'arcana_notice',
    unlockHint: '购买秘仪布告后可能出现。',
    description: '商店中塔罗牌进一步更常出现。',
    effects: [{ type: 'shop_item_weight_bonus', category: 'tarot', amount: 15 }]
  }
];

export function getVoucherDefinition(definitionId: string): VoucherDefinition {
  const definition = VOUCHERS.find((voucher) => voucher.id === definitionId);

  if (!definition) {
    throw new Error(`找不到优惠券定义：${definitionId}`);
  }

  return definition;
}

export function getVoucherForShop(seed: string, ante: number, blindIndex: number, refreshCount: number, ownedVouchers: string[]): VoucherDefinition | null {
  const available = VOUCHERS.filter(
    (voucher) =>
      !ownedVouchers.includes(voucher.id) &&
      (!voucher.requiresVoucherId || ownedVouchers.includes(voucher.requiresVoucherId))
  );

  if (available.length === 0) {
    return null;
  }

  const rng = createRng(`${seed}:voucher:${ante}:${blindIndex}:${refreshCount}:${ownedVouchers.join(',')}`);
  return available[Math.floor(rng.next() * available.length)];
}

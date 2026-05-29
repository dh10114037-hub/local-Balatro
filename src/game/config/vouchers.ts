import { createRng } from '../random';
import type { VoucherDefinition } from '../types';

export const VOUCHERS: VoucherDefinition[] = [
  {
    id: 'wide_pockets',
    name: '宽口袋',
    price: 8,
    description: '小丑槽位 +1。',
    effects: [{ type: 'extra_joker_slot', amount: 1 }]
  },
  {
    id: 'deep_satchel',
    name: '深挎包',
    price: 8,
    description: '消耗牌槽位 +1。',
    effects: [{ type: 'extra_consumable_slot', amount: 1 }]
  },
  {
    id: 'long_fingers',
    name: '长指节',
    price: 10,
    description: '手牌上限 +1。',
    effects: [{ type: 'extra_hand_size', amount: 1 }]
  },
  {
    id: 'steady_pace',
    name: '稳步节奏',
    price: 9,
    description: '每个盲注出牌次数 +1。',
    effects: [{ type: 'extra_hand_per_blind', amount: 1 }]
  },
  {
    id: 'spare_throw',
    name: '备用弃牌',
    price: 7,
    description: '每个盲注弃牌次数 +1。',
    effects: [{ type: 'extra_discard_per_blind', amount: 1 }]
  },
  {
    id: 'cheap_shuffle',
    name: '廉价刷新',
    price: 7,
    description: '商店刷新费用 -$1，最低为 $0。',
    effects: [{ type: 'reroll_discount', amount: 1 }]
  },
  {
    id: 'wholesale',
    name: '批发价',
    price: 10,
    description: '商店普通商品价格 -$1。',
    effects: [{ type: 'shop_discount', amount: 1 }]
  },
  {
    id: 'pack_coupon',
    name: '开包券',
    price: 7,
    description: '补充包价格 -$2。',
    effects: [{ type: 'pack_discount', amount: 2 }]
  },
  {
    id: 'bonus_contract',
    name: '奖金合同',
    price: 8,
    description: '通过每个盲注时额外获得 $1。',
    effects: [{ type: 'bonus_blind_reward', amount: 1 }]
  },
  {
    id: 'boss_notes',
    name: '首领笔记',
    price: 9,
    description: '首领盲注目标分降低 10%。',
    effects: [{ type: 'boss_target_discount', ratio: 0.1 }]
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
  const available = VOUCHERS.filter((voucher) => !ownedVouchers.includes(voucher.id));

  if (available.length === 0) {
    return null;
  }

  const rng = createRng(`${seed}:voucher:${ante}:${blindIndex}:${refreshCount}:${ownedVouchers.join(',')}`);
  return available[Math.floor(rng.next() * available.length)];
}

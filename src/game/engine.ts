import { drawCards, formatCard, RANKS, RANK_VALUES, shuffleDeck, SUITS } from './deck';
import { getBlindDefinition, MAX_ANTE } from './config/blinds';
import { getBossDefinition } from './config/bosses';
import { createDeckCards, DEFAULT_DECK_ID, getDeckDefinition } from './config/decks';
import {
  CONSUMABLES,
  createConsumableInstance,
  getConsumableDefinition,
  getConsumableLabel,
  PLANET_CARDS,
  TAROT_CARDS
} from './config/consumables';
import { POKER_HAND_ORDER } from './config/handScores';
import { createJokerInstance, getJokerDefinition, getJokerSellValue, JOKERS } from './config/jokers';
import { getPackDefinition, getSpectralDefinition, PACKS, SPECTRAL_CARDS } from './config/packs';
import { DEFAULT_STAKE_ID, getStakeDefinition } from './config/stakes';
import { createTagInstance, getTagDefinition, getTagForBlind } from './config/tags';
import { getVoucherDefinition, getVoucherForShop } from './config/vouchers';
import { createRng } from './random';
import { scorePlayedCardsWithJokers } from './scoring';
import type {
  BlindDefinition,
  BossEffect,
  Card,
  CardEnhancement,
  GameState,
  HandLevels,
  JokerRarity,
  PackChoice,
  ScoringEvent,
  ScoringLog,
  ShopItem,
  SpectralEffect,
  TagEffect,
  VoucherEffect
} from './types';

export const DEFAULT_TARGET_SCORE = 300;
export const DEFAULT_HAND_SIZE = 8;
export const DEFAULT_HANDS = 4;
export const DEFAULT_DISCARDS = 3;
export const MAX_SELECTED_CARDS = 5;
export const DEFAULT_SEED = '本地种子';
export const DEFAULT_JOKER_SLOTS = 5;
export const DEFAULT_CONSUMABLE_SLOTS = 2;
export const SHOP_OFFER_COUNT = 4;
export const STARTING_REROLL_COST = 3;
export const PACK_PRICE = 4;
export const GOLD_CARD_PAYOUT = 3;
export const INTEREST_MONEY_STEP = 5;
export const MAX_INTEREST_PAYOUT = 5;
export const GAME_SAVE_VERSION = 2;

const SHOP_ITEM_WEIGHTS = {
  joker: 45,
  tarot: 18,
  planet: 17,
  pack: 15,
  voucher: 5
} as const;

const JOKER_RARITY_WEIGHTS: Record<JokerRarity, number> = {
  common: 70,
  uncommon: 25,
  rare: 5
};

const PACK_WEIGHTS: Record<string, number> = {
  standard_pack: 30,
  planet_pack: 20,
  tarot_pack: 22,
  joker_pack: 18,
  spectral_pack: 10
};

const STANDARD_PACK_ENHANCEMENT_WEIGHTS: Record<CardEnhancement | 'none', number> = {
  none: 55,
  bonus: 12,
  mult: 10,
  wild: 7,
  glass: 6,
  steel: 4,
  gold: 4,
  stone: 2
};

export type InitialGameOptions = {
  deckId?: string;
  stakeId?: string;
  endless?: boolean;
};

export function createDefaultHandLevels(): HandLevels {
  return POKER_HAND_ORDER.reduce(
    (levels, hand) => ({
      ...levels,
      [hand]: 1
    }),
    {} as HandLevels
  );
}

function getVoucherEffects(state: Pick<GameState, 'ownedVouchers'>): VoucherEffect[] {
  return state.ownedVouchers.flatMap((voucherId) => getVoucherDefinition(voucherId).effects);
}

function sumVoucherEffect(state: Pick<GameState, 'ownedVouchers'>, type: VoucherEffect['type']): number {
  return getVoucherEffects(state)
    .filter((effect) => effect.type === type && 'amount' in effect)
    .reduce((total, effect) => total + ('amount' in effect ? effect.amount : 0), 0);
}

function sumShopItemWeightBonus(
  state: Pick<GameState, 'ownedVouchers'>,
  category: keyof typeof SHOP_ITEM_WEIGHTS
): number {
  return getVoucherEffects(state)
    .filter((effect) => effect.type === 'shop_item_weight_bonus' && effect.category === category)
    .reduce((total, effect) => total + (effect.type === 'shop_item_weight_bonus' ? effect.amount : 0), 0);
}

type JokerMoneyEffectType = 'blind_clear_money' | 'reroll_discount' | 'sell_bonus_money';

function sumJokerMoneyEffect(state: Pick<GameState, 'jokers'>, type: JokerMoneyEffectType): number {
  return state.jokers
    .flatMap((joker) => getJokerDefinition(joker.definitionId).effects)
    .filter((effect) => effect.type === type)
    .reduce((total, effect) => total + (effect.type === type ? effect.amount : 0), 0);
}

function getInterestStep(state?: Pick<GameState, 'ownedVouchers'>): number {
  return Math.max(1, INTEREST_MONEY_STEP - (state ? sumVoucherEffect(state, 'interest_step_reduction') : 0));
}

function getInterestCap(state?: Pick<GameState, 'ownedVouchers'>): number {
  return MAX_INTEREST_PAYOUT + (state ? sumVoucherEffect(state, 'interest_cap_bonus') : 0);
}

export function calculateInterest(money: number, state?: Pick<GameState, 'ownedVouchers'>): number {
  return Math.max(0, Math.min(getInterestCap(state), Math.floor(money / getInterestStep(state))));
}

function getBossTargetDiscount(state: Pick<GameState, 'ownedVouchers'>): number {
  return getVoucherEffects(state)
    .filter((effect) => effect.type === 'boss_target_discount')
    .reduce((total, effect) => total + (effect.type === 'boss_target_discount' ? effect.ratio : 0), 0);
}

function getBossEffects(bossId: string | null): BossEffect[] {
  return bossId ? getBossDefinition(bossId).effects : [];
}

type BlindModifierState = Pick<GameState, 'ownedVouchers'> &
  Partial<Pick<GameState, 'deckId' | 'stakeId'>>;

function applyBlindModifiers(blind: BlindDefinition, state: BlindModifierState): BlindDefinition {
  const stake = getStakeDefinition(state.stakeId ?? DEFAULT_STAKE_ID);
  const deck = getDeckDefinition(state.deckId ?? DEFAULT_DECK_ID);
  let targetScore = Math.max(1, Math.floor(blind.targetScore * stake.targetMultiplier));
  let reward = Math.max(0, blind.reward + stake.rewardDelta + (deck.modifiers.blindRewardBonus ?? 0));

  if (blind.kind === 'boss') {
    const discount = getBossTargetDiscount(state);

    if (discount > 0) {
      targetScore = Math.max(1, Math.floor(targetScore * (1 - discount)));
    }
  }

  return {
    ...blind,
    targetScore,
    reward
  };
}

export function getBlindForState(
  state: Pick<GameState, 'ante' | 'blindIndex' | 'seed'> & BlindModifierState,
  blindIndex = state.blindIndex
): BlindDefinition {
  return applyBlindModifiers(getBlindDefinition(state.ante, blindIndex, state.seed), state);
}

export function getBlindChoicesForState(
  state: Pick<GameState, 'ante' | 'seed'> & BlindModifierState
): BlindDefinition[] {
  return [0, 1, 2].map((blindIndex) =>
    applyBlindModifiers(getBlindDefinition(state.ante, blindIndex, state.seed), state)
  );
}

function getStartingRerollCost(state: Pick<GameState, 'ownedVouchers' | 'jokers'>, freeReroll = false): number {
  if (freeReroll) {
    return 0;
  }

  return Math.max(0, STARTING_REROLL_COST - sumVoucherEffect(state, 'reroll_discount') - sumJokerMoneyEffect(state, 'reroll_discount'));
}

function getRerollCostForRefreshCount(state: Pick<GameState, 'ownedVouchers' | 'jokers'>, refreshCount: number): number {
  return Math.max(
    0,
    STARTING_REROLL_COST + refreshCount - sumVoucherEffect(state, 'reroll_discount') - sumJokerMoneyEffect(state, 'reroll_discount')
  );
}

function getEffectiveHandSize(state: Pick<GameState, 'ownedVouchers' | 'baseHandSize'>, bossId: string | null): number {
  const bossDelta = getBossEffects(bossId)
    .filter((effect) => effect.type === 'hand_size_delta')
    .reduce((total, effect) => total + (effect.type === 'hand_size_delta' ? effect.amount : 0), 0);

  return Math.max(1, state.baseHandSize + sumVoucherEffect(state, 'extra_hand_size') + bossDelta);
}

function getPendingTagEffects(state: Pick<GameState, 'pendingTags'>): Array<{ tagId: string; effect: TagEffect }> {
  return state.pendingTags.flatMap((tag) =>
    getTagDefinition(tag.definitionId).effects.map((effect) => ({
      tagId: tag.instanceId,
      effect
    }))
  );
}

function fillHand(state: GameState): GameState {
  const cardsNeeded = Math.max(0, state.handSize - state.hand.length);
  const { drawn, remaining } = drawCards(state.drawPile, cardsNeeded);

  return {
    ...state,
    hand: [...state.hand, ...drawn],
    drawPile: remaining
  };
}

function createBlindDeck(seed: string, ante: number, blindIndex: number, deck: Card[]): Card[] {
  return shuffleDeck(deck, createRng(`${seed}:ante-${ante}:blind-${blindIndex}`));
}

type ShopAdjustments = {
  shopDiscount?: number;
  voucherDiscount?: number;
  extraOffers?: ShopItem[];
};

function discountPrice(price: number, amount: number, state?: Pick<GameState, 'stakeId'>): number {
  const stakePriceDelta = state ? getStakeDefinition(state.stakeId).shopPriceDelta : 0;
  return Math.max(0, price + stakePriceDelta - amount);
}

function pickWeighted<T extends string>(rng: { next: () => number }, weights: Record<T, number>): T {
  const entries = Object.entries(weights) as Array<[T, number]>;
  const totalWeight = entries.reduce((total, [, weight]) => total + weight, 0);
  let roll = rng.next() * totalWeight;

  for (const [item, weight] of entries) {
    roll -= weight;
    if (roll <= 0) {
      return item;
    }
  }

  return entries[entries.length - 1][0];
}

function getOfferKey(offer: ShopItem): string {
  return `${offer.kind}:${offer.definitionId ?? offer.id}`;
}

function applyFirstShopJokerGuarantee(
  state: GameState,
  refreshCount: number,
  offers: ShopItem[],
  shopDiscount: number
): ShopItem[] {
  if (state.ante !== 1 || state.blindIndex !== 0 || refreshCount !== 0) {
    return offers;
  }

  if (offers.some((offer) => offer.kind === 'joker' && offer.price <= state.money)) {
    return offers;
  }

  const starterIds = ['chip_starter', 'mult_starter'];
  const existingStarterIndex = offers.findIndex((offer) => offer.kind === 'joker' && offer.definitionId && starterIds.includes(offer.definitionId));
  const existingDefinitionIds = new Set(offers.map((offer) => offer.definitionId).filter(Boolean));
  const definitionId =
    existingStarterIndex >= 0
      ? offers[existingStarterIndex].definitionId ?? 'chip_starter'
      : starterIds.find((starterId) => !existingDefinitionIds.has(starterId)) ?? 'chip_starter';
  const definition = getJokerDefinition(definitionId);
  const guaranteedOffer: ShopItem = {
    id: `offer-${state.ante}-${state.blindIndex}-${refreshCount}-first-shop-${definitionId}`,
    kind: 'joker',
    definitionId,
    price: Math.max(0, Math.min(discountPrice(definition.price, shopDiscount, state), state.money))
  };

  if (existingStarterIndex >= 0) {
    return offers.map((offer, index) => (index === existingStarterIndex ? guaranteedOffer : offer));
  }

  return offers.map((offer, index) => (index === offers.length - 1 ? guaranteedOffer : offer));
}

function createShopOffers(state: GameState, refreshCount: number, adjustments: ShopAdjustments = {}): ShopItem[] {
  const rng = createRng(`${state.seed}:shop:${state.ante}:${state.blindIndex}:${refreshCount}`);
  const chosenIds = new Set<string>();
  const offers: ShopItem[] = [];
  const shopDiscount = sumVoucherEffect(state, 'shop_discount') + (adjustments.shopDiscount ?? 0);
  const packDiscount = sumVoucherEffect(state, 'pack_discount') + shopDiscount;
  const offerCount = SHOP_OFFER_COUNT + sumVoucherEffect(state, 'extra_shop_offer');
  const shopWeights = {
    joker: SHOP_ITEM_WEIGHTS.joker + sumShopItemWeightBonus(state, 'joker'),
    tarot: SHOP_ITEM_WEIGHTS.tarot + sumShopItemWeightBonus(state, 'tarot'),
    planet: SHOP_ITEM_WEIGHTS.planet + sumShopItemWeightBonus(state, 'planet'),
    pack: SHOP_ITEM_WEIGHTS.pack + sumShopItemWeightBonus(state, 'pack'),
    voucher: SHOP_ITEM_WEIGHTS.voucher + sumShopItemWeightBonus(state, 'voucher')
  } as const;

  function addJokerOffer(definitionId: string) {
    const key = `joker:${definitionId}`;
    if (chosenIds.has(key)) {
      return;
    }

    const definition = getJokerDefinition(definitionId);
    chosenIds.add(key);
    offers.push({
      id: `offer-${state.ante}-${state.blindIndex}-${refreshCount}-${offers.length}-${definitionId}`,
      kind: 'joker',
      definitionId,
      price: discountPrice(definition.price, shopDiscount, state)
    });
  }

  function addConsumableOffer(definitionId: string) {
    const key = `consumable:${definitionId}`;
    if (chosenIds.has(key)) {
      return;
    }

    const definition = getConsumableDefinition(definitionId);
    chosenIds.add(key);
    offers.push({
      id: `offer-${state.ante}-${state.blindIndex}-${refreshCount}-${offers.length}-${definitionId}`,
      kind: 'consumable',
      definitionId,
      price: discountPrice(definition.price, shopDiscount, state)
    });
  }

  function addWeightedJokerOffer() {
    const rarity = pickWeighted(rng, JOKER_RARITY_WEIGHTS);
    const rarityPool = JOKERS.filter((joker) => joker.rarity === rarity && !chosenIds.has(`joker:${joker.id}`));
    const fallbackPool = JOKERS.filter((joker) => !chosenIds.has(`joker:${joker.id}`));
    const pool = rarityPool.length > 0 ? rarityPool : fallbackPool;

    if (pool.length === 0) {
      return;
    }

    addJokerOffer(pool[Math.floor(rng.next() * pool.length)].id);
  }

  function addConsumableFromPool(pool: typeof CONSUMABLES) {
    const available = pool.filter((definition) => !chosenIds.has(`consumable:${definition.id}`));

    if (available.length === 0) {
      return;
    }

    addConsumableOffer(available[Math.floor(rng.next() * available.length)].id);
  }

  function addPackOffer() {
    const packId = pickWeighted(rng, PACK_WEIGHTS);
    const definition = getPackDefinition(packId);
    offers.push({
      id: `offer-${state.ante}-${state.blindIndex}-${refreshCount}-${offers.length}-pack-${definition.id}`,
      kind: 'pack',
      definitionId: definition.id,
      price: discountPrice(definition.price, packDiscount, state)
    });
  }

  function addVoucherOffer() {
    if ([...chosenIds].some((key) => key.startsWith('voucher:'))) {
      return;
    }

    const voucher = getVoucherForShop(state.seed, state.ante, state.blindIndex, refreshCount, state.ownedVouchers);
    if (voucher) {
      const offer: ShopItem = {
        id: `offer-${state.ante}-${state.blindIndex}-${refreshCount}-${offers.length}-voucher-${voucher.id}`,
        kind: 'voucher',
        definitionId: voucher.id,
        price: discountPrice(voucher.price, adjustments.voucherDiscount ?? 0, state)
      };
      chosenIds.add(getOfferKey(offer));
      offers.push(offer);
    }
  }

  let attempts = 0;
  while (offers.length < offerCount && attempts < offerCount * 20) {
    attempts += 1;
    const category = pickWeighted(rng, shopWeights);

    if (category === 'joker') {
      addWeightedJokerOffer();
    } else if (category === 'tarot') {
      addConsumableFromPool(TAROT_CARDS);
    } else if (category === 'planet') {
      addConsumableFromPool(PLANET_CARDS);
    } else if (category === 'pack') {
      addPackOffer();
    } else {
      addVoucherOffer();
    }
  }

  while (offers.length < offerCount) {
    addWeightedJokerOffer();
  }

  const guaranteedOffers = applyFirstShopJokerGuarantee(state, refreshCount, offers, shopDiscount);

  return [...guaranteedOffers, ...(adjustments.extraOffers ?? [])];
}

export function createInitialGame(seed = DEFAULT_SEED, options: InitialGameOptions = {}): GameState {
  const deckId = options.deckId ?? DEFAULT_DECK_ID;
  const stakeId = options.stakeId ?? DEFAULT_STAKE_ID;
  const deckDefinition = getDeckDefinition(deckId);
  const deckModifiers = deckDefinition.modifiers;
  const startingConsumableIds = deckModifiers.startingConsumables ?? [];
  const baseHandSize = Math.max(1, DEFAULT_HAND_SIZE + (deckModifiers.handSizeDelta ?? 0));
  const baseHands = Math.max(1, DEFAULT_HANDS + (deckModifiers.handsDelta ?? 0));
  const baseDiscards = Math.max(0, DEFAULT_DISCARDS + (deckModifiers.discardsDelta ?? 0));
  const ownedVouchers: string[] = [];
  const firstBlind = getBlindForState({
    ante: 1,
    blindIndex: 0,
    seed,
    deckId,
    stakeId,
    ownedVouchers
  });

  return {
    saveVersion: GAME_SAVE_VERSION,
    runId: `${seed}:${deckId}:${stakeId}:${options.endless ? 'endless' : 'normal'}`,
    seed,
    deckId,
    stakeId,
    endless: options.endless ?? false,
    phase: 'blind_select',
    status: 'playing',
    ante: 1,
    blindIndex: 0,
    money: deckModifiers.startingMoney ?? 0,
    currentBlind: null,
    activeBossId: null,
    deck: createDeckCards(deckId),
    handLevels: createDefaultHandLevels(),
    jokers: [],
    jokerSlots: DEFAULT_JOKER_SLOTS + (deckModifiers.jokerSlotsDelta ?? 0),
    consumables: startingConsumableIds.map((definitionId, index) => createConsumableInstance(definitionId, index + 1)),
    consumableSlots: DEFAULT_CONSUMABLE_SLOTS + (deckModifiers.consumableSlotsDelta ?? 0),
    selectedConsumableId: null,
    packChoices: [],
    pendingTags: [],
    ownedVouchers,
    shopOffers: [],
    shopRerollCost: STARTING_REROLL_COST,
    shopRefreshCount: 0,
    nextJokerInstanceNumber: 1,
    nextConsumableInstanceNumber: startingConsumableIds.length + 1,
    nextTagInstanceNumber: 1,
    nextCardCopyNumber: 1,
    targetScore: firstBlind.targetScore,
    currentScore: 0,
    baseHandSize,
    baseHands,
    baseDiscards,
    handsRemaining: 0,
    discardsRemaining: 0,
    handSize: baseHandSize,
    drawPile: [],
    hand: [],
    selectedCardIds: [],
    discardPile: [],
    lastScoringLog: null,
    lastTriggeredJokerIds: [],
    runHighestSingleHandScore: 0,
    playedHandsThisBlind: 0,
    playedHandTypesThisBlind: [],
    message: `选择当前盲注开始。当前使用${deckDefinition.name}与${getStakeDefinition(stakeId).name}${options.endless ? '，无尽模式已开启' : ''}。`
  };
}

export function startCurrentBlind(state: GameState): GameState {
  if (state.phase !== 'blind_select') {
    return state;
  }

  const currentBlind = getBlindForState(state);
  const activeBossId = currentBlind.bossId ?? null;
  const bossEffects = getBossEffects(activeBossId);
  const handSize = getEffectiveHandSize(state, activeBossId);
  const blindStartTagEffects = getPendingTagEffects(state).filter(
    ({ effect }) => effect.type === 'extra_hand_next_blind' || effect.type === 'extra_discard_next_blind'
  );
  const consumedTagIds = new Set(blindStartTagEffects.map(({ tagId }) => tagId));
  const extraHands = blindStartTagEffects
    .filter(({ effect }) => effect.type === 'extra_hand_next_blind')
    .reduce((total, { effect }) => total + (effect.type === 'extra_hand_next_blind' ? effect.amount : 0), 0);
  const extraDiscards = blindStartTagEffects
    .filter(({ effect }) => effect.type === 'extra_discard_next_blind')
    .reduce((total, { effect }) => total + (effect.type === 'extra_discard_next_blind' ? effect.amount : 0), 0);
  const noDiscards = bossEffects.some((effect) => effect.type === 'no_discards');
  const deck = createBlindDeck(state.seed, state.ante, state.blindIndex, state.deck);
  const { drawn, remaining } = drawCards(deck, handSize);

  return {
    ...state,
    phase: 'playing',
    status: 'playing',
    currentBlind,
    activeBossId,
    targetScore: currentBlind.targetScore,
    currentScore: 0,
    handsRemaining: state.baseHands + sumVoucherEffect(state, 'extra_hand_per_blind') + extraHands,
    discardsRemaining: noDiscards ? 0 : state.baseDiscards + sumVoucherEffect(state, 'extra_discard_per_blind') + extraDiscards,
    handSize,
    drawPile: remaining,
    hand: drawn,
    selectedCardIds: [],
    selectedConsumableId: null,
    packChoices: [],
    discardPile: [],
    pendingTags: state.pendingTags.filter((tag) => !consumedTagIds.has(tag.instanceId)),
    lastScoringLog: null,
    lastTriggeredJokerIds: [],
    playedHandsThisBlind: 0,
    playedHandTypesThisBlind: [],
    message: `开始 ${currentBlind.name}：达到 ${currentBlind.targetScore} 分即可进入商店。`
  };
}

export function advanceFromShop(state: GameState): GameState {
  if (state.phase !== 'shop') {
    return state;
  }

  if (state.packChoices.length > 0) {
    return {
      ...state,
      message: '先从补充包里选择一张牌，再进入下一盲注。'
    };
  }

  const nextBlindIndex = state.blindIndex + 1;
  const nextAnte = nextBlindIndex > 2 ? state.ante + 1 : state.ante;
  const normalizedBlindIndex = nextBlindIndex > 2 ? 0 : nextBlindIndex;
  const nextBlind = getBlindForState(
    {
      ...state,
      ante: nextAnte,
      blindIndex: normalizedBlindIndex
    },
    normalizedBlindIndex
  );

  return {
    ...state,
    phase: 'blind_select',
    status: 'playing',
    ante: nextAnte,
    blindIndex: normalizedBlindIndex,
    currentBlind: null,
    activeBossId: null,
    targetScore: nextBlind.targetScore,
    currentScore: 0,
    handsRemaining: 0,
    discardsRemaining: 0,
    drawPile: [],
    hand: [],
    selectedCardIds: [],
    selectedConsumableId: null,
    packChoices: [],
    discardPile: [],
    lastScoringLog: null,
    lastTriggeredJokerIds: [],
    playedHandsThisBlind: 0,
    playedHandTypesThisBlind: [],
    message:
      normalizedBlindIndex === 0
        ? `进入第 ${nextAnte} 层。选择小盲继续。`
        : `商店阶段结束。下一关是 ${nextBlind.name}。`
  };
}

export function skipCurrentBlind(state: GameState): GameState {
  if (state.phase !== 'blind_select') {
    return state;
  }

  if (state.blindIndex >= 2) {
    return {
      ...state,
      message: '首领盲注不能跳过。'
    };
  }

  const currentBlind = getBlindForState(state);
  const tagDefinition = getTagForBlind(state.seed, state.ante, state.blindIndex);
  const nextBlindIndex = state.blindIndex + 1;
  const nextBlind = getBlindForState(
    {
      ...state,
      blindIndex: nextBlindIndex
    },
    nextBlindIndex
  );

  return {
    ...state,
    blindIndex: nextBlindIndex,
    currentBlind: null,
    activeBossId: null,
    targetScore: nextBlind.targetScore,
    pendingTags: [...state.pendingTags, createTagInstance(tagDefinition.id, state.nextTagInstanceNumber)],
    nextTagInstanceNumber: state.nextTagInstanceNumber + 1,
    message: `已跳过${currentBlind.name}，不会获得普通奖励；获得${tagDefinition.name}：${tagDefinition.description}`
  };
}

function updateCardEverywhere(state: GameState, cardId: string, update: (card: Card) => Card): GameState {
  const updateCards = (cards: Card[]) => cards.map((card) => (card.id === cardId ? update(card) : card));

  return {
    ...state,
    deck: updateCards(state.deck),
    drawPile: updateCards(state.drawPile),
    hand: updateCards(state.hand),
    discardPile: updateCards(state.discardPile)
  };
}

function removeCardsEverywhere(state: GameState, cardIds: string[]): GameState {
  if (cardIds.length === 0) {
    return state;
  }

  const removeSet = new Set(cardIds);
  const keepCard = (card: Card) => !removeSet.has(card.id);

  return {
    ...state,
    deck: state.deck.filter(keepCard),
    drawPile: state.drawPile.filter(keepCard),
    hand: state.hand.filter(keepCard),
    discardPile: state.discardPile.filter(keepCard),
    selectedCardIds: state.selectedCardIds.filter((cardId) => !removeSet.has(cardId))
  };
}

function removeConsumable(state: GameState, instanceId: string): GameState {
  return {
    ...state,
    consumables: state.consumables.filter((consumable) => consumable.instanceId !== instanceId),
    selectedConsumableId: state.selectedConsumableId === instanceId ? null : state.selectedConsumableId
  };
}

function pickUniqueDefinitions<T extends { id: string }>(pool: T[], rng: { next: () => number }, count: number): T[] {
  const available = [...pool];
  const picked: T[] = [];

  while (available.length > 0 && picked.length < count) {
    const index = Math.floor(rng.next() * available.length);
    const [definition] = available.splice(index, 1);
    picked.push(definition);
  }

  return picked;
}

function createStandardPackCard(state: GameState, offerId: string, index: number, rng: { next: () => number }): Card {
  const suit = SUITS[Math.floor(rng.next() * SUITS.length)];
  const rank = RANKS[Math.floor(rng.next() * RANKS.length)];
  const enhancement = pickWeighted(rng, STANDARD_PACK_ENHANCEMENT_WEIGHTS);

  return {
    id: `pack-${state.ante}-${state.blindIndex}-${state.shopRefreshCount}-${offerId}-${state.nextCardCopyNumber + index}`,
    suit,
    rank,
    ...(enhancement === 'none' ? {} : { enhancement })
  };
}

function createPackChoices(
  state: GameState,
  offerId: string,
  packId: string | undefined
): { choices: PackChoice[]; nextConsumableNumber: number; nextCardCopyNumber: number } {
  const pack = getPackDefinition(packId);
  const rng = createRng(`${state.seed}:pack:${state.ante}:${state.blindIndex}:${state.shopRefreshCount}:${offerId}`);
  let nextConsumableNumber = state.nextConsumableInstanceNumber;
  let nextCardCopyNumber = state.nextCardCopyNumber;
  let choices: PackChoice[] = [];
  const choiceCount = pack.choiceCount + sumVoucherEffect(state, 'extra_pack_choice');

  if (pack.kind === 'standard') {
    choices = Array.from({ length: choiceCount }, (_, index) => ({
      instanceId: `pack-choice-${state.nextCardCopyNumber + index}`,
      packId: pack.id,
      kind: 'playing_card' as const,
      card: createStandardPackCard(state, offerId, index, rng)
    }));
    nextCardCopyNumber += choices.length;
  }

  if (pack.kind === 'planet') {
    choices = pickUniqueDefinitions(PLANET_CARDS, rng, choiceCount).map((definition) => {
      const choice = createConsumableInstance(definition.id, nextConsumableNumber);
      nextConsumableNumber += 1;
      return {
        ...choice,
        packId: pack.id,
        kind: 'consumable' as const
      };
    });
  }

  if (pack.kind === 'tarot') {
    choices = pickUniqueDefinitions(TAROT_CARDS, rng, choiceCount).map((definition) => {
      const choice = createConsumableInstance(definition.id, nextConsumableNumber);
      nextConsumableNumber += 1;
      return {
        ...choice,
        packId: pack.id,
        kind: 'consumable' as const
      };
    });
  }

  if (pack.kind === 'joker') {
    choices = pickUniqueDefinitions(JOKERS, rng, choiceCount).map((definition, index) => ({
      instanceId: `pack-joker-${state.nextJokerInstanceNumber + index}`,
      packId: pack.id,
      kind: 'joker' as const,
      definitionId: definition.id
    }));
  }

  if (pack.kind === 'spectral') {
    choices = pickUniqueDefinitions(SPECTRAL_CARDS, rng, choiceCount).map((definition, index) => ({
      instanceId: `pack-spectral-${state.ante}-${state.blindIndex}-${state.shopRefreshCount}-${index}`,
      packId: pack.id,
      kind: 'spectral' as const,
      definitionId: definition.id
    }));
  }

  return {
    choices,
    nextConsumableNumber,
    nextCardCopyNumber
  };
}

function getPackBlockedReason(state: GameState, packId: string | undefined): string | null {
  const pack = getPackDefinition(packId);

  if ((pack.kind === 'planet' || pack.kind === 'tarot') && state.consumables.length >= state.consumableSlots) {
    return '消耗牌槽位已满，无法打开这个补充包。';
  }

  if (pack.kind === 'joker' && state.jokers.length >= state.jokerSlots) {
    return '小丑槽位已满，先卖出一张再打开小丑包。';
  }

  return null;
}

function countGoldHeldCards(cards: Card[]): number {
  return cards.filter((card) => card.enhancement === 'gold').length;
}

function getBossDisabledCardReasons(bossId: string | null, cards: Card[]): Record<string, string> {
  const reasons: Record<string, string> = {};

  getBossEffects(bossId).forEach((effect) => {
    cards.forEach((card) => {
      if (effect.type === 'debuff_suit' && card.suit === effect.suit) {
        reasons[card.id] = '首领规则：该花色不计分';
      }

      if (effect.type === 'debuff_rank' && card.rank === effect.rank) {
        reasons[card.id] = '首领规则：该点数不计分';
      }

      if (effect.type === 'debuff_face_cards' && (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K')) {
        reasons[card.id] = '首领规则：人头牌不计分';
      }
    });
  });

  return reasons;
}

function getDisabledJokerRarities(bossId: string | null): JokerRarity[] {
  return getBossEffects(bossId)
    .filter((effect) => effect.type === 'disable_joker_rarity')
    .map((effect) => (effect.type === 'disable_joker_rarity' ? effect.rarity : 'common'));
}

function getBossSelectionLimit(bossId: string | null): number | null {
  const limits = getBossEffects(bossId)
    .filter((effect) => effect.type === 'max_selected_cards')
    .map((effect) => (effect.type === 'max_selected_cards' ? effect.max : MAX_SELECTED_CARDS));

  if (limits.length === 0) {
    return null;
  }

  return Math.max(1, Math.min(...limits));
}

function createScoringEvent(id: string, event: Omit<ScoringEvent, 'id'>): ScoringEvent {
  return {
    id,
    ...event
  };
}

function createFinalScoringEvent(log: ScoringLog): ScoringEvent {
  const rawScore = Math.floor(log.finalChips * log.finalMult);
  const description =
    log.finalScore === rawScore
      ? `${log.finalChips} 筹码 × ${log.finalMult} 倍率 = ${log.finalScore}`
      : `规则修正后最终分 = ${log.finalScore}（原始 ${log.finalChips} 筹码 × ${log.finalMult} 倍率 = ${rawScore}）`;

  return createScoringEvent('final-score', {
    stage: 'final',
    label: '最终分',
    description,
    chipsAfter: log.finalChips,
    multAfter: log.finalMult,
    scoreAfter: log.finalScore
  });
}

function appendRuleScoringEvent(
  log: ScoringLog,
  source: string,
  description: string,
  values: Partial<Pick<ScoringEvent, 'chipsDelta' | 'multDelta' | 'multFactor'>> = {}
): ScoringLog {
  const eventsWithoutFinal = log.events.filter((event) => event.stage !== 'final');
  const nextLog = {
    ...log,
    events: [
      ...eventsWithoutFinal,
      createScoringEvent(`rule-${eventsWithoutFinal.length}`, {
        stage: 'rule',
        label: source,
        description,
        ...values,
        chipsAfter: log.finalChips,
        multAfter: log.finalMult,
        scoreAfter: log.finalScore
      })
    ]
  };

  return {
    ...nextLog,
    events: [...nextLog.events, createFinalScoringEvent(nextLog)]
  };
}

function zeroScoringLog(log: ScoringLog, source: string, description: string): ScoringLog {
  const nextLog = {
    ...log,
    modifiers: [...log.modifiers, { source, description }],
    finalScore: 0
  };

  return appendRuleScoringEvent(nextLog, source, description);
}

function applyBossScoringRules(state: GameState, selectedCards: Card[], log: ScoringLog): ScoringLog {
  return getBossEffects(state.activeBossId).reduce((nextLog, effect) => {
    if (effect.type === 'force_five_cards' && selectedCards.length !== 5) {
      return zeroScoringLog(nextLog, '首领规则', '本盲注必须正好打出 5 张牌，本手不得分。');
    }

    if (effect.type === 'no_repeat_hand' && state.playedHandTypesThisBlind.includes(nextLog.hand)) {
      return zeroScoringLog(nextLog, '首领规则', `本盲注已经打出过${nextLog.handName}，本手不得分。`);
    }

    if (effect.type === 'first_hand_min_score_ratio' && state.playedHandsThisBlind === 0) {
      const requiredScore = Math.ceil(state.targetScore * effect.ratio);
      if (nextLog.finalScore < requiredScore) {
        return zeroScoringLog(nextLog, '首领规则', `第一次出牌至少需要 ${requiredScore} 分，本手不得分。`);
      }
    }

    if (effect.type === 'forbid_hand_types' && effect.hands.includes(nextLog.hand)) {
      return zeroScoringLog(nextLog, '首领规则', `本盲注禁止${nextLog.handName}得分，本手不得分。`);
    }

    if (effect.type === 'require_hand_types' && !effect.hands.includes(nextLog.hand)) {
      return zeroScoringLog(nextLog, '首领规则', `本盲注不允许${nextLog.handName}得分，本手不得分。`);
    }

    if (effect.type === 'first_hand_score_factor' && state.playedHandsThisBlind === 0) {
      const finalMult = nextLog.finalMult * effect.factor;
      const adjustedLog = {
        ...nextLog,
        finalMult,
        finalScore: Math.floor(nextLog.finalChips * finalMult),
        modifiers: [
          ...nextLog.modifiers,
          {
            source: '首领规则',
            description: `第一次出牌倍率 ×${effect.factor}`,
            multFactor: effect.factor
          }
        ]
      };

      return appendRuleScoringEvent(adjustedLog, '首领规则', `第一次出牌倍率 ×${effect.factor}`, {
        multFactor: effect.factor
      });
    }

    return nextLog;
  }, log);
}

type ShopEntryResult = {
  state: GameState;
  adjustments: ShopAdjustments & { freeReroll?: boolean };
  messages: string[];
};

function applyShopEntryTags(state: GameState): ShopEntryResult {
  const consumedTagIds = new Set<string>();
  const adjustments: ShopEntryResult['adjustments'] = {};
  const messages: string[] = [];
  let nextState = state;

  getPendingTagEffects(state).forEach(({ tagId, effect }) => {
    if (
      effect.type !== 'gain_money_next_shop' &&
      effect.type !== 'free_shop_next_shop' &&
      effect.type !== 'free_reroll_next_shop' &&
      effect.type !== 'discount_next_shop' &&
      effect.type !== 'voucher_discount_next_shop' &&
      effect.type !== 'free_pack_next_shop' &&
      effect.type !== 'free_common_joker_next_shop' &&
      effect.type !== 'free_rare_joker_next_shop' &&
      effect.type !== 'add_random_tarot_next_shop' &&
      effect.type !== 'upgrade_random_hand_next_shop'
    ) {
      return;
    }

    consumedTagIds.add(tagId);

    if (effect.type === 'gain_money_next_shop') {
      nextState = {
        ...nextState,
        money: nextState.money + effect.amount
      };
      messages.push(`标记兑现：获得 $${effect.amount}`);
    }

    if (effect.type === 'free_shop_next_shop') {
      adjustments.shopDiscount = (adjustments.shopDiscount ?? 0) + 99;
      adjustments.voucherDiscount = (adjustments.voucherDiscount ?? 0) + 99;
      messages.push('标记兑现：本次商店货架商品免费');
    }

    if (effect.type === 'free_reroll_next_shop') {
      adjustments.freeReroll = true;
      messages.push('标记兑现：本次商店首次刷新免费');
    }

    if (effect.type === 'discount_next_shop') {
      adjustments.shopDiscount = (adjustments.shopDiscount ?? 0) + effect.amount;
      messages.push(`标记兑现：本次商店商品价格 -$${effect.amount}`);
    }

    if (effect.type === 'voucher_discount_next_shop') {
      adjustments.voucherDiscount = (adjustments.voucherDiscount ?? 0) + effect.amount;
      messages.push(`标记兑现：本次商店优惠券价格 -$${effect.amount}`);
    }

    if (effect.type === 'free_pack_next_shop') {
      adjustments.extraOffers = [
        ...(adjustments.extraOffers ?? []),
        {
          id: `tag-${tagId}-free-pack`,
          kind: 'pack',
          definitionId: 'standard_pack',
          price: 0
        }
      ];
      messages.push('标记兑现：额外出现免费补充包');
    }

    if (effect.type === 'free_common_joker_next_shop') {
      const rng = createRng(`${nextState.seed}:tag-free-joker:${tagId}`);
      const commonJokers = JOKERS.filter((joker) => joker.rarity === 'common');
      const definition = commonJokers[Math.floor(rng.next() * commonJokers.length)];
      adjustments.extraOffers = [
        ...(adjustments.extraOffers ?? []),
        {
          id: `tag-${tagId}-free-joker-${definition.id}`,
          kind: 'joker',
          definitionId: definition.id,
          price: 0
        }
      ];
      messages.push('标记兑现：额外出现免费普通小丑');
    }

    if (effect.type === 'free_rare_joker_next_shop') {
      const rng = createRng(`${nextState.seed}:tag-rare-joker:${tagId}`);
      const rareJokers = JOKERS.filter((joker) => joker.rarity === 'rare');
      const pool = rareJokers.length > 0 ? rareJokers : JOKERS;
      const definition = pool[Math.floor(rng.next() * pool.length)];
      adjustments.extraOffers = [
        ...(adjustments.extraOffers ?? []),
        {
          id: `tag-${tagId}-rare-joker-${definition.id}`,
          kind: 'joker',
          definitionId: definition.id,
          price: 0
        }
      ];
      messages.push('标记兑现：额外出现免费稀有小丑');
    }

    if (effect.type === 'add_random_tarot_next_shop') {
      if (nextState.consumables.length < nextState.consumableSlots) {
        const rng = createRng(`${nextState.seed}:tag-tarot:${tagId}`);
        const definition = TAROT_CARDS[Math.floor(rng.next() * TAROT_CARDS.length)];
        nextState = {
          ...nextState,
          consumables: [...nextState.consumables, createConsumableInstance(definition.id, nextState.nextConsumableInstanceNumber)],
          nextConsumableInstanceNumber: nextState.nextConsumableInstanceNumber + 1
        };
        messages.push(`标记兑现：获得${definition.name}`);
      } else {
        messages.push('标记兑现：消耗牌槽位已满，随机塔罗牌未领取');
      }
    }

    if (effect.type === 'upgrade_random_hand_next_shop') {
      const rng = createRng(`${nextState.seed}:tag-hand:${tagId}`);
      const hand = POKER_HAND_ORDER[Math.floor(rng.next() * POKER_HAND_ORDER.length)];
      nextState = {
        ...nextState,
        handLevels: {
          ...nextState.handLevels,
          [hand]: nextState.handLevels[hand] + effect.amount
        }
      };
      messages.push('标记兑现：随机牌型等级提升');
    }
  });

  return {
    state: {
      ...nextState,
      pendingTags: nextState.pendingTags.filter((tag) => !consumedTagIds.has(tag.instanceId))
    },
    adjustments,
    messages
  };
}

function enterShop(state: GameState, baseMessage: string): GameState {
  const tagResult = applyShopEntryTags(state);
  const shopOffers = createShopOffers(tagResult.state, 0, tagResult.adjustments);

  return {
    ...tagResult.state,
    shopOffers,
    shopRerollCost: getStartingRerollCost(tagResult.state, tagResult.adjustments.freeReroll),
    shopRefreshCount: 0,
    message: [baseMessage, ...tagResult.messages].join('；')
  };
}

function applyVoucherToState(state: GameState, definitionId: string): GameState {
  const definition = getVoucherDefinition(definitionId);
  let nextState: GameState = {
    ...state,
    ownedVouchers: [...state.ownedVouchers, definitionId]
  };

  definition.effects.forEach((effect) => {
    if (effect.type === 'extra_joker_slot') {
      nextState = {
        ...nextState,
        jokerSlots: nextState.jokerSlots + effect.amount
      };
    }

    if (effect.type === 'extra_consumable_slot') {
      nextState = {
        ...nextState,
        consumableSlots: nextState.consumableSlots + effect.amount
      };
    }

    if (effect.type === 'extra_hand_size') {
      nextState = {
        ...nextState,
        handSize: nextState.handSize + effect.amount
      };
    }
  });

  return nextState;
}

export function buyShopItem(state: GameState, offerId: string): GameState {
  if (state.phase !== 'shop') {
    return state;
  }

  if (state.packChoices.length > 0) {
    return {
      ...state,
      message: '先从补充包里选择一张牌。'
    };
  }

  const offer = state.shopOffers.find((shopOffer) => shopOffer.id === offerId);
  if (!offer) {
    return state;
  }

  if (state.money < offer.price) {
    return {
      ...state,
      message: `资金不足，购买这个商品需要 $${offer.price}。`
    };
  }

  if (offer.kind === 'joker') {
    return buyJoker(state, offerId);
  }

  if (offer.kind === 'consumable') {
    if (!offer.definitionId) {
      return state;
    }

    const definition = getConsumableDefinition(offer.definitionId);

    if (state.consumables.length >= state.consumableSlots) {
      return {
        ...state,
        message: '消耗牌槽位已满，先使用一张再购买。'
      };
    }

    return {
      ...state,
      money: state.money - offer.price,
      consumables: [...state.consumables, createConsumableInstance(offer.definitionId, state.nextConsumableInstanceNumber)],
      shopOffers: state.shopOffers.filter((shopOffer) => shopOffer.id !== offerId),
      nextConsumableInstanceNumber: state.nextConsumableInstanceNumber + 1,
      message: `已购买${definition.name}。${getConsumableLabel(definition.id)}会放入消耗牌槽。`
    };
  }

  if (offer.kind === 'pack') {
    const blockedReason = getPackBlockedReason(state, offer.definitionId);
    if (blockedReason) {
      return {
        ...state,
        message: blockedReason
      };
    }

    const packDefinition = getPackDefinition(offer.definitionId);
    const pack = createPackChoices(state, offerId, offer.definitionId);

    return {
      ...state,
      money: state.money - offer.price,
      packChoices: pack.choices,
      shopOffers: state.shopOffers.filter((shopOffer) => shopOffer.id !== offerId),
      nextConsumableInstanceNumber: pack.nextConsumableNumber,
      nextCardCopyNumber: pack.nextCardCopyNumber,
      message: `${packDefinition.name}已打开，选择 1 张或跳过。`
    };
  }

  if (offer.kind === 'voucher') {
    if (!offer.definitionId) {
      return state;
    }

    if (state.ownedVouchers.includes(offer.definitionId)) {
      return {
        ...state,
        message: '这张优惠券已经拥有。'
      };
    }

    const definition = getVoucherDefinition(offer.definitionId);
    const nextState = applyVoucherToState(state, offer.definitionId);

    return {
      ...nextState,
      money: nextState.money - offer.price,
      shopOffers: nextState.shopOffers.filter((shopOffer) => shopOffer.id !== offerId),
      message: `已购买优惠券：${definition.name}。${definition.description}`
    };
  }

  return {
    ...state,
    message: '这个商品暂时不能购买。'
  };
}

export function buyJoker(state: GameState, offerId: string): GameState {
  if (state.phase !== 'shop') {
    return state;
  }

  const offer = state.shopOffers.find((shopOffer) => shopOffer.id === offerId);
  if (!offer || offer.kind !== 'joker' || !offer.definitionId) {
    return {
      ...state,
      message: '这个商品暂时不能购买。'
    };
  }

  const definition = getJokerDefinition(offer.definitionId);

  if (state.jokers.length >= state.jokerSlots) {
    return {
      ...state,
      message: '小丑槽位已满，先卖出一张再购买。'
    };
  }

  if (state.money < offer.price) {
    return {
      ...state,
      message: `资金不足，购买${definition.name}需要 $${offer.price}。`
    };
  }

  const joker = createJokerInstance(offer.definitionId, state.nextJokerInstanceNumber);

  return {
    ...state,
    money: state.money - offer.price,
    jokers: [...state.jokers, joker],
    shopOffers: state.shopOffers.filter((shopOffer) => shopOffer.id !== offerId),
    nextJokerInstanceNumber: state.nextJokerInstanceNumber + 1,
    message: `已购买${definition.name}。小丑会按从左到右的顺序触发。`
  };
}

export function sellJoker(state: GameState, instanceId: string): GameState {
  const joker = state.jokers.find((item) => item.instanceId === instanceId);
  if (!joker) {
    return state;
  }

  const definition = getJokerDefinition(joker.definitionId);
  const sellValue = getJokerSellValue(joker.definitionId);
  const sellBonus = definition.effects
    .filter((effect) => effect.type === 'sell_bonus_money')
    .reduce((total, effect) => total + (effect.type === 'sell_bonus_money' ? effect.amount : 0), 0);

  return {
    ...state,
    money: state.money + sellValue + sellBonus,
    jokers: state.jokers.filter((item) => item.instanceId !== instanceId),
    lastTriggeredJokerIds: state.lastTriggeredJokerIds.filter((id) => id !== instanceId),
    message: `已卖出${definition.name}，获得 $${sellValue}${sellBonus > 0 ? `，额外获得 $${sellBonus}` : ''}。`
  };
}

export function moveJoker(state: GameState, fromIndex: number, toIndex: number): GameState {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= state.jokers.length || toIndex >= state.jokers.length) {
    return state;
  }

  const jokers = [...state.jokers];
  const [moved] = jokers.splice(fromIndex, 1);
  jokers.splice(toIndex, 0, moved);

  return {
    ...state,
    jokers,
    message: '小丑顺序已调整。结算会从左到右触发。'
  };
}

export function refreshShop(state: GameState): GameState {
  if (state.phase !== 'shop') {
    return state;
  }

  if (state.packChoices.length > 0) {
    return {
      ...state,
      message: '先从补充包里选择一张牌，再刷新商店。'
    };
  }

  if (state.money < state.shopRerollCost) {
    return {
      ...state,
      message: `资金不足，刷新商店需要 $${state.shopRerollCost}。`
    };
  }

  const nextRefreshCount = state.shopRefreshCount + 1;

  return {
    ...state,
    money: state.money - state.shopRerollCost,
    shopRefreshCount: nextRefreshCount,
    shopRerollCost: getRerollCostForRefreshCount(state, nextRefreshCount),
    shopOffers: createShopOffers(state, nextRefreshCount),
    message: '商店已刷新。'
  };
}

export function toggleCardSelection(state: GameState, cardId: string): GameState {
  if (state.phase !== 'playing' || state.status !== 'playing' || !state.hand.some((card) => card.id === cardId)) {
    return state;
  }

  const activeConsumable = state.selectedConsumableId
    ? state.consumables.find((consumable) => consumable.instanceId === state.selectedConsumableId)
    : null;
  const selectionLimit = activeConsumable
    ? getConsumableDefinition(activeConsumable.definitionId).target.max
    : (getBossSelectionLimit(state.activeBossId) ?? MAX_SELECTED_CARDS);

  if (state.selectedCardIds.includes(cardId)) {
    return {
      ...state,
      selectedCardIds: state.selectedCardIds.filter((selectedId) => selectedId !== cardId),
      message: '已取消选择这张牌。'
    };
  }

  if (state.selectedCardIds.length >= selectionLimit) {
    return {
      ...state,
      message: activeConsumable
        ? `这张消耗牌最多选择 ${selectionLimit} 张目标牌。`
        : getBossSelectionLimit(state.activeBossId)
        ? `首领规则：本盲注最多选择 ${selectionLimit} 张牌。`
        : '最多只能选择五张牌。'
    };
  }

  return {
    ...state,
    selectedCardIds: [...state.selectedCardIds, cardId],
    message: '已选择这张牌。'
  };
}

export type HandSortMode = 'rank' | 'suit';

export function sortHand(state: GameState, mode: HandSortMode): GameState {
  if (state.phase !== 'playing') {
    return state;
  }

  const originalIndex = new Map(state.hand.map((card, index) => [card.id, index]));
  const sortedHand = state.hand.slice().sort((left, right) => {
    const rankDelta = RANK_VALUES[right.rank] - RANK_VALUES[left.rank];
    const suitDelta = SUITS.indexOf(left.suit) - SUITS.indexOf(right.suit);

    if (mode === 'rank') {
      return rankDelta || suitDelta || (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0);
    }

    return suitDelta || rankDelta || (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0);
  });

  return {
    ...state,
    hand: sortedHand,
    message: mode === 'rank' ? '手牌已按点数排序。' : '手牌已按花色排序。'
  };
}

function splitSelectedCards(state: GameState): { selectedCards: Card[]; remainingHand: Card[] } {
  const selectedIds = new Set(state.selectedCardIds);

  return {
    selectedCards: state.hand.filter((card) => selectedIds.has(card.id)),
    remainingHand: state.hand.filter((card) => !selectedIds.has(card.id))
  };
}

export function playSelectedCards(state: GameState): GameState {
  if (state.phase !== 'playing' || state.status !== 'playing') {
    return state;
  }

  if (state.selectedCardIds.length === 0) {
    return {
      ...state,
      message: '出牌前请至少选择一张牌。'
    };
  }

  if (state.selectedConsumableId) {
    return {
      ...state,
      message: '正在为消耗牌选择目标，请先确认使用或取消。'
    };
  }

  if (state.handsRemaining <= 0) {
    return {
      ...state,
      status: state.currentScore >= state.targetScore ? 'won' : 'lost',
      message: '没有剩余出牌次数。'
    };
  }

  const { selectedCards, remainingHand } = splitSelectedCards(state);
  const scoringResult = scorePlayedCardsWithJokers(selectedCards, {
    jokers: state.jokers,
    discardsRemaining: state.discardsRemaining,
    handsRemainingBeforePlay: state.handsRemaining,
    playedHandsThisBlind: state.playedHandsThisBlind,
    money: state.money,
    handLevels: state.handLevels,
    heldCards: remainingHand,
    rng: createRng(`${state.seed}:glass:${state.ante}:${state.blindIndex}:${state.playedHandsThisBlind}`),
    disabledCardReasons: getBossDisabledCardReasons(state.activeBossId, selectedCards),
    disabledJokerRarities: getDisabledJokerRarities(state.activeBossId)
  });
  const scoringLog = applyBossScoringRules(state, selectedCards, scoringResult.log);
  const destroyedCardIds = new Set(scoringResult.destroyedCardIds);
  const currentScore = state.currentScore + scoringLog.finalScore;
  const handsRemaining = state.handsRemaining - 1;
  const clearedBlind = currentScore >= state.targetScore;
  const goldPayout = clearedBlind ? countGoldHeldCards(remainingHand) * GOLD_CARD_PAYOUT : 0;
  const jokerPayout = clearedBlind ? sumJokerMoneyEffect(state, 'blind_clear_money') : 0;
  const interestPayout = clearedBlind ? calculateInterest(state.money, state) : 0;
  const failedBlind = !clearedBlind && handsRemaining === 0;
  const finalRunWon = clearedBlind && !state.endless && state.ante >= MAX_ANTE && state.blindIndex === 2;
  const reward = (state.currentBlind?.reward ?? 0) + sumVoucherEffect(state, 'bonus_blind_reward');
  const status = clearedBlind ? 'won' : failedBlind ? 'lost' : 'playing';
  const phase = finalRunWon ? 'run_won' : clearedBlind ? 'shop' : failedBlind ? 'run_lost' : 'playing';
  const scoreShortfall = Math.max(0, state.targetScore - currentScore);
  const message =
    finalRunWon
      ? `第 ${MAX_ANTE} 层首领盲注已通过，整局胜利！`
      : clearedBlind
        ? `盲注已通过，获得 $${reward}${goldPayout > 0 ? `，黄金牌额外获得 $${goldPayout}` : ''}${
            jokerPayout > 0 ? `，小丑额外获得 $${jokerPayout}` : ''
          }${interestPayout > 0 ? `，利息获得 $${interestPayout}` : ''}，进入商店。`
        : failedBlind
        ? `盲注失败，最后一手${scoringLog.handName}贡献 ${scoringLog.finalScore} 分，还差 ${scoreShortfall} 分。重新开始再试一次。`
        : `${scoringLog.handName} 得分 ${scoringLog.finalScore}。`;

  const baseNextState = removeCardsEverywhere(
    {
      ...state,
      phase,
      status,
      money: clearedBlind ? state.money + reward + goldPayout + jokerPayout + interestPayout : state.money,
      jokers: scoringResult.jokers,
      currentScore,
      handsRemaining,
      hand: remainingHand,
      selectedCardIds: [],
      selectedConsumableId: null,
      activeBossId: phase === 'playing' ? state.activeBossId : null,
      discardPile: [...state.discardPile, ...selectedCards.filter((card) => !destroyedCardIds.has(card.id))],
      lastScoringLog: scoringLog,
      lastTriggeredJokerIds: scoringResult.triggeredJokerIds,
      runHighestSingleHandScore: Math.max(state.runHighestSingleHandScore, scoringLog.finalScore),
      playedHandsThisBlind: state.playedHandsThisBlind + 1,
      playedHandTypesThisBlind: [...state.playedHandTypesThisBlind, scoringLog.hand],
      message
    },
    scoringResult.destroyedCardIds
  );

  if (clearedBlind && !finalRunWon) {
    return enterShop(baseNextState, message);
  }

  return fillHand(baseNextState);
}

export function discardSelectedCards(state: GameState): GameState {
  if (state.phase !== 'playing' || state.status !== 'playing') {
    return state;
  }

  if (state.selectedCardIds.length === 0) {
    return {
      ...state,
      message: '弃牌前请至少选择一张牌。'
    };
  }

  if (state.selectedConsumableId) {
    return {
      ...state,
      message: '正在为消耗牌选择目标，请先确认使用或取消。'
    };
  }

  if (state.discardsRemaining <= 0) {
    return {
      ...state,
      message: '没有剩余弃牌次数。'
    };
  }

  const { selectedCards, remainingHand } = splitSelectedCards(state);

  return fillHand({
    ...state,
    hand: remainingHand,
    selectedCardIds: [],
    discardsRemaining: state.discardsRemaining - 1,
    discardPile: [...state.discardPile, ...selectedCards],
    message: `已弃掉 ${selectedCards.length} 张牌。`
  });
}

export function cancelConsumableTarget(state: GameState): GameState {
  if (!state.selectedConsumableId) {
    return state;
  }

  return {
    ...state,
    selectedConsumableId: null,
    selectedCardIds: [],
    message: '已取消消耗牌目标选择。'
  };
}

function addMoneyDelta(state: GameState, moneyDelta: number | undefined): GameState {
  if (!moneyDelta) {
    return state;
  }

  return {
    ...state,
    money: Math.max(0, state.money + moneyDelta)
  };
}

function applySpectralEffect(state: GameState, effect: SpectralEffect, choiceId: string, effectIndex: number): GameState {
  let nextState = addMoneyDelta(state, effect.moneyDelta);
  const rng = createRng(`${state.seed}:spectral:${choiceId}:${effectIndex}`);

  if (effect.type === 'enhance_random_cards') {
    const targets = pickUniqueDefinitions(nextState.deck, rng, effect.count);
    nextState = targets.reduce(
      (current, card) =>
        updateCardEverywhere(current, card.id, (target) => ({
          ...target,
          enhancement: effect.enhancement
        })),
      nextState
    );
  }

  if (effect.type === 'copy_random_card') {
    const targets = pickUniqueDefinitions(nextState.deck, rng, effect.count);
    const copies = targets.map((card, index) => ({
      ...card,
      id: `${card.id}-spectral-copy-${nextState.nextCardCopyNumber + index}`
    }));
    nextState = {
      ...nextState,
      deck: [...nextState.deck, ...copies],
      nextCardCopyNumber: nextState.nextCardCopyNumber + copies.length
    };
  }

  if (effect.type === 'destroy_random_cards') {
    const targets = pickUniqueDefinitions(nextState.deck, rng, effect.count);
    nextState = removeCardsEverywhere(
      nextState,
      targets.map((card) => card.id)
    );
  }

  if (effect.type === 'upgrade_random_hands') {
    const handChoices = pickUniqueDefinitions(
      POKER_HAND_ORDER.map((hand) => ({ id: hand })),
      rng,
      effect.count
    );
    nextState = handChoices.reduce(
      (current, handChoice) => ({
        ...current,
        handLevels: {
          ...current.handLevels,
          [handChoice.id]: current.handLevels[handChoice.id] + effect.amount
        }
      }),
      nextState
    );
  }

  return nextState;
}

function applySpectralChoice(state: GameState, choice: Extract<PackChoice, { kind: 'spectral' }>): GameState {
  const definition = getSpectralDefinition(choice.definitionId);
  const nextState = definition.effects.reduce(
    (current, effect, index) => applySpectralEffect(current, effect, choice.instanceId, index),
    state
  );

  return {
    ...nextState,
    packChoices: [],
    message: `已选择${definition.name}。${definition.description}`
  };
}

export function choosePackConsumable(state: GameState, instanceId: string): GameState {
  if (state.phase !== 'shop') {
    return state;
  }

  const choice = state.packChoices.find((candidate) => candidate.instanceId === instanceId);
  if (!choice) {
    return state;
  }

  if (choice.kind === 'playing_card') {
    return {
      ...state,
      deck: [...state.deck, choice.card],
      packChoices: [],
      message: `已从补充包中选择 ${formatCard(choice.card)}，加入当前牌组。`
    };
  }

  if (choice.kind === 'consumable') {
    if (state.consumables.length >= state.consumableSlots) {
      return {
        ...state,
        message: '消耗牌槽位已满，无法领取补充包内容。'
      };
    }

    const definition = getConsumableDefinition(choice.definitionId);

    return {
      ...state,
      consumables: [...state.consumables, { instanceId: choice.instanceId, definitionId: choice.definitionId }],
      packChoices: [],
      message: `已从补充包中选择${definition.name}。它会放入消耗牌槽。`
    };
  }

  if (choice.kind === 'joker') {
    if (state.jokers.length >= state.jokerSlots) {
      return {
        ...state,
        message: '小丑槽位已满，先卖出一张再领取小丑包内容。'
      };
    }

    const definition = getJokerDefinition(choice.definitionId);

    return {
      ...state,
      jokers: [...state.jokers, createJokerInstance(choice.definitionId, state.nextJokerInstanceNumber)],
      packChoices: [],
      nextJokerInstanceNumber: state.nextJokerInstanceNumber + 1,
      message: `已从小丑包中选择${definition.name}。`
    };
  }

  return applySpectralChoice(state, choice);
}

export function skipPackChoice(state: GameState): GameState {
  if (state.phase !== 'shop' || state.packChoices.length === 0) {
    return state;
  }

  const pack = getPackDefinition(state.packChoices[0].packId);

  if (!pack.allowSkip) {
    return {
      ...state,
      message: '这个补充包必须选择一张。'
    };
  }

  return {
    ...state,
    packChoices: [],
    message: `已跳过${pack.name}。`
  };
}

function validateConsumableTargets(state: GameState, instanceId: string): { ok: true; cards: Card[] } | { ok: false; message: string } {
  const consumable = state.consumables.find((item) => item.instanceId === instanceId);
  if (!consumable) {
    return { ok: false, message: '找不到这张消耗牌。' };
  }

  const definition = getConsumableDefinition(consumable.definitionId);
  if (definition.target.mode === 'none') {
    return { ok: true, cards: [] };
  }

  if (state.phase !== 'playing') {
    return { ok: false, message: '这张消耗牌需要选择手牌目标，只能在盲注中使用。' };
  }

  const targetCards = getSelectedCardsForConsumable(state);

  if (targetCards.length < definition.target.min || targetCards.length > definition.target.max) {
    return {
      ok: false,
      message:
        definition.target.min === definition.target.max
          ? `请选择 ${definition.target.min} 张手牌作为目标。`
          : `请选择 ${definition.target.min} 到 ${definition.target.max} 张手牌作为目标。`
    };
  }

  return { ok: true, cards: targetCards };
}

function getSelectedCardsForConsumable(state: GameState): Card[] {
  const selectedIds = new Set(state.selectedCardIds);
  return state.hand.filter((card) => selectedIds.has(card.id));
}

export function useConsumable(state: GameState, instanceId: string): GameState {
  const consumable = state.consumables.find((item) => item.instanceId === instanceId);
  if (!consumable) {
    return state;
  }

  const definition = getConsumableDefinition(consumable.definitionId);

  if (definition.target.mode === 'cards' && state.selectedConsumableId !== instanceId) {
    if (state.phase !== 'playing') {
      return {
        ...state,
        message: '这张消耗牌需要选择手牌目标，只能在盲注中使用。'
      };
    }

    return {
      ...state,
      selectedConsumableId: instanceId,
      selectedCardIds: [],
      message:
        definition.target.min === definition.target.max
          ? `请选择 ${definition.target.min} 张手牌，然后确认使用${definition.name}。`
          : `请选择 ${definition.target.min} 到 ${definition.target.max} 张手牌，然后确认使用${definition.name}。`
    };
  }

  const validation = validateConsumableTargets(state, instanceId);
  if (!validation.ok) {
    return {
      ...state,
      message: validation.message
    };
  }

  const targetCards = validation.cards;
  let nextState: GameState = state;

  if (definition.effect.type === 'level_hand') {
    nextState = {
      ...nextState,
      handLevels: {
        ...nextState.handLevels,
        [definition.effect.hand]: nextState.handLevels[definition.effect.hand] + 1
      },
      message: `${definition.name}已使用。对应牌型等级提升到 ${nextState.handLevels[definition.effect.hand] + 1}。`
    };
  }

  if (definition.effect.type === 'gain_money') {
    nextState = {
      ...nextState,
      money: nextState.money + definition.effect.amount,
      message: `${definition.name}已使用，获得 $${definition.effect.amount}。`
    };
  }

  if (definition.effect.type === 'change_suit') {
    const targetSuit = definition.effect.suit;
    nextState = targetCards.reduce(
      (current, card) => updateCardEverywhere(current, card.id, (target) => ({ ...target, suit: targetSuit })),
      nextState
    );
    nextState = {
      ...nextState,
      message: `${definition.name}已使用，${targetCards.length} 张牌的花色已改变。`
    };
  }

  if (definition.effect.type === 'change_rank') {
    const targetRank = definition.effect.rank;
    nextState = targetCards.reduce(
      (current, card) => updateCardEverywhere(current, card.id, (target) => ({ ...target, rank: targetRank })),
      nextState
    );
    nextState = {
      ...nextState,
      message: `${definition.name}已使用，${targetCards.length} 张牌的点数已改变。`
    };
  }

  if (definition.effect.type === 'enhance_card') {
    const targetEnhancement = definition.effect.enhancement;
    nextState = targetCards.reduce(
      (current, card) =>
        updateCardEverywhere(current, card.id, (target) => ({
          ...target,
          enhancement: targetEnhancement
        })),
      nextState
    );
    nextState = {
      ...nextState,
      message: `${definition.name}已使用，目标牌获得新的增强。`
    };
  }

  if (definition.effect.type === 'copy_card') {
    const source = targetCards[0];
    const copy: Card = {
      ...source,
      id: `${source.id}-copy-${nextState.nextCardCopyNumber}`
    };
    nextState = {
      ...nextState,
      deck: [...nextState.deck, copy],
      nextCardCopyNumber: nextState.nextCardCopyNumber + 1,
      message: `${definition.name}已使用，已把 ${source.rank} 复制进牌组。`
    };
  }

  if (definition.effect.type === 'destroy_card') {
    nextState = removeCardsEverywhere(
      {
        ...nextState,
        message: `${definition.name}已使用，目标牌已从牌组中删除。`
      },
      targetCards.map((card) => card.id)
    );
  }

  return removeConsumable(
    {
      ...nextState,
      selectedConsumableId: null,
      selectedCardIds: []
    },
    instanceId
  );
}

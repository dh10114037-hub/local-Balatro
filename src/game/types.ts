export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export type Rank =
  | 'A'
  | 'K'
  | 'Q'
  | 'J'
  | '10'
  | '9'
  | '8'
  | '7'
  | '6'
  | '5'
  | '4'
  | '3'
  | '2';

export type PokerHand =
  | 'flush_five'
  | 'flush_house'
  | 'five_of_a_kind'
  | 'royal_flush'
  | 'straight_flush'
  | 'four_of_a_kind'
  | 'full_house'
  | 'flush'
  | 'straight'
  | 'three_of_a_kind'
  | 'two_pair'
  | 'pair'
  | 'high_card';

export type GamePhase = 'blind_select' | 'playing' | 'shop' | 'run_won' | 'run_lost';

export type GameStatus = 'playing' | 'won' | 'lost';

export type BlindKind = 'small' | 'big' | 'boss';

export type JokerRarity = 'common' | 'uncommon' | 'rare';

export type JokerArchetype =
  | 'general'
  | 'high_card'
  | 'pair'
  | 'flush'
  | 'straight'
  | 'face'
  | 'suit'
  | 'economy'
  | 'growth'
  | 'glass'
  | 'copy'
  | 'enhancement';

export type JokerTriggerTiming = 'on_play' | 'scored_card' | 'blind_end' | 'shop' | 'buy_sell';

export type CardEnhancement = 'bonus' | 'mult' | 'wild' | 'glass' | 'steel' | 'gold' | 'stone';

export type HandLevels = Record<PokerHand, number>;

export type PackKind = 'standard' | 'planet' | 'tarot' | 'joker' | 'spectral';

export type PackDefinition = {
  id: string;
  kind: PackKind;
  name: string;
  description: string;
  price: number;
  choiceCount: number;
  allowSkip: boolean;
};

export type SpectralEffect =
  | { type: 'enhance_random_cards'; enhancement: CardEnhancement; count: number; moneyDelta?: number }
  | { type: 'copy_random_card'; count: number; moneyDelta?: number }
  | { type: 'destroy_random_cards'; count: number; moneyDelta?: number }
  | { type: 'upgrade_random_hands'; count: number; amount: number; moneyDelta?: number };

export type SpectralDefinition = {
  id: string;
  name: string;
  description: string;
  effects: SpectralEffect[];
};

export type PackChoice =
  | {
      instanceId: string;
      packId: string;
      kind: 'playing_card';
      card: Card;
    }
  | {
      instanceId: string;
      packId: string;
      kind: 'consumable';
      definitionId: string;
    }
  | {
      instanceId: string;
      packId: string;
      kind: 'joker';
      definitionId: string;
    }
  | {
      instanceId: string;
      packId: string;
      kind: 'spectral';
      definitionId: string;
    };

export type BossEffect =
  | { type: 'debuff_suit'; suit: Suit }
  | { type: 'debuff_rank'; rank: Rank }
  | { type: 'debuff_face_cards' }
  | { type: 'first_hand_score_factor'; factor: number }
  | { type: 'no_repeat_hand' }
  | { type: 'hand_size_delta'; amount: number }
  | { type: 'no_discards' }
  | { type: 'force_five_cards' }
  | { type: 'first_hand_min_score_ratio'; ratio: number }
  | { type: 'forbid_hand_types'; hands: PokerHand[] }
  | { type: 'require_hand_types'; hands: PokerHand[] }
  | { type: 'disable_joker_rarity'; rarity: JokerRarity }
  | { type: 'max_selected_cards'; max: number }
  | { type: 'hide_face_cards' };

export type TagEffect =
  | { type: 'gain_money_next_shop'; amount: number }
  | { type: 'free_shop_next_shop' }
  | { type: 'free_reroll_next_shop' }
  | { type: 'discount_next_shop'; amount: number }
  | { type: 'voucher_discount_next_shop'; amount: number }
  | { type: 'free_pack_next_shop' }
  | { type: 'free_common_joker_next_shop' }
  | { type: 'free_rare_joker_next_shop' }
  | { type: 'add_random_tarot_next_shop' }
  | { type: 'upgrade_random_hand_next_shop'; amount: number }
  | { type: 'extra_hand_next_blind'; amount: number }
  | { type: 'extra_discard_next_blind'; amount: number };

export type VoucherEffect =
  | { type: 'extra_joker_slot'; amount: number }
  | { type: 'extra_consumable_slot'; amount: number }
  | { type: 'extra_hand_size'; amount: number }
  | { type: 'extra_hand_per_blind'; amount: number }
  | { type: 'extra_discard_per_blind'; amount: number }
  | { type: 'extra_shop_offer'; amount: number }
  | { type: 'extra_pack_choice'; amount: number }
  | { type: 'interest_cap_bonus'; amount: number }
  | { type: 'interest_step_reduction'; amount: number }
  | { type: 'shop_item_weight_bonus'; category: 'joker' | 'tarot' | 'planet' | 'pack' | 'voucher'; amount: number }
  | { type: 'reroll_discount'; amount: number }
  | { type: 'shop_discount'; amount: number }
  | { type: 'pack_discount'; amount: number }
  | { type: 'bonus_blind_reward'; amount: number }
  | { type: 'boss_target_discount'; ratio: number };

export type DeckModifier = {
  startingMoney?: number;
  handSizeDelta?: number;
  handsDelta?: number;
  discardsDelta?: number;
  jokerSlotsDelta?: number;
  consumableSlotsDelta?: number;
  blindRewardBonus?: number;
  startingConsumables?: string[];
};

export type DeckDefinition = {
  id: string;
  name: string;
  description: string;
  modifiers: DeckModifier;
};

export type StakeDefinition = {
  id: string;
  name: string;
  description: string;
  targetMultiplier: number;
  rewardDelta: number;
  shopPriceDelta: number;
  unlockKey?: string;
  unlockDescription?: string;
};

export type JokerEffect =
  | { type: 'add_chips'; amount: number }
  | { type: 'add_mult'; amount: number }
  | { type: 'multiply_mult'; factor: number }
  | { type: 'hand_add_chips'; hand: PokerHand; amount: number }
  | { type: 'hand_add_mult'; hand: PokerHand; amount: number }
  | { type: 'hand_multiply_mult'; hand: PokerHand; factor: number }
  | { type: 'scored_suit_add_chips'; suit: Suit; amount: number }
  | { type: 'scored_suit_add_mult'; suit: Suit; amount: number }
  | { type: 'scored_face_add_chips'; amount: number }
  | { type: 'scored_face_add_mult'; amount: number }
  | { type: 'scored_enhancement_multiply_mult'; enhancement: CardEnhancement; factor: number }
  | { type: 'scored_enhancement_add_chips'; enhancement: CardEnhancement; amount: number }
  | { type: 'scored_enhancement_add_mult'; enhancement: CardEnhancement; amount: number }
  | { type: 'held_enhancement_multiply_mult'; enhancement: CardEnhancement; factor: number }
  | { type: 'remaining_discards_add_chips'; amountPerDiscard: number }
  | { type: 'remaining_discards_add_mult'; amountPerDiscard: number }
  | { type: 'played_hands_add_mult'; amountPerHand: number }
  | { type: 'money_add_mult'; amount: number; divisor: number; max?: number }
  | { type: 'money_add_chips'; amount: number; divisor: number; max?: number }
  | { type: 'money_at_most_add_mult'; maxMoney: number; amount: number }
  | { type: 'first_hand_add_mult'; amount: number }
  | { type: 'last_hand_multiply_mult'; factor: number }
  | { type: 'scored_cards_add_chips'; amountPerCard: number }
  | { type: 'scored_cards_at_most_add_mult'; maxCards: number; amount: number }
  | { type: 'selected_cards_at_most_add_mult'; maxCards: number; amount: number }
  | { type: 'selected_cards_exactly_add_chips'; cards: number; amount: number }
  | { type: 'selected_cards_exactly_add_mult'; cards: number; amount: number }
  | { type: 'repeat_first_scored_card' }
  | { type: 'rank_add_chips'; rank: Rank; amount: number }
  | { type: 'rank_add_mult'; rank: Rank; amount: number }
  | { type: 'scored_ranks_add_chips'; ranks: Rank[]; amount: number }
  | { type: 'scored_ranks_add_mult'; ranks: Rank[]; amount: number }
  | { type: 'joker_count_add_mult'; amountPerJoker: number }
  | { type: 'no_discards_add_mult'; amount: number }
  | { type: 'held_enhancement_add_mult'; enhancement: CardEnhancement; amount: number }
  | { type: 'level_add_mult'; amountPerLevel: number }
  | { type: 'growth_hand_add_mult'; hand: PokerHand; amountPerLevel: number }
  | { type: 'blind_clear_money'; amount: number }
  | { type: 'reroll_discount'; amount: number }
  | { type: 'sell_bonus_money'; amount: number }
  | { type: 'copy_right' };

export type Card = {
  id: string;
  suit: Suit;
  rank: Rank;
  enhancement?: CardEnhancement;
};

export type ScoredCard = {
  card: Card;
  chips: number;
  note?: string;
  disabled?: boolean;
};

export type HandEvaluation = {
  hand: PokerHand;
  handName: string;
  scoredCards: Card[];
};

export type ScoringModifier = {
  sourceId?: string;
  source: string;
  description: string;
  chipsDelta?: number;
  multDelta?: number;
  multFactor?: number;
};

export type ScoringEventStage = 'hand' | 'scored_card' | 'enhancement' | 'joker' | 'rule' | 'final';

export type ScoringEvent = {
  id: string;
  stage: ScoringEventStage;
  label: string;
  description: string;
  cardId?: string;
  sourceId?: string;
  chipsDelta?: number;
  multDelta?: number;
  multFactor?: number;
  chipsAfter?: number;
  multAfter?: number;
  scoreAfter?: number;
};

export type ScoringLog = {
  hand: PokerHand;
  handName: string;
  baseChips: number;
  baseMult: number;
  scoredCards: ScoredCard[];
  modifiers: ScoringModifier[];
  events: ScoringEvent[];
  finalChips: number;
  finalMult: number;
  finalScore: number;
};

export type BlindDefinition = {
  id: string;
  kind: BlindKind;
  name: string;
  targetScore: number;
  reward: number;
  description: string;
  bossId?: string;
};

export type BossDefinition = {
  id: string;
  name: string;
  description: string;
  advice: string;
  effects: BossEffect[];
};

export type JokerDefinition = {
  id: string;
  name: string;
  rarity: JokerRarity;
  archetypes: JokerArchetype[];
  triggerTiming: JokerTriggerTiming[];
  triggerText: string;
  conditionText: string;
  price: number;
  description: string;
  effects: JokerEffect[];
  growthOnHand?: {
    hand: PokerHand;
    amount: number;
  };
  growthOnEveryHand?: {
    amount: number;
  };
  growthOnNoScoredFace?: {
    amount: number;
    resetOnFace: boolean;
  };
};

export type JokerInstance = {
  instanceId: string;
  definitionId: string;
  level: number;
};

export type ConsumableDefinition = {
  id: string;
  name: string;
  kind: 'planet' | 'tarot' | 'spectral';
  price: number;
  description: string;
  target: {
    mode: 'none' | 'cards';
    min: number;
    max: number;
  };
  effect:
    | { type: 'level_hand'; hand: PokerHand }
    | { type: 'change_suit'; suit: Suit }
    | { type: 'change_rank'; rank: Rank }
    | { type: 'copy_card' }
    | { type: 'destroy_card' }
    | { type: 'enhance_card'; enhancement: CardEnhancement }
    | { type: 'gain_money'; amount: number };
};

export type ConsumableInstance = {
  instanceId: string;
  definitionId: string;
};

export type TagDefinition = {
  id: string;
  name: string;
  description: string;
  effects: TagEffect[];
};

export type TagInstance = {
  instanceId: string;
  definitionId: string;
};

export type VoucherDefinition = {
  id: string;
  name: string;
  price: number;
  description: string;
  tier?: 1 | 2;
  pairId?: string;
  requiresVoucherId?: string;
  unlockHint?: string;
  effects: VoucherEffect[];
};

export type ShopItem = {
  id: string;
  kind: 'joker' | 'consumable' | 'voucher' | 'pack';
  definitionId?: string;
  price: number;
};

export type GameState = {
  saveVersion: number;
  runId: string;
  seed: string;
  deckId: string;
  stakeId: string;
  endless: boolean;
  phase: GamePhase;
  status: GameStatus;
  ante: number;
  blindIndex: number;
  money: number;
  currentBlind: BlindDefinition | null;
  activeBossId: string | null;
  deck: Card[];
  handLevels: HandLevels;
  jokers: JokerInstance[];
  jokerSlots: number;
  consumables: ConsumableInstance[];
  consumableSlots: number;
  selectedConsumableId: string | null;
  packChoices: PackChoice[];
  pendingTags: TagInstance[];
  ownedVouchers: string[];
  shopOffers: ShopItem[];
  shopRerollCost: number;
  shopRefreshCount: number;
  nextJokerInstanceNumber: number;
  nextConsumableInstanceNumber: number;
  nextTagInstanceNumber: number;
  nextCardCopyNumber: number;
  targetScore: number;
  currentScore: number;
  baseHandSize: number;
  baseHands: number;
  baseDiscards: number;
  handsRemaining: number;
  discardsRemaining: number;
  handSize: number;
  drawPile: Card[];
  hand: Card[];
  selectedCardIds: string[];
  discardPile: Card[];
  lastScoringLog: ScoringLog | null;
  lastTriggeredJokerIds: string[];
  runHighestSingleHandScore: number;
  playedHandsThisBlind: number;
  playedHandTypesThisBlind: PokerHand[];
  message: string;
};

export type CollectionState = {
  seenJokers: string[];
  seenConsumables: string[];
  seenSpectrals: string[];
  seenBosses: string[];
  seenVouchers: string[];
};

export type ProfileRunRecord = {
  highestAnte: number;
  highestSingleHandScore: number;
  winCount: number;
  lossCount: number;
  runsStarted: number;
};

export type ProfileStats = ProfileRunRecord & {
  highestEndlessAnte: number;
  deckRecords: Record<string, ProfileRunRecord>;
  stakeRecords: Record<string, ProfileRunRecord>;
};

export type GameSettings = {
  volume: number;
  animationMode: 'normal' | 'fast' | 'instant';
  animationSpeed: number;
  showDetailedScoring: boolean;
  soundEnabled: boolean;
  fastMode: boolean;
  tutorialDismissed: string[];
};

export type PersistentProfile = {
  saveVersion: number;
  collection: CollectionState;
  unlocks: string[];
  stats: ProfileStats;
  settings: GameSettings;
};

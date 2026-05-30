import { describe, expect, it } from 'vitest';
import { BOSSES } from './config/bosses';
import { MAX_ANTE } from './config/blinds';
import { getConsumableDefinition } from './config/consumables';
import { DECKS } from './config/decks';
import { getJokerDefinition, getJokerSellValue, JOKERS } from './config/jokers';
import { PACKS, SPECTRAL_CARDS } from './config/packs';
import { STAKES } from './config/stakes';
import { TAGS } from './config/tags';
import { getVoucherForShop, VOUCHERS } from './config/vouchers';
import { createStandardDeck, RANKS } from './deck';
import {
  advanceFromShop,
  buyJoker,
  buyShopItem,
  calculateInterest,
  choosePackConsumable,
  createDefaultHandLevels,
  createInitialGame,
  discardSelectedCards,
  GAME_SAVE_VERSION,
  getBlindForState,
  MAX_SELECTED_CARDS,
  moveJoker,
  playSelectedCards,
  refreshShop,
  sellJoker,
  skipPackChoice,
  skipCurrentBlind,
  sortHand,
  STARTING_REROLL_COST,
  startCurrentBlind,
  toggleCardSelection,
  useConsumable
} from './engine';
import {
  createDefaultProfile,
  normalizeProfile,
  recordRunResult,
  recordRunStarted,
  recordSeenFromState,
  recordStatsFromState,
  resetPersistentProfile,
  updateProfileSettings
} from './profile';
import { createRng, shuffleWithRng } from './random';
import { scorePlayedCards, scorePlayedCardsWithJokers } from './scoring';
import type { Card, CardEnhancement, GameState, Rank, Suit } from './types';

function card(rank: Rank, suit: Suit, enhancement?: CardEnhancement): Card {
  return {
    id: `${rank}-${suit}`,
    rank,
    suit,
    enhancement
  };
}

type JokerScoreOptions = {
  heldCards?: Card[];
  disabledCardReasons?: Record<string, string>;
  discardsRemaining?: number;
  handsRemainingBeforePlay?: number;
  playedHandsThisBlind?: number;
  money?: number;
  level?: number;
};

function scoreWithJoker(definitionId: string, cards: Card[], options: JokerScoreOptions = {}) {
  return scorePlayedCardsWithJokers(cards, {
    jokers: [{ instanceId: 'joker-test', definitionId, level: options.level ?? 0 }],
    discardsRemaining: options.discardsRemaining ?? 0,
    handsRemainingBeforePlay: options.handsRemainingBeforePlay ?? 2,
    playedHandsThisBlind: options.playedHandsThisBlind ?? 1,
    money: options.money ?? 0,
    handLevels: createDefaultHandLevels(),
    heldCards: options.heldCards ?? [],
    disabledCardReasons: options.disabledCardReasons
  }).log;
}

function triggeredJokerEvents(log: ReturnType<typeof scoreWithJoker>) {
  return log.events.filter((event) => event.stage === 'joker' && event.sourceId === 'joker-test');
}

type JokerLogicCase =
  | {
      kind?: 'scoring';
      triggerCards: Card[];
      skipCards?: Card[];
      triggerOptions?: JokerScoreOptions;
      skipOptions?: JokerScoreOptions;
    }
  | { kind: 'copy' | 'blind_end' | 'shop' | 'buy_sell' };

const HEART_FLUSH = [card('2', 'hearts'), card('5', 'hearts'), card('7', 'hearts'), card('9', 'hearts'), card('K', 'hearts')];
const STRAIGHT = [card('2', 'clubs'), card('3', 'diamonds'), card('4', 'hearts'), card('5', 'spades'), card('6', 'clubs')];
const FULL_HOUSE = [card('7', 'spades'), card('7', 'hearts'), card('7', 'diamonds'), card('8', 'clubs'), card('8', 'diamonds')];
const FOUR_KIND = [card('9', 'spades'), card('9', 'hearts'), card('9', 'clubs'), card('9', 'diamonds')];

const JOKER_LOGIC_CASES: Record<string, JokerLogicCase> = {
  chip_starter: { triggerCards: [card('A', 'spades')] },
  mult_starter: { triggerCards: [card('A', 'spades')] },
  magnifier: { triggerCards: [card('A', 'spades')] },
  pair_teacher: { triggerCards: [card('A', 'spades'), card('A', 'hearts')], skipCards: [card('A', 'spades'), card('K', 'hearts')] },
  flush_painter: { triggerCards: HEART_FLUSH, skipCards: [card('A', 'spades')] },
  straight_runner: { triggerCards: STRAIGHT, skipCards: [card('A', 'spades'), card('A', 'hearts')] },
  heart_drummer: { triggerCards: [card('A', 'hearts')], skipCards: [card('A', 'spades')] },
  spade_smith: { triggerCards: [card('A', 'spades')], skipCards: [card('A', 'hearts')] },
  face_tax: { triggerCards: [card('K', 'spades')], skipCards: [card('A', 'spades')] },
  discard_abacus: {
    triggerCards: [card('A', 'spades')],
    skipCards: [card('A', 'spades')],
    triggerOptions: { discardsRemaining: 2 },
    skipOptions: { discardsRemaining: 0 }
  },
  money_pouch: {
    triggerCards: [card('A', 'spades')],
    skipCards: [card('A', 'spades')],
    triggerOptions: { money: 9 },
    skipOptions: { money: 0 }
  },
  opening_firework: {
    triggerCards: [card('A', 'spades')],
    skipCards: [card('A', 'spades')],
    triggerOptions: { playedHandsThisBlind: 0 },
    skipOptions: { playedHandsThisBlind: 1 }
  },
  final_push: {
    triggerCards: [card('A', 'spades')],
    skipCards: [card('A', 'spades')],
    triggerOptions: { handsRemainingBeforePlay: 1 },
    skipOptions: { handsRemainingBeforePlay: 2 }
  },
  counter: { triggerCards: [card('A', 'spades')] },
  ace_fan: { triggerCards: [card('A', 'spades')], skipCards: [card('K', 'spades')] },
  lucky_seven: { triggerCards: [card('7', 'spades')], skipCards: [card('8', 'spades')] },
  high_card_patch: { triggerCards: [card('A', 'spades')], skipCards: [card('A', 'spades'), card('A', 'hearts')] },
  triple_singer: {
    triggerCards: [card('A', 'spades'), card('A', 'hearts'), card('A', 'clubs')],
    skipCards: [card('A', 'spades'), card('A', 'hearts')]
  },
  echo_joker: { kind: 'copy' },
  pair_seed: { triggerCards: [card('A', 'spades'), card('A', 'hearts')], skipCards: [card('A', 'spades'), card('K', 'hearts')] },
  single_spotlight: { triggerCards: [card('A', 'spades')], skipCards: [card('A', 'spades'), card('A', 'hearts')] },
  pair_archivist: { triggerCards: [card('A', 'spades'), card('A', 'hearts')], skipCards: [card('A', 'spades'), card('K', 'hearts')] },
  two_pair_tuner: {
    triggerCards: [card('A', 'spades'), card('A', 'hearts'), card('K', 'clubs'), card('K', 'diamonds')],
    skipCards: [card('A', 'spades'), card('A', 'hearts'), card('K', 'clubs')]
  },
  royal_clerk: { triggerCards: [card('K', 'spades')], skipCards: [card('A', 'spades')] },
  club_drummer: { triggerCards: [card('A', 'clubs')], skipCards: [card('A', 'hearts')] },
  straight_doubler: { triggerCards: STRAIGHT, skipCards: [card('A', 'spades'), card('A', 'hearts')] },
  glass_prism: { triggerCards: [card('A', 'spades', 'glass')], skipCards: [card('A', 'spades', 'bonus')] },
  steel_fund: {
    triggerCards: [card('2', 'clubs')],
    skipCards: [card('2', 'clubs')],
    triggerOptions: { heldCards: [card('A', 'hearts', 'steel')] },
    skipOptions: { heldCards: [card('A', 'hearts')] }
  },
  first_card_echo: {
    triggerCards: [card('A', 'spades')],
    skipCards: [card('A', 'spades')],
    skipOptions: { disabledCardReasons: { 'A-spades': '测试：这张牌不计分' } }
  },
  cashout_clown: { kind: 'blind_end' },
  coupon_clip: { kind: 'shop' },
  parting_gift: { kind: 'buy_sell' },
  high_card_spur: { triggerCards: [card('A', 'spades')], skipCards: [card('A', 'spades'), card('A', 'hearts')] },
  two_pair_bookkeeper: {
    triggerCards: [card('A', 'spades'), card('A', 'hearts'), card('K', 'clubs'), card('K', 'diamonds')],
    skipCards: [card('A', 'spades'), card('A', 'hearts'), card('K', 'clubs')]
  },
  triple_blacksmith: {
    triggerCards: [card('A', 'spades'), card('A', 'hearts'), card('A', 'clubs')],
    skipCards: [card('A', 'spades'), card('A', 'hearts')]
  },
  flush_cartographer: { triggerCards: HEART_FLUSH, skipCards: [card('A', 'spades')] },
  full_house_bell: { triggerCards: FULL_HOUSE, skipCards: [card('A', 'spades'), card('A', 'hearts'), card('A', 'clubs')] },
  full_house_mason: { triggerCards: FULL_HOUSE, skipCards: [card('A', 'spades'), card('A', 'hearts'), card('A', 'clubs')] },
  four_kind_foundry: { triggerCards: FOUR_KIND, skipCards: [card('A', 'spades'), card('A', 'hearts'), card('A', 'clubs')] },
  four_kind_booster: { triggerCards: FOUR_KIND, skipCards: [card('A', 'spades'), card('A', 'hearts'), card('A', 'clubs')] },
  abstract_masks: { triggerCards: [card('A', 'spades')] },
  short_hand_banner: {
    triggerCards: [card('A', 'spades'), card('K', 'hearts'), card('Q', 'clubs')],
    skipCards: [card('A', 'spades'), card('K', 'hearts'), card('Q', 'clubs'), card('J', 'diamonds')]
  },
  even_lantern: { triggerCards: [card('10', 'spades')], skipCards: [card('K', 'spades')] },
  odd_lantern: { triggerCards: [card('A', 'spades')], skipCards: [card('K', 'spades')] },
  ace_scholar: { triggerCards: [card('A', 'spades')], skipCards: [card('K', 'spades')] },
  ten_four_radio: { triggerCards: [card('10', 'spades')], skipCards: [card('K', 'spades')] },
  diamond_drummer: { triggerCards: [card('A', 'diamonds')], skipCards: [card('A', 'spades')] },
  heart_smith: { triggerCards: [card('A', 'hearts')], skipCards: [card('A', 'spades')] },
  blind_storyteller: {
    triggerCards: [card('A', 'spades')],
    triggerOptions: { playedHandsThisBlind: 2 }
  },
  discard_banner: {
    triggerCards: [card('A', 'spades')],
    skipCards: [card('A', 'spades')],
    triggerOptions: { discardsRemaining: 2 },
    skipOptions: { discardsRemaining: 0 }
  },
  empty_peak: {
    triggerCards: [card('A', 'spades')],
    skipCards: [card('A', 'spades')],
    triggerOptions: { discardsRemaining: 0 },
    skipOptions: { discardsRemaining: 1 }
  },
  frugal_clown: {
    triggerCards: [card('A', 'spades')],
    skipCards: [card('A', 'spades')],
    triggerOptions: { money: 3 },
    skipOptions: { money: 4 }
  },
  bull_bank: {
    triggerCards: [card('A', 'spades')],
    skipCards: [card('A', 'spades')],
    triggerOptions: { money: 8 },
    skipOptions: { money: 0 }
  },
  bonus_collector: { triggerCards: [card('A', 'spades', 'bonus')], skipCards: [card('A', 'spades')] },
  mult_collector: { triggerCards: [card('A', 'spades', 'mult')], skipCards: [card('A', 'spades')] },
  wild_signal: { triggerCards: [card('A', 'spades', 'wild')], skipCards: [card('A', 'spades')] },
  stone_stack: { triggerCards: [card('A', 'spades', 'stone')], skipCards: [card('A', 'spades')] },
  steel_engine: {
    triggerCards: [card('2', 'clubs')],
    skipCards: [card('2', 'clubs')],
    triggerOptions: { heldCards: [card('A', 'hearts', 'steel')] },
    skipOptions: { heldCards: [card('A', 'hearts')] }
  },
  five_card_stamp: {
    triggerCards: [card('A', 'spades'), card('K', 'hearts'), card('Q', 'clubs'), card('J', 'diamonds'), card('9', 'spades')],
    skipCards: [card('A', 'spades'), card('K', 'hearts'), card('Q', 'clubs'), card('J', 'diamonds')]
  },
  solo_stamp: { triggerCards: [card('A', 'spades')], skipCards: [card('A', 'spades'), card('K', 'hearts')] },
  face_free_bus: {
    triggerCards: [card('A', 'spades')],
    triggerOptions: { level: 2 }
  },
  green_counter: {
    triggerCards: [card('A', 'spades')],
    triggerOptions: { level: 2 }
  },
  glass_accountant: { triggerCards: [card('A', 'spades', 'glass')], skipCards: [card('A', 'spades')] },
  gold_counter: { triggerCards: [card('A', 'spades', 'gold')], skipCards: [card('A', 'spades')] }
};

describe('P0 engine', () => {
  it('creates a standard 52-card deck with unique cards', () => {
    const deck = createStandardDeck();

    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((deckCard) => deckCard.id)).size).toBe(52);
  });

  it('shuffles deterministically with a fixed seed', () => {
    const firstShuffle = shuffleWithRng(createStandardDeck(), createRng('same-seed')).map((deckCard) => deckCard.id);
    const secondShuffle = shuffleWithRng(createStandardDeck(), createRng('same-seed')).map((deckCard) => deckCard.id);
    const differentShuffle = shuffleWithRng(createStandardDeck(), createRng('different-seed')).map((deckCard) => deckCard.id);

    expect(firstShuffle).toEqual(secondShuffle);
    expect(firstShuffle).not.toEqual(differentShuffle);
  });

  it('starts with a stable initial hand for the same seed', () => {
    const firstGame = startCurrentBlind(createInitialGame('stable-run'));
    const secondGame = startCurrentBlind(createInitialGame('stable-run'));

    expect(firstGame.hand.map((deckCard) => deckCard.id)).toEqual(secondGame.hand.map((deckCard) => deckCard.id));
  });

  it('limits selection to five cards', () => {
    const game = startCurrentBlind(createInitialGame('selection-cap'));
    const next = game.hand
      .slice(0, MAX_SELECTED_CARDS + 1)
      .reduce((current, deckCard) => toggleCardSelection(current, deckCard.id), game);

    expect(next.selectedCardIds).toHaveLength(MAX_SELECTED_CARDS);
  });

  it('does not discard when no discards remain', () => {
    const game = startCurrentBlind(createInitialGame('no-discards'));
    const selected = toggleCardSelection({ ...game, discardsRemaining: 0 }, game.hand[0].id);
    const afterDiscard = discardSelectedCards(selected);

    expect(afterDiscard.discardsRemaining).toBe(0);
    expect(afterDiscard.hand).toHaveLength(selected.hand.length);
    expect(afterDiscard.discardPile).toHaveLength(0);
  });

  it('plays selected cards, updates piles, refills hand, and adds score', () => {
    const game = startCurrentBlind(createInitialGame('play-flow'));
    const selected = toggleCardSelection(game, game.hand[0].id);
    const afterPlay = playSelectedCards(selected);

    expect(afterPlay.handsRemaining).toBe(game.handsRemaining - 1);
    expect(afterPlay.currentScore).toBeGreaterThan(0);
    expect(afterPlay.discardPile).toHaveLength(1);
    expect(afterPlay.hand).toHaveLength(game.handSize);
    expect(afterPlay.drawPile).toHaveLength(game.drawPile.length - 1);
    expect(afterPlay.selectedCardIds).toHaveLength(0);
  });

  it('fails the blind when the final hand does not reach the target', () => {
    const game = startCurrentBlind(createInitialGame('loss-flow'));
    const selected = toggleCardSelection(
      {
        ...game,
        targetScore: 99999,
        handsRemaining: 1
      },
      game.hand[0].id
    );
    const afterPlay = playSelectedCards(selected);

    expect(afterPlay.status).toBe('lost');
    expect(afterPlay.phase).toBe('run_lost');
    expect(afterPlay.message).toContain('还差');
    expect(afterPlay.message).toContain('最后一手');
  });

  it('clears the blind when a played hand reaches the target', () => {
    const game = startCurrentBlind(createInitialGame('win-flow'));
    const selected = toggleCardSelection(
      {
        ...game,
        targetScore: 1
      },
      game.hand[0].id
    );
    const afterPlay = playSelectedCards(selected);

    expect(afterPlay.status).toBe('won');
    expect(afterPlay.phase).toBe('shop');
  });

  it('calculates base Chips x Mult correctly', () => {
    const result = scorePlayedCards([card('A', 'spades'), card('A', 'hearts'), card('9', 'clubs')]);

    expect(result.handName).toBe('对子');
    expect(result.baseChips).toBe(10);
    expect(result.baseMult).toBe(2);
    expect(result.finalChips).toBe(32);
    expect(result.finalMult).toBe(2);
    expect(result.finalScore).toBe(64);
  });

  it('records scoring events in hand, card, and final order', () => {
    const result = scorePlayedCards([card('A', 'spades'), card('A', 'hearts'), card('9', 'clubs')]);

    expect(result.events.map((event) => event.stage)).toEqual(['hand', 'scored_card', 'scored_card', 'final']);
    expect(result.events[1]).toMatchObject({
      stage: 'scored_card',
      chipsDelta: 11,
      chipsAfter: 21,
      multAfter: 2
    });
    expect(result.events[result.events.length - 1]).toMatchObject({
      stage: 'final',
      scoreAfter: 64
    });
  });

  it('scores special modified-deck hands with structured logs', () => {
    const cards = [
      { ...card('A', 'hearts'), id: 'a-1' },
      { ...card('A', 'hearts'), id: 'a-2' },
      { ...card('A', 'hearts'), id: 'a-3' },
      { ...card('A', 'hearts'), id: 'a-4' },
      { ...card('A', 'hearts'), id: 'a-5' }
    ];
    const result = scorePlayedCards(cards);

    expect(result.handName).toBe('同花五条');
    expect(result.baseChips).toBe(160);
    expect(result.baseMult).toBe(16);
    expect(result.scoredCards).toHaveLength(5);
    expect(result.finalScore).toBe((160 + 55) * 16);
  });
});

describe('P1 run flow', () => {
  it('starts at Ante 1 blind selection with no hand dealt yet', () => {
    const game = createInitialGame('new-run');

    expect(game.phase).toBe('blind_select');
    expect(game.ante).toBe(1);
    expect(game.blindIndex).toBe(0);
    expect(game.money).toBe(0);
    expect(game.hand).toHaveLength(0);
  });

  it('starts the current blind with a target, hand, and blind definition', () => {
    const game = startCurrentBlind(createInitialGame('start-blind'));

    expect(game.phase).toBe('playing');
    expect(game.currentBlind?.name).toBe('小盲');
    expect(game.targetScore).toBe(game.currentBlind?.targetScore);
    expect(game.hand).toHaveLength(game.handSize);
    expect(game.handsRemaining).toBe(4);
    expect(game.discardsRemaining).toBe(3);
  });

  it('rewards money and sends the player to shop after clearing a blind', () => {
    const game = startCurrentBlind(createInitialGame('shop-flow'));
    const selected = toggleCardSelection({ ...game, targetScore: 1 }, game.hand[0].id);
    const afterPlay = playSelectedCards(selected);

    expect(afterPlay.phase).toBe('shop');
    expect(afterPlay.money).toBe(game.currentBlind?.reward);
    expect(afterPlay.shopOffers).toHaveLength(4);
  });

  it('moves from shop to the next blind and then to the next ante after boss', () => {
    const smallShop = {
      ...startCurrentBlind(createInitialGame('advance-flow')),
      phase: 'shop' as const,
      status: 'won' as const,
      blindIndex: 0
    };
    const bigSelect = advanceFromShop(smallShop);

    expect(bigSelect.phase).toBe('blind_select');
    expect(bigSelect.ante).toBe(1);
    expect(bigSelect.blindIndex).toBe(1);

    const bossShop = {
      ...bigSelect,
      phase: 'shop' as const,
      status: 'won' as const,
      blindIndex: 2
    };
    const nextAnte = advanceFromShop(bossShop);

    expect(nextAnte.ante).toBe(2);
    expect(nextAnte.blindIndex).toBe(0);
  });

  it('wins the whole run after clearing Ante 8 boss blind', () => {
    const finalSelect = {
      ...createInitialGame('final-win'),
      ante: 8,
      blindIndex: 2
    };
    const game = startCurrentBlind(finalSelect);
    const selected = toggleCardSelection({ ...game, targetScore: 1 }, game.hand[0].id);
    const afterPlay = playSelectedCards(selected);

    expect(afterPlay.phase).toBe('run_won');
    expect(afterPlay.status).toBe('won');
  });

  it('can traverse the full standard run without reaching a dead-end phase', () => {
    let state: GameState = createInitialGame('full-run-regression');
    const visited: string[] = [];

    for (let step = 0; step < MAX_ANTE * 3; step += 1) {
      expect(state.phase).toBe('blind_select');
      visited.push(`${state.ante}-${state.blindIndex}`);

      const started = startCurrentBlind(state);
      const selected = toggleCardSelection({ ...started, targetScore: 0 }, started.hand[0].id);
      const cleared = playSelectedCards(selected);

      if (step === MAX_ANTE * 3 - 1) {
        expect(cleared.phase).toBe('run_won');
        expect(cleared.status).toBe('won');
        state = cleared;
        break;
      }

      expect(cleared.phase).toBe('shop');
      expect(cleared.shopOffers.length).toBeGreaterThan(0);
      state = advanceFromShop(cleared);
    }

    expect(visited).toHaveLength(MAX_ANTE * 3);
    expect(state.phase).toBe('run_won');
  });
});

describe('P2 joker system', () => {
  it('defines a complete data-driven joker roster with metadata', () => {
    expect(JOKERS).toHaveLength(64);
    expect(new Set(JOKERS.map((joker) => joker.id)).size).toBe(JOKERS.length);
    JOKERS.forEach((joker) => {
      expect(joker.archetypes.length).toBeGreaterThan(0);
      expect(joker.triggerTiming.length).toBeGreaterThan(0);
      expect(joker.triggerText).not.toBe('');
      expect(joker.conditionText).not.toBe('');
      expect(getJokerDefinition(joker.id)).toBe(joker);
    });
  });

  it('keeps a logic validation case for every joker', () => {
    expect(Object.keys(JOKER_LOGIC_CASES).sort()).toEqual(JOKERS.map((joker) => joker.id).sort());
  });

  it('triggers and skips every hand-scoring joker in its intended situation', () => {
    Object.entries(JOKER_LOGIC_CASES)
      .filter(([, testCase]) => !testCase.kind || testCase.kind === 'scoring')
      .forEach(([definitionId, testCase]) => {
        if (testCase.kind && testCase.kind !== 'scoring') return;

        const triggered = scoreWithJoker(definitionId, testCase.triggerCards, testCase.triggerOptions);
        expect(triggeredJokerEvents(triggered).length, `${definitionId} should trigger`).toBeGreaterThan(0);

        if (testCase.skipCards) {
          const skipped = scoreWithJoker(definitionId, testCase.skipCards, testCase.skipOptions);
          expect(triggeredJokerEvents(skipped), `${definitionId} should skip`).toHaveLength(0);
        }
      });
  });

  it('copies the right joker through the copy hook', () => {
    const result = scorePlayedCardsWithJokers([card('A', 'spades')], {
      jokers: [
        { instanceId: 'joker-copy', definitionId: 'echo_joker', level: 0 },
        { instanceId: 'joker-right', definitionId: 'mult_starter', level: 0 }
      ],
      discardsRemaining: 0,
      handsRemainingBeforePlay: 2,
      playedHandsThisBlind: 1,
      money: 0,
      handLevels: createDefaultHandLevels(),
      heldCards: []
    });

    expect(result.triggeredJokerIds).toEqual(['joker-copy', 'joker-right']);
    expect(result.log.events.find((event) => event.sourceId === 'joker-copy')).toMatchObject({ multDelta: 4 });
  });

  it('buys a joker from the shop and removes the offer', () => {
    const shop = {
      ...createInitialGame('buy-joker'),
      phase: 'shop' as const,
      money: 5,
      shopOffers: [{ id: 'offer-1', kind: 'joker' as const, definitionId: 'mult_starter', price: 2 }]
    };
    const next = buyJoker(shop, 'offer-1');

    expect(next.money).toBe(3);
    expect(next.jokers).toHaveLength(1);
    expect(next.jokers[0].definitionId).toBe('mult_starter');
    expect(next.shopOffers).toHaveLength(0);
  });

  it('does not buy when joker slots are full', () => {
    const shop = {
      ...createInitialGame('full-slots'),
      phase: 'shop' as const,
      money: 99,
      jokerSlots: 1,
      jokers: [{ instanceId: 'joker-existing', definitionId: 'chip_starter', level: 0 }],
      shopOffers: [{ id: 'offer-1', kind: 'joker' as const, definitionId: 'mult_starter', price: 2 }]
    };
    const next = buyJoker(shop, 'offer-1');

    expect(next.money).toBe(99);
    expect(next.jokers).toHaveLength(1);
    expect(next.shopOffers).toHaveLength(1);
  });

  it('sells a joker for its sell value', () => {
    const game = {
      ...createInitialGame('sell-joker'),
      money: 0,
      jokers: [{ instanceId: 'joker-1', definitionId: 'mult_starter', level: 0 }]
    };
    const next = sellJoker(game, 'joker-1');

    expect(next.money).toBe(1);
    expect(next.jokers).toHaveLength(0);
  });

  it('refreshes the shop with a deterministic cost', () => {
    const shop = {
      ...createInitialGame('refresh-shop'),
      phase: 'shop' as const,
      money: 8,
      shopRerollCost: STARTING_REROLL_COST,
      shopRefreshCount: 0
    };
    const next = refreshShop(shop);

    expect(next.money).toBe(8 - STARTING_REROLL_COST);
    expect(next.shopRerollCost).toBe(STARTING_REROLL_COST + 1);
    expect(next.shopRefreshCount).toBe(1);
    expect(next.shopOffers).toHaveLength(4);
  });

  it('moves jokers and makes order matter for scoring', () => {
    const baseGame = {
      ...startCurrentBlind(createInitialGame('joker-order')),
      hand: [card('A', 'spades')],
      drawPile: [],
      selectedCardIds: ['A-spades'],
      jokers: [
        { instanceId: 'joker-add', definitionId: 'mult_starter', level: 0 },
        { instanceId: 'joker-times', definitionId: 'magnifier', level: 0 }
      ]
    };
    const addThenMultiply = playSelectedCards(baseGame);
    const moved = moveJoker(baseGame, 0, 1);
    const multiplyThenAdd = playSelectedCards(moved);

    expect(addThenMultiply.lastScoringLog?.finalScore).toBeGreaterThan(multiplyThenAdd.lastScoringLog?.finalScore ?? 0);
    expect(addThenMultiply.lastTriggeredJokerIds).toEqual(['joker-add', 'joker-times']);
    expect(addThenMultiply.lastScoringLog?.events.filter((event) => event.stage === 'joker').map((event) => event.sourceId)).toEqual([
      'joker-add',
      'joker-times'
    ]);
    expect(addThenMultiply.lastScoringLog?.events.find((event) => event.sourceId === 'joker-add')).toMatchObject({
      multDelta: 4
    });
    expect(addThenMultiply.lastScoringLog?.events.find((event) => event.sourceId === 'joker-times')).toMatchObject({
      multFactor: 1.5
    });
  });

  it('grows a growth joker after its matching hand is played', () => {
    const game = {
      ...startCurrentBlind(createInitialGame('growth-joker')),
      hand: [card('A', 'spades'), card('A', 'hearts')],
      drawPile: [],
      selectedCardIds: ['A-spades', 'A-hearts'],
      jokers: [{ instanceId: 'joker-growth', definitionId: 'pair_seed', level: 0 }]
    };
    const afterFirstPair = playSelectedCards(game);

    expect(afterFirstPair.jokers[0].level).toBe(1);
    expect(afterFirstPair.lastTriggeredJokerIds).toEqual(['joker-growth']);
  });

  it('grows and resets the newer growth jokers according to their conditions', () => {
    const noFace = scorePlayedCardsWithJokers([card('A', 'spades')], {
      jokers: [{ instanceId: 'joker-bus', definitionId: 'face_free_bus', level: 2 }],
      discardsRemaining: 0,
      handsRemainingBeforePlay: 2,
      playedHandsThisBlind: 1,
      money: 0,
      handLevels: createDefaultHandLevels(),
      heldCards: []
    });
    const withFace = scorePlayedCardsWithJokers([card('K', 'spades')], {
      jokers: [{ instanceId: 'joker-bus', definitionId: 'face_free_bus', level: 2 }],
      discardsRemaining: 0,
      handsRemainingBeforePlay: 2,
      playedHandsThisBlind: 1,
      money: 0,
      handLevels: createDefaultHandLevels(),
      heldCards: []
    });
    const green = scorePlayedCardsWithJokers([card('A', 'spades')], {
      jokers: [{ instanceId: 'joker-green', definitionId: 'green_counter', level: 2 }],
      discardsRemaining: 0,
      handsRemainingBeforePlay: 2,
      playedHandsThisBlind: 1,
      money: 0,
      handLevels: createDefaultHandLevels(),
      heldCards: []
    });

    expect(noFace.jokers[0].level).toBe(3);
    expect(withFace.jokers[0].level).toBe(0);
    expect(green.jokers[0].level).toBe(3);
    expect(noFace.log.events.some((event) => event.description.includes('无计分人头牌'))).toBe(true);
    expect(withFace.log.events.some((event) => event.description.includes('成长重置'))).toBe(true);
  });

  it('triggers and skips the new scoring jokers in their intended situations', () => {
    const scoringCases: Array<{
      definitionId: string;
      triggerCards: Card[];
      skipCards: Card[];
      triggerOptions?: JokerScoreOptions;
      skipOptions?: JokerScoreOptions;
    }> = [
      {
        definitionId: 'single_spotlight',
        triggerCards: [card('A', 'spades')],
        skipCards: [card('A', 'spades'), card('A', 'hearts')]
      },
      {
        definitionId: 'pair_archivist',
        triggerCards: [card('A', 'spades'), card('A', 'hearts')],
        skipCards: [card('A', 'spades'), card('K', 'hearts')]
      },
      {
        definitionId: 'two_pair_tuner',
        triggerCards: [card('A', 'spades'), card('A', 'hearts'), card('K', 'clubs'), card('K', 'diamonds')],
        skipCards: [card('A', 'spades'), card('A', 'hearts'), card('K', 'clubs')]
      },
      {
        definitionId: 'royal_clerk',
        triggerCards: [card('K', 'spades')],
        skipCards: [card('A', 'spades')]
      },
      {
        definitionId: 'club_drummer',
        triggerCards: [card('A', 'clubs')],
        skipCards: [card('A', 'hearts')]
      },
      {
        definitionId: 'straight_doubler',
        triggerCards: [card('2', 'clubs'), card('3', 'diamonds'), card('4', 'hearts'), card('5', 'spades'), card('6', 'clubs')],
        skipCards: [card('A', 'spades'), card('A', 'hearts')]
      },
      {
        definitionId: 'glass_prism',
        triggerCards: [card('A', 'spades', 'glass')],
        skipCards: [card('A', 'spades', 'bonus')]
      },
      {
        definitionId: 'steel_fund',
        triggerCards: [card('2', 'clubs')],
        skipCards: [card('2', 'clubs')],
        triggerOptions: { heldCards: [card('A', 'hearts', 'steel')] },
        skipOptions: { heldCards: [card('A', 'hearts')] }
      }
    ];

    scoringCases.forEach((testCase) => {
      const triggered = scoreWithJoker(testCase.definitionId, testCase.triggerCards, testCase.triggerOptions);
      const skipped = scoreWithJoker(testCase.definitionId, testCase.skipCards, testCase.skipOptions);

      expect(triggeredJokerEvents(triggered).length, testCase.definitionId).toBeGreaterThan(0);
      expect(triggeredJokerEvents(skipped), testCase.definitionId).toHaveLength(0);
    });
  });

  it('can repeat the first scored card and respects disabled scoring cards', () => {
    const triggered = scoreWithJoker('first_card_echo', [card('A', 'spades')]);
    const skipped = scoreWithJoker('first_card_echo', [card('A', 'spades')], {
      disabledCardReasons: { 'A-spades': '测试：这张牌不计分' }
    });

    expect(triggered.finalChips).toBe(27);
    expect(triggeredJokerEvents(triggered)).toHaveLength(1);
    expect(triggeredJokerEvents(skipped)).toHaveLength(0);
  });

  it('applies economy joker hooks outside hand scoring', () => {
    const played = card('A', 'spades');
    const clearGame = {
      ...startCurrentBlind(createInitialGame('cashout-hook')),
      targetScore: 1,
      hand: [played],
      drawPile: [],
      selectedCardIds: [played.id],
      jokers: [{ instanceId: 'joker-cash', definitionId: 'cashout_clown', level: 0 }]
    };
    const cleared = playSelectedCards(clearGame);

    expect(cleared.money).toBe((clearGame.currentBlind?.reward ?? 0) + 2);
    expect(cleared.message).toContain('小丑额外获得 $2');

    const couponGame = {
      ...startCurrentBlind(createInitialGame('coupon-hook')),
      targetScore: 1,
      hand: [played],
      drawPile: [],
      selectedCardIds: [played.id],
      jokers: [{ instanceId: 'joker-coupon', definitionId: 'coupon_clip', level: 0 }]
    };
    const shop = playSelectedCards(couponGame);

    expect(shop.shopRerollCost).toBe(STARTING_REROLL_COST - 1);

    const sold = sellJoker(
      {
        ...createInitialGame('sell-hook'),
        money: 0,
        jokers: [{ instanceId: 'joker-parting', definitionId: 'parting_gift', level: 0 }]
      },
      'joker-parting'
    );

    expect(sold.money).toBe(getJokerSellValue('parting_gift') + 3);
    expect(sold.message).toContain('额外获得 $3');
  });
});

describe('P3 shop pressure', () => {
  it('generates weighted shop offers deterministically from a fixed seed', () => {
    const played = card('A', 'spades');
    const makeShop = () =>
      playSelectedCards({
        ...startCurrentBlind(createInitialGame('weighted-shop')),
        targetScore: 1,
        hand: [played],
        drawPile: [],
        selectedCardIds: [played.id]
      });
    const first = makeShop();
    const second = makeShop();

    expect(first.shopOffers).toEqual(second.shopOffers);
    expect(first.shopOffers).toHaveLength(4);
    first.shopOffers.forEach((offer) => {
      if (offer.kind === 'joker') {
        expect(JOKERS.some((joker) => joker.id === offer.definitionId)).toBe(true);
      }
      if (offer.kind === 'consumable') {
        expect(offer.definitionId).toMatch(/^(planet|tarot)_/);
      }
      expect(offer.price).toBeGreaterThanOrEqual(0);
    });
  });

  it('starts rerolls at $3, increases by $1, and applies discounts down to $0', () => {
    const baseShop = {
      ...createInitialGame('reroll-pressure'),
      phase: 'shop' as const,
      money: 20,
      shopRerollCost: STARTING_REROLL_COST,
      shopRefreshCount: 0
    };
    const firstRefresh = refreshShop(baseShop);
    const secondRefresh = refreshShop(firstRefresh);

    expect(STARTING_REROLL_COST).toBe(3);
    expect(firstRefresh.money).toBe(17);
    expect(firstRefresh.shopRerollCost).toBe(4);
    expect(secondRefresh.money).toBe(13);
    expect(secondRefresh.shopRerollCost).toBe(5);

    const discountedShop = {
      ...baseShop,
      ownedVouchers: ['cheap_shuffle'],
      jokers: [{ instanceId: 'joker-coupon', definitionId: 'coupon_clip', level: 0 }]
    };
    const discountedRefresh = refreshShop({
      ...discountedShop,
      shopRerollCost: 1
    });

    expect(discountedRefresh.money).toBe(19);
    expect(discountedRefresh.shopRerollCost).toBe(2);
  });

  it('pays interest after clearing a blind and caps the payout', () => {
    expect(calculateInterest(0)).toBe(0);
    expect(calculateInterest(24)).toBe(4);
    expect(calculateInterest(100)).toBe(5);

    const played = card('A', 'spades');
    const game = {
      ...startCurrentBlind(createInitialGame('interest-payout')),
      money: 24,
      targetScore: 1,
      hand: [played],
      drawPile: [],
      selectedCardIds: [played.id]
    };
    const next = playSelectedCards(game);

    expect(next.phase).toBe('shop');
    expect(next.money).toBe(24 + (game.currentBlind?.reward ?? 0) + 4);
    expect(next.message).toContain('利息获得 $4');
  });

  it('locks shop progression and refresh while a pack choice is open', () => {
    const shop = {
      ...createInitialGame('shop-lock'),
      phase: 'shop' as const,
      money: 10,
      shopRerollCost: STARTING_REROLL_COST,
      shopOffers: [{ id: 'pack-offer', kind: 'pack' as const, price: 4 }]
    };
    const opened = buyShopItem(shop, 'pack-offer');
    const refreshed = refreshShop(opened);
    const advanced = advanceFromShop(opened);

    expect(opened.packChoices).toHaveLength(3);
    expect(refreshed.shopRefreshCount).toBe(opened.shopRefreshCount);
    expect(refreshed.message).toContain('先从补充包里选择');
    expect(advanced.phase).toBe('shop');
    expect(advanced.message).toContain('先从补充包里选择');
  });

  it('guarantees an affordable starter joker in the first small-blind shop only', () => {
    const started = startCurrentBlind(createInitialGame('first-shop-safety-net'));
    const reward = started.currentBlind?.reward ?? 0;
    const openedShop = playSelectedCards(
      toggleCardSelection(
        {
          ...started,
          money: -reward,
          targetScore: 1
        },
        started.hand[0].id
      )
    );
    const affordableStarter = openedShop.shopOffers.find(
      (offer) => offer.kind === 'joker' && ['chip_starter', 'mult_starter'].includes(offer.definitionId ?? '') && offer.price <= openedShop.money
    );

    expect(openedShop.phase).toBe('shop');
    expect(openedShop.money).toBe(0);
    expect(affordableStarter).toBeDefined();

    const refreshed = refreshShop({
      ...openedShop,
      shopRerollCost: 0
    });

    expect(refreshed.shopRefreshCount).toBe(1);
    expect(refreshed.shopOffers.every((offer) => !offer.id.includes('first-shop'))).toBe(true);
  });
});

describe('P3 consumables and deck modification', () => {
  it('shop can sell a consumable into the consumable slot', () => {
    const shop = {
      ...createInitialGame('buy-consumable'),
      phase: 'shop' as const,
      money: 5,
      shopOffers: [{ id: 'offer-planet', kind: 'consumable' as const, definitionId: 'planet_pair', price: 3 }]
    };
    const next = buyShopItem(shop, 'offer-planet');

    expect(next.money).toBe(2);
    expect(next.consumables).toHaveLength(1);
    expect(next.consumables[0].definitionId).toBe('planet_pair');
    expect(next.shopOffers).toHaveLength(0);
  });

  it('uses a planet card to level the matching poker hand', () => {
    const game = {
      ...createInitialGame('planet-level'),
      consumables: [{ instanceId: 'consumable-1', definitionId: 'planet_pair' }]
    };
    const next = useConsumable(game, 'consumable-1');
    const score = scorePlayedCards([card('A', 'spades'), card('A', 'hearts')], { handLevels: next.handLevels });

    expect(next.handLevels.pair).toBe(2);
    expect(next.consumables).toHaveLength(0);
    expect(score.baseChips).toBeGreaterThan(10);
    expect(score.baseMult).toBeGreaterThan(2);
  });

  it('uses a tarot card to change suit in the persistent deck and current hand', () => {
    const sourceCard = card('A', 'spades');
    const game = {
      ...startCurrentBlind(createInitialGame('change-suit')),
      deck: [sourceCard],
      hand: [sourceCard],
      drawPile: [],
      consumables: [{ instanceId: 'consumable-1', definitionId: 'tarot_suit_hearts' }]
    };
    const targeting = useConsumable(game, 'consumable-1');
    const selected = toggleCardSelection(targeting, sourceCard.id);
    const next = useConsumable(selected, 'consumable-1');

    expect(next.hand[0].suit).toBe('hearts');
    expect(next.deck[0].suit).toBe('hearts');
    expect(next.consumables).toHaveLength(0);
  });

  it('defines rank-changing tarot cards for every rank', () => {
    RANKS.forEach((rank) => {
      const definition = getConsumableDefinition(`tarot_rank_${rank}`);

      expect(definition.effect).toEqual({ type: 'change_rank', rank });
      expect(definition.target).toEqual({ mode: 'cards', min: 1, max: 2 });
    });
  });

  it('uses a tarot card to change rank and enables five of a kind', () => {
    const keepSpade = card('A', 'spades');
    const keepDiamond = card('A', 'diamonds');
    const keepClub = card('A', 'clubs');
    const targetKing = card('K', 'hearts');
    const targetQueen = card('Q', 'hearts');
    const game = {
      ...startCurrentBlind(createInitialGame('change-rank')),
      deck: [keepSpade, keepDiamond, keepClub, targetKing, targetQueen],
      hand: [keepSpade, keepDiamond, keepClub, targetKing, targetQueen],
      drawPile: [],
      consumables: [{ instanceId: 'consumable-1', definitionId: 'tarot_rank_A' }]
    };
    const targeting = useConsumable(game, 'consumable-1');
    const selectedKing = toggleCardSelection(targeting, targetKing.id);
    const selectedQueen = toggleCardSelection(selectedKing, targetQueen.id);
    const next = useConsumable(selectedQueen, 'consumable-1');
    const score = scorePlayedCards(next.hand);

    expect(next.hand.map((deckCard) => deckCard.rank)).toEqual(['A', 'A', 'A', 'A', 'A']);
    expect(next.deck.map((deckCard) => deckCard.rank)).toEqual(['A', 'A', 'A', 'A', 'A']);
    expect(next.consumables).toHaveLength(0);
    expect(score.hand).toBe('five_of_a_kind');
  });

  it('keeps card-target consumables until a legal target count is selected', () => {
    const firstCard = card('2', 'spades');
    const secondCard = card('3', 'hearts');
    const thirdCard = card('4', 'clubs');
    const game = {
      ...startCurrentBlind(createInitialGame('target-count')),
      deck: [firstCard, secondCard, thirdCard],
      hand: [firstCard, secondCard, thirdCard],
      drawPile: [],
      consumables: [{ instanceId: 'consumable-1', definitionId: 'tarot_rank_A' }]
    };
    const targeting = useConsumable(game, 'consumable-1');
    const rejected = useConsumable(targeting, 'consumable-1');
    const selectedFirst = toggleCardSelection(targeting, firstCard.id);
    const selectedSecond = toggleCardSelection(selectedFirst, secondCard.id);
    const blockedThird = toggleCardSelection(selectedSecond, thirdCard.id);

    expect(rejected.consumables).toHaveLength(1);
    expect(rejected.message).toContain('请选择 1 到 2 张手牌');
    expect(blockedThird.selectedCardIds).toHaveLength(2);
    expect(blockedThird.message).toContain('最多选择 2 张目标牌');
  });

  it('copy and destroy tarot cards change deck size predictably', () => {
    const sourceCard = card('K', 'clubs', 'bonus');
    const copyGame = {
      ...startCurrentBlind(createInitialGame('copy-card')),
      deck: [sourceCard],
      hand: [sourceCard],
      drawPile: [],
      consumables: [{ instanceId: 'consumable-1', definitionId: 'tarot_copy' }]
    };
    const copied = useConsumable(toggleCardSelection(useConsumable(copyGame, 'consumable-1'), sourceCard.id), 'consumable-1');

    expect(copied.deck).toHaveLength(2);
    expect(copied.deck[1].enhancement).toBe('bonus');

    const destroyGame = {
      ...copied,
      consumables: [{ instanceId: 'consumable-2', definitionId: 'tarot_destroy' }],
      hand: [sourceCard],
      selectedCardIds: []
    };
    const destroyed = useConsumable(toggleCardSelection(useConsumable(destroyGame, 'consumable-2'), sourceCard.id), 'consumable-2');

    expect(destroyed.deck.some((deckCard) => deckCard.id === sourceCard.id)).toBe(false);
    expect(destroyed.drawPile.some((deckCard) => deckCard.id === sourceCard.id)).toBe(false);
    expect(destroyed.discardPile.some((deckCard) => deckCard.id === sourceCard.id)).toBe(false);
    expect(destroyed.hand).toHaveLength(0);
  });

  it('card enhancements affect scoring and gold pays out after clearing a blind', () => {
    const bonusScore = scorePlayedCards([card('A', 'spades', 'bonus')]);
    const multScore = scorePlayedCards([card('A', 'spades', 'mult')]);
    const wildScore = scorePlayedCards([
      card('A', 'hearts'),
      card('K', 'hearts'),
      card('7', 'hearts'),
      card('4', 'hearts'),
      card('2', 'spades', 'wild')
    ]);
    const stoneScore = scorePlayedCards([card('9', 'clubs', 'stone')]);
    const steelHeldScore = scorePlayedCards([card('A', 'spades')], { heldCards: [card('K', 'clubs', 'steel')] });
    const steelPlayedScore = scorePlayedCards([card('K', 'clubs', 'steel')]);
    const firstGlassScore = scorePlayedCards([card('Q', 'diamonds', 'glass')], { rng: createRng('glass-stable') });
    const secondGlassScore = scorePlayedCards([card('Q', 'diamonds', 'glass')], { rng: createRng('glass-stable') });

    expect(bonusScore.finalChips).toBe(46);
    expect(multScore.finalMult).toBe(5);
    expect(wildScore.hand).toBe('flush');
    expect(stoneScore.finalChips).toBe(55);
    expect(steelHeldScore.finalMult).toBe(1.5);
    expect(steelPlayedScore.finalMult).toBe(1);
    expect(firstGlassScore.events.some((event) => event.label === '玻璃牌碎裂')).toBe(
      secondGlassScore.events.some((event) => event.label === '玻璃牌碎裂')
    );
    expect(bonusScore.events.some((event) => event.stage === 'enhancement' && event.chipsDelta === 30)).toBe(true);
    expect(multScore.events.some((event) => event.stage === 'enhancement' && event.multDelta === 4)).toBe(true);

    const played = card('2', 'clubs');
    const gold = card('A', 'hearts', 'gold');
    const game = {
      ...startCurrentBlind(createInitialGame('gold-payout')),
      targetScore: 1,
      hand: [played, gold],
      drawPile: [],
      selectedCardIds: [played.id]
    };
    const next = playSelectedCards(game);

    expect(next.phase).toBe('shop');
    expect(next.money).toBe((game.currentBlind?.reward ?? 0) + 3);
  });

  it('opens a pack and chooses one consumable', () => {
    const shop = {
      ...createInitialGame('pack-choice'),
      phase: 'shop' as const,
      money: 5,
      shopOffers: [{ id: 'pack-offer', kind: 'pack' as const, definitionId: 'tarot_pack', price: 4 }]
    };
    const opened = buyShopItem(shop, 'pack-offer');
    const chosen = choosePackConsumable(opened, opened.packChoices[0].instanceId);

    expect(opened.packChoices).toHaveLength(3);
    expect(opened.packChoices.every((choice) => choice.kind === 'consumable')).toBe(true);
    expect(chosen.packChoices).toHaveLength(0);
    expect(chosen.consumables).toHaveLength(1);
  });

  it('adds pack candidates when a pack-choice voucher is owned', () => {
    const shop = {
      ...createInitialGame('pack-choice-voucher'),
      phase: 'shop' as const,
      money: 5,
      ownedVouchers: ['pack_preview'],
      shopOffers: [{ id: 'pack-offer', kind: 'pack' as const, definitionId: 'tarot_pack', price: 4 }]
    };
    const opened = buyShopItem(shop, 'pack-offer');

    expect(opened.packChoices).toHaveLength(4);
  });
});

describe('P5 packs and consumable experience', () => {
  it('defines the first wave of pack types and spectral effects', () => {
    expect(PACKS.map((pack) => pack.kind).sort()).toEqual(['joker', 'planet', 'spectral', 'standard', 'tarot']);
    expect(SPECTRAL_CARDS.length).toBeGreaterThanOrEqual(5);
  });

  it('opens a standard pack and adds one playing card to the deck', () => {
    const shop = {
      ...createInitialGame('standard-pack'),
      phase: 'shop' as const,
      money: 10,
      shopOffers: [{ id: 'standard-pack-offer', kind: 'pack' as const, definitionId: 'standard_pack', price: 4 }]
    };
    const opened = buyShopItem(shop, 'standard-pack-offer');
    const chosen = choosePackConsumable(opened, opened.packChoices[0].instanceId);

    expect(opened.packChoices).toHaveLength(3);
    expect(opened.packChoices.every((choice) => choice.kind === 'playing_card')).toBe(true);
    expect(chosen.deck).toHaveLength(shop.deck.length + 1);
    expect(chosen.packChoices).toHaveLength(0);
    expect(chosen.message).toContain('加入当前牌组');
  });

  it('opens planet and tarot packs with skip support', () => {
    const planetShop = {
      ...createInitialGame('planet-pack'),
      phase: 'shop' as const,
      money: 10,
      shopOffers: [{ id: 'planet-pack-offer', kind: 'pack' as const, definitionId: 'planet_pack', price: 4 }]
    };
    const openedPlanet = buyShopItem(planetShop, 'planet-pack-offer');
    const skipped = skipPackChoice(openedPlanet);
    const chosenPlanet = choosePackConsumable(openedPlanet, openedPlanet.packChoices[0].instanceId);

    expect(openedPlanet.packChoices.every((choice) => choice.kind === 'consumable' && choice.definitionId.startsWith('planet_'))).toBe(true);
    expect(skipped.packChoices).toHaveLength(0);
    expect(skipped.consumables).toHaveLength(0);
    expect(chosenPlanet.consumables[0].definitionId.startsWith('planet_')).toBe(true);

    const tarotShop = {
      ...createInitialGame('tarot-pack'),
      phase: 'shop' as const,
      money: 10,
      shopOffers: [{ id: 'tarot-pack-offer', kind: 'pack' as const, definitionId: 'tarot_pack', price: 4 }]
    };
    const openedTarot = buyShopItem(tarotShop, 'tarot-pack-offer');

    expect(openedTarot.packChoices.every((choice) => choice.kind === 'consumable' && choice.definitionId.startsWith('tarot_'))).toBe(true);
  });

  it('opens a joker pack and blocks claiming while joker slots are full', () => {
    const shop = {
      ...createInitialGame('joker-pack'),
      phase: 'shop' as const,
      money: 10,
      shopOffers: [{ id: 'joker-pack-offer', kind: 'pack' as const, definitionId: 'joker_pack', price: 6 }]
    };
    const opened = buyShopItem(shop, 'joker-pack-offer');
    const full = {
      ...opened,
      jokerSlots: 1,
      jokers: [{ instanceId: 'joker-filled', definitionId: 'chip_starter', level: 0 }]
    };
    const blocked = choosePackConsumable(full, full.packChoices[0].instanceId);
    const sold = sellJoker(blocked, 'joker-filled');
    const chosen = choosePackConsumable(sold, sold.packChoices[0].instanceId);

    expect(opened.packChoices.every((choice) => choice.kind === 'joker')).toBe(true);
    expect(blocked.jokers).toHaveLength(1);
    expect(blocked.packChoices).toHaveLength(3);
    expect(blocked.message).toContain('小丑槽位已满');
    expect(chosen.jokers).toHaveLength(1);
    expect(chosen.packChoices).toHaveLength(0);
  });

  it('applies spectral choices with deterministic fixed-seed effects', () => {
    SPECTRAL_CARDS.forEach((definition) => {
      const base = {
        ...createInitialGame(`spectral-${definition.id}`),
        phase: 'shop' as const,
        money: 10,
        packChoices: [
          {
            instanceId: 'spectral-choice',
            packId: 'spectral_pack',
            kind: 'spectral' as const,
            definitionId: definition.id
          }
        ]
      };
      const first = choosePackConsumable(base, 'spectral-choice');
      const second = choosePackConsumable(base, 'spectral-choice');

      expect(first.deck).toEqual(second.deck);
      expect(first.handLevels).toEqual(second.handLevels);
      expect(first.money).toBe(second.money);
      expect(first.packChoices).toHaveLength(0);

      definition.effects.forEach((effect) => {
        if (effect.type === 'enhance_random_cards') {
          expect(first.deck.filter((deckCard) => deckCard.enhancement === effect.enhancement)).toHaveLength(effect.count);
        }

        if (effect.type === 'copy_random_card') {
          expect(first.deck).toHaveLength(base.deck.length + effect.count);
        }

        if (effect.type === 'destroy_random_cards') {
          expect(first.deck).toHaveLength(base.deck.length - effect.count);
        }

        if (effect.type === 'upgrade_random_hands') {
          const totalLevelGain = Object.values(first.handLevels).reduce((total, level) => total + (level - 1), 0);
          expect(totalLevelGain).toBe(effect.count * effect.amount);
        }
      });
    });
  });
});

describe('P4 bosses, tags, and vouchers', () => {
  it('defines enough data-driven bosses, tags, and vouchers', () => {
    expect(BOSSES.length).toBeGreaterThanOrEqual(10);
    expect(TAGS.length).toBeGreaterThanOrEqual(10);
    expect(VOUCHERS).toHaveLength(32);
    expect(new Set(VOUCHERS.map((voucher) => voucher.id)).size).toBe(VOUCHERS.length);
    VOUCHERS.filter((voucher) => voucher.tier === 2).forEach((voucher) => {
      expect(voucher.requiresVoucherId, voucher.id).toBeTruthy();
      expect(VOUCHERS.some((candidate) => candidate.id === voucher.requiresVoucherId)).toBe(true);
    });
  });

  it('keeps voucher upgrade offers locked until the base voucher is owned', () => {
    const upgradeIds = new Set(VOUCHERS.filter((voucher) => voucher.requiresVoucherId).map((voucher) => voucher.id));
    const baseOnlyOffers = Array.from({ length: 80 }, (_, index) => getVoucherForShop('voucher-lock', 1, 0, index, []));
    const upgradedOffers = Array.from({ length: 80 }, (_, index) => getVoucherForShop('voucher-lock', 1, 0, index, ['wide_pockets']));

    expect(baseOnlyOffers.every((voucher) => !voucher || !upgradeIds.has(voucher.id))).toBe(true);
    expect(upgradedOffers.some((voucher) => voucher?.id === 'wide_locker')).toBe(true);
  });

  it('applies voucher effects to shop size, interest, and reroll floors', () => {
    const shop = {
      ...createInitialGame('voucher-effect-shop'),
      phase: 'shop' as const,
      ownedVouchers: ['extra_shelf'],
      money: 20,
      shopRerollCost: STARTING_REROLL_COST
    };
    const refreshed = refreshShop(shop);

    expect(refreshed.shopOffers).toHaveLength(5);
    expect(calculateInterest(30, { ownedVouchers: ['money_ladder', 'small_savings'] })).toBe(7);

    const freeRefresh = refreshShop({
      ...shop,
      ownedVouchers: ['cheap_shuffle', 'soft_shuffle'],
      shopRerollCost: 0
    });

    expect(freeRefresh.money).toBe(20);
    expect(freeRefresh.shopRerollCost).toBe(2);
  });

  it('skips small and big blinds for a tag without ordinary reward', () => {
    const game = createInitialGame('skip-small');
    const skipped = skipCurrentBlind(game);

    expect(skipped.blindIndex).toBe(1);
    expect(skipped.money).toBe(0);
    expect(skipped.pendingTags).toHaveLength(1);
    expect(skipped.message).toContain('已跳过小盲');
  });

  it('does not skip the boss blind', () => {
    const game = {
      ...createInitialGame('skip-boss'),
      blindIndex: 2
    };
    const skipped = skipCurrentBlind(game);

    expect(skipped.blindIndex).toBe(2);
    expect(skipped.pendingTags).toHaveLength(0);
    expect(skipped.message).toBe('首领盲注不能跳过。');
  });

  it('redeems a cash tag when entering shop', () => {
    const played = card('A', 'spades');
    const game = {
      ...startCurrentBlind(createInitialGame('cash-tag')),
      pendingTags: [{ instanceId: 'tag-1', definitionId: 'cash_drop' }],
      targetScore: 1,
      hand: [played],
      drawPile: [],
      selectedCardIds: [played.id]
    };
    const next = playSelectedCards(game);

    expect(next.phase).toBe('shop');
    expect(next.money).toBe((game.currentBlind?.reward ?? 0) + 6);
    expect(next.pendingTags).toHaveLength(0);
    expect(next.message).toContain('标记兑现');
  });

  it('redeems an extra hand tag on the next blind start', () => {
    const game = {
      ...createInitialGame('extra-hand-tag'),
      pendingTags: [{ instanceId: 'tag-1', definitionId: 'extra_hand' }]
    };
    const started = startCurrentBlind(game);

    expect(started.handsRemaining).toBe(5);
    expect(started.pendingTags).toHaveLength(0);
  });

  it('buys a voucher and applies its long-term effect', () => {
    const shop = {
      ...createInitialGame('voucher-buy'),
      phase: 'shop' as const,
      money: 20,
      shopOffers: [{ id: 'voucher-offer', kind: 'voucher' as const, definitionId: 'wide_pockets', price: 8 }]
    };
    const next = buyShopItem(shop, 'voucher-offer');

    expect(next.money).toBe(12);
    expect(next.jokerSlots).toBe(shop.jokerSlots + 1);
    expect(next.ownedVouchers).toEqual(['wide_pockets']);
    expect(next.shopOffers).toHaveLength(0);
  });

  it('applies voucher discounts to boss target and blind rewards', () => {
    const bossSelect = {
      ...createInitialGame('boss-discount'),
      blindIndex: 2,
      ownedVouchers: ['boss_notes']
    };
    const discountedBoss = getBlindForState(bossSelect);
    const normalBoss = getBlindForState({ ...bossSelect, ownedVouchers: [] });

    expect(discountedBoss.targetScore).toBeLessThan(normalBoss.targetScore);

    const played = card('A', 'spades');
    const bonusRewardGame = {
      ...startCurrentBlind({ ...createInitialGame('bonus-contract'), ownedVouchers: ['bonus_contract'] }),
      targetScore: 1,
      hand: [played],
      drawPile: [],
      selectedCardIds: [played.id]
    };
    const next = playSelectedCards(bonusRewardGame);

    expect(next.money).toBe((bonusRewardGame.currentBlind?.reward ?? 0) + 1);
  });

  it('boss suit debuff keeps cards in the hand type but removes their card chips', () => {
    const played = card('A', 'hearts');
    const game = {
      ...startCurrentBlind(createInitialGame('suit-boss')),
      activeBossId: 'crimson_lock',
      targetScore: 999,
      hand: [played],
      drawPile: [],
      selectedCardIds: [played.id]
    };
    const next = playSelectedCards(game);

    expect(next.lastScoringLog?.handName).toBe('高牌');
    expect(next.lastScoringLog?.scoredCards[0].chips).toBe(0);
    expect(next.lastScoringLog?.finalScore).toBe(5);
    expect(next.lastScoringLog?.scoredCards[0].note).toContain('该花色不计分');
  });

  it('boss repeat-hand rule can zero out a repeated poker hand', () => {
    const game = {
      ...startCurrentBlind(createInitialGame('repeat-boss')),
      activeBossId: 'pattern_ban',
      playedHandTypesThisBlind: ['pair' as const],
      targetScore: 999,
      hand: [card('A', 'spades'), card('A', 'hearts')],
      drawPile: [],
      selectedCardIds: ['A-spades', 'A-hearts']
    };
    const next = playSelectedCards(game);

    expect(next.lastScoringLog?.handName).toBe('对子');
    expect(next.lastScoringLog?.finalScore).toBe(0);
    expect(next.lastScoringLog?.modifiers.some((modifier) => modifier.source === '首领规则')).toBe(true);
    expect(next.lastScoringLog?.events.some((event) => event.stage === 'rule' && event.description.includes('本手不得分'))).toBe(true);
    expect(next.lastScoringLog?.events[(next.lastScoringLog?.events.length ?? 1) - 1]?.scoreAfter).toBe(0);
  });
});

describe('P6 bosses and skip rewards', () => {
  it('adds boss advice and hand-interference bosses', () => {
    expect(BOSSES.every((boss) => boss.advice.length > 0)).toBe(true);
    expect(BOSSES.some((boss) => boss.effects.some((effect) => effect.type === 'max_selected_cards'))).toBe(true);
    expect(BOSSES.some((boss) => boss.effects.some((effect) => effect.type === 'hide_face_cards'))).toBe(true);
  });

  it('boss max-selection rule limits playable card selection', () => {
    const game: GameState = {
      ...startCurrentBlind(createInitialGame('short-leash')),
      activeBossId: 'short_leash',
      hand: [card('A', 'spades'), card('K', 'hearts'), card('Q', 'clubs'), card('J', 'diamonds')],
      selectedCardIds: []
    };
    const selected = game.hand.reduce((current, deckCard) => toggleCardSelection(current, deckCard.id), game);

    expect(selected.selectedCardIds).toHaveLength(3);
    expect(selected.message).toContain('首领规则');
  });

  it('boss effects clear after the blind ends', () => {
    const played = card('A', 'spades');
    const game = {
      ...startCurrentBlind(createInitialGame('boss-clear')),
      activeBossId: 'short_leash',
      targetScore: 1,
      hand: [played],
      drawPile: [],
      selectedCardIds: [played.id]
    };
    const next = playSelectedCards(game);

    expect(next.phase).toBe('shop');
    expect(next.activeBossId).toBeNull();
  });

  it('redeems a free shop tag by making current shop offers free', () => {
    const played = card('A', 'spades');
    const game = {
      ...startCurrentBlind(createInitialGame('free-shop-tag')),
      pendingTags: [{ instanceId: 'tag-1', definitionId: 'free_shop' }],
      targetScore: 1,
      hand: [played],
      drawPile: [],
      selectedCardIds: [played.id]
    };
    const next = playSelectedCards(game);

    expect(next.phase).toBe('shop');
    expect(next.shopOffers.length).toBeGreaterThan(0);
    expect(next.shopOffers.every((offer) => offer.price === 0)).toBe(true);
    expect(next.message).toContain('本次商店货架商品免费');
  });

  it('redeems a rare joker tag into a free rare joker offer', () => {
    const played = card('A', 'spades');
    const game = {
      ...startCurrentBlind(createInitialGame('rare-joker-tag')),
      pendingTags: [{ instanceId: 'tag-1', definitionId: 'rare_joker' }],
      targetScore: 1,
      hand: [played],
      drawPile: [],
      selectedCardIds: [played.id]
    };
    const next = playSelectedCards(game);
    const rareOffer = next.shopOffers.find(
      (offer) => offer.kind === 'joker' && offer.price === 0 && offer.definitionId && getJokerDefinition(offer.definitionId).rarity === 'rare'
    );

    expect(next.phase).toBe('shop');
    expect(rareOffer).toBeDefined();
    expect(next.pendingTags).toHaveLength(0);
  });
});

describe('P5 long-term systems', () => {
  it('defines starting decks and stakes for long-term runs', () => {
    expect(DECKS.map((deck) => deck.id)).toEqual(
      expect.arrayContaining(['red', 'blue', 'yellow', 'green', 'black', 'checkered', 'ghost', 'abandoned'])
    );
    expect(STAKES.map((stake) => stake.id)).toEqual(expect.arrayContaining(['white', 'red', 'green', 'black']));
  });

  it('applies starting deck parameters correctly', () => {
    const red = startCurrentBlind(createInitialGame('deck-red', { deckId: 'red' }));
    const blue = startCurrentBlind(createInitialGame('deck-blue', { deckId: 'blue' }));
    const yellow = createInitialGame('deck-yellow', { deckId: 'yellow' });
    const black = startCurrentBlind(createInitialGame('deck-black', { deckId: 'black' }));
    const checkered = createInitialGame('deck-checkered', { deckId: 'checkered' });
    const ghost = createInitialGame('deck-ghost', { deckId: 'ghost' });
    const abandoned = createInitialGame('deck-abandoned', { deckId: 'abandoned' });

    expect(red.discardsRemaining).toBe(4);
    expect(blue.handsRemaining).toBe(5);
    expect(yellow.money).toBe(10);
    expect(black.jokerSlots).toBe(6);
    expect(black.handsRemaining).toBe(3);
    expect(checkered.deck).toHaveLength(52);
    expect(new Set(checkered.deck.map((deckCard) => deckCard.suit))).toEqual(new Set(['hearts', 'spades']));
    expect(ghost.consumableSlots).toBe(3);
    expect(ghost.consumables[0].definitionId).toBe('tarot_enhance_wild');
    expect(abandoned.deck).toHaveLength(40);
    expect(abandoned.deck.some((deckCard) => ['J', 'Q', 'K'].includes(deckCard.rank))).toBe(false);
  });

  it('applies stake modifiers to targets, rewards, and shop prices', () => {
    const whiteBlind = getBlindForState(createInitialGame('stake-compare', { stakeId: 'white' }));
    const greenBlind = getBlindForState(createInitialGame('stake-compare', { stakeId: 'green' }));

    expect(greenBlind.targetScore).toBeGreaterThan(whiteBlind.targetScore);
    expect(greenBlind.reward).toBeLessThan(whiteBlind.reward);

    const whiteShop = refreshShop({
      ...createInitialGame('stake-shop', { stakeId: 'white' }),
      phase: 'shop' as const,
      money: 20,
      shopRerollCost: 0,
      shopRefreshCount: 0
    });
    const greenShop = refreshShop({
      ...createInitialGame('stake-shop', { stakeId: 'green' }),
      phase: 'shop' as const,
      money: 20,
      shopRerollCost: 0,
      shopRefreshCount: 0
    });

    expect(greenShop.shopOffers[0].definitionId).toBe(whiteShop.shopOffers[0].definitionId);
    expect(greenShop.shopOffers[0].price).toBeGreaterThan(whiteShop.shopOffers[0].price);
  });

  it('keeps identical seeds deterministic for the same action sequence', () => {
    const firstStart = startCurrentBlind(createInitialGame('same-long-run', { deckId: 'yellow', stakeId: 'red' }));
    const secondStart = startCurrentBlind(createInitialGame('same-long-run', { deckId: 'yellow', stakeId: 'red' }));
    const firstAfterPlay = playSelectedCards(toggleCardSelection({ ...firstStart, targetScore: 1 }, firstStart.hand[0].id));
    const secondAfterPlay = playSelectedCards(toggleCardSelection({ ...secondStart, targetScore: 1 }, secondStart.hand[0].id));

    expect(firstStart.hand.map((deckCard) => deckCard.id)).toEqual(secondStart.hand.map((deckCard) => deckCard.id));
    expect(firstAfterPlay.shopOffers.map((offer) => `${offer.kind}:${offer.definitionId ?? offer.id}:${offer.price}`)).toEqual(
      secondAfterPlay.shopOffers.map((offer) => `${offer.kind}:${offer.definitionId ?? offer.id}:${offer.price}`)
    );
  });

  it('records collection entries without duplicates and unlocks immediately', () => {
    const shop = {
      ...createInitialGame('collection'),
      ante: 2,
      phase: 'shop' as const,
      shopOffers: [
        { id: 'joker-offer', kind: 'joker' as const, definitionId: 'mult_starter', price: 2 },
        { id: 'planet-offer', kind: 'consumable' as const, definitionId: 'planet_pair', price: 3 },
        { id: 'voucher-offer', kind: 'voucher' as const, definitionId: 'wide_pockets', price: 8 }
      ],
      packChoices: [
        {
          instanceId: 'spectral-choice',
          packId: 'spectral_pack',
          kind: 'spectral' as const,
          definitionId: 'spectral_glass_rain'
        }
      ]
    };
    const profile = recordStatsFromState(recordSeenFromState(createDefaultProfile(), shop), shop);
    const repeated = recordSeenFromState(profile, shop);

    expect(repeated.collection.seenJokers).toEqual(['mult_starter']);
    expect(repeated.collection.seenConsumables).toEqual(['planet_pair']);
    expect(repeated.collection.seenSpectrals).toEqual(['spectral_glass_rain']);
    expect(repeated.collection.seenVouchers).toEqual(['wide_pockets']);
    expect(repeated.unlocks).toContain('stake_red');
  });

  it('continues after Ante 8 boss when endless mode is enabled', () => {
    const finalSelect = {
      ...createInitialGame('endless-win', { endless: true }),
      ante: 8,
      blindIndex: 2
    };
    const game = startCurrentBlind(finalSelect);
    const cleared = playSelectedCards(toggleCardSelection({ ...game, targetScore: 1 }, game.hand[0].id));
    const nextAnte = advanceFromShop(cleared);

    expect(cleared.phase).toBe('shop');
    expect(cleared.status).toBe('won');
    expect(nextAnte.phase).toBe('blind_select');
    expect(nextAnte.ante).toBe(9);
  });

  it('tracks results and can reset persistent profile data independently', () => {
    const wonProfile = recordRunResult(createDefaultProfile(), true);
    const reset = resetPersistentProfile();

    expect(wonProfile.stats.winCount).toBe(1);
    expect(wonProfile.unlocks).toContain('stake_green');
    expect(reset.stats.winCount).toBe(0);
    expect(reset.collection.seenJokers).toHaveLength(0);
    expect(reset.collection.seenSpectrals).toHaveLength(0);
  });
});

describe('P7 long-term replayability', () => {
  it('adds save versions and migrates older profile shapes', () => {
    const game = createInitialGame('versioned-run');
    const migrated = normalizeProfile({
      stats: {
        highestAnte: 3,
        highestSingleHandScore: 120,
        winCount: 1,
        lossCount: 0,
        runsStarted: 2
      }
    } as unknown as Parameters<typeof normalizeProfile>[0]);

    expect(game.saveVersion).toBe(GAME_SAVE_VERSION);
    expect(migrated.saveVersion).toBeGreaterThanOrEqual(2);
    expect(migrated.stats.highestAnte).toBe(3);
    expect(migrated.stats.deckRecords).toEqual({});
    expect(migrated.stats.stakeRecords).toEqual({});
  });

  it('records deck and stake run starts, results, and best scores', () => {
    const baseGame = {
      ...createInitialGame('record-run', { deckId: 'yellow', stakeId: 'green' }),
      ante: 4,
      runHighestSingleHandScore: 987
    };
    const started = recordRunStarted(createDefaultProfile(), baseGame);
    const scored = recordStatsFromState(started, baseGame);
    const won = recordRunResult(scored, true, baseGame);

    expect(won.stats.runsStarted).toBe(1);
    expect(won.stats.deckRecords.yellow.runsStarted).toBe(1);
    expect(won.stats.deckRecords.yellow.highestAnte).toBe(4);
    expect(won.stats.deckRecords.yellow.highestSingleHandScore).toBe(987);
    expect(won.stats.deckRecords.yellow.winCount).toBe(1);
    expect(won.stats.stakeRecords.green.winCount).toBe(1);
  });

  it('tracks endless highest ante separately and steepens target growth after ante 8', () => {
    const anteEightBoss = getBlindForState({ ...createInitialGame('endless-curve', { endless: true }), ante: MAX_ANTE, blindIndex: 2 });
    const anteNineBoss = getBlindForState({ ...createInitialGame('endless-curve', { endless: true }), ante: MAX_ANTE + 1, blindIndex: 2 });
    const profile = recordStatsFromState(createDefaultProfile(), {
      ...createInitialGame('endless-record', { endless: true }),
      ante: 11
    });

    expect(anteNineBoss.targetScore).toBeGreaterThan(anteEightBoss.targetScore);
    expect(anteNineBoss.targetScore).toBeGreaterThan(240 + (MAX_ANTE + 1) * 25);
    expect(profile.stats.highestEndlessAnte).toBe(11);
  });
});

describe('P6 feel and settings support', () => {
  it('keeps animation, sound, and fast mode as display-only profile settings', () => {
    const profile = createDefaultProfile();
    const updated = updateProfileSettings(profile, {
      animationMode: 'instant',
      volume: 35,
      soundEnabled: false,
      showDetailedScoring: false
    });

    expect(updated.settings.animationMode).toBe('instant');
    expect(updated.settings.animationSpeed).toBe(3);
    expect(updated.settings.volume).toBe(35);
    expect(updated.settings.soundEnabled).toBe(false);
    expect(updated.settings.fastMode).toBe(true);
    expect(updated.settings.showDetailedScoring).toBe(false);
    expect(updated.stats).toEqual(profile.stats);
    expect(updated.collection).toEqual(profile.collection);
  });

  it('clamps polish settings without changing scoring results', () => {
    const profile = updateProfileSettings(createDefaultProfile(), {
      animationSpeed: 99,
      volume: -10,
      fastMode: true
    });
    const score = scorePlayedCards([card('A', 'spades'), card('A', 'hearts')]);

    expect(profile.settings.animationSpeed).toBe(3);
    expect(profile.settings.volume).toBe(0);
    expect(score.finalScore).toBe(64);
  });
});

describe('P8 final polish', () => {
  it('sorts the visible hand by rank or suit without changing piles or selection', () => {
    const started = startCurrentBlind(createInitialGame('sort-hand'));
    const drawPile = [card('2', 'hearts')];
    const deck = createStandardDeck();
    const discardPile = [card('5', 'hearts')];
    const hand = [card('3', 'clubs'), card('A', 'diamonds'), card('10', 'spades'), card('A', 'spades')];
    const state: GameState = {
      ...started,
      deck,
      drawPile,
      discardPile,
      hand,
      selectedCardIds: [hand[0].id]
    };

    const byRank = sortHand(state, 'rank');
    const bySuit = sortHand(state, 'suit');

    expect(byRank.hand.map((deckCard) => deckCard.id)).toEqual(['A-spades', 'A-diamonds', '10-spades', '3-clubs']);
    expect(bySuit.hand.map((deckCard) => deckCard.id)).toEqual(['A-spades', '10-spades', 'A-diamonds', '3-clubs']);
    expect(byRank.deck).toBe(deck);
    expect(byRank.drawPile).toBe(drawPile);
    expect(byRank.discardPile).toBe(discardPile);
    expect(byRank.selectedCardIds).toEqual([hand[0].id]);
  });

  it('maps the three animation modes to normal, fast, and instant behavior', () => {
    const profile = createDefaultProfile();
    const fast = updateProfileSettings(profile, { animationMode: 'fast' });
    const instant = updateProfileSettings(fast, { animationMode: 'instant' });
    const normal = updateProfileSettings(instant, { animationMode: 'normal' });

    expect(fast.settings.animationSpeed).toBe(2);
    expect(fast.settings.fastMode).toBe(false);
    expect(instant.settings.animationSpeed).toBe(3);
    expect(instant.settings.fastMode).toBe(true);
    expect(normal.settings.animationSpeed).toBe(1);
    expect(normal.settings.fastMode).toBe(false);
  });

  it('migrates old profiles into the P8 settings shape without changing scoring', () => {
    const migrated = normalizeProfile({
      saveVersion: 1,
      settings: {
        volume: 45
      }
    } as unknown as Parameters<typeof normalizeProfile>[0]);
    const score = scorePlayedCards([card('A', 'spades'), card('A', 'hearts')]);

    expect(migrated.saveVersion).toBeGreaterThanOrEqual(3);
    expect(migrated.settings.animationMode).toBe('normal');
    expect(migrated.settings.animationSpeed).toBe(1);
    expect(migrated.settings.fastMode).toBe(false);
    expect(score.finalScore).toBe(64);
  });
});

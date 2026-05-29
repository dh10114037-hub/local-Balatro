import { getHandScore, HAND_SCORES } from './config/handScores';
import { getJokerDefinition } from './config/jokers';
import { formatCard, getCardChips } from './deck';
import { evaluateHand } from './handEvaluator';
import type { Rng } from './random';
import type { Card, HandLevels, JokerEffect, JokerInstance, JokerRarity, ScoringEvent, ScoringLog, ScoringModifier } from './types';

export type JokerScoringContext = {
  jokers: JokerInstance[];
  discardsRemaining: number;
  handsRemainingBeforePlay: number;
  playedHandsThisBlind: number;
  money: number;
  handLevels: HandLevels;
  heldCards: Card[];
  rng?: Rng;
  disabledCardReasons?: Record<string, string>;
  disabledJokerRarities?: JokerRarity[];
};

export type JokerScoringResult = {
  log: ScoringLog;
  jokers: JokerInstance[];
  triggeredJokerIds: string[];
  destroyedCardIds: string[];
};

type ScoreOptions = {
  handLevels?: Partial<HandLevels>;
  heldCards?: Card[];
  rng?: Rng;
  glassBreakChance?: number;
  disabledCardReasons?: Record<string, string>;
};

function getLevel(handLevels: Partial<HandLevels> | undefined, hand: keyof HandLevels): number {
  return Math.max(1, handLevels?.[hand] ?? 1);
}

function createModifier(
  sourceId: string | undefined,
  source: string,
  description: string,
  values: Partial<Pick<ScoringModifier, 'chipsDelta' | 'multDelta' | 'multFactor'>>
): ScoringModifier {
  return {
    sourceId,
    source,
    description,
    ...values
  };
}

function createEvent(id: string, event: Omit<ScoringEvent, 'id'>): ScoringEvent {
  return {
    id,
    ...event
  };
}

function applyCardEnhancement(card: Card, log: ScoringLog, rng: Rng | undefined, glassBreakChance: number): string | null {
  const scoredCard = log.scoredCards.find((item) => item.card.id === card.id);

  if (!scoredCard || scoredCard.disabled || !card.enhancement) {
    return null;
  }

  if (card.enhancement === 'bonus') {
    scoredCard.chips += 30;
    scoredCard.note = '奖励牌 +30 筹码';
    log.finalChips += 30;
    log.modifiers.push(createModifier(undefined, '奖励牌', `${card.rank} 额外 +30 筹码`, { chipsDelta: 30 }));
    log.events.push(
      createEvent(`enhancement-${card.id}-bonus`, {
        stage: 'enhancement',
        label: '奖励牌',
        description: `${card.rank} 额外 +30 筹码`,
        cardId: card.id,
        chipsDelta: 30,
        chipsAfter: log.finalChips,
        multAfter: log.finalMult
      })
    );
    return null;
  }

  if (card.enhancement === 'mult') {
    scoredCard.note = '倍率牌 +4 倍率';
    log.finalMult += 4;
    log.modifiers.push(createModifier(undefined, '倍率牌', `${card.rank} 计分时 +4 倍率`, { multDelta: 4 }));
    log.events.push(
      createEvent(`enhancement-${card.id}-mult`, {
        stage: 'enhancement',
        label: '倍率牌',
        description: `${card.rank} 计分时 +4 倍率`,
        cardId: card.id,
        multDelta: 4,
        chipsAfter: log.finalChips,
        multAfter: log.finalMult
      })
    );
    return null;
  }

  if (card.enhancement === 'wild') {
    scoredCard.note = '万能牌可配合同花';
    log.modifiers.push(createModifier(undefined, '万能牌', `${card.rank} 可视为需要的花色参与同花`, {}));
    log.events.push(
      createEvent(`enhancement-${card.id}-wild`, {
        stage: 'enhancement',
        label: '万能牌',
        description: `${card.rank} 可视为需要的花色参与同花`,
        cardId: card.id,
        chipsAfter: log.finalChips,
        multAfter: log.finalMult
      })
    );
    return null;
  }

  if (card.enhancement === 'glass') {
    scoredCard.note = '玻璃牌 x2 倍率';
    log.finalMult *= 2;
    log.modifiers.push(createModifier(undefined, '玻璃牌', `${card.rank} 计分时倍率 x2`, { multFactor: 2 }));
    log.events.push(
      createEvent(`enhancement-${card.id}-glass`, {
        stage: 'enhancement',
        label: '玻璃牌',
        description: `${card.rank} 计分时倍率 x2`,
        cardId: card.id,
        multFactor: 2,
        chipsAfter: log.finalChips,
        multAfter: log.finalMult
      })
    );

    if (rng && rng.next() < glassBreakChance) {
      log.modifiers.push(createModifier(undefined, '玻璃牌', `${card.rank} 结算后碎裂并离开牌组`, {}));
      log.events.push(
        createEvent(`enhancement-${card.id}-glass-break`, {
          stage: 'enhancement',
          label: '玻璃牌碎裂',
          description: `${card.rank} 结算后碎裂并离开牌组`,
          cardId: card.id,
          chipsAfter: log.finalChips,
          multAfter: log.finalMult
        })
      );
      return card.id;
    }

    return null;
  }

  if (card.enhancement === 'stone') {
    scoredCard.note = '石头牌 +50 筹码，不参与牌型点数';
    log.modifiers.push(createModifier(undefined, '石头牌', `${card.rank} 提供 50 筹码，但不参与牌型点数`, {}));
    log.events.push(
      createEvent(`enhancement-${card.id}-stone`, {
        stage: 'enhancement',
        label: '石头牌',
        description: `${card.rank} 提供 50 筹码，但不参与牌型点数`,
        cardId: card.id,
        chipsAfter: log.finalChips,
        multAfter: log.finalMult
      })
    );
    return null;
  }

  if (card.enhancement === 'gold') {
    scoredCard.note = '黄金牌留在手牌时结算后给钱';
    return null;
  }

  return null;
}

function applyHeldCardEnhancements(heldCards: Card[], log: ScoringLog): void {
  heldCards.forEach((card) => {
    if (card.enhancement === 'steel') {
      log.finalMult *= 1.5;
      log.modifiers.push(createModifier(undefined, '钢铁牌', `${card.rank} 留在手牌中，倍率 x1.5`, { multFactor: 1.5 }));
      log.events.push(
        createEvent(`enhancement-${card.id}-steel-held`, {
          stage: 'enhancement',
          label: '钢铁牌',
          description: `${card.rank} 留在手牌中，倍率 x1.5`,
          cardId: card.id,
          multFactor: 1.5,
          chipsAfter: log.finalChips,
          multAfter: log.finalMult
        })
      );
    }
  });
}

function scorePlayedCardsInternal(cards: Card[], options: ScoreOptions = {}): { log: ScoringLog; destroyedCardIds: string[] } {
  const evaluation = evaluateHand(cards);
  const baseScore = getHandScore(evaluation.hand, getLevel(options.handLevels, evaluation.hand));
  const scoredCardIds = new Set(evaluation.scoredCards.map((card) => card.id));
  const scoredCards = cards
    .filter((card) => scoredCardIds.has(card.id))
    .map((card) => {
      const disabledReason = options.disabledCardReasons?.[card.id];

      return {
        card,
        chips: disabledReason ? 0 : getCardChips(card),
        note: disabledReason,
        disabled: Boolean(disabledReason)
      };
    });
  const cardChips = scoredCards.reduce((total, scoredCard) => total + scoredCard.chips, 0);
  const finalChips = baseScore.chips + cardChips;
  const finalMult = baseScore.mult;
  const modifiers: ScoringModifier[] =
    getLevel(options.handLevels, evaluation.hand) > 1
      ? [
          createModifier(
            undefined,
            '牌型等级',
            `${evaluation.handName} 等级 ${getLevel(options.handLevels, evaluation.hand)}，基础提升为 ${baseScore.chips} 筹码 × ${baseScore.mult} 倍率`,
            {}
          )
        ]
      : [];

  const log: ScoringLog = {
    hand: evaluation.hand,
    handName: evaluation.handName,
    baseChips: baseScore.chips,
    baseMult: baseScore.mult,
    scoredCards,
    modifiers,
    events: [
      createEvent('hand-base', {
        stage: 'hand',
        label: evaluation.handName,
        description: `牌型基础 ${baseScore.chips} 筹码 × ${baseScore.mult} 倍率`,
        chipsDelta: baseScore.chips,
        multDelta: baseScore.mult,
        chipsAfter: baseScore.chips,
        multAfter: baseScore.mult
      }),
      ...scoredCards.map((scoredCard, index) =>
        createEvent(`scored-card-${index}-${scoredCard.card.id}`, {
          stage: 'scored_card',
          label: formatCard(scoredCard.card),
          description: scoredCard.note
            ? `${formatCard(scoredCard.card)} 计分 +${scoredCard.chips} 筹码，${scoredCard.note}`
            : `${formatCard(scoredCard.card)} 计分 +${scoredCard.chips} 筹码`,
          cardId: scoredCard.card.id,
          chipsDelta: scoredCard.chips,
          chipsAfter: baseScore.chips + scoredCards.slice(0, index + 1).reduce((total, item) => total + item.chips, 0),
          multAfter: baseScore.mult
        })
      ),
      ...modifiers.map((modifier, index) =>
        createEvent(`rule-base-${index}`, {
          stage: 'rule',
          label: modifier.source,
          description: modifier.description,
          chipsDelta: modifier.chipsDelta,
          multDelta: modifier.multDelta,
          multFactor: modifier.multFactor,
          chipsAfter: finalChips,
          multAfter: finalMult
        })
      )
    ],
    finalChips,
    finalMult,
    finalScore: finalChips * finalMult
  };

  const destroyedCardIds = cards
    .map((card) => applyCardEnhancement(card, log, options.rng, options.glassBreakChance ?? 0.25))
    .filter((cardId): cardId is string => cardId !== null);
  applyHeldCardEnhancements(options.heldCards ?? [], log);
  log.finalScore = Math.floor(log.finalChips * log.finalMult);
  log.events.push(
    createEvent('final-score', {
      stage: 'final',
      label: '最终分',
      description: `${log.finalChips} 筹码 × ${log.finalMult} 倍率 = ${log.finalScore}`,
      chipsAfter: log.finalChips,
      multAfter: log.finalMult,
      scoreAfter: log.finalScore
    })
  );

  return { log, destroyedCardIds };
}

export function scorePlayedCards(cards: Card[], options: ScoreOptions = {}): ScoringLog {
  return scorePlayedCardsInternal(cards, options).log;
}

function countScored(cards: Card[], predicate: (card: Card) => boolean): number {
  return cards.filter(predicate).length;
}

function isFaceCard(card: Card): boolean {
  return card.rank === 'K' || card.rank === 'Q' || card.rank === 'J';
}

function getEnhancementName(enhancement: Card['enhancement']): string {
  if (enhancement === 'bonus') return '奖励牌';
  if (enhancement === 'mult') return '倍率牌';
  if (enhancement === 'wild') return '万能牌';
  if (enhancement === 'glass') return '玻璃牌';
  if (enhancement === 'steel') return '钢铁牌';
  if (enhancement === 'gold') return '黄金牌';
  if (enhancement === 'stone') return '石头牌';

  return '增强牌';
}

function applyEffect(
  effect: JokerEffect,
  sourceId: string,
  source: string,
  instance: JokerInstance,
  context: JokerScoringContext,
  log: ScoringLog
): ScoringModifier | null {
  const scoredCards = log.scoredCards.filter((scoredCard) => !scoredCard.disabled).map((scoredCard) => scoredCard.card);

  if (effect.type === 'add_chips') {
    log.finalChips += effect.amount;
    return createModifier(sourceId, source, `+${effect.amount} 筹码`, { chipsDelta: effect.amount });
  }

  if (effect.type === 'add_mult') {
    log.finalMult += effect.amount;
    return createModifier(sourceId, source, `+${effect.amount} 倍率`, { multDelta: effect.amount });
  }

  if (effect.type === 'multiply_mult') {
    log.finalMult *= effect.factor;
    return createModifier(sourceId, source, `倍率 x${effect.factor}`, { multFactor: effect.factor });
  }

  if (effect.type === 'hand_add_chips' && log.handName === HAND_SCORES[effect.hand].name) {
    log.finalChips += effect.amount;
    return createModifier(sourceId, source, `打出${log.handName}，+${effect.amount} 筹码`, { chipsDelta: effect.amount });
  }

  if (effect.type === 'hand_add_mult' && log.handName === HAND_SCORES[effect.hand].name) {
    log.finalMult += effect.amount;
    return createModifier(sourceId, source, `打出${log.handName}，+${effect.amount} 倍率`, { multDelta: effect.amount });
  }

  if (effect.type === 'hand_multiply_mult' && log.handName === HAND_SCORES[effect.hand].name) {
    log.finalMult *= effect.factor;
    return createModifier(sourceId, source, `打出${log.handName}，倍率 x${effect.factor}`, { multFactor: effect.factor });
  }

  if (effect.type === 'scored_suit_add_chips') {
    const count = countScored(scoredCards, (card) => card.suit === effect.suit);
    const amount = count * effect.amount;
    if (amount <= 0) return null;
    log.finalChips += amount;
    return createModifier(sourceId, source, `${count} 张对应花色计分，+${amount} 筹码`, { chipsDelta: amount });
  }

  if (effect.type === 'scored_suit_add_mult') {
    const count = countScored(scoredCards, (card) => card.suit === effect.suit);
    const amount = count * effect.amount;
    if (amount <= 0) return null;
    log.finalMult += amount;
    return createModifier(sourceId, source, `${count} 张对应花色计分，+${amount} 倍率`, { multDelta: amount });
  }

  if (effect.type === 'scored_face_add_chips') {
    const count = countScored(scoredCards, isFaceCard);
    const amount = count * effect.amount;
    if (amount <= 0) return null;
    log.finalChips += amount;
    return createModifier(sourceId, source, `${count} 张人头牌计分，+${amount} 筹码`, { chipsDelta: amount });
  }

  if (effect.type === 'scored_face_add_mult') {
    const count = countScored(scoredCards, isFaceCard);
    const amount = count * effect.amount;
    if (amount <= 0) return null;
    log.finalMult += amount;
    return createModifier(sourceId, source, `${count} 张人头牌计分，+${amount} 倍率`, { multDelta: amount });
  }

  if (effect.type === 'scored_enhancement_multiply_mult') {
    const count = countScored(scoredCards, (card) => card.enhancement === effect.enhancement);
    if (count <= 0) return null;
    const factor = Math.pow(effect.factor, count);
    log.finalMult *= factor;
    return createModifier(sourceId, source, `${count} 张${getEnhancementName(effect.enhancement)}计分，倍率 x${Number(factor.toFixed(3))}`, {
      multFactor: Number(factor.toFixed(3))
    });
  }

  if (effect.type === 'remaining_discards_add_mult') {
    const amount = context.discardsRemaining * effect.amountPerDiscard;
    if (amount <= 0) return null;
    log.finalMult += amount;
    return createModifier(sourceId, source, `剩余 ${context.discardsRemaining} 次弃牌，+${amount} 倍率`, {
      multDelta: amount
    });
  }

  if (effect.type === 'money_add_mult') {
    const rawAmount = Math.floor(context.money / effect.divisor) * effect.amount;
    const amount = effect.max === undefined ? rawAmount : Math.min(effect.max, rawAmount);
    if (amount <= 0) return null;
    log.finalMult += amount;
    return createModifier(sourceId, source, `资金带来 +${amount} 倍率`, { multDelta: amount });
  }

  if (effect.type === 'first_hand_add_mult' && context.playedHandsThisBlind === 0) {
    log.finalMult += effect.amount;
    return createModifier(sourceId, source, `本盲注第一次出牌，+${effect.amount} 倍率`, { multDelta: effect.amount });
  }

  if (effect.type === 'last_hand_multiply_mult' && context.handsRemainingBeforePlay === 1) {
    log.finalMult *= effect.factor;
    return createModifier(sourceId, source, `最后一次出牌，倍率 x${effect.factor}`, { multFactor: effect.factor });
  }

  if (effect.type === 'scored_cards_add_chips') {
    const amount = scoredCards.length * effect.amountPerCard;
    if (amount <= 0) return null;
    log.finalChips += amount;
    return createModifier(sourceId, source, `${scoredCards.length} 张计分牌，+${amount} 筹码`, { chipsDelta: amount });
  }

  if (effect.type === 'scored_cards_at_most_add_mult' && scoredCards.length <= effect.maxCards) {
    log.finalMult += effect.amount;
    return createModifier(sourceId, source, `${scoredCards.length} 张计分牌不超过 ${effect.maxCards} 张，+${effect.amount} 倍率`, {
      multDelta: effect.amount
    });
  }

  if (effect.type === 'repeat_first_scored_card') {
    const firstScoredCard = log.scoredCards.find((scoredCard) => !scoredCard.disabled);
    if (!firstScoredCard || firstScoredCard.chips <= 0) return null;
    log.finalChips += firstScoredCard.chips;
    return createModifier(sourceId, source, `重复${formatCard(firstScoredCard.card)}，+${firstScoredCard.chips} 筹码`, {
      chipsDelta: firstScoredCard.chips
    });
  }

  if (effect.type === 'rank_add_chips') {
    const count = countScored(scoredCards, (card) => card.rank === effect.rank);
    const amount = count * effect.amount;
    if (amount <= 0) return null;
    log.finalChips += amount;
    return createModifier(sourceId, source, `${count} 张 ${effect.rank} 计分，+${amount} 筹码`, { chipsDelta: amount });
  }

  if (effect.type === 'rank_add_mult') {
    const count = countScored(scoredCards, (card) => card.rank === effect.rank);
    const amount = count * effect.amount;
    if (amount <= 0) return null;
    log.finalMult += amount;
    return createModifier(sourceId, source, `${count} 张 ${effect.rank} 计分，+${amount} 倍率`, { multDelta: amount });
  }

  if (effect.type === 'held_enhancement_add_mult') {
    const count = context.heldCards.filter((card) => card.enhancement === effect.enhancement).length;
    const amount = count * effect.amount;
    if (amount <= 0) return null;
    log.finalMult += amount;
    return createModifier(sourceId, source, `${count} 张${getEnhancementName(effect.enhancement)}留在手牌，+${amount} 倍率`, {
      multDelta: amount
    });
  }

  if (effect.type === 'growth_hand_add_mult' && log.handName === HAND_SCORES[effect.hand].name) {
    const amount = instance.level * effect.amountPerLevel;
    if (amount <= 0) return null;
    log.finalMult += amount;
    return createModifier(sourceId, source, `成长等级 ${instance.level}，+${amount} 倍率`, { multDelta: amount });
  }

  return null;
}

function applyJokerEffects(
  effects: JokerEffect[],
  sourceId: string,
  source: string,
  instance: JokerInstance,
  context: JokerScoringContext,
  log: ScoringLog
): ScoringModifier[] {
  const modifiers: ScoringModifier[] = [];

  effects.forEach((effect) => {
    if (effect.type === 'copy_right') {
      return;
    }

    const modifier = applyEffect(effect, sourceId, source, instance, context, log);

    if (!modifier) {
      return;
    }

    modifiers.push(modifier);
    log.events.push(
      createEvent(`joker-${sourceId}-${modifiers.length - 1}-${log.events.length}`, {
        stage: 'joker',
        label: modifier.source,
        description: modifier.description,
        sourceId,
        chipsDelta: modifier.chipsDelta,
        multDelta: modifier.multDelta,
        multFactor: modifier.multFactor,
        chipsAfter: log.finalChips,
        multAfter: log.finalMult
      })
    );
  });

  return modifiers;
}

export function scorePlayedCardsWithJokers(cards: Card[], context: JokerScoringContext): JokerScoringResult {
  const { log, destroyedCardIds } = scorePlayedCardsInternal(cards, {
    handLevels: context.handLevels,
    heldCards: context.heldCards,
    rng: context.rng,
    disabledCardReasons: context.disabledCardReasons
  });
  const nextJokers = context.jokers.map((joker) => ({ ...joker }));
  const modifiers: ScoringModifier[] = [...log.modifiers];

  nextJokers.forEach((joker, index) => {
    const definition = getJokerDefinition(joker.definitionId);

    if (context.disabledJokerRarities?.includes(definition.rarity)) {
      modifiers.push(createModifier(joker.instanceId, definition.name, '首领规则使这张小丑暂时失效。', {}));
      log.events.push(
        createEvent(`joker-${joker.instanceId}-disabled`, {
          stage: 'joker',
          label: definition.name,
          description: '首领规则使这张小丑暂时失效。',
          sourceId: joker.instanceId,
          chipsAfter: log.finalChips,
          multAfter: log.finalMult
        })
      );
      return;
    }

    const directModifiers = applyJokerEffects(definition.effects, joker.instanceId, definition.name, joker, context, log);
    modifiers.push(...directModifiers);

    if (definition.effects.some((effect) => effect.type === 'copy_right')) {
      const rightJoker = nextJokers[index + 1];
      if (rightJoker) {
        const rightDefinition = getJokerDefinition(rightJoker.definitionId);
        modifiers.push(
          ...applyJokerEffects(
            rightDefinition.effects,
            joker.instanceId,
            `${definition.name}复制${rightDefinition.name}`,
            rightJoker,
            context,
            log
          )
        );
      }
    }

    if (definition.growthOnHand && log.handName === HAND_SCORES[definition.growthOnHand.hand].name) {
      joker.level += definition.growthOnHand.amount;
      const growthModifier = createModifier(joker.instanceId, definition.name, `本次出牌后成长到等级 ${joker.level}`, {});
      modifiers.push(growthModifier);
      log.events.push(
        createEvent(`joker-${joker.instanceId}-growth-${joker.level}`, {
          stage: 'joker',
          label: definition.name,
          description: growthModifier.description,
          sourceId: joker.instanceId,
          chipsAfter: log.finalChips,
          multAfter: log.finalMult
        })
      );
    }
  });

  log.modifiers = modifiers;
  log.finalScore = Math.floor(log.finalChips * log.finalMult);
  log.events = [
    ...log.events.filter((event) => event.stage !== 'final'),
    createEvent('final-score', {
      stage: 'final',
      label: '最终分',
      description: `${log.finalChips} 筹码 × ${log.finalMult} 倍率 = ${log.finalScore}`,
      chipsAfter: log.finalChips,
      multAfter: log.finalMult,
      scoreAfter: log.finalScore
    })
  ];

  return {
    log,
    jokers: nextJokers,
    triggeredJokerIds: [...new Set(modifiers.map((modifier) => modifier.sourceId).filter(Boolean) as string[])],
    destroyedCardIds
  };
}

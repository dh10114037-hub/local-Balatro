import { type ChangeEvent, type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import packageJson from '../package.json';
import { MAX_ANTE } from './game/config/blinds';
import { BOSSES, getBossDefinition } from './game/config/bosses';
import { CONSUMABLES, ENHANCEMENT_NAMES, getConsumableDefinition, getConsumableLabel } from './game/config/consumables';
import { DECKS, DEFAULT_DECK_ID, getDeckDefinition } from './game/config/decks';
import { getHandScore, HAND_SCORES, POKER_HAND_ORDER } from './game/config/handScores';
import { getJokerDefinition, getJokerSellValue, JOKERS } from './game/config/jokers';
import { getPackDefinition, getSpectralDefinition } from './game/config/packs';
import { DEFAULT_STAKE_ID, getStakeDefinition, isStakeUnlocked, STAKES } from './game/config/stakes';
import { getTagDefinition, getTagForBlind } from './game/config/tags';
import { getVoucherDefinition, VOUCHERS } from './game/config/vouchers';
import { ENHANCEMENT_SHORT_LABELS, formatCard, getCardChips, RANKS, SUIT_LABELS, SUIT_NAMES, SUITS } from './game/deck';
import {
  advanceFromShop,
  buyShopItem,
  cancelConsumableTarget,
  calculateInterest,
  choosePackConsumable,
  createDefaultHandLevels,
  createInitialGame,
  DEFAULT_SEED,
  GAME_SAVE_VERSION,
  INTEREST_MONEY_STEP,
  MAX_INTEREST_PAYOUT,
  discardSelectedCards,
  getBlindChoicesForState,
  getBlindForState,
  moveJoker,
  playSelectedCards,
  refreshShop,
  sellJoker,
  skipPackChoice,
  skipCurrentBlind,
  sortHand,
  startCurrentBlind,
  toggleCardSelection,
  useConsumable
} from './game/engine';
import { evaluateHand } from './game/handEvaluator';
import {
  createDefaultProfile,
  normalizeProfile,
  recordRunResult,
  recordRunStarted,
  recordSeenFromState,
  recordStatsFromState,
  resetPersistentProfile,
  updateProfileSettings
} from './game/profile';
import type {
  BlindDefinition,
  BossEffect,
  Card,
  ConsumableInstance,
  GamePhase,
  GameState,
  JokerArchetype,
  JokerInstance,
  JokerTriggerTiming,
  PackChoice,
  PersistentProfile,
  ProfileRunRecord,
  ScoringEvent,
  ScoringLog as GameScoringLog,
  ShopItem
} from './game/types';

const SAVE_KEY = 'local-card-run-p5';
const PROFILE_KEY = 'local-card-profile-p5';
const BASE_ANIMATION_MS = 650;
const APP_VERSION = packageJson.version;
const BACKUP_EXPORT_VERSION = 1;
const FEEDBACK_URL: string | null = null;
type SoundKind = 'play' | 'discard' | 'shop' | 'buy' | 'sell' | 'reroll' | 'pack' | 'sort' | 'start' | 'score' | 'mult' | 'error';
type MobileOverlay = null | 'rules' | 'deck' | 'log' | 'profile' | 'settings';
type AppScreen = 'home' | 'newRun' | 'collection' | 'stats' | 'settings' | 'rules' | 'game';
type SaveBackup = {
  exportVersion: number;
  exportedAt: string;
  appVersion: string;
  game: Partial<GameState> | null;
  profile: Partial<PersistentProfile>;
};
type PendingImport = {
  exportedAt: string;
  appVersion?: string;
  game: GameState | null;
  profile: PersistentProfile;
};
type InspectTarget =
  | { kind: 'joker'; definitionId: string; level?: number; sellValue?: number; source?: string }
  | { kind: 'consumable'; definitionId: string; source?: string }
  | { kind: 'playing_card'; card: Card; hidden?: boolean; source?: string }
  | { kind: 'boss'; definitionId: string; source?: string }
  | { kind: 'tag'; definitionId: string; source?: string }
  | { kind: 'voucher'; definitionId: string; source?: string }
  | { kind: 'pack'; definitionId: string; source?: string }
  | { kind: 'spectral'; definitionId: string; source?: string };
const SOUND_FREQUENCIES: Record<SoundKind, number> = {
  play: 520,
  discard: 240,
  shop: 660,
  buy: 740,
  sell: 300,
  reroll: 610,
  pack: 820,
  sort: 460,
  start: 420,
  score: 700,
  mult: 920,
  error: 160
};
const SOUND_TYPES: Record<SoundKind, OscillatorType> = {
  play: 'triangle',
  discard: 'sawtooth',
  shop: 'triangle',
  buy: 'sine',
  sell: 'square',
  reroll: 'triangle',
  pack: 'sine',
  sort: 'triangle',
  start: 'triangle',
  score: 'sine',
  mult: 'sine',
  error: 'square'
};

const ANIMATION_MODE_OPTIONS: Array<{
  id: PersistentProfile['settings']['animationMode'];
  label: string;
  detail: string;
}> = [
  { id: 'normal', label: '正常', detail: '完整动画' },
  { id: 'fast', label: '快速', detail: '节奏更紧' },
  { id: 'instant', label: '瞬时', detail: '跳过动画' }
];

const MOBILE_OVERLAY_LABELS: Record<NonNullable<MobileOverlay>, string> = {
  rules: '局势',
  deck: '牌组',
  log: '日志',
  profile: '资料',
  settings: '设置'
};

const APP_SCREEN_TITLES: Record<Exclude<AppScreen, 'home' | 'newRun' | 'game'>, string> = {
  collection: '收藏图鉴',
  stats: '统计资料',
  settings: '设置',
  rules: '规则说明'
};

function generateSeed() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().slice(0, 8).toUpperCase();
  }

  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function getSelectedCards(game: GameState): Card[] {
  const selectedIds = new Set(game.selectedCardIds);
  return game.hand.filter((card) => selectedIds.has(card.id));
}

function getActiveBossEffects(game: GameState): BossEffect[] {
  return game.activeBossId ? getBossDefinition(game.activeBossId).effects : [];
}

function isFaceCard(card: Card): boolean {
  return card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
}

function isCardHiddenByBoss(game: GameState, card: Card): boolean {
  return getActiveBossEffects(game).some((effect) => effect.type === 'hide_face_cards') && isFaceCard(card);
}

function getBossSelectionLimit(game: GameState): number | null {
  const limits = getActiveBossEffects(game)
    .filter((effect) => effect.type === 'max_selected_cards')
    .map((effect) => (effect.type === 'max_selected_cards' ? effect.max : 5));

  return limits.length > 0 ? Math.max(1, Math.min(...limits)) : null;
}

function AnimatedNumber({
  value,
  enabled,
  duration
}: {
  value: number;
  enabled: boolean;
  duration: number;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);

  useEffect(() => {
    if (!enabled) {
      previousValueRef.current = value;
      setDisplayValue(value);
      return;
    }

    const startValue = previousValueRef.current;
    const delta = value - startValue;
    const startedAt = performance.now();
    let frameId = 0;

    function tick(now: number) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(startValue + delta * eased));

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        previousValueRef.current = value;
      }
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [duration, enabled, value]);

  return <>{displayValue}</>;
}

function GameCard({
  card,
  selected,
  disabled,
  hidden,
  onClick
}: {
  card: Card;
  selected: boolean;
  disabled: boolean;
  hidden: boolean;
  onClick: () => void;
}) {
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const cardLabel = hidden ? '盖面牌' : formatCard(card);
  const detail = hidden
    ? `盖面牌｜${card.enhancement ? ENHANCEMENT_NAMES[card.enhancement] : '普通牌'}`
    : `${formatCard(card)}${card.enhancement ? `｜${ENHANCEMENT_NAMES[card.enhancement]}` : '｜普通牌'}`;

  return (
    <button
      className={`game-card ${selected ? 'selected' : ''} ${isRed ? 'red-suit' : 'black-suit'} ${hidden ? 'hidden-card' : ''}`}
      type="button"
      aria-pressed={selected}
      data-detail={detail}
      title={detail}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="card-rank">{hidden ? '?' : card.rank}</span>
      <span className="card-suit">{hidden ? '盖' : SUIT_LABELS[card.suit]}</span>
      <span className="card-code">{cardLabel}</span>
      {card.enhancement && (
        <span className={`enhancement-badge ${card.enhancement}`} title={ENHANCEMENT_NAMES[card.enhancement]}>
          {ENHANCEMENT_SHORT_LABELS[card.enhancement]}
        </span>
      )}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getEnhancementDetail(enhancement: Card['enhancement']): string {
  if (enhancement === 'bonus') return '计分时额外 +30 筹码。';
  if (enhancement === 'mult') return '计分时额外 +4 倍率。';
  if (enhancement === 'wild') return '可视为需要的花色参与同花判断。';
  if (enhancement === 'glass') return '计分时倍率 x2，结算后有概率碎裂并离开牌组。';
  if (enhancement === 'steel') return '留在手牌中时倍率 x1.5。';
  if (enhancement === 'gold') return '留在手牌中并通过盲注后获得额外资金。';
  if (enhancement === 'stone') return '提供 50 筹码，但不参与牌型点数。';
  return '普通扑克牌，没有额外增强。';
}

function getConsumableTargetText(definition: ReturnType<typeof getConsumableDefinition>): string {
  if (definition.target.mode === 'none') {
    return '无需选择目标，购买后可立即使用。';
  }

  if (definition.target.min === definition.target.max) {
    return `需要在盲注中选择 ${definition.target.min} 张手牌作为目标。`;
  }

  return `需要在盲注中选择 ${definition.target.min}-${definition.target.max} 张手牌作为目标。`;
}

function inspectTargetFromShopOffer(offer: ShopItem): InspectTarget | null {
  if (!offer.definitionId) {
    return null;
  }

  if (offer.kind === 'joker') {
    return { kind: 'joker', definitionId: offer.definitionId, source: `商店商品｜$${offer.price}` };
  }

  if (offer.kind === 'consumable') {
    return { kind: 'consumable', definitionId: offer.definitionId, source: `商店商品｜$${offer.price}` };
  }

  if (offer.kind === 'voucher') {
    return { kind: 'voucher', definitionId: offer.definitionId, source: `商店商品｜$${offer.price}` };
  }

  return { kind: 'pack', definitionId: offer.definitionId, source: `商店商品｜$${offer.price}` };
}

function inspectTargetFromPackChoice(choice: PackChoice): InspectTarget {
  if (choice.kind === 'playing_card') {
    return { kind: 'playing_card', card: choice.card, source: '补充包候选' };
  }

  if (choice.kind === 'consumable') {
    return { kind: 'consumable', definitionId: choice.definitionId, source: '补充包候选' };
  }

  if (choice.kind === 'joker') {
    return { kind: 'joker', definitionId: choice.definitionId, source: '补充包候选' };
  }

  return { kind: 'spectral', definitionId: choice.definitionId, source: '补充包候选' };
}

function DetailPillRow({ children }: { children: ReactNode }) {
  return <div className="detail-pill-row">{children}</div>;
}

function DetailModal({ target, onClose }: { target: InspectTarget | null; onClose: () => void }) {
  if (!target) {
    return null;
  }

  let title = '';
  let kicker = target.source ?? '详情';
  let body: ReactNode = null;

  if (target.kind === 'joker') {
    const definition = getJokerDefinition(target.definitionId);
    title = definition.name;
    body = (
      <>
        <DetailPillRow>
          <RarityLabel rarity={definition.rarity} />
          {definition.archetypes.map((archetype) => (
            <span className="detail-pill" key={archetype}>{JOKER_ARCHETYPE_LABELS[archetype]}</span>
          ))}
          {definition.triggerTiming.map((timing) => (
            <span className="detail-pill timing" key={timing}>{JOKER_TRIGGER_LABELS[timing]}</span>
          ))}
        </DetailPillRow>
        <p>{definition.description}</p>
        <div className="detail-section">
          <span>触发说明</span>
          <strong>{definition.triggerText}</strong>
          <small>{definition.conditionText}</small>
        </div>
        <div className="detail-grid">
          <Stat label="购买价格" value={`$${definition.price}`} />
          <Stat label="卖出价值" value={`$${target.sellValue ?? getJokerSellValue(definition.id)}`} />
          <Stat label="成长层数" value={target.level ?? 0} />
        </div>
      </>
    );
  }

  if (target.kind === 'consumable') {
    const definition = getConsumableDefinition(target.definitionId);
    title = definition.name;
    body = (
      <>
        <DetailPillRow>
          <span className={`detail-pill ${definition.kind}`}>{getConsumableLabel(definition.id)}</span>
          <span className="detail-pill">价格 ${definition.price}</span>
        </DetailPillRow>
        <p>{definition.description}</p>
        <div className="detail-section">
          <span>使用时机</span>
          <strong>{getConsumableTargetText(definition)}</strong>
          <small>{definition.target.mode === 'cards' ? '商店中只能查看和购买，实际目标需要进入盲注后选择手牌。' : '无需选择手牌目标。'}</small>
        </div>
      </>
    );
  }

  if (target.kind === 'playing_card') {
    title = target.hidden ? '盖面牌' : formatCard(target.card);
    const enhancementName = target.card.enhancement ? ENHANCEMENT_NAMES[target.card.enhancement] : '普通牌';
    body = (
      <>
        <DetailPillRow>
          <span className="detail-pill">{target.hidden ? '盖面' : `${SUIT_LABELS[target.card.suit]} ${SUIT_NAMES[target.card.suit]}`}</span>
          <span className="detail-pill">{target.hidden ? '点数隐藏' : target.card.rank}</span>
          <span className={`detail-pill ${target.card.enhancement ?? ''}`}>{enhancementName}</span>
        </DetailPillRow>
        <p>{target.hidden ? '这张牌被 Boss 规则盖面，出牌结算时才会揭晓。' : `基础筹码：${getCardChips(target.card)}。`}</p>
        <div className="detail-section">
          <span>增强效果</span>
          <strong>{enhancementName}</strong>
          <small>{getEnhancementDetail(target.card.enhancement)}</small>
        </div>
      </>
    );
  }

  if (target.kind === 'boss') {
    const definition = getBossDefinition(target.definitionId);
    title = definition.name;
    kicker = target.source ?? '首领盲注';
    body = (
      <>
        <p>{definition.description}</p>
        <div className="detail-section">
          <span>限制规则</span>
          <div className="boss-effect-list detail-effects">
            {definition.effects.map((effect, index) => (
              <span key={`${definition.id}-${index}`}>{getBossEffectLabel(effect)}</span>
            ))}
          </div>
        </div>
        <div className="detail-section">
          <span>应对建议</span>
          <strong>{definition.advice}</strong>
        </div>
      </>
    );
  }

  if (target.kind === 'tag') {
    const definition = getTagDefinition(target.definitionId);
    title = definition.name;
    body = (
      <>
        <p>{definition.description}</p>
        <div className="detail-section">
          <span>兑现时机</span>
          <strong>跳过当前小/大盲后，在后续商店或局势中生效。</strong>
        </div>
      </>
    );
  }

  if (target.kind === 'voucher') {
    const definition = getVoucherDefinition(target.definitionId);
    title = definition.name;
    body = (
      <>
        <DetailPillRow>
          <span className="detail-pill">优惠券</span>
          <span className="detail-pill">价格 ${definition.price}</span>
        </DetailPillRow>
        <p>{definition.description}</p>
        <div className="detail-section">
          <span>持续效果</span>
          <strong>购买后对当前 run 持续生效。</strong>
        </div>
      </>
    );
  }

  if (target.kind === 'pack') {
    const definition = getPackDefinition(target.definitionId);
    title = definition.name;
    body = (
      <>
        <DetailPillRow>
          <span className={`detail-pill ${definition.kind}`}>补充包</span>
          <span className="detail-pill">价格 ${definition.price}</span>
          <span className="detail-pill">候选 {definition.choiceCount} 张</span>
        </DetailPillRow>
        <p>{definition.description}</p>
        <div className="detail-section">
          <span>开包流程</span>
          <strong>{definition.allowSkip ? '打开后可选择 1 张，也可以跳过。' : '打开后必须选择奖励。'}</strong>
        </div>
      </>
    );
  }

  if (target.kind === 'spectral') {
    const definition = getSpectralDefinition(target.definitionId);
    title = definition.name;
    body = (
      <>
        <DetailPillRow>
          <span className="detail-pill spectral">幻灵牌</span>
        </DetailPillRow>
        <p>{definition.description}</p>
        <div className="detail-section">
          <span>风险提示</span>
          <strong>效果强，但通常伴随资金或牌组代价。</strong>
        </div>
      </>
    );
  }

  return (
    <div className="detail-modal-layer" role="presentation">
      <button type="button" className="detail-backdrop" aria-label="关闭详情" onClick={onClose} />
      <article className={`detail-modal ${target.kind}`} role="dialog" aria-modal="true" aria-label={`${title}详情`}>
        <header className="detail-modal-header">
          <div>
            <span>{kicker}</span>
            <strong>{title}</strong>
          </div>
          <button type="button" className="secondary-action compact-action" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="detail-modal-body">{body}</div>
      </article>
    </div>
  );
}

function getLegacyModifierStage(modifier: GameScoringLog['modifiers'][number]): ScoringEvent['stage'] {
  if (['奖励牌', '倍率牌', '万能牌', '玻璃牌', '钢铁牌', '石头牌'].includes(modifier.source)) {
    return 'enhancement';
  }

  if (modifier.sourceId) {
    return 'joker';
  }

  return 'rule';
}

function buildFallbackScoringEvents(log: GameScoringLog): ScoringEvent[] {
  const scoredCardEvents: ScoringEvent[] = log.scoredCards.map((scoredCard, index) => ({
    id: `legacy-card-${index}-${scoredCard.card.id}`,
    stage: 'scored_card',
    label: formatCard(scoredCard.card),
    description: scoredCard.note
      ? `${formatCard(scoredCard.card)} +${scoredCard.chips} 筹码，${scoredCard.note}`
      : `${formatCard(scoredCard.card)} +${scoredCard.chips} 筹码`,
    cardId: scoredCard.card.id,
    chipsDelta: scoredCard.chips
  }));
  const modifierEvents: ScoringEvent[] = log.modifiers.map((modifier, index) => ({
    id: `legacy-modifier-${index}`,
    stage: getLegacyModifierStage(modifier),
    label: modifier.source,
    description: modifier.description,
    sourceId: modifier.sourceId,
    chipsDelta: modifier.chipsDelta,
    multDelta: modifier.multDelta,
    multFactor: modifier.multFactor
  }));

  return [
    {
      id: 'legacy-hand-base',
      stage: 'hand',
      label: log.handName,
      description: `牌型基础 ${log.baseChips} 筹码 × ${log.baseMult} 倍率`,
      chipsDelta: log.baseChips,
      multDelta: log.baseMult,
      chipsAfter: log.baseChips,
      multAfter: log.baseMult
    },
    ...scoredCardEvents,
    ...modifierEvents,
    {
      id: 'legacy-final-score',
      stage: 'final',
      label: '最终分',
      description: `${log.finalChips} 筹码 × ${log.finalMult} 倍率 = ${log.finalScore}`,
      chipsAfter: log.finalChips,
      multAfter: log.finalMult,
      scoreAfter: log.finalScore
    }
  ];
}

function getScoringEvents(log: GameScoringLog): ScoringEvent[] {
  return log.events?.length ? log.events : buildFallbackScoringEvents(log);
}

function normalizeScoringLog(log: GameScoringLog): GameScoringLog {
  return {
    ...log,
    events: getScoringEvents(log)
  };
}

function normalizePackChoices(choices: Partial<GameState>['packChoices']): PackChoice[] {
  if (!Array.isArray(choices)) {
    return [];
  }

  return (choices as unknown[]).flatMap((choice) => {
    if (!choice || typeof choice !== 'object') {
      return [];
    }

    if ('kind' in choice && choice.kind) {
      return [choice as PackChoice];
    }

    if ('definitionId' in choice && 'instanceId' in choice && choice.definitionId && choice.instanceId) {
      return [
        {
          instanceId: String(choice.instanceId),
          packId: 'tarot_pack',
          kind: 'consumable' as const,
          definitionId: String(choice.definitionId)
        }
      ];
    }

    return [];
  });
}

function describeFinalFormula(log: GameScoringLog): string {
  const rawScore = Math.floor(log.finalChips * log.finalMult);

  if (rawScore === log.finalScore) {
    return `${log.finalChips} 筹码 × ${log.finalMult} 倍率 = ${log.finalScore}`;
  }

  return `规则修正后 ${log.finalScore} 分（原始 ${log.finalChips} 筹码 × ${log.finalMult} 倍率 = ${rawScore}）`;
}

function describeEventValue(event: ScoringEvent): string {
  const values: string[] = [];

  if (event.chipsDelta !== undefined) {
    values.push(`${event.chipsDelta >= 0 ? '+' : ''}${event.chipsDelta} 筹码`);
  }

  if (event.multDelta !== undefined) {
    values.push(`${event.multDelta >= 0 ? '+' : ''}${event.multDelta} 倍率`);
  }

  if (event.multFactor !== undefined) {
    values.push(`×${event.multFactor}`);
  }

  if (values.length > 0) {
    return values.join(' / ');
  }

  if (event.scoreAfter !== undefined) {
    return `${event.scoreAfter} 分`;
  }

  return '触发';
}

function getEventClass(event: ScoringEvent): string {
  if (event.multFactor !== undefined) {
    return 'factor';
  }

  if (event.multDelta !== undefined) {
    return 'mult';
  }

  if (event.chipsDelta !== undefined) {
    return 'chips';
  }

  if (event.scoreAfter !== undefined) {
    return 'score';
  }

  return 'trigger';
}

function EventChipList({ events, emptyText = '无触发' }: { events: ScoringEvent[]; emptyText?: string }) {
  if (events.length === 0) {
    return <span className="timeline-empty">{emptyText}</span>;
  }

  return (
    <div className="timeline-event-list">
      {events.map((event, index) => (
        <span
          key={event.id}
          className={`event-chip ${getEventClass(event)}`}
          style={{ '--item-index': index } as CSSProperties}
          title={event.description}
        >
          <strong>{event.label}</strong>
          <em>{describeEventValue(event)}</em>
        </span>
      ))}
    </div>
  );
}

function SettlementTimeline({
  game,
  fastMode
}: {
  game: GameState;
  fastMode: boolean;
}) {
  const log = game.lastScoringLog;

  if (!log) {
    return null;
  }

  const events = getScoringEvents(log);
  const handEvent = events.find((event) => event.stage === 'hand');
  const cardEvents = events.filter((event) => event.stage === 'scored_card');
  const enhancementEvents = events.filter((event) => event.stage === 'enhancement');
  const jokerEvents = events.filter((event) => event.stage === 'joker');
  const ruleEvents = events.filter((event) => event.stage === 'rule');
  const cardChips = cardEvents.reduce((total, event) => total + (event.chipsDelta ?? 0), 0);

  if (game.phase === 'shop') {
    return (
      <section className={`settlement-panel settlement-summary ${fastMode ? 'fast' : ''}`} aria-label="结算摘要">
        <div className="settlement-main">
          <span>本手结算</span>
          <strong>
            <AnimatedNumber value={log.finalScore} enabled={!fastMode} duration={420} />
          </strong>
        </div>
        <div className="settlement-summary-grid">
          <Stat label="牌型" value={log.handName} />
          <Stat label="计分牌" value={`+${cardChips}`} />
          <Stat label="最终" value={`${log.finalChips} 筹码 × ${log.finalMult} 倍率`} />
        </div>
      </section>
    );
  }

  return (
    <section className={`settlement-panel ${fastMode ? 'fast' : ''}`} aria-label="结算动画">
      <div className="settlement-main">
        <span>本手结算</span>
        <strong>
          <AnimatedNumber value={log.finalScore} enabled={!fastMode} duration={520} />
        </strong>
      </div>
      <div className="settlement-steps">
        <div className="settlement-step hand-type">
          <span>牌型</span>
          <strong>{handEvent?.label ?? log.handName}</strong>
          <small>
            <AnimatedNumber value={log.baseChips} enabled={!fastMode} duration={420} /> 筹码 ×{' '}
            <AnimatedNumber value={log.baseMult} enabled={!fastMode} duration={420} /> 倍率
          </small>
        </div>
        <div className="settlement-step cards">
          <span>计分牌</span>
          <strong>+{cardChips}</strong>
          <EventChipList events={cardEvents} emptyText="无计分牌" />
        </div>
        <div className="settlement-step enhancements">
          <span>增强牌</span>
          <strong>{enhancementEvents.length}</strong>
          <EventChipList events={enhancementEvents} />
        </div>
        <div className="settlement-step jokers">
          <span>小丑</span>
          <strong>{jokerEvents.length}</strong>
          <EventChipList events={jokerEvents} />
        </div>
        <div className="settlement-step rules">
          <span>规则修正</span>
          <strong>{ruleEvents.length}</strong>
          <EventChipList events={ruleEvents} />
        </div>
        <div className="settlement-step final">
          <span>最终</span>
          <strong>
            <AnimatedNumber value={log.finalScore} enabled={!fastMode} duration={520} />
          </strong>
          <small>
            {log.finalChips} 筹码 × {log.finalMult} 倍率
          </small>
        </div>
      </div>
    </section>
  );
}

function ScoringLog({ game, detailed }: { game: GameState; detailed: boolean }) {
  if (!game.lastScoringLog) {
    return <p className="empty-log">还没有结算记录。</p>;
  }

  const log = game.lastScoringLog;
  const eventSections = [
    { id: 'hand', title: '牌型基础', events: getScoringEvents(log).filter((event) => event.stage === 'hand') },
    { id: 'scored_card', title: '计分牌', events: getScoringEvents(log).filter((event) => event.stage === 'scored_card') },
    { id: 'enhancement', title: '增强牌', events: getScoringEvents(log).filter((event) => event.stage === 'enhancement') },
    { id: 'joker', title: '小丑', events: getScoringEvents(log).filter((event) => event.stage === 'joker') },
    { id: 'rule', title: '规则修正', events: getScoringEvents(log).filter((event) => event.stage === 'rule') },
    { id: 'final', title: '最终', events: getScoringEvents(log).filter((event) => event.stage === 'final') }
  ];

  return (
    <details className="scoring-log" open={detailed}>
      <summary className="log-head">
        <span>{log.handName}</span>
        <strong>{log.finalScore}</strong>
      </summary>
      <p>
        基础 {log.baseChips} 筹码 × {log.baseMult} 倍率
      </p>
      {detailed && (
        <div className="event-log-list">
          {eventSections.map((section) => (
            <div className="event-log-section" key={section.id}>
              <strong>{section.title}</strong>
              <EventChipList events={section.events} emptyText="无" />
            </div>
          ))}
        </div>
      )}
      <p>最终 {describeFinalFormula(log)}</p>
    </details>
  );
}

function normalizeSavedGame(parsed: Partial<GameState>): GameState {
  const deckId = parsed.deckId ?? DEFAULT_DECK_ID;
  const stakeId = parsed.stakeId ?? DEFAULT_STAKE_ID;
  const fallback = createInitialGame(parsed.seed ?? DEFAULT_SEED, {
    deckId,
    stakeId,
    endless: parsed.endless ?? false
  });

  return {
    ...fallback,
    ...parsed,
    saveVersion: GAME_SAVE_VERSION,
    runId: parsed.runId ?? fallback.runId,
    deckId,
    stakeId,
    endless: parsed.endless ?? fallback.endless,
    currentBlind: parsed.currentBlind ?? null,
    activeBossId: parsed.activeBossId ?? null,
    deck: parsed.deck ?? fallback.deck,
    handLevels: {
      ...createDefaultHandLevels(),
      ...(parsed.handLevels ?? {})
    },
    jokers: parsed.jokers ?? [],
    jokerSlots: parsed.jokerSlots ?? fallback.jokerSlots,
    consumables: parsed.consumables ?? [],
    consumableSlots: parsed.consumableSlots ?? fallback.consumableSlots,
    selectedConsumableId: parsed.selectedConsumableId ?? null,
    packChoices: normalizePackChoices(parsed.packChoices),
    pendingTags: parsed.pendingTags ?? [],
    ownedVouchers: parsed.ownedVouchers ?? [],
    shopOffers: parsed.shopOffers ?? [],
    shopRerollCost: parsed.shopRerollCost ?? fallback.shopRerollCost,
    shopRefreshCount: parsed.shopRefreshCount ?? 0,
    nextJokerInstanceNumber: parsed.nextJokerInstanceNumber ?? 1,
    nextConsumableInstanceNumber: parsed.nextConsumableInstanceNumber ?? 1,
    nextTagInstanceNumber: parsed.nextTagInstanceNumber ?? 1,
    nextCardCopyNumber: parsed.nextCardCopyNumber ?? 1,
    baseHandSize: parsed.baseHandSize ?? fallback.baseHandSize,
    baseHands: parsed.baseHands ?? fallback.baseHands,
    baseDiscards: parsed.baseDiscards ?? fallback.baseDiscards,
    lastScoringLog: parsed.lastScoringLog ? normalizeScoringLog(parsed.lastScoringLog) : null,
    lastTriggeredJokerIds: parsed.lastTriggeredJokerIds ?? [],
    runHighestSingleHandScore: Math.max(parsed.runHighestSingleHandScore ?? 0, parsed.lastScoringLog?.finalScore ?? 0),
    playedHandsThisBlind: parsed.playedHandsThisBlind ?? 0,
    playedHandTypesThisBlind: parsed.playedHandTypesThisBlind ?? []
  };
}

function loadSavedGame(): GameState {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return createInitialGame(DEFAULT_SEED);
    }

    const parsed = JSON.parse(raw) as Partial<GameState>;
    if (!parsed.phase || !parsed.seed) {
      return createInitialGame(DEFAULT_SEED);
    }

    return normalizeSavedGame(parsed);
  } catch {
    return createInitialGame(DEFAULT_SEED);
  }
}

function loadSavedProfile(): PersistentProfile {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) {
      return createDefaultProfile();
    }

    return normalizeProfile(JSON.parse(raw) as Partial<PersistentProfile>);
  } catch {
    return createDefaultProfile();
  }
}

function isBackupLike(value: unknown): value is SaveBackup {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const backup = value as Partial<SaveBackup>;
  return typeof backup.exportVersion === 'number' && typeof backup.exportedAt === 'string' && 'game' in backup && Boolean(backup.profile);
}

function parseBackupFile(raw: string): PendingImport {
  const parsed = JSON.parse(raw) as unknown;

  if (!isBackupLike(parsed)) {
    throw new Error('导入文件缺少必要字段。');
  }

  if (parsed.exportVersion > BACKUP_EXPORT_VERSION) {
    throw new Error('导入文件来自更新版本，当前版本暂不支持。');
  }

  const game = parsed.game ? normalizeSavedGame(parsed.game) : null;
  const profile = normalizeProfile(parsed.profile);

  return {
    exportedAt: parsed.exportedAt,
    appVersion: parsed.appVersion,
    game,
    profile
  };
}

function getBackupFileName(seed: string) {
  const date = new Date().toISOString().slice(0, 10);
  const safeSeed = seed.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, '-').slice(0, 24) || 'profile';
  return `local-card-backup-${safeSeed}-${date}.json`;
}

function formatImportDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN');
}

function getPhaseTask(phase: GamePhase): string {
  if (phase === 'blind_select') {
    return '选择当前盲注。小盲和大盲可以跳过，跳过会放弃奖励但获得标记。';
  }

  if (phase === 'playing') {
    return '选 1 到 5 张牌，尽量用有限出牌次数达到目标分数。';
  }

  if (phase === 'shop') {
    return '商店阶段。购买小丑、消耗牌、补充包或优惠券；跳过获得的标记会在这里兑现。';
  }

  if (phase === 'run_won') {
    return '你已经通过第 8 层的首领盲注，整局完成。无尽模式会在这里继续推进。';
  }

  return '本局失败。重新开局后可以换一个种子再试。';
}

function RulesPanel({ game }: { game: GameState }) {
  return (
    <section className="rules-panel">
      <h2>规则说明</h2>
      <div className="current-task">
        <span>当前要做</span>
        <strong>{getPhaseTask(game.phase)}</strong>
      </div>
      <ol>
        <li>一局由多个层级组成，每个层级按小盲、大盲、首领盲注推进。</li>
        <li>每个盲注有目标分数。达到目标就进入商店；出牌次数用完还没达标就失败。</li>
        <li>每次可选择 1 到 5 张手牌出牌，系统会识别这组牌的最佳牌型。</li>
        <li>得分公式是：牌型基础筹码加计分牌筹码，再乘以牌型倍率。</li>
        <li>弃牌不会得分，但会换新牌；弃牌次数有限。</li>
        <li>小丑放在槽位里，不会被打出；它们会在结算时从左到右触发。</li>
        <li>商店商品按权重出现；刷新从 $3 起，每次刷新后变贵，保留资金会在盲注结束时产生利息。</li>
        <li>星球牌会提升指定牌型等级，让之后同类牌型的基础筹码和倍率变高。</li>
        <li>塔罗牌用来改花色、复制牌、删除牌、增强牌或直接获得资金。</li>
        <li>增强牌会改变计分方式：奖励牌加筹码、倍率牌加倍率、万能牌帮助组成同花、钢铁牌留在手牌中放大倍率、黄金牌通关盲注后给钱。</li>
        <li>补充包有标准、星球、塔罗、小丑和幻灵类型；开包后选择 1 张，或跳过保留当前构筑。</li>
        <li>小盲和大盲可以跳过。跳过不会获得普通奖励，但会得到一个标记，之后在下一次商店或下一场盲注兑现。</li>
        <li>首领盲注会提前展示特殊规则，例如某些牌不计分、不能重复牌型、手牌变少或小丑暂时失效。</li>
        <li>优惠券是长期效果，买下后会持续改变槽位、商店价格、盲注奖励或首领目标。</li>
        <li>长期资料包含初始牌组、难度、无尽模式、图鉴、解锁、统计和设置；这些资料会保存在本机。</li>
        <li>结算反馈、数字递增、音效、快速模式和键盘操作会帮助你读懂每手牌。</li>
      </ol>
      <div className="publish-note">
        <span>线上说明</span>
        <p>
          这是独立制作的《盲注回响 / Ante Echo》，非官方作品，不使用原版素材或受保护文案。线上版本不需要你的电脑保持开机；存档只保存在当前浏览器，可在设置中导出和导入备份。
        </p>
        {FEEDBACK_URL ? <a href={FEEDBACK_URL}>反馈问题</a> : <small>反馈入口待开放</small>}
      </div>
    </section>
  );
}

function RarityLabel({ rarity }: { rarity: string }) {
  const label = rarity === 'rare' ? '稀有' : rarity === 'uncommon' ? '罕见' : '普通';
  return <span className={`rarity ${rarity}`}>{label}</span>;
}

const JOKER_ARCHETYPE_LABELS: Record<JokerArchetype, string> = {
  general: '通用',
  high_card: '高牌',
  pair: '对子',
  flush: '同花',
  straight: '顺子',
  face: '人头',
  suit: '花色',
  economy: '经济',
  growth: '成长',
  glass: '玻璃',
  copy: '复制',
  enhancement: '增强'
};

const JOKER_TRIGGER_LABELS: Record<JokerTriggerTiming, string> = {
  on_play: '出牌',
  scored_card: '计分牌',
  blind_end: '盲注结束',
  shop: '商店',
  buy_sell: '买卖'
};

function JokerInfoBadges({ definition }: { definition: ReturnType<typeof getJokerDefinition> }) {
  return (
    <div className="joker-tag-row">
      {definition.archetypes.map((archetype) => (
        <span className="joker-tag archetype" key={archetype}>
          {JOKER_ARCHETYPE_LABELS[archetype]}
        </span>
      ))}
      {definition.triggerTiming.map((timing) => (
        <span className="joker-tag timing" key={timing}>
          {JOKER_TRIGGER_LABELS[timing]}
        </span>
      ))}
    </div>
  );
}

function JokerTriggerDetails({ definition }: { definition: ReturnType<typeof getJokerDefinition> }) {
  return (
    <div className="joker-trigger-text">
      <span>{definition.triggerText}</span>
      <strong>{definition.conditionText}</strong>
    </div>
  );
}

function JokerCard({
  joker,
  index,
  triggered,
  triggerOrder,
  canSell,
  canMoveLeft,
  canMoveRight,
  onSell,
  onMove,
  onInspect,
  onDragStart,
  onDrop
}: {
  joker: JokerInstance;
  index: number;
  triggered: boolean;
  triggerOrder: number | null;
  canSell: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onSell: () => void;
  onMove: (toIndex: number) => void;
  onInspect: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const definition = getJokerDefinition(joker.definitionId);

  return (
    <article
      className={`joker-card ${triggered ? 'triggered' : ''}`}
      style={triggered && triggerOrder !== null ? ({ '--joker-trigger-delay': `${triggerOrder * 120}ms` } as CSSProperties) : undefined}
      draggable
      title={definition.description}
      tabIndex={0}
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      onClick={onInspect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onInspect();
        }
      }}
    >
      <div className="joker-topline">
        <RarityLabel rarity={definition.rarity} />
        <span>${definition.price}</span>
      </div>
      <h3>{definition.name}</h3>
      <JokerInfoBadges definition={definition} />
      <p>{definition.description}</p>
      <JokerTriggerDetails definition={definition} />
      {joker.level > 0 && <strong className="joker-level">成长 {joker.level}</strong>}
      {triggered && triggerOrder !== null && <span className="joker-trigger-order">第 {triggerOrder + 1} 个触发</span>}
      <div className="joker-actions">
        <button
          type="button"
          className="icon-action"
          disabled={!canMoveLeft}
          aria-label="左移小丑"
          onClick={(event) => {
            event.stopPropagation();
            onMove(index - 1);
          }}
        >
          ←
        </button>
        <button
          type="button"
          className="icon-action"
          disabled={!canMoveRight}
          aria-label="右移小丑"
          onClick={(event) => {
            event.stopPropagation();
            onMove(index + 1);
          }}
        >
          →
        </button>
        <button
          type="button"
          className="sell-action"
          disabled={!canSell}
          onClick={(event) => {
            event.stopPropagation();
            onSell();
          }}
        >
          卖出 ${getJokerSellValue(joker.definitionId)}
        </button>
      </div>
    </article>
  );
}

function JokerBar({
  game,
  onSell,
  onMove,
  onInspect
}: {
  game: GameState;
  onSell: (instanceId: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onInspect: (target: InspectTarget) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const emptySlots = Array.from({ length: Math.max(0, game.jokerSlots - game.jokers.length) });
  const triggerOrder = game.lastScoringLog
    ? getScoringEvents(game.lastScoringLog)
        .filter((event) => event.stage === 'joker' && event.sourceId)
        .reduce<string[]>((order, event) => {
          if (event.sourceId && !order.includes(event.sourceId)) {
            return [...order, event.sourceId];
          }

          return order;
        }, [])
    : [];

  return (
    <section className={`joker-bar ${game.jokers.length === 0 ? 'empty-bar' : ''}`} aria-label="小丑槽位">
      <div className="joker-bar-header">
        <div>
          <span>小丑槽</span>
          <strong>{game.jokers.length}/{game.jokerSlots}</strong>
        </div>
        <p>从左到右触发，可拖拽或用箭头调整顺序。</p>
      </div>
      <div className="joker-row">
        {game.jokers.map((joker, index) => (
          <JokerCard
            key={joker.instanceId}
            joker={joker}
            index={index}
            triggered={game.lastTriggeredJokerIds.includes(joker.instanceId)}
            triggerOrder={triggerOrder.includes(joker.instanceId) ? triggerOrder.indexOf(joker.instanceId) : null}
            canSell={game.phase === 'shop'}
            canMoveLeft={index > 0}
            canMoveRight={index < game.jokers.length - 1}
            onSell={() => onSell(joker.instanceId)}
            onMove={(toIndex) => onMove(index, toIndex)}
            onInspect={() =>
              onInspect({
                kind: 'joker',
                definitionId: joker.definitionId,
                level: joker.level,
                sellValue: getJokerSellValue(joker.definitionId),
                source: `小丑槽第 ${index + 1} 位`
              })
            }
            onDragStart={() => setDragIndex(index)}
            onDrop={() => {
              if (dragIndex !== null) {
                onMove(dragIndex, index);
                setDragIndex(null);
              }
            }}
          />
        ))}
        {emptySlots.map((_, index) => (
          <div className="joker-empty" key={`empty-${index}`}>
            空槽
          </div>
        ))}
      </div>
    </section>
  );
}

function ConsumableCard({
  consumable,
  active,
  disabled,
  disabledReason,
  selectedTargetCount,
  onUse,
  onInspect
}: {
  consumable: ConsumableInstance;
  active: boolean;
  disabled: boolean;
  disabledReason: string | null;
  selectedTargetCount: number;
  onUse: () => void;
  onInspect: () => void;
}) {
  const definition = getConsumableDefinition(consumable.definitionId);
  const actionLabel = active ? '确认使用' : disabledReason === '需要进入盲注后选择手牌目标' ? '盲注中使用' : definition.target.mode === 'none' ? '立即使用' : '选择目标';
  const targetText =
    definition.target.mode === 'cards'
      ? definition.target.min === definition.target.max
        ? `目标：选择 ${definition.target.min} 张手牌`
        : `目标：选择 ${definition.target.min}-${definition.target.max} 张手牌`
      : '无需选择目标';
  const activeText =
    active && definition.target.mode === 'cards'
      ? `当前已选 ${selectedTargetCount}/${definition.target.max}`
      : targetText;

  return (
    <article
      className={`consumable-card ${definition.kind} ${active ? 'active' : ''}`}
      title={`${definition.name}：${definition.description}。${targetText}`}
      tabIndex={0}
      onClick={onInspect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onInspect();
        }
      }}
    >
      <div className="consumable-topline">
        <span>{getConsumableLabel(definition.id)}</span>
        <strong>${definition.price}</strong>
      </div>
      <h3>{definition.name}</h3>
      <p>{definition.description}</p>
      <small className="consumable-target-note">{activeText}</small>
      {disabledReason && <em className="disabled-reason">{disabledReason}</em>}
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onUse();
        }}
      >
        {actionLabel}
      </button>
    </article>
  );
}

function ConsumableBar({
  game,
  onUse,
  onCancel,
  onInspect
}: {
  game: GameState;
  onUse: (instanceId: string) => void;
  onCancel: () => void;
  onInspect: (target: InspectTarget) => void;
}) {
  const emptySlots = Array.from({ length: Math.max(0, game.consumableSlots - game.consumables.length) });
  const activeConsumable = game.selectedConsumableId
    ? game.consumables.find((consumable) => consumable.instanceId === game.selectedConsumableId)
    : null;
  const activeDefinition = activeConsumable ? getConsumableDefinition(activeConsumable.definitionId) : null;

  return (
    <section className={`consumable-bar ${game.consumables.length === 0 ? 'empty-bar' : ''}`} aria-label="消耗牌槽位">
      <div className="consumable-header">
        <div>
          <span>消耗牌槽</span>
          <strong>{game.consumables.length}/{game.consumableSlots}</strong>
        </div>
        {activeDefinition ? (
          <div className="target-helper">
            <span>
              {activeDefinition.target.min === activeDefinition.target.max
                ? `目标 ${game.selectedCardIds.length}/${activeDefinition.target.max}`
                : `目标 ${game.selectedCardIds.length}/${activeDefinition.target.min}-${activeDefinition.target.max}`}
            </span>
            <small>
              {game.selectedCardIds.length >= activeDefinition.target.min &&
              game.selectedCardIds.length <= activeDefinition.target.max
                ? '目标数量合法，可以确认使用。'
                : '请选择合法数量的目标牌。'}
            </small>
            <button type="button" className="secondary-action compact-action" onClick={onCancel}>
              取消目标
            </button>
          </div>
        ) : (
          <p>星球牌升级牌型，塔罗牌改造当前牌组。</p>
        )}
      </div>
      <div className="consumable-row">
        {game.consumables.map((consumable) => {
          const definition = getConsumableDefinition(consumable.definitionId);
          const needsCards = definition.target.mode === 'cards';
          const isActive = game.selectedConsumableId === consumable.instanceId;
          const selectedTargetCount = isActive ? game.selectedCardIds.length : 0;
          const targetCountValid =
            !isActive ||
            !needsCards ||
            (selectedTargetCount >= definition.target.min && selectedTargetCount <= definition.target.max);
          const disabledReason =
            needsCards && game.phase !== 'playing'
              ? '需要进入盲注后选择手牌目标'
              : needsCards && isActive && !targetCountValid
                ? '请选择合法数量的目标牌'
                : null;
          const disabled = needsCards && (game.phase !== 'playing' || !targetCountValid);

          return (
            <ConsumableCard
              key={consumable.instanceId}
              consumable={consumable}
              active={isActive}
              disabled={disabled}
              disabledReason={disabledReason}
              selectedTargetCount={selectedTargetCount}
              onUse={() => onUse(consumable.instanceId)}
              onInspect={() =>
                onInspect({
                  kind: 'consumable',
                  definitionId: consumable.definitionId,
                  source: isActive ? '当前正在选择目标' : '消耗牌槽'
                })
              }
            />
          );
        })}
        {emptySlots.map((_, index) => (
          <div className="consumable-empty" key={`consumable-empty-${index}`}>
            空槽
          </div>
        ))}
      </div>
    </section>
  );
}

function DeckPanel({ game, onInspect }: { game: GameState; onInspect?: (target: InspectTarget) => void }) {
  const suitCounts = game.deck.reduce<Record<string, number>>(
    (counts, card) => ({
      ...counts,
      [card.suit]: (counts[card.suit] ?? 0) + 1
    }),
    {}
  );
  const rankCounts = game.deck.reduce<Record<string, number>>(
    (counts, card) => ({
      ...counts,
      [card.rank]: (counts[card.rank] ?? 0) + 1
    }),
    {}
  );
  const enhancementCounts = game.deck.reduce<Record<string, number>>((counts, card) => {
    if (!card.enhancement) {
      return counts;
    }

    return {
      ...counts,
      [card.enhancement]: (counts[card.enhancement] ?? 0) + 1
    };
  }, {});
  const enhancementTotal = Object.values(enhancementCounts).reduce((total, count) => total + count, 0);

  return (
    <section>
      <h2>查看牌组</h2>
      <div className="deck-summary">
        <Stat label="牌组总数" value={game.deck.length} />
        <Stat label="增强牌" value={enhancementTotal} />
      </div>
      <div className="deck-stat-block">
        <div className="deck-stat-title">
          <span>花色分布</span>
          <small>改花色后会即时更新</small>
        </div>
        <div className="deck-chip-grid suits">
          {SUITS.map((suit) => (
            <span key={suit}>
              {SUIT_LABELS[suit]} {SUIT_NAMES[suit]} <strong>{suitCounts[suit] ?? 0}</strong>
            </span>
          ))}
        </div>
      </div>
      <div className="deck-stat-block">
        <div className="deck-stat-title">
          <span>点数分布</span>
          <small>改点数、复制、删牌都会改变这里</small>
        </div>
        <div className="deck-chip-grid ranks">
          {RANKS.map((rank) => (
            <span key={rank}>
              {rank} <strong>{rankCounts[rank] ?? 0}</strong>
            </span>
          ))}
        </div>
      </div>
      <div className="deck-stat-block">
        <div className="deck-stat-title">
          <span>增强统计</span>
          <small>用于判断 Bonus、Mult、Wild、Glass 等构筑密度</small>
        </div>
        <div className="enhancement-counts">
          {Object.entries(enhancementCounts).length === 0 ? (
            <span>暂无增强牌</span>
          ) : (
            Object.entries(enhancementCounts).map(([enhancement, count]) => (
              <span key={enhancement}>
                {ENHANCEMENT_NAMES[enhancement as keyof typeof ENHANCEMENT_NAMES]} × {count}
              </span>
            ))
          )}
        </div>
      </div>
      <div className="hand-levels">
        {POKER_HAND_ORDER.slice().reverse().map((hand) => {
          const score = getHandScore(hand, game.handLevels[hand]);

          return (
            <div key={hand} className="hand-level-row">
              <span>{HAND_SCORES[hand].name}</span>
              <strong>等级 {game.handLevels[hand]}</strong>
              <small>
                {score.chips} 筹码 × {score.mult} 倍率
              </small>
            </div>
          );
        })}
      </div>
      <div className="deck-card-list">
        {game.deck.map((card) => (
          <button
            type="button"
            key={card.id}
            className={card.enhancement ? `deck-mini-card ${card.enhancement}` : 'deck-mini-card'}
            onClick={() => onInspect?.({ kind: 'playing_card', card, source: '当前牌组' })}
          >
            {formatCard(card)}
            {card.enhancement ? ` ${ENHANCEMENT_SHORT_LABELS[card.enhancement]}` : ''}
          </button>
        ))}
      </div>
    </section>
  );
}

function DiscardPanel({ game, onInspect }: { game: GameState; onInspect?: (target: InspectTarget) => void }) {
  return (
    <section>
      <h2>弃牌堆</h2>
      <p className="discard-count">{game.discardPile.length} 张牌</p>
      <div className="discard-list">
        {game.discardPile.slice(-12).map((card) => (
          <button type="button" className="discard-chip" key={card.id} onClick={() => onInspect?.({ kind: 'playing_card', card, source: '弃牌堆' })}>
            {formatCard(card)}
          </button>
        ))}
      </div>
    </section>
  );
}

function RunModifiersPanel({ game, onInspect }: { game: GameState; onInspect?: (target: InspectTarget) => void }) {
  return (
    <section>
      <h2>标记与优惠券</h2>
      <div className="modifier-panel-block">
        <span>待兑现标记</span>
        {game.pendingTags.length === 0 ? (
          <p className="empty-log">暂无标记。</p>
        ) : (
          <div className="run-modifier-list">
            {game.pendingTags.map((tag) => {
              const definition = getTagDefinition(tag.definitionId);

              return (
                <button
                  type="button"
                  className="run-modifier-item"
                  key={tag.instanceId}
                  title={`${definition.name}：${definition.description}`}
                  onClick={() => onInspect?.({ kind: 'tag', definitionId: definition.id, source: '待兑现标记' })}
                >
                  <strong>{definition.name}</strong>
                  <small>{definition.description}</small>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="modifier-panel-block">
        <span>已购优惠券</span>
        {game.ownedVouchers.length === 0 ? (
          <p className="empty-log">暂无优惠券。</p>
        ) : (
          <div className="run-modifier-list">
            {game.ownedVouchers.map((voucherId) => {
              const definition = getVoucherDefinition(voucherId);

              return (
                <button
                  type="button"
                  className="run-modifier-item"
                  key={voucherId}
                  title={`${definition.name}：${definition.description}`}
                  onClick={() => onInspect?.({ kind: 'voucher', definitionId: definition.id, source: '已购优惠券' })}
                >
                  <strong>{definition.name}</strong>
                  <small>{definition.description}</small>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function getConsumableKindCounts(ids: string[]) {
  return ids.reduce(
    (counts, definitionId) => {
      const definition = getConsumableDefinition(definitionId);
      return {
        ...counts,
        [definition.kind]: counts[definition.kind] + 1
      };
    },
    { planet: 0, tarot: 0, spectral: 0 }
  );
}

function CollectionList({
  title,
  ids,
  total,
  getName
}: {
  title: string;
  ids: string[];
  total: number;
  getName: (id: string) => string;
}) {
  return (
    <div className="collection-block">
      <div className="collection-head">
        <span>{title}</span>
        <strong>
          {ids.length}/{total}
        </strong>
      </div>
      <div className="collection-list">
        {ids.length === 0 ? (
          <span>尚未见过</span>
        ) : (
          ids.slice(0, 10).map((id) => <span key={id}>{getName(id)}</span>)
        )}
      </div>
    </div>
  );
}

function topRecords(records: Record<string, ProfileRunRecord>, limit = 4) {
  return Object.entries(records)
    .sort(([, left], [, right]) => right.highestAnte - left.highestAnte || right.highestSingleHandScore - left.highestSingleHandScore)
    .slice(0, limit);
}

function RecordList({
  title,
  records,
  getName
}: {
  title: string;
  records: Record<string, ProfileRunRecord>;
  getName: (id: string) => string;
}) {
  const entries = topRecords(records);

  return (
    <div className="record-block">
      <div className="collection-head">
        <span>{title}</span>
        <strong>{entries.length}</strong>
      </div>
      {entries.length === 0 ? (
        <p className="empty-log">暂无记录。</p>
      ) : (
        <div className="record-list">
          {entries.map(([id, record]) => (
            <div className="record-row" key={id}>
              <strong>{getName(id)}</strong>
              <span>最高第 {record.highestAnte} 层</span>
              <small>
                单手 {record.highestSingleHandScore}｜胜 {record.winCount}｜败 {record.lossCount}
              </small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatsPanel({ profile }: { profile: PersistentProfile }) {
  return (
    <section>
      <h2>统计资料</h2>
      <div className="profile-stats">
        <Stat label="最高层级" value={profile.stats.highestAnte} />
        <Stat label="无尽最高" value={profile.stats.highestEndlessAnte || '-'} />
        <Stat label="最高单手" value={profile.stats.highestSingleHandScore} />
        <Stat label="通关次数" value={profile.stats.winCount} />
        <Stat label="失败次数" value={profile.stats.lossCount} />
      </div>
      <div className="record-grid">
        <RecordList title="牌组记录" records={profile.stats.deckRecords} getName={(id) => getDeckDefinition(id).name} />
        <RecordList title="难度记录" records={profile.stats.stakeRecords} getName={(id) => getStakeDefinition(id).name} />
      </div>
    </section>
  );
}

function CollectionPanel({ profile }: { profile: PersistentProfile }) {
  const consumableCounts = getConsumableKindCounts(profile.collection.seenConsumables);

  return (
    <section>
      <h2>收藏图鉴</h2>
      <div className="collection-grid">
        <CollectionList
          title="小丑图鉴"
          ids={profile.collection.seenJokers}
          total={JOKERS.length}
          getName={(id) => getJokerDefinition(id).name}
        />
        <CollectionList
          title="星球与塔罗"
          ids={profile.collection.seenConsumables}
          total={CONSUMABLES.length}
          getName={(id) => getConsumableDefinition(id).name}
        />
        <CollectionList
          title="首领图鉴"
          ids={profile.collection.seenBosses}
          total={BOSSES.length}
          getName={(id) => getBossDefinition(id).name}
        />
        <CollectionList
          title="优惠券图鉴"
          ids={profile.collection.seenVouchers}
          total={VOUCHERS.length}
          getName={(id) => getVoucherDefinition(id).name}
        />
      </div>
      <p className="profile-note">
        已见过 {consumableCounts.planet} 张星球牌、{consumableCounts.tarot} 张塔罗牌。解锁会在条件达成后自动保存。
      </p>
      <div className="unlock-list">
        {profile.unlocks.length === 0 ? (
          <span>暂无额外解锁</span>
        ) : (
          profile.unlocks.map((unlock) => <span key={unlock}>{unlock}</span>)
        )}
      </div>
    </section>
  );
}

function ProfilePanel({ profile }: { profile: PersistentProfile }) {
  return (
    <section>
      <h2>长期资料</h2>
      <StatsPanel profile={profile} />
      <CollectionPanel profile={profile} />
    </section>
  );
}

function SettingsPanel({
  profile,
  onChange,
  onResetProfile,
  onClearRun,
  onExportBackup,
  onImportBackup,
  importMessage
}: {
  profile: PersistentProfile;
  onChange: (profile: PersistentProfile) => void;
  onResetProfile: () => void;
  onClearRun: () => void;
  onExportBackup: () => void;
  onImportBackup: (event: ChangeEvent<HTMLInputElement>) => void;
  importMessage: string | null;
}) {
  return (
    <section>
      <h2>设置与存档</h2>
      <label className="setting-row">
        <span>音量</span>
        <input
          type="range"
          min="0"
          max="100"
          value={profile.settings.volume}
          onChange={(event) => onChange(updateProfileSettings(profile, { volume: Number(event.target.value) }))}
        />
        <strong>{profile.settings.volume}</strong>
      </label>
      <div className="setting-row speed-setting">
        <span>动画速度</span>
        <div className="segmented-control" role="group" aria-label="动画速度">
          {ANIMATION_MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={profile.settings.animationMode === option.id ? 'active' : ''}
              title={option.detail}
              onClick={() => onChange(updateProfileSettings(profile, { animationMode: option.id }))}
            >
              {option.label}
            </button>
          ))}
        </div>
        <strong>{profile.settings.animationSpeed}x</strong>
      </div>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={profile.settings.showDetailedScoring}
          onChange={(event) => onChange(updateProfileSettings(profile, { showDetailedScoring: event.target.checked }))}
        />
        <span>显示详细结算日志</span>
      </label>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={profile.settings.soundEnabled}
          onChange={(event) => onChange(updateProfileSettings(profile, { soundEnabled: event.target.checked }))}
        />
        <span>音效</span>
      </label>
      <div className="publish-note compact">
        <span>版本 {APP_VERSION}</span>
        <p>线上版本使用本地浏览器存档，不包含账号、云同步、排行榜或多人功能。换设备前请先导出备份。</p>
        {FEEDBACK_URL ? <a href={FEEDBACK_URL}>反馈问题</a> : <small>反馈入口待开放</small>}
      </div>
      <div className="backup-panel">
        <div>
          <span>存档管理</span>
          <strong>导出 / 导入本地备份</strong>
          <p>导出文件会包含当前 run 和长期资料。换设备或清理浏览器前请先导出；导入前会预览摘要，确认后才覆盖当前浏览器存档。</p>
        </div>
        <div className="storage-actions">
          <button type="button" onClick={onExportBackup}>
            导出存档
          </button>
          <label className="file-import-action">
            <input type="file" accept="application/json,.json" onChange={onImportBackup} />
            <span>导入存档</span>
          </label>
        </div>
        {importMessage && <p className="backup-message">{importMessage}</p>}
      </div>
      <div className="storage-actions">
        <button type="button" className="secondary-action" onClick={onClearRun}>
          清除当前进度
        </button>
        <button type="button" className="danger-action" onClick={onResetProfile}>
          重置长期资料
        </button>
      </div>
    </section>
  );
}

function SituationSummaryPanel({ game }: { game: GameState }) {
  const currentBlind = game.currentBlind ?? getBlindForState(game);
  const progress = Math.min(100, Math.round((game.currentScore / game.targetScore) * 100));

  return (
    <section className="situation-summary-panel">
      <h2>当前局势</h2>
      <div className="mobile-situation-grid">
        <Stat label="层级" value={game.endless ? `${game.ante}/∞` : `${game.ante}/${MAX_ANTE}`} />
        <Stat label="盲注" value={currentBlind.name} />
        <Stat label="当前分" value={game.currentScore} />
        <Stat label="目标" value={game.targetScore} />
        <Stat label="资金" value={`$${game.money}`} />
        <Stat label="出牌/弃牌" value={`${game.handsRemaining}/${game.discardsRemaining}`} />
      </div>
      <div className="progress-track" aria-label={`进度 ${progress}%`}>
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
    </section>
  );
}

function MobileSituationPanel({ game, onInspect }: { game: GameState; onInspect?: (target: InspectTarget) => void }) {
  return (
    <>
      <SituationSummaryPanel game={game} />
      <RulesPanel game={game} />
      <RunModifiersPanel game={game} onInspect={onInspect} />
    </>
  );
}

function MobileBottomNav({
  activeOverlay,
  onOpen
}: {
  activeOverlay: MobileOverlay;
  onOpen: (overlay: NonNullable<MobileOverlay>) => void;
}) {
  const entries: Array<{ id: NonNullable<MobileOverlay>; label: string; icon: string }> = [
    { id: 'rules', label: '局势', icon: '势' },
    { id: 'deck', label: '牌组', icon: '牌' },
    { id: 'log', label: '日志', icon: '录' },
    { id: 'profile', label: '资料', icon: '库' },
    { id: 'settings', label: '设置', icon: '设' }
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="移动端快速面板">
      {entries.map((entry) => (
        <button
          type="button"
          className={activeOverlay === entry.id ? 'active' : ''}
          key={entry.id}
          aria-pressed={activeOverlay === entry.id}
          onClick={() => onOpen(entry.id)}
        >
          <span>{entry.icon}</span>
          <strong>{entry.label}</strong>
        </button>
      ))}
    </nav>
  );
}

function MobileOverlaySheet({
  activeOverlay,
  game,
  profile,
  onClose,
  onProfileChange,
  onResetProfile,
  onClearRun,
  onExportBackup,
  onImportBackup,
  importMessage,
  onInspect
}: {
  activeOverlay: MobileOverlay;
  game: GameState;
  profile: PersistentProfile;
  onClose: () => void;
  onProfileChange: (profile: PersistentProfile) => void;
  onResetProfile: () => void;
  onClearRun: () => void;
  onExportBackup: () => void;
  onImportBackup: (event: ChangeEvent<HTMLInputElement>) => void;
  importMessage: string | null;
  onInspect: (target: InspectTarget) => void;
}) {
  if (!activeOverlay) {
    return null;
  }

  return (
    <div className="mobile-sheet-layer" role="presentation">
      <button type="button" className="mobile-sheet-backdrop" aria-label="关闭面板" onClick={onClose} />
      <aside className="mobile-sheet" role="dialog" aria-modal="true" aria-label={MOBILE_OVERLAY_LABELS[activeOverlay]}>
        <header className="mobile-sheet-header">
          <span>{MOBILE_OVERLAY_LABELS[activeOverlay]}</span>
          <button type="button" className="secondary-action compact-action" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="mobile-sheet-body">
          {activeOverlay === 'rules' && <MobileSituationPanel game={game} onInspect={onInspect} />}
          {activeOverlay === 'deck' && (
            <>
              <DeckPanel game={game} onInspect={onInspect} />
              <DiscardPanel game={game} onInspect={onInspect} />
            </>
          )}
          {activeOverlay === 'log' && (
            <section>
              <h2>最近结算日志</h2>
              <ScoringLog game={game} detailed={profile.settings.showDetailedScoring} />
            </section>
          )}
          {activeOverlay === 'profile' && <ProfilePanel profile={profile} />}
          {activeOverlay === 'settings' && (
            <SettingsPanel
              profile={profile}
              onChange={onProfileChange}
              onResetProfile={onResetProfile}
              onClearRun={onClearRun}
              onExportBackup={onExportBackup}
              onImportBackup={onImportBackup}
              importMessage={importMessage}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

function SaveSummary({ game, canContinue }: { game: GameState; canContinue: boolean }) {
  const currentBlind = game.currentBlind ?? getBlindForState(game);

  return (
    <aside className="save-summary-card">
      <span>当前存档</span>
      <strong>{canContinue ? `${getDeckDefinition(game.deckId).name}｜${getStakeDefinition(game.stakeId).name}` : '暂无可继续局'}</strong>
      <div className="save-summary-grid">
        <Stat label="层级" value={canContinue ? `${game.ante}${game.endless ? '/∞' : `/${MAX_ANTE}`}` : '-'} />
        <Stat label="盲注" value={canContinue ? currentBlind.name : '-'} />
        <Stat label="资金" value={canContinue ? `$${game.money}` : '-'} />
        <Stat label="小丑" value={canContinue ? `${game.jokers.length}/${game.jokerSlots}` : '-'} />
      </div>
      <p>{canContinue ? game.message : '选择新开局后，会在这里保留当前 run 的摘要。'}</p>
      <small className="local-save-note">存档只属于当前浏览器。换设备前，请到设置里导出备份。</small>
    </aside>
  );
}

function HomeView({
  game,
  profile,
  canContinue,
  onContinue,
  onNavigate
}: {
  game: GameState;
  profile: PersistentProfile;
  canContinue: boolean;
  onContinue: () => void;
  onNavigate: (screen: AppScreen) => void;
}) {
  return (
    <section className="menu-screen home-screen">
      <div className="menu-hero">
        <p className="eyebrow">本地单人牌组挑战</p>
        <h1>盲注回响</h1>
        <p className="title-translation">Ante Echo</p>
        <p>先选牌组与难度，再进入盲注、商店、小丑和牌堆改造的完整 run。</p>
        <small className="version-chip">v{APP_VERSION}｜本地存档｜静态线上版</small>
      </div>
      <div className="home-menu-grid">
        <nav className="menu-actions" aria-label="主菜单">
          <button type="button" className="primary-menu-action" disabled={!canContinue} onClick={onContinue}>
            继续当前局
          </button>
          <button type="button" onClick={() => onNavigate('newRun')}>
            新开局
          </button>
          <button type="button" className="secondary-action" onClick={() => onNavigate('collection')}>
            收藏图鉴
          </button>
          <button type="button" className="secondary-action" onClick={() => onNavigate('stats')}>
            统计资料
          </button>
          <button type="button" className="secondary-action" onClick={() => onNavigate('rules')}>
            规则说明
          </button>
          <button type="button" className="secondary-action" onClick={() => onNavigate('settings')}>
            设置
          </button>
        </nav>
        <SaveSummary game={game} canContinue={canContinue} />
        <section className="home-record-strip">
          <h2>长期记录</h2>
          <div className="profile-stats">
            <Stat label="最高层级" value={profile.stats.highestAnte} />
            <Stat label="最高单手" value={profile.stats.highestSingleHandScore} />
            <Stat label="通关" value={profile.stats.winCount} />
            <Stat label="失败" value={profile.stats.lossCount} />
          </div>
        </section>
      </div>
    </section>
  );
}

function NewRunView({
  profile,
  seedInput,
  setupDeckId,
  setupStakeId,
  setupEndless,
  hasSavedRun,
  pendingConfirm,
  onSeedChange,
  onDeckChange,
  onStakeChange,
  onEndlessChange,
  onRandomSeed,
  onCopySeed,
  onStart,
  onCancelConfirm,
  onBack
}: {
  profile: PersistentProfile;
  seedInput: string;
  setupDeckId: string;
  setupStakeId: string;
  setupEndless: boolean;
  hasSavedRun: boolean;
  pendingConfirm: boolean;
  onSeedChange: (seed: string) => void;
  onDeckChange: (deckId: string) => void;
  onStakeChange: (stakeId: string) => void;
  onEndlessChange: (enabled: boolean) => void;
  onRandomSeed: () => void;
  onCopySeed: () => void;
  onStart: (force?: boolean) => void;
  onCancelConfirm: () => void;
  onBack: () => void;
}) {
  const selectedDeck = getDeckDefinition(setupDeckId);
  const secondaryDecks = DECKS.filter((deck) => deck.id !== setupDeckId);
  const selectedStake = getStakeDefinition(setupStakeId);
  const secondaryStakes = STAKES.filter((stake) => stake.id !== setupStakeId);

  return (
    <section className="menu-screen new-run-screen">
      <header className="menu-page-header">
        <div>
          <p className="eyebrow">新开局配置</p>
          <h1>选择起手规则</h1>
        </div>
        <button type="button" className="secondary-action" onClick={onBack}>
          返回首页
        </button>
      </header>

      <form
        className="new-run-form"
        onSubmit={(event) => {
          event.preventDefault();
          onStart(false);
        }}
      >
        <section className="setup-section">
          <div className="setup-section-heading">
            <span>1</span>
            <div>
              <h2>选择牌组</h2>
              <p>每副牌组会改变开局节奏和构筑方向。</p>
            </div>
          </div>
          <div className="choice-stack">
            <button
              type="button"
              className="setup-choice selected featured-choice"
              aria-pressed="true"
              onClick={() => onDeckChange(selectedDeck.id)}
            >
              <span>{selectedDeck.name}</span>
              <small>{selectedDeck.description}</small>
            </button>
            <div className="deck-choice-grid secondary-options">
              {secondaryDecks.map((deck) => (
                <button
                  key={deck.id}
                  type="button"
                  className="setup-choice"
                  aria-pressed="false"
                  onClick={() => onDeckChange(deck.id)}
                >
                  <span>{deck.name}</span>
                  <small>{deck.description}</small>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="setup-section">
          <div className="setup-section-heading">
            <span>2</span>
            <div>
              <h2>选择难度</h2>
              <p>未解锁难度会保持不可选，避免误开局。</p>
            </div>
          </div>
          <div className="choice-stack">
            <button
              type="button"
              className="setup-choice stake selected featured-choice"
              aria-pressed="true"
              disabled={!isStakeUnlocked(profile, selectedStake.id)}
              onClick={() => onStakeChange(selectedStake.id)}
            >
              <span>{selectedStake.name}</span>
              <small>{selectedStake.description}</small>
            </button>
            <div className="stake-choice-row secondary-options">
              {secondaryStakes.map((stake) => {
              const unlocked = isStakeUnlocked(profile, stake.id);

              return (
                <button
                  key={stake.id}
                  type="button"
                  className={setupStakeId === stake.id ? 'setup-choice stake selected' : 'setup-choice stake'}
                  disabled={!unlocked}
                  aria-pressed={setupStakeId === stake.id}
                  onClick={() => onStakeChange(stake.id)}
                >
                  <span>{stake.name}</span>
                  <small>{unlocked ? stake.description : '未解锁'}</small>
                </button>
              );
              })}
            </div>
          </div>
        </section>

        <section className="setup-section setup-final-section">
          <div className="setup-section-heading">
            <span>3</span>
            <div>
              <h2>种子与模式</h2>
              <p>同一种子和同一操作序列可以复盘同一局。</p>
            </div>
          </div>
          <div className="seed-config-panel">
            <label htmlFor="new-run-seed">种子</label>
            <input id="new-run-seed" value={seedInput} onChange={(event) => onSeedChange(event.target.value)} spellCheck={false} />
            <button type="button" className="secondary-action" onClick={onRandomSeed}>
              随机种子
            </button>
            <button type="button" className="secondary-action" onClick={onCopySeed}>
              复制种子
            </button>
            <label className="toggle-row setup-toggle">
              <input type="checkbox" checked={setupEndless} onChange={(event) => onEndlessChange(event.target.checked)} />
              <span>无尽模式</span>
            </label>
          </div>
        </section>

        <div className="new-run-actions">
          <button type="button" className="secondary-action" onClick={onBack}>
            取消
          </button>
          <button type="submit">开始游戏</button>
        </div>
      </form>

      {pendingConfirm && (
        <div className="confirm-layer" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-label="确认覆盖当前进度">
            <span>覆盖当前进度</span>
            <strong>开始新局会替换当前 run。</strong>
            <p>长期资料、图鉴和统计不会被清除；只会覆盖当前可继续的牌局。</p>
            <div className="action-row">
              <button type="button" className="secondary-action" onClick={onCancelConfirm}>
                取消
              </button>
              <button type="button" className="danger-action" onClick={() => onStart(true)}>
                确认开始
              </button>
            </div>
          </div>
        </div>
      )}
      {hasSavedRun && <p className="overwrite-note">检测到当前已有可继续牌局。开始新局前会再次确认。</p>}
    </section>
  );
}

function AppInfoPage({
  screen,
  game,
  profile,
  onBack,
  onProfileChange,
  onResetProfile,
  onClearRun,
  onExportBackup,
  onImportBackup,
  importMessage
}: {
  screen: Exclude<AppScreen, 'home' | 'newRun' | 'game'>;
  game: GameState;
  profile: PersistentProfile;
  onBack: () => void;
  onProfileChange: (profile: PersistentProfile) => void;
  onResetProfile: () => void;
  onClearRun: () => void;
  onExportBackup: () => void;
  onImportBackup: (event: ChangeEvent<HTMLInputElement>) => void;
  importMessage: string | null;
}) {
  return (
    <section className="menu-screen info-screen">
      <header className="menu-page-header">
        <div>
          <p className="eyebrow">游戏资料</p>
          <h1>{APP_SCREEN_TITLES[screen]}</h1>
        </div>
        <button type="button" className="secondary-action" onClick={onBack}>
          返回首页
        </button>
      </header>
      <div className="info-panel">
        {screen === 'collection' && <CollectionPanel profile={profile} />}
        {screen === 'stats' && <StatsPanel profile={profile} />}
        {screen === 'rules' && <RulesPanel game={game} />}
        {screen === 'settings' && (
          <SettingsPanel
            profile={profile}
            onChange={onProfileChange}
            onResetProfile={onResetProfile}
            onClearRun={onClearRun}
            onExportBackup={onExportBackup}
            onImportBackup={onImportBackup}
            importMessage={importMessage}
          />
        )}
      </div>
    </section>
  );
}

function ImportConfirmDialog({
  pendingImport,
  onCancel,
  onConfirm
}: {
  pendingImport: PendingImport;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const importedBlind = pendingImport.game ? pendingImport.game.currentBlind ?? getBlindForState(pendingImport.game) : null;

  return (
    <div className="confirm-layer" role="presentation">
      <div className="confirm-dialog import-dialog" role="dialog" aria-modal="true" aria-label="确认导入存档">
        <span>导入本地备份</span>
        <strong>确认后会覆盖当前浏览器存档。</strong>
        <p>
          备份时间：{formatImportDate(pendingImport.exportedAt)}
          {pendingImport.appVersion ? `｜版本 ${pendingImport.appVersion}` : ''}
        </p>
        <div className="import-summary-grid">
          <Stat label="当前局" value={pendingImport.game ? `${getDeckDefinition(pendingImport.game.deckId).name}｜${getStakeDefinition(pendingImport.game.stakeId).name}` : '无'} />
          <Stat label="层级" value={pendingImport.game ? `${pendingImport.game.ante}${pendingImport.game.endless ? '/∞' : `/${MAX_ANTE}`}` : '-'} />
          <Stat label="盲注" value={importedBlind ? importedBlind.name : '-'} />
          <Stat label="最高单手" value={pendingImport.profile.stats.highestSingleHandScore} />
        </div>
        <div className="action-row">
          <button type="button" className="secondary-action" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="danger-action" onClick={onConfirm}>
            确认导入
          </button>
        </div>
      </div>
    </div>
  );
}

function BlindSelection({
  game,
  disabled,
  onStart,
  onSkip,
  onInspect
}: {
  game: GameState;
  disabled: boolean;
  onStart: () => void;
  onSkip: () => void;
  onInspect: (target: InspectTarget) => void;
}) {
  const blinds = getBlindChoicesForState(game);
  const currentSkipTag = game.blindIndex < 2 ? getTagForBlind(game.seed, game.ante, game.blindIndex) : null;

  return (
    <section className="stage-view">
      <div className="stage-copy">
        <span>盲注选择</span>
        <h2>第 {game.ante} 层</h2>
        <p>{game.message}</p>
      </div>
      <div className="blind-grid">
        {blinds.map((blind, index) => {
          const stateLabel = index < game.blindIndex ? '已完成' : index === game.blindIndex ? '当前' : '未解锁';
          const isCurrent = index === game.blindIndex;

          return (
            <article className={`blind-card ${isCurrent ? 'current' : ''}`} key={blind.id}>
              <span>{stateLabel}</span>
              <h3>{blind.name}</h3>
              <p>{blind.description}</p>
              {blind.bossId && <BossPreview bossId={blind.bossId} onInspect={onInspect} />}
              <div className="blind-meta">
                <strong>{blind.targetScore}</strong>
                <span>目标分</span>
              </div>
              <div className="blind-meta">
                <strong>${blind.reward}</strong>
                <span>奖励</span>
              </div>
            </article>
          );
        })}
      </div>
      {currentSkipTag && <TagPreview tagId={currentSkipTag.id} onInspect={onInspect} />}
      <div className="action-row">
        {currentSkipTag && (
          <button type="button" className="secondary-action" disabled={disabled} onClick={onSkip}>
            跳过，获得{currentSkipTag.name}
          </button>
        )}
        <button type="button" disabled={disabled} onClick={onStart}>
          开始当前盲注
        </button>
      </div>
    </section>
  );
}

function getBossEffectLabel(effect: BossEffect): string {
  if (effect.type === 'debuff_suit') return `${SUIT_NAMES[effect.suit]}不计分`;
  if (effect.type === 'debuff_rank') return `${effect.rank} 不计分`;
  if (effect.type === 'debuff_face_cards') return '人头牌不计分';
  if (effect.type === 'first_hand_score_factor') return `首手倍率 ×${effect.factor}`;
  if (effect.type === 'no_repeat_hand') return '牌型不能重复';
  if (effect.type === 'hand_size_delta') return `手牌上限 ${effect.amount > 0 ? '+' : ''}${effect.amount}`;
  if (effect.type === 'no_discards') return '没有弃牌';
  if (effect.type === 'force_five_cards') return '必须打 5 张';
  if (effect.type === 'first_hand_min_score_ratio') return `首手至少 ${Math.round(effect.ratio * 100)}%`;
  if (effect.type === 'disable_joker_rarity') return `${effect.rarity === 'rare' ? '稀有' : effect.rarity === 'uncommon' ? '罕见' : '普通'}小丑失效`;
  if (effect.type === 'max_selected_cards') return `最多选 ${effect.max} 张`;
  return '人头牌盖面';
}

function BossPreview({ bossId, onInspect }: { bossId: string; onInspect?: (target: InspectTarget) => void }) {
  const boss = getBossDefinition(bossId);
  const detail = `${boss.name}：${boss.description}。应对：${boss.advice}`;

  return (
    <button type="button" className="boss-preview" title={detail} onClick={() => onInspect?.({ kind: 'boss', definitionId: boss.id, source: 'Boss 预告' })}>
      <strong>{boss.name}</strong>
      <small>{boss.description}</small>
      <div className="boss-effect-list">
        {boss.effects.map((effect, index) => (
          <span key={`${boss.id}-${index}`}>{getBossEffectLabel(effect)}</span>
        ))}
      </div>
      <em>{boss.advice}</em>
    </button>
  );
}

function TagPreview({ tagId, onInspect }: { tagId: string; onInspect?: (target: InspectTarget) => void }) {
  const tag = getTagDefinition(tagId);

  return (
    <button type="button" className="tag-preview" title={`${tag.name}：${tag.description}`} onClick={() => onInspect?.({ kind: 'tag', definitionId: tag.id, source: '跳过奖励' })}>
      <span>跳过奖励</span>
      <strong>{tag.name}</strong>
      <small>{tag.description}</small>
    </button>
  );
}

function getPackChoiceLabel(choice: PackChoice): string {
  if (choice.kind === 'playing_card') {
    return '扑克牌';
  }

  if (choice.kind === 'consumable') {
    return getConsumableLabel(choice.definitionId);
  }

  if (choice.kind === 'joker') {
    return '小丑牌';
  }

  return '幻灵牌';
}

function getPackChoiceTitle(choice: PackChoice): string {
  if (choice.kind === 'playing_card') {
    return formatCard(choice.card);
  }

  if (choice.kind === 'consumable') {
    return getConsumableDefinition(choice.definitionId).name;
  }

  if (choice.kind === 'joker') {
    return getJokerDefinition(choice.definitionId).name;
  }

  return getSpectralDefinition(choice.definitionId).name;
}

function getPackChoiceDescription(choice: PackChoice): string {
  if (choice.kind === 'playing_card') {
    return choice.card.enhancement
      ? `加入牌组，并带有${ENHANCEMENT_NAMES[choice.card.enhancement]}。`
      : '加入牌组，作为普通扑克牌参与之后的抽牌。';
  }

  if (choice.kind === 'consumable') {
    return getConsumableDefinition(choice.definitionId).description;
  }

  if (choice.kind === 'joker') {
    return getJokerDefinition(choice.definitionId).description;
  }

  return getSpectralDefinition(choice.definitionId).description;
}

function getPackChoiceDetail(choice: PackChoice, index: number): string {
  return `${index + 1}. ${getPackChoiceTitle(choice)}｜${getPackChoiceLabel(choice)}｜${getPackChoiceDescription(choice)}`;
}

function getPackChoiceBlockedText(choice: PackChoice, game: GameState): string | null {
  if (choice.kind === 'consumable' && game.consumables.length >= game.consumableSlots) {
    return '消耗牌槽已满';
  }

  if (choice.kind === 'joker' && game.jokers.length >= game.jokerSlots) {
    return '小丑槽已满';
  }

  return null;
}

function PackChoiceModal({
  game,
  disabled,
  onChoosePack,
  onSkipPack,
  onInspect
}: {
  game: GameState;
  disabled: boolean;
  onChoosePack: (instanceId: string) => void;
  onSkipPack: () => void;
  onInspect: (target: InspectTarget) => void;
}) {
  if (game.packChoices.length === 0) {
    return null;
  }

  const activePack = getPackDefinition(game.packChoices[0].packId);

  return (
    <div className="pack-modal-layer" role="presentation">
      <div className={`pack-choice-panel pack-modal ${activePack.kind}`} role="dialog" aria-modal="true" aria-label={activePack.name}>
        <div className="pack-choice-heading">
          <div>
            <span>{activePack.name}</span>
            <strong>选择 1 张，或跳过</strong>
            <small>{activePack.description}</small>
          </div>
          <button type="button" className="secondary-action compact-action" disabled={disabled} title="跳过这个补充包，不获得候选内容" onClick={onSkipPack}>
            跳过
          </button>
        </div>
        <div className="pack-choice-row">
          {game.packChoices.map((choice, index) => {
            const blockedText = getPackChoiceBlockedText(choice, game);

            return (
              <article
                className={`pack-choice ${choice.kind} ${disabled || blockedText ? 'disabled' : ''}`}
                key={choice.instanceId}
                title={getPackChoiceDetail(choice, index)}
              >
                <span>{index + 1}. {getPackChoiceLabel(choice)}</span>
                <strong>{getPackChoiceTitle(choice)}</strong>
                <small>{getPackChoiceDescription(choice)}</small>
                {blockedText && <em>{blockedText}</em>}
                <div className="pack-choice-actions">
                  <button type="button" disabled={disabled || Boolean(blockedText)} onClick={() => onChoosePack(choice.instanceId)}>
                    选择
                  </button>
                  <button type="button" className="secondary-action" onClick={() => onInspect(inspectTargetFromPackChoice(choice))}>
                    详情
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ShopView({
  game,
  disabled,
  onBuy,
  onRefresh,
  onNext,
  onChoosePack,
  onSkipPack,
  onInspect
}: {
  game: GameState;
  disabled: boolean;
  onBuy: (offerId: string) => void;
  onRefresh: () => void;
  onNext: () => void;
  onChoosePack: (instanceId: string) => void;
  onSkipPack: () => void;
  onInspect: (target: InspectTarget) => void;
}) {
  const completedBlind = game.currentBlind;
  const shopLocked = disabled || game.packChoices.length > 0;
  const projectedInterest = calculateInterest(game.money);

  return (
    <section className="stage-view shop-view">
      <div className="stage-copy">
        <span>商店</span>
        <h2>{completedBlind ? `${completedBlind.name} 已通过` : '盲注已通过'}</h2>
        <p>你现在有 ${game.money}。可以补小丑，也可以保留资金吃利息，下一次商店刷新会更贵。</p>
      </div>
      <div className="shop-pressure-panel">
        <div>
          <span>刷新费用</span>
          <strong>${game.shopRerollCost}</strong>
          <small>每次刷新后 +$1，减免最低到 $0。</small>
        </div>
        <div>
          <span>利息预估</span>
          <strong>${projectedInterest}</strong>
          <small>
            每 ${INTEREST_MONEY_STEP} 存款 +$1，最多 ${MAX_INTEREST_PAYOUT}。
          </small>
        </div>
        <div>
          <span>商店锁定</span>
          <strong>{game.packChoices.length > 0 ? '开包中' : '可操作'}</strong>
          <small>{game.packChoices.length > 0 ? '先选完补充包内容，才能刷新或进入下一盲注。' : '买、卖、刷新、保留钱都可取舍。'}</small>
        </div>
      </div>
      <div className="shop-shelves">
        {game.shopOffers.map((offer) => (
          <ShopOfferCard
            key={offer.id}
            offer={offer}
            money={game.money}
            jokerSlotsFull={game.jokers.length >= game.jokerSlots}
            consumableSlotsFull={game.consumables.length >= game.consumableSlots}
            actionDisabled={shopLocked}
            onBuy={() => onBuy(offer.id)}
            onInspect={() => {
              const target = inspectTargetFromShopOffer(offer);
              if (target) {
                onInspect(target);
              }
            }}
          />
        ))}
      </div>
      <div className="action-row">
        <button
          className="secondary-action"
          type="button"
          disabled={shopLocked || game.money < game.shopRerollCost}
          title="花费资金刷新所有商店商品，之后刷新费用会提高"
          onClick={onRefresh}
        >
          刷新商店 ${game.shopRerollCost}
        </button>
        <button type="button" disabled={shopLocked} title="保留当前构筑，进入下一次盲注选择" onClick={onNext}>
          下一盲注
        </button>
      </div>
      <PackChoiceModal game={game} disabled={disabled} onChoosePack={onChoosePack} onSkipPack={onSkipPack} onInspect={onInspect} />
    </section>
  );
}

function getShopOfferDetail(offer: ShopItem): string {
  if (!offer.definitionId) {
    return '未知商品';
  }

  if (offer.kind === 'pack') {
    const definition = getPackDefinition(offer.definitionId);
    return `${definition.name}｜补充包｜$${offer.price}｜${definition.description}`;
  }

  if (offer.kind === 'consumable') {
    const definition = getConsumableDefinition(offer.definitionId);
    return `${definition.name}｜${getConsumableLabel(definition.id)}｜$${offer.price}｜${definition.description}`;
  }

  if (offer.kind === 'voucher') {
    const definition = getVoucherDefinition(offer.definitionId);
    return `${definition.name}｜优惠券｜$${offer.price}｜${definition.description}`;
  }

  const definition = getJokerDefinition(offer.definitionId);
  return `${definition.name}｜${JOKER_ARCHETYPE_LABELS[definition.archetypes[0] ?? 'general']}｜$${offer.price}｜${definition.description}｜${definition.triggerText}：${definition.conditionText}`;
}

function getShopOfferHint(offer: ShopItem, money: number): string {
  if (!offer.definitionId) {
    return '未知商品';
  }

  if (offer.kind === 'pack') {
    const definition = getPackDefinition(offer.definitionId);
    if (definition.kind === 'standard') return '牌堆改造｜补充新牌';
    if (definition.kind === 'planet') return '牌型成长｜提升常用牌型';
    if (definition.kind === 'tarot') return '牌堆改造｜复制、删牌或增强';
    if (definition.kind === 'joker') return '构筑补强｜补小丑槽';
    return '高风险高收益｜会带代价';
  }

  if (offer.kind === 'consumable') {
    const definition = getConsumableDefinition(offer.definitionId);
    return definition.target.mode === 'cards' ? '盲注中使用｜选择手牌目标' : '立即生效｜不需要目标';
  }

  if (offer.kind === 'voucher') {
    return '长期效果｜买下后持续生效';
  }

  const definition = getJokerDefinition(offer.definitionId);
  const archetype = JOKER_ARCHETYPE_LABELS[definition.archetypes[0] ?? 'general'];
  const moneyEffect = definition.effects.find((effect) => effect.type === 'money_add_mult');
  if (moneyEffect?.type === 'money_add_mult' && money < moneyEffect.divisor) {
    return `${archetype}流｜当前资金不足以触发`;
  }

  return `${archetype}流｜${definition.conditionText}`;
}

function getActionBlockedReason(actionDisabled: boolean): string | null {
  return actionDisabled ? '先处理当前补充包或等待结算完成' : null;
}

function ShopOfferCard({
  offer,
  money,
  jokerSlotsFull,
  consumableSlotsFull,
  actionDisabled,
  onBuy,
  onInspect
}: {
  offer: ShopItem;
  money: number;
  jokerSlotsFull: boolean;
  consumableSlotsFull: boolean;
  actionDisabled: boolean;
  onBuy: () => void;
  onInspect: () => void;
}) {
  const offerDetail = getShopOfferDetail(offer);
  const actionBlockedReason = getActionBlockedReason(actionDisabled);
  const offerHint = getShopOfferHint(offer, money);

  if (offer.kind === 'pack') {
    const definition = getPackDefinition(offer.definitionId);
    const slotBlocked =
      (definition.kind === 'planet' || definition.kind === 'tarot') ? consumableSlotsFull : definition.kind === 'joker' ? jokerSlotsFull : false;
    const disabled = actionDisabled || money < offer.price || slotBlocked;
    const disabledReason =
      actionBlockedReason ??
      (definition.kind === 'joker' && jokerSlotsFull
        ? '小丑槽位已满，先卖出一张'
        : (definition.kind === 'planet' || definition.kind === 'tarot') && consumableSlotsFull
          ? '消耗牌槽位已满'
          : money < offer.price
            ? `还差 $${offer.price - money}`
            : null);
    const blockedLabel =
      definition.kind === 'joker' && jokerSlotsFull
        ? '先卖小丑'
        : (definition.kind === 'planet' || definition.kind === 'tarot') && consumableSlotsFull
        ? '槽位已满'
        : money < offer.price
        ? '资金不足'
        : '打开';

    return (
      <article className={`shop-slot pack-offer ${definition.kind}`} title={offerDetail} tabIndex={0} onClick={onInspect} onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onInspect();
        }
      }}>
        <div className="joker-topline">
          <span className="rarity uncommon">补充包</span>
          <span>${offer.price}</span>
        </div>
        <strong>{definition.name}</strong>
        <p>{definition.description}</p>
        <small className="shop-hint">{offerHint}</small>
        {disabledReason && <em className="shop-blocked-reason">{disabledReason}</em>}
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onBuy();
          }}
        >
          {blockedLabel}
        </button>
      </article>
    );
  }

  if (!offer.definitionId) {
    return null;
  }

  if (offer.kind === 'consumable') {
    const definition = getConsumableDefinition(offer.definitionId);
    const disabled = actionDisabled || money < offer.price || consumableSlotsFull;
    const disabledReason =
      actionBlockedReason ??
      (consumableSlotsFull
        ? '消耗牌槽位已满，先使用一张'
        : money < offer.price
          ? `还差 $${offer.price - money}`
          : definition.target.mode === 'cards'
            ? '购买后在盲注中选择手牌目标'
            : null);

    return (
      <article className={`shop-slot consumable-offer ${definition.kind}`} title={offerDetail} tabIndex={0} onClick={onInspect} onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onInspect();
        }
      }}>
        <div className="joker-topline">
          <span className="rarity common">{getConsumableLabel(definition.id)}</span>
          <span>${offer.price}</span>
        </div>
        <strong>{definition.name}</strong>
        <p>{definition.description}</p>
        <small className="shop-hint">{offerHint}</small>
        {disabledReason && <em className="shop-blocked-reason">{disabledReason}</em>}
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onBuy();
          }}
        >
          {consumableSlotsFull ? '槽位已满' : money < offer.price ? '资金不足' : '购买'}
        </button>
      </article>
    );
  }

  if (offer.kind === 'voucher') {
    const definition = getVoucherDefinition(offer.definitionId);
    const disabled = actionDisabled || money < offer.price;
    const disabledReason = actionBlockedReason ?? (money < offer.price ? `还差 $${offer.price - money}` : null);

    return (
      <article className="shop-slot voucher-offer" title={offerDetail} tabIndex={0} onClick={onInspect} onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onInspect();
        }
      }}>
        <div className="joker-topline">
          <span className="rarity rare">优惠券</span>
          <span>${offer.price}</span>
        </div>
        <strong>{definition.name}</strong>
        <p>{definition.description}</p>
        <small className="shop-hint">{offerHint}</small>
        {disabledReason && <em className="shop-blocked-reason">{disabledReason}</em>}
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onBuy();
          }}
        >
          {money < offer.price ? '资金不足' : '购买'}
        </button>
      </article>
    );
  }

  const definition = getJokerDefinition(offer.definitionId);
  const disabled = actionDisabled || money < offer.price || jokerSlotsFull;
  const disabledReason =
    actionBlockedReason ??
    (jokerSlotsFull ? '小丑槽位已满，先卖出一张' : money < offer.price ? `还差 $${offer.price - money}` : null);

  return (
    <article className="shop-slot" title={offerDetail} tabIndex={0} onClick={onInspect} onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onInspect();
      }
    }}>
      <div className="joker-topline">
        <RarityLabel rarity={definition.rarity} />
        <span>${offer.price}</span>
      </div>
      <strong>{definition.name}</strong>
      <JokerInfoBadges definition={definition} />
      <p>{definition.description}</p>
      <JokerTriggerDetails definition={definition} />
      <small className="shop-hint">{offerHint}</small>
      {disabledReason && <em className="shop-blocked-reason">{disabledReason}</em>}
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onBuy();
        }}
      >
        {jokerSlotsFull ? '槽位已满' : money < offer.price ? '资金不足' : '购买'}
      </button>
    </article>
  );
}

function OutcomeView({
  game,
  disabled,
  onRestart
}: {
  game: GameState;
  disabled: boolean;
  onRestart: () => void;
}) {
  const won = game.phase === 'run_won';
  const deckDefinition = getDeckDefinition(game.deckId);
  const stakeDefinition = getStakeDefinition(game.stakeId);
  const scoreShortfall = game.phase === 'run_lost' ? Math.max(0, game.targetScore - game.currentScore) : 0;

  return (
    <section className={`stage-view outcome-view ${won ? 'won' : 'lost'}`}>
      <div className="stage-copy">
        <span>{won ? '整局胜利' : '本局失败'}</span>
        <h2>{won ? '第 8 层首领盲注已通过' : '盲注挑战失败'}</h2>
        <p>{game.message}</p>
        {!won && (
          <p className="outcome-advice">
            下一次建议：还差 {scoreShortfall} 分，优先在商店买小丑，或打出对子、同花、顺子这类更高倍率牌型。
          </p>
        )}
      </div>
      <div className="outcome-recap">
        <div className="outcome-score">
          <span>最终资金</span>
          <strong>${game.money}</strong>
        </div>
        <Stat label="本局最高单手" value={game.runHighestSingleHandScore} />
        <Stat label="最终层级" value={`第 ${game.ante} 层`} />
        <Stat label="牌组" value={deckDefinition.name} />
        <Stat label="难度" value={stakeDefinition.name} />
      </div>
      <div className="outcome-build">
        <span>最终小丑</span>
        {game.jokers.length === 0 ? (
          <p className="empty-log">本局没有小丑。</p>
        ) : (
          <div className="collection-list">
            {game.jokers.map((joker) => (
              <span key={joker.instanceId}>{getJokerDefinition(joker.definitionId).name}</span>
            ))}
          </div>
        )}
      </div>
      <button type="button" disabled={disabled} onClick={onRestart}>
        重新开局
      </button>
    </section>
  );
}

function PlayView({
  game,
  selectedPreview,
  selectedPreviewScore,
  canAct,
  onToggleCard,
  onPlay,
  onDiscard,
  onConfirmConsumable,
  onCancelConsumable,
  onSortHand,
  onInspectCard
}: {
  game: GameState;
  selectedPreview: string;
  selectedPreviewScore: string;
  canAct: boolean;
  onToggleCard: (cardId: string) => void;
  onPlay: () => void;
  onDiscard: () => void;
  onConfirmConsumable: () => void;
  onCancelConsumable: () => void;
  onSortHand: (mode: 'rank' | 'suit') => void;
  onInspectCard: (card: Card, hidden: boolean) => void;
}) {
  const activeConsumable = game.selectedConsumableId
    ? game.consumables.find((consumable) => consumable.instanceId === game.selectedConsumableId)
    : null;
  const activeDefinition = activeConsumable ? getConsumableDefinition(activeConsumable.definitionId) : null;
  const selectionLimit = activeDefinition?.target.max ?? getBossSelectionLimit(game) ?? 5;

  return (
    <section className="play-zone">
      <div className="zone-header">
        <div>
          <span>{activeDefinition ? '消耗牌目标' : '当前牌型'}</span>
          <strong>{activeDefinition ? activeDefinition.name : selectedPreview}</strong>
          {!activeDefinition && <small>{selectedPreviewScore}</small>}
        </div>
        <div className="zone-tools">
          <span>已选 {game.selectedCardIds.length}/{selectionLimit}</span>
          <div className="sort-actions">
            <button type="button" className="secondary-action compact-action" title="按点数从 A 到 2 排列当前手牌" onClick={() => onSortHand('rank')}>
              按点数
            </button>
            <button type="button" className="secondary-action compact-action" title="按花色分组，并在每组内按点数排列" onClick={() => onSortHand('suit')}>
              按花色
            </button>
            <button
              type="button"
              className="secondary-action compact-action"
              disabled={game.selectedCardIds.length === 0}
              title="查看第一张已选手牌的详情"
              onClick={() => {
                const selectedCard = game.hand.find((card) => game.selectedCardIds.includes(card.id));
                if (selectedCard) {
                  onInspectCard(selectedCard, isCardHiddenByBoss(game, selectedCard));
                }
              }}
            >
              选牌详情
            </button>
          </div>
        </div>
      </div>

      {activeDefinition && (
        <div className="target-banner">
          <p>{activeDefinition.description}</p>
          <div className="action-row">
            <button type="button" onClick={onConfirmConsumable}>
              确认使用
            </button>
            <button type="button" className="secondary-action" onClick={onCancelConsumable}>
              取消
            </button>
          </div>
        </div>
      )}

      <div className="hand-row" aria-label="手牌">
        {game.hand.map((card) => (
          <GameCard
            key={card.id}
            card={card}
            selected={game.selectedCardIds.includes(card.id)}
            disabled={game.phase !== 'playing'}
            hidden={isCardHiddenByBoss(game, card)}
            onClick={() => onToggleCard(card.id)}
          />
        ))}
      </div>

      <div className="action-row">
        <button type="button" disabled={!canAct} title="打出已选手牌并结算本手分数" onClick={onPlay}>
          出牌
        </button>
        <button
          type="button"
          className="secondary-action"
          disabled={!canAct || game.discardsRemaining <= 0}
          title="弃掉已选手牌并补牌，不结算分数"
          onClick={onDiscard}
        >
          弃牌
        </button>
      </div>
    </section>
  );
}

export default function App() {
  const [game, setGame] = useState(loadSavedGame);
  const [profile, setProfile] = useState(loadSavedProfile);
  const [seedInput, setSeedInput] = useState(() => game.seed);
  const [setupDeckId, setSetupDeckId] = useState(() => game.deckId);
  const [setupStakeId, setSetupStakeId] = useState(() => game.stakeId);
  const [setupEndless, setSetupEndless] = useState(() => game.endless);
  const [isUiLocked, setIsUiLocked] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState<MobileOverlay>(null);
  const [appScreen, setAppScreen] = useState<AppScreen>('home');
  const [hasSavedRun, setHasSavedRun] = useState(() => Boolean(window.localStorage.getItem(SAVE_KEY)));
  const [pendingNewRunConfirm, setPendingNewRunConfirm] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [inspectTarget, setInspectTarget] = useState<InspectTarget | null>(null);
  const previousPhaseRef = useRef<GamePhase>(game.phase);
  const lockTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const selectedCards = useMemo(() => getSelectedCards(game), [game]);
  const selectedPreview = useMemo(() => {
    if (selectedCards.length === 0) {
      return '尚未选择牌型';
    }

    if (selectedCards.some((card) => isCardHiddenByBoss(game, card))) {
      return '盖面牌已选择';
    }

    return evaluateHand(selectedCards).handName;
  }, [game, selectedCards]);
  const selectedPreviewScore = useMemo(() => {
    if (selectedCards.length === 0) {
      return '优先凑对子、同花或顺子；选择 1 到 5 张牌后会显示预计基础分。';
    }

    if (selectedCards.some((card) => isCardHiddenByBoss(game, card))) {
      return '包含首领盖面牌，出牌后揭晓牌型与基础分。';
    }

    const evaluation = evaluateHand(selectedCards);
    const score = getHandScore(evaluation.hand, game.handLevels[evaluation.hand]);
    const cardChips = evaluation.scoredCards.reduce((total, card) => total + getCardChips(card), 0);
    const previewScore = (score.chips + cardChips) * score.mult;

    return `基础 ${score.chips} 筹码 × ${score.mult} 倍率，计分牌 +${cardChips}，预计基础分 ${previewScore}`;
  }, [game, game.handLevels, selectedCards]);
  const progress = Math.min(100, Math.round((game.currentScore / game.targetScore) * 100));
  const currentBlind: BlindDefinition = game.currentBlind ?? getBlindForState(game);
  const canAct =
    !isUiLocked && game.phase === 'playing' && game.status === 'playing' && game.selectedCardIds.length > 0 && !game.selectedConsumableId;
  const animationDuration = profile.settings.fastMode
    ? 0
    : Math.max(120, Math.round(BASE_ANIMATION_MS / profile.settings.animationSpeed));
  const motionStyle = {
    '--settle-duration': `${animationDuration}ms`
  } as CSSProperties;

  useEffect(() => {
    if (hasSavedRun) {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(game));
    }
  }, [game, hasSavedRun]);

  useEffect(() => {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    setProfile((current) => {
      let next = recordSeenFromState(current, game);
      next = recordStatsFromState(next, game);

      if ((game.phase === 'run_won' || game.phase === 'run_lost') && previousPhaseRef.current !== game.phase) {
        next = recordRunResult(next, game.phase === 'run_won', game);
      }

      return next;
    });
    previousPhaseRef.current = game.phase;
  }, [game]);

  useEffect(() => {
    if (profile.settings.fastMode) {
      setIsUiLocked(false);
      if (lockTimerRef.current !== null) {
        window.clearTimeout(lockTimerRef.current);
        lockTimerRef.current = null;
      }
    }
  }, [profile.settings.fastMode]);

  useEffect(() => {
    setActiveOverlay(null);
    setInspectTarget(null);
  }, [game.phase]);

  useEffect(() => {
    if (appScreen !== 'game') {
      return;
    }

    if (!['shop', 'blind_select', 'run_lost', 'run_won'].includes(game.phase)) {
      return;
    }

    if (!window.matchMedia('(max-width: 1080px)').matches) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      document.querySelector('.stage-view')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [appScreen, game.phase]);

  useEffect(
    () => () => {
      if (lockTimerRef.current !== null) {
        window.clearTimeout(lockTimerRef.current);
      }
    },
    []
  );

  function playUiSound(kind: SoundKind) {
    if (!profile.settings.soundEnabled || profile.settings.volume <= 0) {
      return;
    }

    const AudioContextConstructor =
      window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      return;
    }

    const audioContext = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = audioContext;
    void audioContext.resume();

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const volume = profile.settings.volume / 100;
    const now = audioContext.currentTime;

    oscillator.type = SOUND_TYPES[kind];
    oscillator.frequency.setValueAtTime(SOUND_FREQUENCIES[kind], now);
    oscillator.frequency.exponentialRampToValueAtTime(SOUND_FREQUENCIES[kind] * (kind === 'mult' ? 1.18 : 0.82), now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08 * volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.13);
  }

  function runGameAction(kind: SoundKind, update: (current: GameState) => GameState, lock = true) {
    if (isUiLocked && lock) {
      return;
    }

    setGame((current) => update(current));
    playUiSound(kind);

    if (!profile.settings.fastMode && lock) {
      setIsUiLocked(true);
      if (lockTimerRef.current !== null) {
        window.clearTimeout(lockTimerRef.current);
      }
      lockTimerRef.current = window.setTimeout(() => {
        setIsUiLocked(false);
        lockTimerRef.current = null;
      }, animationDuration);
    }
  }

  function restartRun(seed = seedInput.trim() || DEFAULT_SEED) {
    const stakeId = isStakeUnlocked(profile, setupStakeId) ? setupStakeId : DEFAULT_STAKE_ID;
    const nextGame = createInitialGame(seed, {
      deckId: setupDeckId,
      stakeId,
      endless: setupEndless
    });
    setSeedInput(seed);
    setSetupStakeId(stakeId);
    setGame(nextGame);
    setHasSavedRun(true);
    setAppScreen('game');
    setPendingNewRunConfirm(false);
    setActiveOverlay(null);
    setProfile((current) => recordRunStarted(current, nextGame));
    previousPhaseRef.current = nextGame.phase;
    playUiSound('start');
  }

  function startConfiguredRun(force = false) {
    if (hasSavedRun && !force) {
      setPendingNewRunConfirm(true);
      return;
    }

    restartRun(seedInput.trim() || DEFAULT_SEED);
  }

  function clearCurrentRun() {
    window.localStorage.removeItem(SAVE_KEY);
    const nextGame = createInitialGame(seedInput.trim() || DEFAULT_SEED, {
      deckId: setupDeckId,
      stakeId: isStakeUnlocked(profile, setupStakeId) ? setupStakeId : DEFAULT_STAKE_ID,
      endless: setupEndless
    });
    setGame(nextGame);
    setHasSavedRun(false);
    setAppScreen('home');
    setPendingNewRunConfirm(false);
    setActiveOverlay(null);
    previousPhaseRef.current = nextGame.phase;
    playUiSound('start');
  }

  async function copySeed(seed = game.seed) {
    try {
      await navigator.clipboard.writeText(seed);
      if (appScreen === 'game') {
        setGame((current) => ({ ...current, message: '当前种子已复制。' }));
      }
    } catch {
      if (appScreen === 'game') {
        setGame((current) => ({ ...current, message: `当前种子：${seed}` }));
      }
    }
  }

  function resetProfileData() {
    const nextProfile = resetPersistentProfile();
    setProfile(nextProfile);
    setSetupStakeId(DEFAULT_STAKE_ID);
  }

  function exportBackup() {
    const backup: SaveBackup = {
      exportVersion: BACKUP_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      game: hasSavedRun ? game : null,
      profile
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = getBackupFileName(hasSavedRun ? game.seed : 'profile');
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setImportMessage('存档备份已导出。');
    playUiSound('shop');
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      const raw = await file.text();
      const nextImport = parseBackupFile(raw);
      setPendingImport(nextImport);
      setImportMessage('已读取备份，请确认是否覆盖当前浏览器存档。');
      playUiSound('pack');
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法读取这个备份文件。';
      setPendingImport(null);
      setImportMessage(`导入失败：${message}`);
      playUiSound('error');
    }
  }

  function confirmImportBackup() {
    if (!pendingImport) {
      return;
    }

    if (pendingImport.game) {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(pendingImport.game));
      setGame(pendingImport.game);
      setSeedInput(pendingImport.game.seed);
      setSetupDeckId(pendingImport.game.deckId);
      setSetupStakeId(pendingImport.game.stakeId);
      setSetupEndless(pendingImport.game.endless);
      setHasSavedRun(true);
      previousPhaseRef.current = pendingImport.game.phase;
    } else {
      window.localStorage.removeItem(SAVE_KEY);
      const nextGame = createInitialGame(seedInput.trim() || DEFAULT_SEED, {
        deckId: setupDeckId,
        stakeId: isStakeUnlocked(pendingImport.profile, setupStakeId) ? setupStakeId : DEFAULT_STAKE_ID,
        endless: setupEndless
      });
      setGame(nextGame);
      setHasSavedRun(false);
      previousPhaseRef.current = nextGame.phase;
    }

    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(pendingImport.profile));
    setProfile(pendingImport.profile);
    setPendingImport(null);
    setImportMessage('存档已导入，可以从首页继续当前局。');
    setActiveOverlay(null);
    setAppScreen('home');
    playUiSound('start');
  }

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;

      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        target?.isContentEditable ||
        tagName === 'INPUT' ||
        tagName === 'SELECT' ||
        tagName === 'TEXTAREA'
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (event.key === 'Escape' && inspectTarget) {
        event.preventDefault();
        setInspectTarget(null);
        return;
      }

      if (event.key === 'Escape' && pendingNewRunConfirm) {
        event.preventDefault();
        setPendingNewRunConfirm(false);
        return;
      }

      if (appScreen !== 'game') {
        if (event.key === 'Escape' && appScreen !== 'home') {
          event.preventDefault();
          setAppScreen('home');
          setPendingNewRunConfirm(false);
        }
        return;
      }

      if (event.key === 'Escape' && activeOverlay) {
        event.preventDefault();
        setActiveOverlay(null);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        if (game.phase === 'blind_select') {
          runGameAction('start', (current) => startCurrentBlind(current));
          return;
        }

        if (game.phase === 'playing' && game.selectedConsumableId) {
          runGameAction(
            'buy',
            (current) => (current.selectedConsumableId ? useConsumable(current, current.selectedConsumableId) : current),
            false
          );
          return;
        }

        if (canAct) {
          runGameAction('play', (current) => playSelectedCards(current));
          return;
        }

        if (game.phase === 'shop' && game.packChoices.length > 0) {
          runGameAction('pack', (current) => choosePackConsumable(current, current.packChoices[0]?.instanceId ?? ''), false);
          return;
        }

        if (game.phase === 'shop') {
          runGameAction('start', (current) => advanceFromShop(current));
          return;
        }

        if (game.phase === 'run_won' || game.phase === 'run_lost') {
          restartRun();
        }
      }

      if (key === 'd' || event.key === 'Backspace') {
        if (canAct && game.discardsRemaining > 0) {
          event.preventDefault();
          runGameAction('discard', (current) => discardSelectedCards(current));
        }
        return;
      }

      if (key === 'r' && game.phase === 'playing') {
        event.preventDefault();
        runGameAction('sort', (current) => sortHand(current, 'rank'), false);
        return;
      }

      if (key === 'f' && game.phase === 'playing') {
        event.preventDefault();
        runGameAction('sort', (current) => sortHand(current, 'suit'), false);
        return;
      }

      if (key === 'q') {
        event.preventDefault();
        setProfile((current) =>
          updateProfileSettings(current, {
            animationMode: current.settings.animationMode === 'instant' ? 'normal' : 'instant'
          })
        );
        return;
      }

      if (event.key === 'Escape') {
        if (game.phase === 'playing' && game.selectedConsumableId) {
          event.preventDefault();
          runGameAction('error', (current) => cancelConsumableTarget(current), false);
          return;
        }

        if (game.phase === 'shop' && game.packChoices.length > 0) {
          event.preventDefault();
          runGameAction('shop', (current) => skipPackChoice(current), false);
          return;
        }
      }

      if (game.phase === 'shop' && game.packChoices.length > 0 && /^[1-9]$/.test(event.key)) {
        const choice = game.packChoices[Number(event.key) - 1];
        if (choice) {
          event.preventDefault();
          runGameAction('pack', (current) => choosePackConsumable(current, choice.instanceId), false);
        }
        return;
      }

      if (key === 's' && game.phase === 'blind_select') {
        event.preventDefault();
        runGameAction('start', (current) => startCurrentBlind(current));
        return;
      }

      if (key === 'x' && game.phase === 'blind_select' && game.blindIndex < 2) {
        event.preventDefault();
        runGameAction('shop', (current) => skipCurrentBlind(current));
        return;
      }

      if (key === 'n' && game.phase === 'shop') {
        event.preventDefault();
        runGameAction('start', (current) => advanceFromShop(current));
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  });

  if (appScreen !== 'game') {
    return (
      <main className={`app-shell menu-shell screen-${appScreen} ${profile.settings.fastMode ? 'fast-mode' : ''}`} style={motionStyle}>
        {appScreen === 'home' && (
          <HomeView
            game={game}
            profile={profile}
            canContinue={hasSavedRun}
            onContinue={() => setAppScreen('game')}
            onNavigate={(screen) => {
              setPendingNewRunConfirm(false);
              setAppScreen(screen);
            }}
          />
        )}
        {appScreen === 'newRun' && (
          <NewRunView
            profile={profile}
            seedInput={seedInput}
            setupDeckId={setupDeckId}
            setupStakeId={setupStakeId}
            setupEndless={setupEndless}
            hasSavedRun={hasSavedRun}
            pendingConfirm={pendingNewRunConfirm}
            onSeedChange={setSeedInput}
            onDeckChange={setSetupDeckId}
            onStakeChange={setSetupStakeId}
            onEndlessChange={setSetupEndless}
            onRandomSeed={() => setSeedInput(generateSeed())}
            onCopySeed={() => copySeed(seedInput.trim() || DEFAULT_SEED)}
            onStart={startConfiguredRun}
            onCancelConfirm={() => setPendingNewRunConfirm(false)}
            onBack={() => {
              setPendingNewRunConfirm(false);
              setAppScreen('home');
            }}
          />
        )}
        {(appScreen === 'collection' || appScreen === 'stats' || appScreen === 'settings' || appScreen === 'rules') && (
          <AppInfoPage
            screen={appScreen}
            game={game}
            profile={profile}
            onBack={() => setAppScreen('home')}
            onProfileChange={setProfile}
            onResetProfile={resetProfileData}
            onClearRun={clearCurrentRun}
            onExportBackup={exportBackup}
            onImportBackup={importBackup}
            importMessage={importMessage}
          />
        )}
        {pendingImport && (
          <ImportConfirmDialog
            pendingImport={pendingImport}
            onCancel={() => {
              setPendingImport(null);
              setImportMessage('已取消导入，当前存档未改变。');
            }}
            onConfirm={confirmImportBackup}
          />
        )}
      </main>
    );
  }

  return (
    <main
      className={`app-shell phase-${game.phase} ${isUiLocked ? 'ui-locked' : ''} ${profile.settings.fastMode ? 'fast-mode' : ''}`}
      style={motionStyle}
    >
      <section className="table-surface">
        <header className="top-bar">
          <div>
            <p className="eyebrow">当前牌局</p>
            <h1>盲注回响</h1>
            <p className="title-translation compact">Ante Echo</p>
          </div>
          <div className="game-menu-actions">
            <span className="seed-chip">种子 {game.seed}</span>
            <button type="button" className="secondary-action" onClick={() => copySeed()}>
              复制种子
            </button>
            <button type="button" className="secondary-action" onClick={() => setAppScreen('home')}>
              返回首页
            </button>
            <button type="button" onClick={() => setAppScreen('newRun')}>
              新开局
            </button>
          </div>
        </header>

        <section className={`status-ribbon ${game.status}`}>
          <div>
            <span>状态</span>
            <strong>
              {game.phase === 'blind_select'
                ? '等待选择盲注'
                : game.phase === 'shop'
                  ? '商店阶段'
                  : game.phase === 'run_won'
                    ? '整局胜利'
                    : game.phase === 'run_lost'
                      ? '本局失败'
                      : '盲注进行中'}
            </strong>
          </div>
          <p>{game.message}</p>
        </section>

        <section className="scoreboard" aria-label="计分面板">
          <Stat label="层级" value={game.endless ? `${game.ante}/∞` : `${game.ante}/${MAX_ANTE}`} />
          <Stat label="盲注" value={currentBlind.name} />
          <Stat
            label="资金"
            value={
              <>
                $
                <AnimatedNumber value={game.money} enabled={!profile.settings.fastMode} duration={animationDuration} />
              </>
            }
          />
          <Stat
            label="得分"
            value={<AnimatedNumber value={game.currentScore} enabled={!profile.settings.fastMode} duration={animationDuration} />}
          />
          <Stat label="目标" value={game.targetScore} />
          <Stat label="出牌" value={game.handsRemaining} />
          <Stat label="弃牌" value={game.discardsRemaining} />
          <Stat label="牌库" value={game.drawPile.length} />
        </section>

        <div className="progress-track" aria-label={`进度 ${progress}%`}>
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <SettlementTimeline game={game} fastMode={profile.settings.fastMode} />

        <JokerBar
          game={game}
          onSell={(instanceId) => runGameAction('sell', (current) => sellJoker(current, instanceId), false)}
          onMove={(fromIndex, toIndex) => runGameAction('sort', (current) => moveJoker(current, fromIndex, toIndex), false)}
          onInspect={setInspectTarget}
        />

        <ConsumableBar
          game={game}
          onUse={(instanceId) => runGameAction('buy', (current) => useConsumable(current, instanceId), false)}
          onCancel={() => runGameAction('error', (current) => cancelConsumableTarget(current), false)}
          onInspect={setInspectTarget}
        />

        {game.phase === 'blind_select' && (
          <BlindSelection
            game={game}
            disabled={isUiLocked}
            onStart={() => runGameAction('start', (current) => startCurrentBlind(current))}
            onSkip={() => runGameAction('shop', (current) => skipCurrentBlind(current))}
            onInspect={setInspectTarget}
          />
        )}
        {game.phase === 'playing' && (
          <PlayView
            game={game}
            selectedPreview={selectedPreview}
            selectedPreviewScore={selectedPreviewScore}
            canAct={canAct}
            onToggleCard={(cardId) => {
              if (!isUiLocked) {
                setGame((current) => toggleCardSelection(current, cardId));
              }
            }}
            onPlay={() => runGameAction('play', (current) => playSelectedCards(current))}
            onDiscard={() => runGameAction('discard', (current) => discardSelectedCards(current))}
            onSortHand={(mode) => runGameAction('sort', (current) => sortHand(current, mode), false)}
            onInspectCard={(card, hidden) => setInspectTarget({ kind: 'playing_card', card, hidden, source: '已选手牌' })}
            onConfirmConsumable={() =>
              runGameAction(
                'buy',
                (current) => (current.selectedConsumableId ? useConsumable(current, current.selectedConsumableId) : current),
                false
              )
            }
            onCancelConsumable={() => runGameAction('error', (current) => cancelConsumableTarget(current), false)}
          />
        )}
        {game.phase === 'shop' && (
          <ShopView
            game={game}
            disabled={isUiLocked}
            onBuy={(offerId) => runGameAction('buy', (current) => buyShopItem(current, offerId))}
            onRefresh={() => runGameAction('reroll', (current) => refreshShop(current))}
            onNext={() => runGameAction('start', (current) => advanceFromShop(current))}
            onChoosePack={(instanceId) => runGameAction('pack', (current) => choosePackConsumable(current, instanceId))}
            onSkipPack={() => runGameAction('shop', (current) => skipPackChoice(current))}
            onInspect={setInspectTarget}
          />
        )}
        {(game.phase === 'run_won' || game.phase === 'run_lost') && <OutcomeView game={game} disabled={isUiLocked} onRestart={() => restartRun()} />}
      </section>

      <aside className="side-panel desktop-side-panel">
        <SituationSummaryPanel game={game} />
        <RunModifiersPanel game={game} onInspect={setInspectTarget} />
        <section>
          <h2>最近结算日志</h2>
          <ScoringLog game={game} detailed={profile.settings.showDetailedScoring} />
        </section>
        <DeckPanel game={game} onInspect={setInspectTarget} />
        <details className="side-details-panel">
          <summary>规则说明</summary>
          <RulesPanel game={game} />
        </details>
        <ProfilePanel profile={profile} />
        <SettingsPanel
          profile={profile}
          onChange={setProfile}
          onResetProfile={resetProfileData}
          onClearRun={clearCurrentRun}
          onExportBackup={exportBackup}
          onImportBackup={importBackup}
          importMessage={importMessage}
        />
        <DiscardPanel game={game} onInspect={setInspectTarget} />
      </aside>

      <MobileBottomNav
        activeOverlay={activeOverlay}
        onOpen={(overlay) => setActiveOverlay((current) => (current === overlay ? null : overlay))}
      />
      <MobileOverlaySheet
        activeOverlay={activeOverlay}
        game={game}
        profile={profile}
        onClose={() => setActiveOverlay(null)}
        onProfileChange={setProfile}
        onResetProfile={resetProfileData}
        onClearRun={clearCurrentRun}
        onExportBackup={exportBackup}
        onImportBackup={importBackup}
        importMessage={importMessage}
        onInspect={setInspectTarget}
      />
      <DetailModal target={inspectTarget} onClose={() => setInspectTarget(null)} />
      {pendingImport && (
        <ImportConfirmDialog
          pendingImport={pendingImport}
          onCancel={() => {
            setPendingImport(null);
            setImportMessage('已取消导入，当前存档未改变。');
          }}
          onConfirm={confirmImportBackup}
        />
      )}
    </main>
  );
}

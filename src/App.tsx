import { type ChangeEvent, type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './App.css';
import packageJson from '../package.json';
import { MAX_ANTE } from './game/config/blinds';
import { BOSSES, getBossDefinition } from './game/config/bosses';
import {
  ENHANCEMENT_NAMES,
  getConsumableDefinition,
  getConsumableLabel,
  PLANET_CARDS,
  TAROT_CARDS
} from './game/config/consumables';
import { DECKS, DEFAULT_DECK_ID, getDeckDefinition } from './game/config/decks';
import { getHandScore, HAND_SCORES, POKER_HAND_ORDER } from './game/config/handScores';
import { getJokerDefinition, getJokerSellValue, JOKERS } from './game/config/jokers';
import { getPackDefinition, getSpectralDefinition, SPECTRAL_CARDS } from './game/config/packs';
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
  PokerHand,
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
type TutorialTipId = 'blind_select' | 'playing' | 'selected_cards' | 'shop' | 'jokers' | 'consumables' | 'details';
type TutorialTip = {
  id: TutorialTipId;
  title: string;
  body: string;
  action?: string;
};
const ALL_TUTORIAL_TIP_IDS: TutorialTipId[] = ['blind_select', 'playing', 'selected_cards', 'shop', 'jokers', 'consumables', 'details'];
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
  targetState,
  onClick
}: {
  card: Card;
  selected: boolean;
  disabled: boolean;
  hidden: boolean;
  targetState?: 'eligible' | 'locked' | 'selected' | null;
  onClick: () => void;
}) {
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const cardLabel = hidden ? '盖面牌' : formatCard(card);
  const detail = hidden
    ? `盖面牌｜${card.enhancement ? ENHANCEMENT_NAMES[card.enhancement] : '普通牌'}`
    : `${formatCard(card)}${card.enhancement ? `｜${ENHANCEMENT_NAMES[card.enhancement]}` : '｜普通牌'}`;

  return (
    <button
      className={`game-card ${selected ? 'selected' : ''} ${isRed ? 'red-suit' : 'black-suit'} ${hidden ? 'hidden-card' : ''} ${
        targetState ? `target-${targetState}` : ''
      }`}
      type="button"
      aria-pressed={selected}
      data-detail={detail}
      data-target-state={targetState ?? undefined}
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

const STAT_CLASS_BY_LABEL: Record<string, string> = {
  层级: 'layer',
  盲注: 'blind',
  资金: 'money',
  得分: 'score',
  当前分: 'score',
  目标: 'target',
  出牌: 'hands',
  弃牌: 'discards',
  牌库: 'deck',
  '出牌/弃牌': 'actions',
  牌组总数: 'deck-total',
  增强牌: 'enhancements',
  牌型: 'hand',
  计分牌: 'scored-cards',
  最终: 'final',
  最高层级: 'record',
  无尽最高: 'record',
  最高单手: 'record',
  通关次数: 'record',
  失败次数: 'record',
  当前局: 'run'
};

function Stat({ label, value }: { label: string; value: ReactNode }) {
  const className = STAT_CLASS_BY_LABEL[label] ? `stat stat-${STAT_CLASS_BY_LABEL[label]}` : 'stat';

  return (
    <div className={className}>
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

function isConsumableTargetCountValid(definition: ReturnType<typeof getConsumableDefinition>, count: number): boolean {
  return definition.target.mode === 'none' || (count >= definition.target.min && count <= definition.target.max);
}

function getConsumableTargetProgress(definition: ReturnType<typeof getConsumableDefinition>, count: number): { label: string; detail: string; valid: boolean } {
  if (definition.target.mode === 'none') {
    return { label: '无需目标', detail: '可以直接使用。', valid: true };
  }

  if (count < definition.target.min) {
    return {
      label: `还需 ${definition.target.min - count} 张`,
      detail:
        definition.target.min === definition.target.max
          ? `必须正好选择 ${definition.target.min} 张目标牌。`
          : `需要选择 ${definition.target.min} 到 ${definition.target.max} 张目标牌。`,
      valid: false
    };
  }

  if (count > definition.target.max) {
    return { label: `多选 ${count - definition.target.max} 张`, detail: `最多只能选择 ${definition.target.max} 张目标牌。`, valid: false };
  }

  return {
    label: '可以确认',
    detail: count === definition.target.max ? '目标数量已达上限，可以使用。' : `还可以继续多选 ${definition.target.max - count} 张。`,
    valid: true
  };
}

function getConsumableEffectPreview(definition: ReturnType<typeof getConsumableDefinition>, selectedCards: Card[] = []): string {
  const targetNames = selectedCards.length > 0 ? selectedCards.map((card) => formatCard(card)).join('、') : '所选目标';

  if (definition.effect.type === 'level_hand') {
    return `${HAND_SCORES[definition.effect.hand].name}等级 +1，之后这个牌型基础分更高。`;
  }

  if (definition.effect.type === 'change_suit') {
    return `${targetNames}会变成${SUIT_NAMES[definition.effect.suit]}。`;
  }

  if (definition.effect.type === 'change_rank') {
    return `${targetNames}会变成 ${definition.effect.rank}。`;
  }

  if (definition.effect.type === 'copy_card') {
    return `${targetNames}会复制一张加入牌组。`;
  }

  if (definition.effect.type === 'destroy_card') {
    return `${targetNames}会从牌组中删除。`;
  }

  if (definition.effect.type === 'gain_money') {
    return `立即获得 $${definition.effect.amount}。`;
  }

  if (definition.effect.type === 'enhance_card') {
    return `${targetNames}会变成${ENHANCEMENT_NAMES[definition.effect.enhancement]}。`;
  }

  return definition.description;
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

function getActiveTutorialTip(game: GameState, profile: PersistentProfile): TutorialTip | null {
  const dismissed = new Set(profile.settings.tutorialDismissed);
  const candidates: TutorialTip[] = [];

  if (game.phase === 'blind_select') {
    candidates.push({
      id: 'blind_select',
      title: '先选择盲注',
      body: '看清目标分、奖励和 Boss 规则。小盲/大盲可以跳过换标记，Boss 不能跳过。',
      action: '点击 Boss 或跳过奖励可以查看详情。'
    });
  }

  if (game.phase === 'playing' && game.selectedCardIds.length === 0) {
    candidates.push({
      id: 'playing',
      title: '选择 1 到 5 张牌',
      body: '目标是在有限出牌次数内达到盲注分数。选牌后会实时显示牌型和预计基础分。',
      action: '先凑对子、同花或顺子会更稳定。'
    });
  }

  if (game.phase === 'playing' && game.selectedCardIds.length > 0) {
    candidates.push({
      id: 'selected_cards',
      title: '决定出牌或弃牌',
      body: '出牌会结算分数，弃牌会换手牌但不加分。出牌和弃牌次数都很珍贵。',
      action: '需要看牌面效果时，点“选牌详情”。'
    });
  }

  if (game.phase === 'shop') {
    candidates.push({
      id: 'shop',
      title: '商店是构筑核心',
      body: '优先买能稳定加分的小丑，再考虑星球、塔罗和补充包。留钱会产生利息。',
      action: '商品卡可点击查看完整效果。'
    });
  }

  if (game.jokers.length > 0) {
    candidates.push({
      id: 'jokers',
      title: '小丑从左到右触发',
      body: '顺序会影响 +倍率 和 x倍率 的结果。拖拽或箭头可以调整位置。',
      action: '点击小丑牌可查看触发条件、流派和卖出价值。'
    });
  }

  if (game.consumables.length > 0) {
    candidates.push({
      id: 'consumables',
      title: '消耗牌改变构筑',
      body: '星球牌升级牌型，塔罗牌改造手牌或牌组。目标型消耗牌需要进入盲注后选择手牌。',
      action: '点击消耗牌可以确认使用时机。'
    });
  }

  candidates.push({
    id: 'details',
    title: '看到“详情”就可以点',
    body: '小丑、商店商品、Boss、Tag、优惠券和牌组里的牌都能打开详情面板。',
    action: '移动端不依赖 hover，直接点击查看。'
  });

  return candidates.find((candidate) => !dismissed.has(candidate.id)) ?? null;
}

function TutorialHint({
  tip,
  onDismiss,
  onDismissAll
}: {
  tip: TutorialTip | null;
  onDismiss: (id: TutorialTipId) => void;
  onDismissAll: () => void;
}) {
  if (!tip) {
    return null;
  }

  return (
    <section className="tutorial-hint" aria-label="新手提示">
      <div className="tutorial-marker">?</div>
      <div>
        <span>新手提示</span>
        <strong>{tip.title}</strong>
        <p>{tip.body}</p>
        {tip.action && <small>{tip.action}</small>}
      </div>
      <div className="tutorial-actions">
        <button type="button" className="secondary-action compact-action" onClick={() => onDismiss(tip.id)}>
          知道了
        </button>
        <button type="button" className="ghost-action compact-action" onClick={onDismissAll}>
          不再提示
        </button>
      </div>
    </section>
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

type SettlementImpact = 'hand' | 'chips' | 'mult' | 'factor' | 'rule' | 'score' | 'quiet';

const SETTLEMENT_STAGE_DEFINITIONS: Array<{
  id: ScoringEvent['stage'];
  title: string;
  shortTitle: string;
  emptyText: string;
  className: string;
}> = [
  { id: 'hand', title: '牌型基础', shortTitle: '牌型', emptyText: '无牌型', className: 'hand-type' },
  { id: 'scored_card', title: '计分牌', shortTitle: '计分', emptyText: '无计分牌', className: 'cards' },
  { id: 'enhancement', title: '增强牌', shortTitle: '增强', emptyText: '无增强', className: 'enhancements' },
  { id: 'joker', title: '小丑触发', shortTitle: '小丑', emptyText: '无小丑触发', className: 'jokers' },
  { id: 'rule', title: '规则修正', shortTitle: '规则', emptyText: '无修正', className: 'rules' },
  { id: 'final', title: '最终爆分', shortTitle: '最终', emptyText: '等待最终分', className: 'final' }
];

function formatFactor(value: number): string {
  const rounded = Number(value.toFixed(3));
  return String(rounded);
}

function sumEventValues(events: ScoringEvent[], key: 'chipsDelta' | 'multDelta'): number {
  return events.reduce((total, event) => total + (event[key] ?? 0), 0);
}

function multiplyEventFactors(events: ScoringEvent[]): number {
  return events.reduce((total, event) => total * (event.multFactor ?? 1), 1);
}

function getStageImpact(stage: ScoringEvent['stage'], events: ScoringEvent[]): SettlementImpact {
  if (stage === 'hand') {
    return 'hand';
  }

  if (stage === 'final') {
    return 'score';
  }

  if (events.some((event) => event.multFactor !== undefined)) {
    return 'factor';
  }

  if (events.some((event) => event.multDelta !== undefined)) {
    return 'mult';
  }

  if (events.some((event) => event.chipsDelta !== undefined)) {
    return 'chips';
  }

  if (stage === 'rule' && events.length > 0) {
    return 'rule';
  }

  return 'quiet';
}

function getStageBadges(stage: ScoringEvent['stage'], events: ScoringEvent[], log: GameScoringLog) {
  const chipsTotal = sumEventValues(events, 'chipsDelta');
  const multTotal = sumEventValues(events, 'multDelta');
  const factorTotal = multiplyEventFactors(events);

  if (stage === 'hand') {
    return [
      { className: 'chips', label: '筹码', value: `${log.baseChips}` },
      { className: 'mult', label: '倍率', value: `${log.baseMult}` }
    ];
  }

  if (stage === 'final') {
    return [
      { className: 'chips', label: '筹码', value: `${log.finalChips}` },
      { className: 'mult', label: '倍率', value: `${log.finalMult}` },
      { className: 'score', label: '得分', value: `${log.finalScore}` }
    ];
  }

  const badges: Array<{ className: string; label: string; value: string }> = [];

  if (chipsTotal !== 0) {
    badges.push({ className: 'chips', label: '筹码', value: `${chipsTotal > 0 ? '+' : ''}${chipsTotal}` });
  }

  if (multTotal !== 0) {
    badges.push({ className: 'mult', label: '+倍率', value: `${multTotal > 0 ? '+' : ''}${multTotal}` });
  }

  if (factorTotal !== 1) {
    badges.push({ className: 'factor', label: 'x倍率', value: `×${formatFactor(factorTotal)}` });
  }

  return badges;
}

function getStageAfterText(stage: ScoringEvent['stage'], events: ScoringEvent[], log: GameScoringLog): string {
  if (stage === 'final') {
    return describeFinalFormula(log);
  }

  const lastEventWithTotals = [...events].reverse().find((event) => event.chipsAfter !== undefined || event.multAfter !== undefined);

  if (lastEventWithTotals?.chipsAfter !== undefined && lastEventWithTotals.multAfter !== undefined) {
    return `阶段后 ${lastEventWithTotals.chipsAfter} 筹码 × ${lastEventWithTotals.multAfter} 倍率`;
  }

  if (stage === 'hand') {
    return `基础 ${log.baseChips} 筹码 × ${log.baseMult} 倍率`;
  }

  return events.length > 0 ? '已记录触发，无数值变化' : '本阶段无触发';
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
  const cardChips = cardEvents.reduce((total, event) => total + (event.chipsDelta ?? 0), 0);
  const stageEvents = SETTLEMENT_STAGE_DEFINITIONS.map((definition, index) => {
    const sectionEvents = events.filter((event) => event.stage === definition.id);

    return {
      ...definition,
      index,
      events: sectionEvents,
      impact: getStageImpact(definition.id, sectionEvents),
      badges: getStageBadges(definition.id, sectionEvents, log),
      afterText: getStageAfterText(definition.id, sectionEvents, log)
    };
  });

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
        <span>本手爆分</span>
        <strong className="settlement-score-burst">
          <AnimatedNumber value={log.finalScore} enabled={!fastMode} duration={520} />
        </strong>
        <div className="settlement-formula-strip" aria-label="最终公式">
          <span className="formula-chip chips">{log.finalChips} 筹码</span>
          <span className="formula-operator">×</span>
          <span className="formula-chip mult">{log.finalMult} 倍率</span>
          <span className="formula-operator">=</span>
          <span className="formula-chip score">{log.finalScore}</span>
        </div>
      </div>
      <div className="settlement-stage-track">
        {stageEvents.map((stage) => (
          <article
            key={stage.id}
            className={`settlement-stage-card ${stage.className} impact-${stage.impact}`}
            style={{ '--stage-index': stage.index } as CSSProperties}
          >
            <div className="settlement-stage-head">
              <span className="stage-order">{stage.index + 1}</span>
              <div>
                <span>{stage.shortTitle}</span>
                <strong>{stage.id === 'hand' ? (handEvent?.label ?? log.handName) : stage.title}</strong>
              </div>
              <em>{stage.events.length > 0 ? `${stage.events.length} 次` : '无'}</em>
            </div>
            <div className="settlement-stage-badges">
              {stage.badges.length > 0 ? (
                stage.badges.map((badge) => (
                  <span className={`stage-badge ${badge.className}`} key={`${stage.id}-${badge.className}-${badge.value}`}>
                    <small>{badge.label}</small>
                    <strong>{badge.value}</strong>
                  </span>
                ))
              ) : (
                <span className="stage-badge quiet">
                  <small>结果</small>
                  <strong>未改变</strong>
                </span>
              )}
            </div>
            <small className="settlement-stage-after">{stage.afterText}</small>
            <EventChipList events={stage.events} emptyText={stage.emptyText} />
          </article>
        ))}
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

type HandRuleCard = {
  hand: PokerHand;
  example: string[];
  rule: string;
  badge: string;
};

const HAND_RULE_GUIDE: HandRuleCard[] = [
  {
    hand: 'high_card',
    example: ['A♠'],
    rule: '没有组成其它牌型时，只取最高的一张计分。',
    badge: '1-5 张都可能'
  },
  {
    hand: 'pair',
    example: ['7♠', '7♥'],
    rule: '两张同点数。多选散牌会打出，但通常不计入这手牌型。',
    badge: '2 张起'
  },
  {
    hand: 'two_pair',
    example: ['7♠', '7♥', '8♣', '8♦'],
    rule: '两组不同点数的对子，可以直接用 4 张打出。',
    badge: '4 张起'
  },
  {
    hand: 'three_of_a_kind',
    example: ['Q♠', 'Q♥', 'Q♦'],
    rule: '三张同点数。只要三张成立，不必选满 5 张。',
    badge: '3 张起'
  },
  {
    hand: 'straight',
    example: ['4♣', '5♦', '6♠', '7♥', '8♣'],
    rule: '必须是 5 张连续点数。A 可以作为最低点参与低端顺子。',
    badge: '必须 5 张'
  },
  {
    hand: 'flush',
    example: ['2♥', '6♥', '9♥', 'J♥', 'K♥'],
    rule: '必须是 5 张同花色。万能牌可以帮助组成同花。',
    badge: '必须 5 张'
  },
  {
    hand: 'full_house',
    example: ['7♠', '7♥', '7♦', '8♣', '8♦'],
    rule: '三条加一对，必须刚好由 5 张有效牌组成。',
    badge: '必须 5 张'
  },
  {
    hand: 'four_of_a_kind',
    example: ['9♠', '9♥', '9♣', '9♦'],
    rule: '四张同点数。第 5 张散牌可一起打出，但四张才是计分核心。',
    badge: '4 张起'
  },
  {
    hand: 'straight_flush',
    example: ['4♠', '5♠', '6♠', '7♠', '8♠'],
    rule: '顺子和同花同时成立。',
    badge: '必须 5 张'
  },
  {
    hand: 'royal_flush',
    example: ['10♦', 'J♦', 'Q♦', 'K♦', 'A♦'],
    rule: '10、J、Q、K、A 的同花顺。',
    badge: '必须 5 张'
  },
  {
    hand: 'five_of_a_kind',
    example: ['A♠', 'A♥', 'A♣', 'A♦', 'A♠'],
    rule: '五张同点数，通常需要复制或改点数后才会出现。',
    badge: '改造牌堆'
  },
  {
    hand: 'flush_house',
    example: ['7♠', '7♠', '7♠', '8♠', '8♠'],
    rule: '葫芦且 5 张同花色，通常需要改花色或复制牌。',
    badge: '改造牌堆'
  },
  {
    hand: 'flush_five',
    example: ['A♥', 'A♥', 'A♥', 'A♥', 'A♥'],
    rule: '五条且 5 张同花色，是改造牌堆后的顶级牌型。',
    badge: '改造牌堆'
  }
];

type RuleTabId = 'quick' | 'hands' | 'scoring' | 'cards' | 'shop' | 'boss';

const RULE_TABS: Array<{ id: RuleTabId; label: string }> = [
  { id: 'quick', label: '快速上手' },
  { id: 'hands', label: '牌型说明' },
  { id: 'scoring', label: '计分流程' },
  { id: 'cards', label: '卡牌能力' },
  { id: 'shop', label: '商店构筑' },
  { id: 'boss', label: 'Boss/跳过' }
];

const QUICK_RULES = [
  { title: '推进顺序', body: '每个层级按小盲、大盲、首领盲注推进，打过当前盲注后进入商店。' },
  { title: '胜负目标', body: '在有限出牌次数内达到目标分就过关；出牌次数用完还没达标就失败。' },
  { title: '每次操作', body: '出牌会得分，弃牌只换牌但不计分；两者次数都有限。' },
  { title: '构筑循环', body: '商店购买小丑、星球、塔罗、补充包和优惠券，让下一轮更强。' }
];

const SCORING_STEPS = [
  { title: '牌型基础', body: '系统识别最佳牌型，给出基础筹码和倍率。' },
  { title: '计分牌', body: '参与牌型的牌逐张加筹码，Boss 禁用牌会显示原因。' },
  { title: '增强牌', body: 'Bonus、Mult、Glass、Steel、Gold 等增强按各自规则生效。' },
  { title: '小丑触发', body: '小丑从左到右结算，顺序会影响 +Mult 和 xMult 的最终结果。' },
  { title: '规则修正', body: 'Boss 或特殊规则最后修正分数，再得到最终分。' }
];

const ENHANCEMENT_RULES: Array<{ id: NonNullable<Card['enhancement']>; body: string }> = [
  { id: 'bonus', body: '计分时增加筹码，适合补稳定基础分。' },
  { id: 'mult', body: '计分时增加倍率，适合配合高筹码牌型。' },
  { id: 'wild', body: '可帮助组成同花，降低花色要求。' },
  { id: 'glass', body: '高风险放大倍率，有概率在结算后破碎。' },
  { id: 'steel', body: '留在手牌中放大倍率，通常不需要打出。' },
  { id: 'gold', body: '通过盲注后给钱，偏经济构筑。' },
  { id: 'stone', body: '强化筹码但失去原本点数和花色价值。' }
];

const CARD_RULES = [
  { title: '星球牌', body: '提升指定牌型等级，让之后同类牌型获得更高基础筹码和倍率。' },
  { title: '塔罗牌', body: '用于改花色、改点数、复制、删除、增强牌或直接获得资金。' },
  { title: '幻灵牌', body: '通常是强收益加明确代价，可能创建小丑、复制牌、删牌、强化牌或清空资金。' },
  { title: '补充包', body: '标准、星球、塔罗、小丑和幻灵包打开后选择 1 张，也可以跳过。' }
];

const SHOP_RULES = [
  { title: '商店商品', body: '货架会出现小丑、星球、塔罗、补充包和优惠券。' },
  { title: '刷新压力', body: '刷新从 $3 起，每次刷新后变贵；减免最低到 $0。' },
  { title: '利息', body: `默认每 $${INTEREST_MONEY_STEP} 存款给 $1，最多 $${MAX_INTEREST_PAYOUT}。` },
  { title: '优惠券', body: '基础券可直接出现，升级券需要先买下同组基础券后才会进入商店池。' },
  { title: '槽位', body: '小丑槽和消耗牌槽会限制购买，满槽时需要先卖出或使用。' }
];

const BOSS_RULES = [
  { title: 'Boss 预告', body: '进入首领盲注前会展示名称、限制和应对建议。' },
  { title: '当前盲注生效', body: 'Boss 限制只影响当前盲注，进入商店后会清除。' },
  { title: '限制类型', body: '可能禁用花色/点数、人头牌、小丑稀有度，或禁止/要求某些牌型。' },
  { title: '跳过奖励', body: '小盲和大盲可以跳过换 Tag；跳过不给普通奖励，Boss 不能跳过。' },
  { title: '兑现时机', body: 'Tag 通常在后续商店或下一场盲注兑现，效果会在局势面板显示。' }
];

function HandExampleCards({ cards }: { cards: string[] }) {
  return (
    <div className="hand-mini-cards" aria-label={cards.join(' ')}>
      {cards.map((card, index) => {
        const isRed = card.includes('♥') || card.includes('♦');
        return (
          <span className={`hand-mini-card ${isRed ? 'red' : 'black'}`} key={`${card}-${index}`}>
            {card}
          </span>
        );
      })}
    </div>
  );
}

function RulesPanel({ game }: { game: GameState }) {
  const [activeTab, setActiveTab] = useState<RuleTabId>('quick');

  return (
    <section className="rules-panel">
      <h2>规则说明</h2>
      <div className="rules-tabs" role="tablist" aria-label="规则分类">
        {RULE_TABS.map((tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`rule-tab-${tab.id}`}
            id={`rule-tab-button-${tab.id}`}
            className={activeTab === tab.id ? 'active' : ''}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className={`rule-tab-panel ${activeTab}`}
        role="tabpanel"
        id={`rule-tab-${activeTab}`}
        aria-labelledby={`rule-tab-button-${activeTab}`}
      >
        {activeTab === 'quick' && (
          <>
            <div className="current-task">
              <span>当前要做</span>
              <strong>{getPhaseTask(game.phase)}</strong>
            </div>
            <div className="rule-card-grid">
              {QUICK_RULES.map((rule) => (
                <article className="rule-info-card" key={rule.title}>
                  <span>{rule.title}</span>
                  <p>{rule.body}</p>
                </article>
              ))}
            </div>
            <div className="publish-note">
              <span>线上说明</span>
              <p>
                这是独立制作的《盲注回响 / Ante Echo》，非官方作品，不使用原版素材或受保护文案。线上版本不需要你的电脑保持开机；存档只保存在当前浏览器，可在设置中导出和导入备份。
              </p>
              {FEEDBACK_URL ? <a href={FEEDBACK_URL}>反馈问题</a> : <small>反馈入口待开放</small>}
            </div>
          </>
        )}

        {activeTab === 'hands' && (
          <section className="hand-guide" aria-labelledby="hand-guide-title">
            <div className="hand-guide-header">
              <div>
                <span>牌型速查</span>
                <h3 id="hand-guide-title">1 到 5 张都能出，系统会取最佳牌型</h3>
              </div>
              <p>顺子、同花、葫芦和特殊牌型通常要求 5 张；对子、两对、三条、四条可以少于 5 张成立。</p>
            </div>
            <div className="hand-guide-grid">
              {HAND_RULE_GUIDE.map((item) => {
                const score = HAND_SCORES[item.hand];
                return (
                  <article className="hand-rule-card" key={item.hand}>
                    <div className="hand-rule-card-top">
                      <div>
                        <span className="hand-rule-name">{score.name}</span>
                        <span className="hand-rule-score">
                          {score.chips} 筹码 ×{score.mult}
                        </span>
                      </div>
                      <em>{item.badge}</em>
                    </div>
                    <HandExampleCards cards={item.example} />
                    <p>{item.rule}</p>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === 'scoring' && (
          <section className="rule-section">
            <div className="rule-section-title">
              <span>核心公式</span>
              <h3>最终得分 = Chips × Mult</h3>
              <p>筹码决定底盘，倍率决定爆发。+Mult 先把倍率加高，xMult 再把倍率整体放大。</p>
            </div>
            <div className="rule-flow-list">
              {SCORING_STEPS.map((step, index) => (
                <article className="rule-flow-step" key={step.title}>
                  <em>{index + 1}</em>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'cards' && (
          <section className="rule-section">
            <div className="rule-section-title">
              <span>牌与能力</span>
              <h3>普通牌、增强牌和消耗牌共同改变构筑</h3>
            </div>
            <div className="enhancement-rule-grid">
              {ENHANCEMENT_RULES.map((rule) => (
                <article className={`enhancement-rule-card ${rule.id}`} key={rule.id}>
                  <strong>{ENHANCEMENT_NAMES[rule.id]}</strong>
                  <p>{rule.body}</p>
                </article>
              ))}
            </div>
            <div className="rule-card-grid">
              {CARD_RULES.map((rule) => (
                <article className="rule-info-card" key={rule.title}>
                  <span>{rule.title}</span>
                  <p>{rule.body}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'shop' && (
          <section className="rule-section">
            <div className="rule-section-title">
              <span>商店构筑</span>
              <h3>买、刷、留钱都会改变后续路线</h3>
            </div>
            <div className="rule-card-grid">
              {SHOP_RULES.map((rule) => (
                <article className="rule-info-card" key={rule.title}>
                  <span>{rule.title}</span>
                  <p>{rule.body}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'boss' && (
          <section className="rule-section">
            <div className="rule-section-title">
              <span>首领和跳过</span>
              <h3>Boss 打断惯性，Tag 奖励改变节奏</h3>
            </div>
            <div className="rule-card-grid">
              {BOSS_RULES.map((rule) => (
                <article className="rule-info-card danger" key={rule.title}>
                  <span>{rule.title}</span>
                  <p>{rule.body}</p>
                </article>
              ))}
            </div>
          </section>
        )}
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
  const targetProgress = getConsumableTargetProgress(definition, selectedTargetCount);
  const actionLabel = active ? '确认使用' : disabledReason === '需要进入盲注后选择手牌目标' ? '盲注中使用' : definition.target.mode === 'none' ? '立即使用' : '选择目标';
  const targetText =
    definition.target.mode === 'cards'
      ? definition.target.min === definition.target.max
        ? `目标：选择 ${definition.target.min} 张手牌`
        : `目标：选择 ${definition.target.min}-${definition.target.max} 张手牌`
      : '无需选择目标';
  const activeText =
    active && definition.target.mode === 'cards'
      ? `当前已选 ${selectedTargetCount}/${definition.target.max}｜${targetProgress.label}`
      : targetText;

  return (
    <article
      className={`consumable-card ${definition.kind} ${active ? 'active' : ''} ${
        active && definition.target.mode === 'cards' ? (targetProgress.valid ? 'target-valid' : 'target-invalid') : ''
      }`}
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
      <small className="consumable-effect-note">{getConsumableEffectPreview(definition)}</small>
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
  const activeProgress = activeDefinition ? getConsumableTargetProgress(activeDefinition, game.selectedCardIds.length) : null;

  return (
    <section className={`consumable-bar ${game.consumables.length === 0 ? 'empty-bar' : ''}`} aria-label="消耗牌槽位">
      <div className="consumable-header">
        <div>
          <span>消耗牌槽</span>
          <strong>{game.consumables.length}/{game.consumableSlots}</strong>
        </div>
        {activeDefinition ? (
          <div className={`target-helper ${activeProgress?.valid ? 'valid' : 'invalid'}`}>
            <span>{activeDefinition.name}</span>
            <strong>
              {activeDefinition.target.min === activeDefinition.target.max
                ? `目标 ${game.selectedCardIds.length}/${activeDefinition.target.max}`
                : `目标 ${game.selectedCardIds.length}/${activeDefinition.target.min}-${activeDefinition.target.max}`}
            </strong>
            <small>{activeProgress?.detail}</small>
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
  getName,
  getDescription,
  getKicker,
  visualKind,
  onInspect,
  getInspectTarget
}: {
  title: string;
  ids: string[];
  total: number;
  getName: (id: string) => string;
  getDescription?: (id: string) => string;
  getKicker?: (id: string) => string;
  visualKind: 'joker' | 'planet' | 'tarot' | 'spectral' | 'boss' | 'voucher';
  onInspect?: (target: InspectTarget) => void;
  getInspectTarget: (id: string) => InspectTarget;
}) {
  const recentIds = ids.slice(-6).reverse();

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
          <span className="collection-empty">尚未见过</span>
        ) : (
          recentIds.map((id) => (
            <button
              type="button"
              className={`collection-entry ${visualKind}`}
              key={id}
              onClick={() => onInspect?.(getInspectTarget(id))}
              title={`${getName(id)}：${getDescription?.(id) ?? '点击查看详情'}`}
            >
              {getKicker ? <em>{getKicker(id)}</em> : null}
              <strong>{getName(id)}</strong>
              {getDescription ? <small>{getDescription(id)}</small> : null}
            </button>
          ))
        )}
      </div>
      {ids.length > 6 ? <p className="collection-recent">显示最近见过的 6 项。</p> : null}
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

function CollectionPanel({ profile, onInspect }: { profile: PersistentProfile; onInspect?: (target: InspectTarget) => void }) {
  const consumableCounts = getConsumableKindCounts(profile.collection.seenConsumables);
  const seenPlanets = profile.collection.seenConsumables.filter((id) => getConsumableDefinition(id).kind === 'planet');
  const seenTarots = profile.collection.seenConsumables.filter((id) => getConsumableDefinition(id).kind === 'tarot');

  return (
    <section>
      <h2>收藏图鉴</h2>
      <div className="collection-grid">
        <CollectionList
          title="小丑图鉴"
          ids={profile.collection.seenJokers}
          total={JOKERS.length}
          getName={(id) => getJokerDefinition(id).name}
          getDescription={(id) => getJokerDefinition(id).description}
          getKicker={(id) => (getJokerDefinition(id).rarity === 'rare' ? '稀有' : getJokerDefinition(id).rarity === 'uncommon' ? '罕见' : '普通')}
          visualKind="joker"
          onInspect={onInspect}
          getInspectTarget={(id) => ({ kind: 'joker', definitionId: id, source: '收藏图鉴' })}
        />
        <CollectionList
          title="星球图鉴"
          ids={seenPlanets}
          total={PLANET_CARDS.length}
          getName={(id) => getConsumableDefinition(id).name}
          getDescription={(id) => getConsumableDefinition(id).description}
          getKicker={() => '星球'}
          visualKind="planet"
          onInspect={onInspect}
          getInspectTarget={(id) => ({ kind: 'consumable', definitionId: id, source: '收藏图鉴' })}
        />
        <CollectionList
          title="塔罗图鉴"
          ids={seenTarots}
          total={TAROT_CARDS.length}
          getName={(id) => getConsumableDefinition(id).name}
          getDescription={(id) => getConsumableDefinition(id).description}
          getKicker={() => '塔罗'}
          visualKind="tarot"
          onInspect={onInspect}
          getInspectTarget={(id) => ({ kind: 'consumable', definitionId: id, source: '收藏图鉴' })}
        />
        <CollectionList
          title="幻灵图鉴"
          ids={profile.collection.seenSpectrals}
          total={SPECTRAL_CARDS.length}
          getName={(id) => getSpectralDefinition(id).name}
          getDescription={(id) => getSpectralDefinition(id).description}
          getKicker={() => '幻灵'}
          visualKind="spectral"
          onInspect={onInspect}
          getInspectTarget={(id) => ({ kind: 'spectral', definitionId: id, source: '收藏图鉴' })}
        />
        <CollectionList
          title="首领图鉴"
          ids={profile.collection.seenBosses}
          total={BOSSES.length}
          getName={(id) => getBossDefinition(id).name}
          getDescription={(id) => getBossDefinition(id).description}
          getKicker={() => '首领'}
          visualKind="boss"
          onInspect={onInspect}
          getInspectTarget={(id) => ({ kind: 'boss', definitionId: id, source: '收藏图鉴' })}
        />
        <CollectionList
          title="优惠券图鉴"
          ids={profile.collection.seenVouchers}
          total={VOUCHERS.length}
          getName={(id) => getVoucherDefinition(id).name}
          getDescription={(id) => {
            const voucher = getVoucherDefinition(id);
            return `${voucher.tier === 2 ? '升级券' : '基础券'}：${voucher.description}`;
          }}
          getKicker={(id) => (getVoucherDefinition(id).tier === 2 ? '升级券' : '基础券')}
          visualKind="voucher"
          onInspect={onInspect}
          getInspectTarget={(id) => ({ kind: 'voucher', definitionId: id, source: '收藏图鉴' })}
        />
      </div>
      <p className="profile-note">
        已见过 {consumableCounts.planet} 张星球牌、{consumableCounts.tarot} 张塔罗牌、{profile.collection.seenSpectrals.length} 张幻灵牌。图鉴只公开见过的条目，未见过内容会保留为占位。
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

function ProfilePanel({ profile, onInspect }: { profile: PersistentProfile; onInspect?: (target: InspectTarget) => void }) {
  return (
    <section>
      <h2>长期资料</h2>
      <StatsPanel profile={profile} />
      <CollectionPanel profile={profile} onInspect={onInspect} />
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
      <div className="setting-row tutorial-setting">
        <span>新手提示</span>
        <button
          type="button"
          className="secondary-action compact-action"
          onClick={() => onChange(updateProfileSettings(profile, { tutorialDismissed: [] }))}
        >
          重新显示
        </button>
        <strong>{profile.settings.tutorialDismissed.length}/{ALL_TUTORIAL_TIP_IDS.length}</strong>
      </div>
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
    <div className="mobile-situation-panel">
      <SituationSummaryPanel game={game} />
      <RunModifiersPanel game={game} onInspect={onInspect} />
      <details className="mobile-rules-disclosure">
        <summary>规则提示</summary>
        <RulesPanel game={game} />
      </details>
    </div>
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
          {activeOverlay === 'profile' && <ProfilePanel profile={profile} onInspect={onInspect} />}
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
  importMessage,
  onInspect
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
  onInspect: (target: InspectTarget) => void;
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
        {screen === 'collection' && <CollectionPanel profile={profile} onInspect={onInspect} />}
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

function getPackChoiceFlowText(choice: PackChoice, game: GameState): string {
  if (choice.kind === 'playing_card') {
    return '选择后加入当前牌组，后续抽牌可能抽到它。';
  }

  if (choice.kind === 'consumable') {
    const definition = getConsumableDefinition(choice.definitionId);
    return definition.target.mode === 'cards' ? '进入消耗牌槽，之后在盲注中选择手牌目标。' : '进入消耗牌槽，可直接使用。';
  }

  if (choice.kind === 'joker') {
    return game.jokers.length >= game.jokerSlots ? '小丑槽已满，先卖出后才能领取。' : `加入小丑槽，还剩 ${game.jokerSlots - game.jokers.length - 1} 个槽。`;
  }

  return '选择后立即生效，通常会强力改变牌组并带有代价。';
}

function getPackChoiceSignals(choice: PackChoice, game: GameState): string[] {
  if (choice.kind === 'playing_card') {
    const signals = [`${SUIT_NAMES[choice.card.suit]} ${choice.card.rank}`];
    if (choice.card.enhancement) {
      signals.push(ENHANCEMENT_NAMES[choice.card.enhancement]);
    } else {
      signals.push('普通牌');
    }
    return signals;
  }

  if (choice.kind === 'consumable') {
    return getConsumableBuildSignals(getConsumableDefinition(choice.definitionId), game);
  }

  if (choice.kind === 'joker') {
    return getJokerBuildSignals(getJokerDefinition(choice.definitionId), game);
  }

  return ['高风险高收益', '立即生效'];
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
  const blockedChoices = game.packChoices.filter((choice) => getPackChoiceBlockedText(choice, game)).length;

  return createPortal(
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
        <div className="pack-choice-guide" aria-label="开包提示">
          <span>候选 {game.packChoices.length} 张</span>
          <span>{blockedChoices > 0 ? `${blockedChoices} 张暂不可选` : '全部可选'}</span>
          <span>键盘 1-9 选择，Esc 跳过</span>
        </div>
        <div className="pack-choice-row">
          {game.packChoices.map((choice, index) => {
            const blockedText = getPackChoiceBlockedText(choice, game);
            const choiceSignals = getPackChoiceSignals(choice, game);
            const flowText = getPackChoiceFlowText(choice, game);

            return (
              <article
                className={`pack-choice ${choice.kind} ${disabled || blockedText ? 'disabled' : ''}`}
                key={choice.instanceId}
                title={getPackChoiceDetail(choice, index)}
              >
                <span>{index + 1}. {getPackChoiceLabel(choice)}</span>
                <strong>{getPackChoiceTitle(choice)}</strong>
                <small>{getPackChoiceDescription(choice)}</small>
                <ShopSignalList signals={choiceSignals} />
                <em className="pack-choice-flow">{flowText}</em>
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
    </div>,
    document.body
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
  const shopDecisionCards = getShopDecisionCards(game, shopLocked);

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
      <div className="shop-decision-strip" aria-label="商店决策提示">
        {shopDecisionCards.map((card) => (
          <div className={`shop-decision-card ${card.tone}`} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
          </div>
        ))}
      </div>
      <div className="shop-shelves">
        {game.shopOffers.map((offer) => (
          <ShopOfferCard
            key={offer.id}
            offer={offer}
            game={game}
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
      {createPortal(
        <div className="action-row mobile-shop-action-row">
          <button
            className="secondary-action"
            type="button"
            disabled={shopLocked || game.money < game.shopRerollCost}
            title="花费资金刷新所有商店商品，之后刷新费用会提高"
            onClick={onRefresh}
          >
            刷新 ${game.shopRerollCost}
          </button>
          <button type="button" disabled={shopLocked} title="保留当前构筑，进入下一次盲注选择" onClick={onNext}>
            下一盲注
          </button>
        </div>,
        document.body
      )}
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

function getShopOfferHint(offer: ShopItem, game: GameState): string {
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
  if (moneyEffect?.type === 'money_add_mult' && game.money < moneyEffect.divisor) {
    return `${archetype}流｜当前资金不足以触发`;
  }

  return `${archetype}流｜${definition.conditionText}`;
}

function getOwnedArchetypes(game: GameState): Set<JokerArchetype> {
  const archetypes = new Set<JokerArchetype>();

  game.jokers.forEach((joker) => {
    getJokerDefinition(joker.definitionId).archetypes.forEach((archetype) => archetypes.add(archetype));
  });

  return archetypes;
}

function getUpgradedHandNames(game: GameState): string[] {
  return POKER_HAND_ORDER.filter((hand) => game.handLevels[hand] > 1)
    .map((hand) => HAND_SCORES[hand].name)
    .slice(0, 3);
}

function getShopOfferBlockReason(offer: ShopItem, game: GameState, actionDisabled: boolean): string | null {
  if (actionDisabled) {
    return '先处理当前补充包或等待结算完成';
  }

  if (game.money < offer.price) {
    return `还差 $${offer.price - game.money}`;
  }

  if (offer.kind === 'joker' && game.jokers.length >= game.jokerSlots) {
    return '小丑槽位已满，先卖出一张';
  }

  if (offer.kind === 'consumable' && game.consumables.length >= game.consumableSlots) {
    return '消耗牌槽位已满，先使用一张';
  }

  if (offer.kind === 'pack') {
    const definition = getPackDefinition(offer.definitionId);

    if (definition.kind === 'joker' && game.jokers.length >= game.jokerSlots) {
      return '小丑槽位已满，先卖出一张';
    }

    if ((definition.kind === 'planet' || definition.kind === 'tarot') && game.consumables.length >= game.consumableSlots) {
      return '消耗牌槽位已满';
    }
  }

  return null;
}

function getShopOfferFlowNote(offer: ShopItem, game: GameState): string | null {
  if (!offer.definitionId) {
    return null;
  }

  if (offer.kind === 'joker') {
    return game.jokers.length >= game.jokerSlots ? '需要腾出小丑槽后才能买。' : `购买后占用 1 个小丑槽，还剩 ${game.jokerSlots - game.jokers.length - 1} 个。`;
  }

  if (offer.kind === 'consumable') {
    const definition = getConsumableDefinition(offer.definitionId);
    return definition.target.mode === 'cards' ? '买下后进入盲注，再选择手牌目标。' : '买下后放入消耗牌槽，可直接使用。';
  }

  if (offer.kind === 'pack') {
    const definition = getPackDefinition(offer.definitionId);
    if (definition.kind === 'standard' || definition.kind === 'spectral') return '打开后进入选牌层，商店会暂时锁定。';
    if (definition.kind === 'joker') return '打开后从候选小丑中选 1 张。';
    return '打开后从候选消耗牌中选 1 张放入槽位。';
  }

  return '立即生效，不占用小丑或消耗牌槽。';
}

function getJokerBuildSignals(definition: ReturnType<typeof getJokerDefinition>, game: GameState): string[] {
  const ownedArchetypes = getOwnedArchetypes(game);
  const signals: string[] = [];
  const overlappingArchetype = definition.archetypes.find((archetype) => archetype !== 'general' && ownedArchetypes.has(archetype));

  if (overlappingArchetype) {
    signals.push(`接上现有${JOKER_ARCHETYPE_LABELS[overlappingArchetype]}流`);
  }

  definition.effects.forEach((effect) => {
    if ('hand' in effect && game.handLevels[effect.hand] > 1) {
      signals.push(`${HAND_SCORES[effect.hand].name}已升级`);
    }

    if (
      effect.type === 'add_chips' ||
      effect.type === 'hand_add_chips' ||
      effect.type === 'scored_cards_add_chips' ||
      effect.type === 'rank_add_chips' ||
      effect.type === 'scored_ranks_add_chips' ||
      effect.type === 'remaining_discards_add_chips' ||
      effect.type === 'money_add_chips' ||
      effect.type === 'scored_enhancement_add_chips' ||
      effect.type === 'selected_cards_exactly_add_chips'
    ) {
      signals.push('稳定补筹码');
    }

    if (
      effect.type === 'add_mult' ||
      effect.type === 'hand_add_mult' ||
      effect.type === 'scored_suit_add_mult' ||
      effect.type === 'scored_face_add_mult' ||
      effect.type === 'rank_add_mult' ||
      effect.type === 'held_enhancement_add_mult' ||
      effect.type === 'growth_hand_add_mult' ||
      effect.type === 'remaining_discards_add_mult' ||
      effect.type === 'first_hand_add_mult' ||
      effect.type === 'money_add_mult' ||
      effect.type === 'scored_cards_at_most_add_mult' ||
      effect.type === 'selected_cards_at_most_add_mult' ||
      effect.type === 'selected_cards_exactly_add_mult' ||
      effect.type === 'scored_ranks_add_mult' ||
      effect.type === 'joker_count_add_mult' ||
      effect.type === 'scored_enhancement_add_mult' ||
      effect.type === 'played_hands_add_mult' ||
      effect.type === 'money_at_most_add_mult' ||
      effect.type === 'no_discards_add_mult' ||
      effect.type === 'level_add_mult'
    ) {
      signals.push('提高 +Mult');
    }

    if (
      effect.type === 'multiply_mult' ||
      effect.type === 'hand_multiply_mult' ||
      effect.type === 'scored_enhancement_multiply_mult' ||
      effect.type === 'held_enhancement_multiply_mult' ||
      effect.type === 'last_hand_multiply_mult'
    ) {
      signals.push('xMult 爆发');
    }

    if (effect.type === 'money_add_mult') {
      const rawAmount = Math.floor(game.money / effect.divisor) * effect.amount;
      const amount = effect.max === undefined ? rawAmount : Math.min(effect.max, rawAmount);
      signals.push(amount > 0 ? `当前约 +${amount} 倍率` : `到 $${effect.divisor} 起动`);
    }

    if (effect.type === 'blind_clear_money' || effect.type === 'reroll_discount' || effect.type === 'sell_bonus_money' || effect.type === 'money_add_chips') {
      signals.push('改善商店经济');
    }

    if (effect.type === 'copy_right') {
      signals.push('顺序敏感：看右侧');
    }

    if (effect.type === 'repeat_first_scored_card') {
      signals.push('首张计分牌越大越好');
    }

    if (effect.type === 'scored_suit_add_chips' || effect.type === 'scored_suit_add_mult') {
      signals.push(`需要${SUIT_NAMES[effect.suit]}计分`);
    }

    if (effect.type === 'scored_face_add_chips' || effect.type === 'scored_face_add_mult') {
      signals.push('需要 J/Q/K 计分');
    }
  });

  if (definition.growthOnHand) {
    signals.push('越早买越能成长');
  }

  return [...new Set(signals)].slice(0, 4);
}

function getConsumableBuildSignals(definition: ReturnType<typeof getConsumableDefinition>, game: GameState): string[] {
  const signals: string[] = [];

  if (definition.effect.type === 'level_hand') {
    signals.push(`升级${HAND_SCORES[definition.effect.hand].name}`);
    if (game.handLevels[definition.effect.hand] > 1) {
      signals.push('继续强化已有牌型');
    }
  }

  if (definition.effect.type === 'change_suit') {
    signals.push(`改成${SUIT_NAMES[definition.effect.suit]}`);
    signals.push('支持同花/花色流');
  }

  if (definition.effect.type === 'change_rank') {
    signals.push(`改成 ${definition.effect.rank}`);
    signals.push('支持五条/指定点数');
  }

  if (definition.effect.type === 'copy_card') signals.push('复制核心牌');
  if (definition.effect.type === 'destroy_card') signals.push('压缩牌组');
  if (definition.effect.type === 'gain_money') signals.push(`立即 +$${definition.effect.amount}`);
  if (definition.effect.type === 'enhance_card') signals.push(`制造${ENHANCEMENT_NAMES[definition.effect.enhancement]}`);

  return signals.slice(0, 4);
}

function getPackBuildSignals(definition: ReturnType<typeof getPackDefinition>): string[] {
  if (definition.kind === 'standard') return ['补牌/增强', '构筑牌堆'];
  if (definition.kind === 'planet') return ['牌型升级', '稳定成长'];
  if (definition.kind === 'tarot') return ['删牌/复制/改造', '支撑流派'];
  if (definition.kind === 'joker') return ['找核心小丑', '满槽需腾位'];
  return ['高风险高收益', '立即改变牌堆'];
}

function getVoucherBuildSignals(definition: ReturnType<typeof getVoucherDefinition>): string[] {
  if (definition.effects.some((effect) => effect.type === 'extra_joker_slot')) return ['增加小丑上限', '放大构筑空间'];
  if (definition.effects.some((effect) => effect.type === 'extra_consumable_slot')) return ['增加消耗牌槽', '更好存牌'];
  if (definition.effects.some((effect) => effect.type === 'reroll_discount' || effect.type === 'shop_discount' || effect.type === 'pack_discount')) return ['降低商店压力'];
  if (definition.effects.some((effect) => effect.type === 'extra_hand_per_blind' || effect.type === 'extra_discard_per_blind' || effect.type === 'extra_hand_size')) return ['提高操作容错'];
  return ['长期收益', '立即生效'];
}

function getShopOfferBuildSignals(offer: ShopItem, game: GameState): string[] {
  if (!offer.definitionId) {
    return ['未知商品'];
  }

  if (offer.kind === 'joker') {
    return getJokerBuildSignals(getJokerDefinition(offer.definitionId), game);
  }

  if (offer.kind === 'consumable') {
    return getConsumableBuildSignals(getConsumableDefinition(offer.definitionId), game);
  }

  if (offer.kind === 'pack') {
    return getPackBuildSignals(getPackDefinition(offer.definitionId));
  }

  return getVoucherBuildSignals(getVoucherDefinition(offer.definitionId));
}

function getShopDecisionCards(game: GameState, shopLocked: boolean) {
  const buyableCount = game.shopOffers.filter((offer) => !getShopOfferBlockReason(offer, game, shopLocked)).length;
  const currentInterest = calculateInterest(game.money);
  const nextInterestAt = currentInterest >= MAX_INTEREST_PAYOUT ? null : (currentInterest + 1) * INTEREST_MONEY_STEP;
  const upgradedHands = getUpgradedHandNames(game);

  return [
    {
      label: '可买商品',
      value: game.packChoices.length > 0 ? '开包中' : `${buyableCount}/${game.shopOffers.length}`,
      detail:
        game.packChoices.length > 0
          ? '先完成当前补充包选择。'
          : buyableCount > 0
            ? '优先看能立即补强的牌。'
            : '可以卖小丑、保钱或进下一盲注。',
      tone: buyableCount > 0 && game.packChoices.length === 0 ? 'good' : 'warning'
    },
    {
      label: '槽位压力',
      value: `${game.jokers.length}/${game.jokerSlots} 小丑 · ${game.consumables.length}/${game.consumableSlots} 消耗`,
      detail: game.jokers.length >= game.jokerSlots || game.consumables.length >= game.consumableSlots ? '满槽会阻止购买或开包。' : '还有空间继续构筑。',
      tone: game.jokers.length >= game.jokerSlots || game.consumables.length >= game.consumableSlots ? 'warning' : 'neutral'
    },
    {
      label: '利息取舍',
      value: `$${currentInterest}`,
      detail: nextInterestAt ? `保到 $${nextInterestAt} 可多拿 1 利息。` : '利息已到本局上限。',
      tone: 'money'
    },
    {
      label: '当前方向',
      value: upgradedHands.length > 0 ? upgradedHands.join(' / ') : '未定型',
      detail: upgradedHands.length > 0 ? '商店优先补强这些牌型。' : '小丑和星球会决定第一条路线。',
      tone: upgradedHands.length > 0 ? 'good' : 'neutral'
    }
  ];
}

function ShopSignalList({ signals }: { signals: string[] }) {
  if (signals.length === 0) {
    return null;
  }

  return (
    <div className="shop-signal-list" aria-label="构筑提示">
      {signals.map((signal) => (
        <span key={signal}>{signal}</span>
      ))}
    </div>
  );
}

function ShopOfferCard({
  offer,
  game,
  actionDisabled,
  onBuy,
  onInspect
}: {
  offer: ShopItem;
  game: GameState;
  actionDisabled: boolean;
  onBuy: () => void;
  onInspect: () => void;
}) {
  const offerDetail = getShopOfferDetail(offer);
  const offerHint = getShopOfferHint(offer, game);
  const buildSignals = getShopOfferBuildSignals(offer, game);
  const flowNote = getShopOfferFlowNote(offer, game);

  if (offer.kind === 'pack') {
    const definition = getPackDefinition(offer.definitionId);
    const disabledReason = getShopOfferBlockReason(offer, game, actionDisabled);
    const disabled = Boolean(disabledReason);
    const blockedLabel =
      definition.kind === 'joker' && game.jokers.length >= game.jokerSlots
        ? '先卖小丑'
        : (definition.kind === 'planet' || definition.kind === 'tarot') && game.consumables.length >= game.consumableSlots
        ? '槽位已满'
        : game.money < offer.price
        ? '资金不足'
        : '打开';

    return (
      <article className={`shop-slot pack-offer ${definition.kind} ${disabled ? 'blocked' : 'buyable'}`} title={offerDetail} tabIndex={0} onClick={onInspect} onKeyDown={(event) => {
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
        <ShopSignalList signals={buildSignals} />
        {flowNote && <em className="shop-flow-note">{flowNote}</em>}
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
    const disabledReason = getShopOfferBlockReason(offer, game, actionDisabled);
    const disabled = Boolean(disabledReason);

    return (
      <article className={`shop-slot consumable-offer ${definition.kind} ${disabled ? 'blocked' : 'buyable'}`} title={offerDetail} tabIndex={0} onClick={onInspect} onKeyDown={(event) => {
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
        <ShopSignalList signals={buildSignals} />
        {flowNote && <em className="shop-flow-note">{flowNote}</em>}
        {disabledReason && <em className="shop-blocked-reason">{disabledReason}</em>}
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onBuy();
          }}
        >
          {game.consumables.length >= game.consumableSlots ? '槽位已满' : game.money < offer.price ? '资金不足' : '购买'}
        </button>
      </article>
    );
  }

  if (offer.kind === 'voucher') {
    const definition = getVoucherDefinition(offer.definitionId);
    const disabledReason = getShopOfferBlockReason(offer, game, actionDisabled);
    const disabled = Boolean(disabledReason);

    return (
      <article className={`shop-slot voucher-offer ${disabled ? 'blocked' : 'buyable'}`} title={offerDetail} tabIndex={0} onClick={onInspect} onKeyDown={(event) => {
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
        <ShopSignalList signals={buildSignals} />
        {flowNote && <em className="shop-flow-note">{flowNote}</em>}
        {disabledReason && <em className="shop-blocked-reason">{disabledReason}</em>}
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onBuy();
          }}
        >
          {game.money < offer.price ? '资金不足' : '购买'}
        </button>
      </article>
    );
  }

  const definition = getJokerDefinition(offer.definitionId);
  const disabledReason = getShopOfferBlockReason(offer, game, actionDisabled);
  const disabled = Boolean(disabledReason);

  return (
    <article className={`shop-slot ${disabled ? 'blocked' : 'buyable'}`} title={offerDetail} tabIndex={0} onClick={onInspect} onKeyDown={(event) => {
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
      <ShopSignalList signals={buildSignals} />
      {flowNote && <em className="shop-flow-note">{flowNote}</em>}
      {disabledReason && <em className="shop-blocked-reason">{disabledReason}</em>}
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onBuy();
        }}
      >
        {game.jokers.length >= game.jokerSlots ? '槽位已满' : game.money < offer.price ? '资金不足' : '购买'}
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
  const selectedTargetCards = activeDefinition ? getSelectedCards(game) : [];
  const targetProgress = activeDefinition ? getConsumableTargetProgress(activeDefinition, game.selectedCardIds.length) : null;
  const targetCountValid = activeDefinition ? isConsumableTargetCountValid(activeDefinition, game.selectedCardIds.length) : false;
  const targetPreview = activeDefinition ? getConsumableEffectPreview(activeDefinition, selectedTargetCards) : '';
  const targetSelectedLabel =
    selectedTargetCards.length > 0 ? selectedTargetCards.map((card) => formatCard(card)).join('、') : '还没有选择目标牌';
  const targetInstruction = activeDefinition
    ? activeDefinition.target.min === activeDefinition.target.max
      ? `点选 ${activeDefinition.target.min} 张手牌作为目标`
      : `点选 ${activeDefinition.target.min}-${activeDefinition.target.max} 张手牌作为目标`
    : '';

  return (
    <section className={`play-zone ${activeDefinition ? 'targeting-mode' : ''}`}>
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
        <div className={`target-banner ${targetCountValid ? 'valid' : 'invalid'}`}>
          <div>
            <span>目标选择模式</span>
            <strong>{targetProgress?.label}</strong>
            <p>
              {targetInstruction}。{activeDefinition.description}
            </p>
          </div>
          <div className="target-preview-grid">
            <small>目标牌：{targetSelectedLabel}</small>
            <small>结果预览：{targetPreview}</small>
            <small>{targetProgress?.detail}</small>
          </div>
        </div>
      )}

      <div className="hand-row" aria-label="手牌">
        {game.hand.map((card) => {
          const selected = game.selectedCardIds.includes(card.id);
          const lockedByTargetLimit = Boolean(activeDefinition && !selected && game.selectedCardIds.length >= selectionLimit);
          const targetState = activeDefinition ? (selected ? 'selected' : lockedByTargetLimit ? 'locked' : 'eligible') : null;

          return (
            <GameCard
              key={card.id}
              card={card}
              selected={selected}
              disabled={game.phase !== 'playing' || lockedByTargetLimit}
              hidden={isCardHiddenByBoss(game, card)}
              targetState={targetState}
              onClick={() => onToggleCard(card.id)}
            />
          );
        })}
      </div>

      {activeDefinition &&
        createPortal(
          <div className={`action-row target-action-row ${targetCountValid ? 'valid' : 'invalid'}`}>
            <span className="target-action-note">{targetCountValid ? targetPreview : targetProgress?.detail}</span>
            <button type="button" disabled={!targetCountValid} onClick={onConfirmConsumable}>
              {targetCountValid ? `确认使用 ${activeDefinition.name}` : targetProgress?.label}
            </button>
            <button type="button" className="secondary-action" onClick={onCancelConsumable}>
              取消目标
            </button>
          </div>,
          document.body
        )}

      {!activeDefinition && (
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
      )}
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
  const tutorialTip = useMemo(() => getActiveTutorialTip(game, profile), [game, profile]);
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
    if (appScreen !== 'game' || game.packChoices.length === 0) {
      return;
    }

    setActiveOverlay(null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [appScreen, game.packChoices.length]);

  useEffect(() => {
    if (appScreen !== 'game') {
      return;
    }

    if (game.packChoices.length > 0) {
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
  }, [appScreen, game.phase, game.packChoices.length]);

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

  function dismissTutorialTip(id: TutorialTipId) {
    setProfile((current) =>
      updateProfileSettings(current, {
        tutorialDismissed: [...current.settings.tutorialDismissed, id]
      })
    );
  }

  function dismissAllTutorialTips() {
    setProfile((current) =>
      updateProfileSettings(current, {
        tutorialDismissed: ALL_TUTORIAL_TIP_IDS
      })
    );
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
            onInspect={setInspectTarget}
          />
        )}
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

        <TutorialHint tip={tutorialTip} onDismiss={dismissTutorialTip} onDismissAll={dismissAllTutorialTips} />

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
        <ProfilePanel profile={profile} onInspect={setInspectTarget} />
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

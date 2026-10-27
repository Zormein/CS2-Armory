import React, { useEffect, useRef, useState } from 'react';
import { OwnedSkinItem, OwnedStickerItem, UnboxOutcome } from '../types/cs2';
import { calculateItemValuation } from '../game/rules';
import { ItemArtwork, SpecialMysteryTileArtwork } from './ItemArtwork';
import { soundEngine } from '../utils/audio';

interface UnboxReelProps {
  outcome: UnboxOutcome;
  fastAnimation?: boolean;
  onAnimationComplete: (outcome: UnboxOutcome) => void;
  onKeepAndClose: () => void;
  onOpenAnother: () => void;
  onQuickSellReward: (outcome: UnboxOutcome, creditAmount: number) => void;
  onInspectSkin?: (skin: OwnedSkinItem) => void;
}

const TILE_WIDTH_PX = 168;
const TILE_GAP_PX = 10;
const TILE_STEP_PX = TILE_WIDTH_PX + TILE_GAP_PX;

export const UnboxReel: React.FC<UnboxReelProps> = ({
  outcome,
  fastAnimation = false,
  onAnimationComplete,
  onKeepAndClose,
  onOpenAnother,
  onQuickSellReward,
  onInspectSkin,
}) => {
  const [phase, setPhase] = useState<'SPINNING' | 'REVEALED'>('SPINNING');
  const [translateX, setTranslateX] = useState<number>(0);
  const [soldThisOutcome, setSoldThisOutcome] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const completedRef = useRef(false);

  const durationMs = fastAnimation ? 1400 : 4900;

  useEffect(() => {
    completedRef.current = false;
    setSoldThisOutcome(false);
    setPhase('SPINNING');
    setTranslateX(0);

    soundEngine.playCaseLatchSound();

    const viewportWidth = viewportRef.current?.clientWidth || 860;
    const centerOffset = viewportWidth / 2 - TILE_WIDTH_PX / 2;
    // Deterministic sub-tile landing jitter within safe center zone (-26px..+26px) so it always lands inside the winning tile
    const jitterSeed = (outcome.winningIndex * 17) % 36 - 18;
    const targetX = -(outcome.winningIndex * TILE_STEP_PX - centerOffset + jitterSeed);

    let rafId = 0;
    let lastTickTile = 0;
    const startTime = performance.now();

    // Start CSS transform on next frame
    const startTimer = window.setTimeout(() => {
      setTranslateX(targetX);
    }, 30);

    // Track virtual position for synchronized audio ticks
    const tickLoop = (now: number) => {
      const elapsed = Math.min(1, (now - startTime) / durationMs);
      // Cubic bezier approximation matching (0.08, 0.82, 0.14, 1)
      const eased = 1 - Math.pow(1 - elapsed, 3.6);
      const currentDist = Math.abs(targetX) * eased;
      const currentTileIndex = Math.floor((currentDist + viewportWidth / 2) / TILE_STEP_PX);

      if (currentTileIndex > lastTickTile && currentTileIndex <= outcome.winningIndex + 2) {
        lastTickTile = currentTileIndex;
        const speedRemaining = Math.max(0.1, 1 - elapsed);
        soundEngine.playReelTickSound(speedRemaining);
      }

      if (elapsed < 1) {
        rafId = requestAnimationFrame(tickLoop);
      }
    };
    rafId = requestAnimationFrame(tickLoop);

    const endTimer = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      setPhase('REVEALED');
      if (outcome.rewardType === 'SKIN' && outcome.skinReward) {
        soundEngine.playRevealSound(outcome.skinReward.rarity, outcome.skinReward.isSpecialItem);
      } else if (outcome.rewardType === 'STICKER' && outcome.stickerReward) {
        soundEngine.playRevealSound(outcome.stickerReward.rarity, false);
      }
      onAnimationComplete(outcome);
    }, durationMs + 100);

    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(endTimer);
      cancelAnimationFrame(rafId);
    };
  }, [outcome, durationMs, onAnimationComplete]);

  const skinReward: OwnedSkinItem | undefined = outcome.skinReward;
  const stickerReward: OwnedStickerItem | undefined = outcome.stickerReward;
  const skinValuation = skinReward ? calculateItemValuation(skinReward) : null;
  const rewardCrValue = skinValuation
    ? skinValuation.totalEstimatedCr
    : stickerReward
    ? stickerReward.price
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Opening ${outcome.containerName}`}
    >
      <div className="w-full max-w-5xl rounded-xl border border-slate-700/80 bg-[#11161f] shadow-2xl overflow-hidden">
        {/* Top status header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0d1117]">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 font-medium">
              {phase === 'SPINNING' ? 'Unlocking Container...' : 'Container Unlocked — Verified Reward'}
            </p>
            <h2 className="font-display text-2xl font-bold tracking-wide text-slate-100">
              {outcome.containerName}
            </h2>
          </div>
          <div className="text-right font-mono text-xs text-slate-400 tabular-nums">
            {phase === 'SPINNING' ? 'REEL ACTIVE' : 'REWARD CREDITED TO INVENTORY'}
          </div>
        </div>

        {/* Horizontal CS2 Reel Viewport */}
        <div className="p-6 bg-[#0b0f16] border-b border-slate-800/80">
          <div
            ref={viewportRef}
            data-testid="cs2-unbox-reel-viewport"
            className="relative w-full h-44 rounded-lg border border-slate-700/90 bg-[#090d13] overflow-hidden shadow-inner"
          >
            {/* Left & Right vignette fades */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-[#090d13] to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-[#090d13] to-transparent" />

            {/* Authentic CS2 Center Golden Selection Marker Line */}
            <div
              className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 z-20 bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.95)]"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 z-20 w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[9px] border-t-amber-400"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 z-20 w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-b-[9px] border-b-amber-400"
              aria-hidden="true"
            />

            {/* Moving Horizontal Reel Track */}
            <div
              className="flex items-center h-full px-0 will-change-transform"
              style={{
                gap: `${TILE_GAP_PX}px`,
                transform: `translate3d(${translateX}px, 0, 0)`,
                transitionProperty: 'transform',
                transitionDuration: translateX === 0 ? '0ms' : `${durationMs}ms`,
                transitionTimingFunction: 'cubic-bezier(0.08, 0.82, 0.14, 1)',
              }}
            >
              {outcome.reelTiles.map((tile, idx) => (
                <div
                  key={tile.tileId}
                  data-winning-tile={idx === outcome.winningIndex ? 'true' : undefined}
                  style={{
                    width: `${TILE_WIDTH_PX}px`,
                    minWidth: `${TILE_WIDTH_PX}px`,
                  }}
                  className="relative h-36 rounded bg-[#141b26] border border-slate-700/60 overflow-hidden flex flex-col justify-between select-none"
                >
                  {/* Subtle top glow from rarity color */}
                  <div
                    className="w-full flex-1 flex items-center justify-center p-3"
                    style={{
                      background: `radial-gradient(circle at 50% 65%, ${tile.rarityColor}28 0%, rgba(15,23,42,0) 75%)`,
                    }}
                  >
                    {tile.isSpecialMystery ? (
                      /* Knives & Gloves show ONLY ★ SPECIAL ITEM ★ during spin — no name/finish/model! */
                      <SpecialMysteryTileArtwork />
                    ) : (
                      /* Ordinary skins/stickers show ONLY their image and rarity bar during spin! */
                      <ItemArtwork
                        src={tile.image}
                        alt="Reel Item"
                        rarityColor={tile.rarityColor}
                        className="w-full h-24 object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.65)]"
                      />
                    )}
                  </div>

                  {/* Authentic CS2 Bottom Rarity Color Strip */}
                  <div
                    className="h-2 w-full shrink-0"
                    style={{ backgroundColor: tile.rarityColor }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Post-Spin Inspection Reveal Area */}
        {phase === 'SPINNING' ? (
          <div className="p-8 text-center bg-[#11161f]">
            <p className="text-sm text-slate-300 font-medium">
              Decelerating horizontal reel... Item identity, wear condition, float, and pattern will be revealed upon stop.
            </p>
          </div>
        ) : (
          <div
            data-testid="unbox-reveal-panel"
            className="p-6 md:p-8 bg-[#11161f] animate-fadeIn"
          >
            {skinReward && skinValuation && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                {/* Left: Weapon Reveal Artwork Showcase */}
                <div
                  className="lg:col-span-5 rounded-xl border p-6 flex flex-col items-center justify-center relative overflow-hidden"
                  style={{
                    borderColor: `${skinReward.rarityColor}88`,
                    background: `radial-gradient(circle at 50% 50%, ${skinReward.rarityColor}30 0%, #0d1219 80%)`,
                  }}
                >
                  <div className="w-full flex items-center justify-between text-xs font-mono text-slate-300 mb-2">
                    <span>{skinReward.rarity.toUpperCase()}</span>
                    <span>SEED #{skinReward.patternSeed}</span>
                  </div>
                  <div className="w-full h-48 flex items-center justify-center my-2">
                    <ItemArtwork
                      src={skinReward.image}
                      alt={skinReward.name}
                      category={skinReward.category}
                      rarityColor={skinReward.rarityColor}
                      className="max-h-44 w-auto object-contain drop-shadow-[0_14px_24px_rgba(0,0,0,0.75)]"
                    />
                  </div>
                  {/* Pre-applied Souvenir Gold Stickers preview if Souvenir */}
                  {skinReward.isSouvenir && (
                    <div className="w-full mt-3 pt-3 border-t border-amber-500/30 flex items-center justify-between text-xs text-amber-300">
                      <span>Souvenir Commemorative Gold Stickers Applied (4/4)</span>
                      <span className="font-mono">{skinReward.souvenirTournament}</span>
                    </div>
                  )}
                </div>

                {/* Right: Complete Item Metadata & Evidence-Based Valuation */}
                <div className="lg:col-span-7 space-y-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-1">
                      <span>{skinReward.collectionName}</span>
                      <span aria-hidden="true">·</span>
                      <span>Released {skinReward.releaseDate}</span>
                      {skinReward.patternInfo.tierLabel && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span
                            className="font-semibold"
                            style={{ color: skinReward.patternInfo.badgeColor || '#38bdf8' }}
                          >
                            {skinReward.patternInfo.tierLabel}
                          </span>
                        </>
                      )}
                    </div>
                    <h3
                      className="font-display text-3xl font-bold tracking-tight"
                      style={{ color: skinReward.isSpecialItem ? '#ffd700' : '#f8fafc' }}
                    >
                      {skinReward.name}
                    </h3>
                    <p className="text-sm text-slate-300 mt-0.5">
                      Condition: <strong className="text-white">{skinReward.wear}</strong> · Float:{' '}
                      <span className="font-mono text-amber-300 tabular-nums">
                        {skinReward.floatValue.toFixed(8)}
                      </span>{' '}
                      <span className="text-xs text-slate-400 font-mono">
                        (Cap {skinReward.minFloat.toFixed(2)}–{skinReward.maxFloat.toFixed(2)})
                      </span>
                    </p>
                  </div>

                  {/* Visual Float Spectrum Bar */}
                  <div className="space-y-1">
                    <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-slate-800 border border-slate-700 relative">
                      <div className="h-full bg-emerald-500/80" style={{ width: '7%' }} title="Factory New (0.00 - 0.07)" />
                      <div className="h-full bg-lime-500/80" style={{ width: '8%' }} title="Minimal Wear (0.07 - 0.15)" />
                      <div className="h-full bg-amber-400/80" style={{ width: '23%' }} title="Field-Tested (0.15 - 0.38)" />
                      <div className="h-full bg-orange-500/80" style={{ width: '7%' }} title="Well-Worn (0.38 - 0.45)" />
                      <div className="h-full bg-rose-600/80" style={{ width: '55%' }} title="Battle-Scarred (0.45 - 1.00)" />
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_6px_#fff]"
                        style={{ left: `${Math.min(99, Math.max(0.5, skinReward.floatValue * 100))}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                      <span>0.00 FN</span>
                      <span>0.07 MW</span>
                      <span>0.15 FT</span>
                      <span>0.38 WW</span>
                      <span>0.45 BS</span>
                      <span>1.00</span>
                    </div>
                  </div>

                  {/* Evidence-Based Valuation Box */}
                  <div className="rounded-lg border border-slate-800 bg-[#0d1117] p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-800/80 pb-3">
                      <div>
                        <span className="text-xs text-slate-400 block">
                          Evidence-Based Market Estimate (1 CR = €1 ref)
                        </span>
                        <span className="font-mono text-2xl font-bold text-emerald-400 tabular-nums">
                          {skinValuation.totalEstimatedCr.toFixed(2)} CR
                        </span>
                      </div>
                      <div className="text-right font-mono text-xs text-slate-400 tabular-nums">
                        <div>Completed Sales Median: {skinValuation.completedSalesMedianCr.toFixed(2)} CR</div>
                        <div>Active Listings Floor: {skinValuation.activeListingsFloorCr.toFixed(2)} CR</div>
                      </div>
                    </div>
                    <div className="mt-2.5 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2">
                      <span>Source: {skinValuation.source}</span>
                      <span>Verified: {skinValuation.updatedAt} · Confidence: {skinValuation.confidence}</span>
                    </div>
                    {skinReward.patternInfo.evidenceNote && (
                      <p className="mt-2 text-xs text-sky-300 font-medium">
                        {skinReward.patternInfo.evidenceNote}
                      </p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={onOpenAnother}
                      className="px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Open Another (Free)
                    </button>
                    {!skinReward.isSpecialItem && onInspectSkin && !soldThisOutcome && (
                      <button
                        type="button"
                        onClick={() => onInspectSkin(skinReward)}
                        className="px-4 py-2.5 rounded-lg border border-slate-600 hover:border-slate-400 bg-slate-800/70 text-slate-100 font-medium text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Inspect & Apply Stickers
                      </button>
                    )}
                    {!soldThisOutcome ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSoldThisOutcome(true);
                          onQuickSellReward(outcome, rewardCrValue);
                        }}
                        className="px-4 py-2.5 rounded-lg border border-emerald-500/50 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-medium text-sm font-mono tabular-nums transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Sell Item (+{rewardCrValue.toFixed(2)} CR)
                      </button>
                    ) : (
                      <span className="px-3 py-2 text-xs font-mono text-emerald-400">
                        Sold for +{rewardCrValue.toFixed(2)} CR
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={onKeepAndClose}
                      className="ml-auto px-4 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Close Reveal
                    </button>
                  </div>
                </div>
              </div>
            )}

            {stickerReward && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                <div
                  className="lg:col-span-5 rounded-xl border p-6 flex flex-col items-center justify-center"
                  style={{
                    borderColor: `${stickerReward.rarityColor}88`,
                    background: `radial-gradient(circle at 50% 50%, ${stickerReward.rarityColor}30 0%, #0d1219 80%)`,
                  }}
                >
                  <span className="text-xs font-mono text-slate-300 uppercase mb-2">
                    {stickerReward.rarity}
                  </span>
                  <div className="w-full h-44 flex items-center justify-center">
                    <ItemArtwork
                      src={stickerReward.image}
                      alt={stickerReward.name}
                      rarityColor={stickerReward.rarityColor}
                      className="max-h-40 w-auto object-contain drop-shadow-[0_12px_20px_rgba(0,0,0,0.75)]"
                    />
                  </div>
                </div>

                <div className="lg:col-span-7 space-y-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                      <span>{stickerReward.capsuleName}</span>
                      <span aria-hidden="true">·</span>
                      <span>Released {stickerReward.releaseDate}</span>
                    </div>
                    <h3 className="font-display text-3xl font-bold text-slate-100">
                      {stickerReward.name}
                    </h3>
                    <p className="text-sm text-slate-300 mt-1">
                      Added to your Owned Stickers inventory. You can apply this sticker to any owned weapon skin in the Inventory Inspector.
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-[#0d1117] p-4">
                    <span className="text-xs text-slate-400 block">
                      Verified Sticker Market Reference Value
                    </span>
                    <span className="font-mono text-2xl font-bold text-emerald-400 tabular-nums">
                      {stickerReward.price.toFixed(2)} CR
                    </span>
                    <p className="text-xs text-slate-400 mt-1">
                      Source: {stickerReward.releaseSource} · Steam Community Market Median (2026-10-27)
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={onOpenAnother}
                      className="px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Open Another Capsule (Free)
                    </button>
                    {!soldThisOutcome ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSoldThisOutcome(true);
                          onQuickSellReward(outcome, stickerReward.price);
                        }}
                        className="px-4 py-2.5 rounded-lg border border-emerald-500/50 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-medium text-sm font-mono tabular-nums transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Sell Sticker (+{stickerReward.price.toFixed(2)} CR)
                      </button>
                    ) : (
                      <span className="px-3 py-2 text-xs font-mono text-emerald-400">
                        Sold for +{stickerReward.price.toFixed(2)} CR
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={onKeepAndClose}
                      className="ml-auto px-4 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Close Reveal
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { OwnedSkinItem, OwnedStickerItem } from '../types/cs2';
import { calculateItemValuation, STICKER_SLOT_LABELS } from '../game/rules';
import { ItemArtwork } from './ItemArtwork';

interface InspectModalProps {
  skin: OwnedSkinItem;
  ownedStickers: OwnedStickerItem[];
  onClose: () => void;
  onApplySticker: (
    skinInstanceId: string,
    stickerInstanceId: string,
    slotIndex: 0 | 1 | 2 | 3 | 4
  ) => void;
  onScrapeSticker: (skinInstanceId: string, slotIndex: 0 | 1 | 2 | 3 | 4) => void;
  onSellSkin: (skinInstanceId: string, creditAmount: number) => void;
}

export const InspectModal: React.FC<InspectModalProps> = ({
  skin,
  ownedStickers,
  onClose,
  onApplySticker,
  onScrapeSticker,
  onSellSkin,
}) => {
  const [selectedSlot, setSelectedSlot] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [selectedStickerInstanceId, setSelectedStickerInstanceId] = useState<string>(
    ownedStickers[0]?.instanceId || ''
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const valuation = calculateItemValuation(skin);
  const canApplyStickers =
    !skin.isSpecialItem && skin.category !== 'Knives' && skin.category !== 'Gloves';

  const handleApplyClick = () => {
    const stickerIdToUse = selectedStickerInstanceId || ownedStickers[0]?.instanceId;
    if (!stickerIdToUse) {
      setStatusMessage('No owned stickers available. Open a Sticker Capsule for free or purchase a sticker in the Store.');
      return;
    }
    if (skin.appliedStickers[selectedSlot] !== null) {
      setStatusMessage(`Slot ${selectedSlot + 1} (${STICKER_SLOT_LABELS[selectedSlot]}) already has a sticker. Scrape it first.`);
      return;
    }
    onApplySticker(skin.instanceId, stickerIdToUse, selectedSlot);
    setStatusMessage(`Applied sticker to Slot ${selectedSlot + 1} (${STICKER_SLOT_LABELS[selectedSlot]}).`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Inspecting ${skin.name}`}
    >
      <div className="w-full max-w-5xl rounded-xl border border-slate-700 bg-[#11161f] shadow-2xl overflow-hidden my-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0d1117]">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>{skin.collectionName}</span>
              <span aria-hidden="true">·</span>
              <span>Released {skin.releaseDate}</span>
              <span aria-hidden="true">·</span>
              <span>{skin.rarity}</span>
            </div>
            <h2
              className="font-display text-2xl md:text-3xl font-bold tracking-wide mt-0.5"
              style={{ color: skin.isSpecialItem ? '#ffd700' : '#f8fafc' }}
            >
              {skin.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
          >
            Close Inspector
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left column: Panorama Inspection Stage + 5-Slot Sticker Positions */}
          <div className="lg:col-span-6 space-y-5">
            <div
              className="rounded-xl border p-6 flex flex-col items-center justify-between min-h-[290px] relative"
              style={{
                borderColor: `${skin.rarityColor}80`,
                background: `radial-gradient(circle at 50% 45%, ${skin.rarityColor}2c 0%, #0b0f16 80%)`,
              }}
            >
              <div className="w-full flex items-center justify-between text-xs font-mono text-slate-300 tabular-nums">
                <span>FLOAT: {skin.floatValue.toFixed(8)}</span>
                <span>PATTERN SEED: #{skin.patternSeed}</span>
              </div>

              <div className="my-4 w-full h-48 flex items-center justify-center">
                <ItemArtwork
                  src={skin.image}
                  alt={skin.name}
                  category={skin.category}
                  rarityColor={skin.rarityColor}
                  className="max-h-44 w-auto object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,0.85)]"
                />
              </div>

              {/* Applied Stickers Bar on Weapon Stage */}
              <div className="w-full pt-3 border-t border-slate-800/80">
                <p className="text-[11px] font-mono text-slate-400 uppercase mb-2">
                  Weapon Sticker Positions (5 Supported Slots)
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {([0, 1, 2, 3, 4] as const).map(slotIdx => {
                    const applied = skin.appliedStickers[slotIdx];
                    const isSelected = selectedSlot === slotIdx;
                    return (
                      <div
                        key={slotIdx}
                        onClick={() => setSelectedSlot(slotIdx)}
                        className={`rounded-lg border p-2 flex flex-col items-center justify-between transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-amber-400 bg-amber-500/10'
                            : 'border-slate-800 bg-[#0d1117] hover:border-slate-700'
                        }`}
                      >
                        <span className="text-[10px] font-mono text-slate-400">
                          Slot {slotIdx + 1}
                        </span>
                        {applied ? (
                          <>
                            <div className="w-10 h-10 my-1 flex items-center justify-center">
                              <ItemArtwork
                                src={applied.image}
                                alt={applied.name}
                                rarityColor={applied.rarityColor}
                                className="w-9 h-9 object-contain"
                              />
                            </div>
                            <span
                              className="text-[10px] text-slate-200 truncate w-full text-center"
                              title={applied.name}
                            >
                              {applied.name.replace('Sticker | ', '')}
                            </span>
                            {!applied.isSouvenirGold && (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  onScrapeSticker(skin.instanceId, slotIdx);
                                  setStatusMessage(`Scraped and removed sticker from Slot ${slotIdx + 1}.`);
                                }}
                                className="mt-1 text-[10px] text-rose-400 hover:text-rose-300 underline cursor-pointer"
                              >
                                Scrape
                              </button>
                            )}
                          </>
                        ) : (
                          <div className="h-14 flex items-center justify-center text-[11px] text-slate-500">
                            Empty
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Sticker Application Workbench */}
            {canApplyStickers ? (
              <div className="rounded-xl border border-slate-800 bg-[#0d1117] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Sticker Application Workbench — Target: Slot {selectedSlot + 1} ({STICKER_SLOT_LABELS[selectedSlot]})
                  </h3>
                  <span className="text-xs font-mono text-slate-400 tabular-nums">
                    Owned Stickers: {ownedStickers.length}
                  </span>
                </div>

                {ownedStickers.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    You do not have any unapplied stickers in your inventory yet. Open any Sticker Capsule for free or purchase individual verified stickers in the Store tab.
                  </p>
                ) : (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <label htmlFor="inspect-sticker-select" className="sr-only">
                      Select Owned Sticker to Apply
                    </label>
                    <select
                      id="inspect-sticker-select"
                      value={selectedStickerInstanceId || ownedStickers[0]?.instanceId || ''}
                      onChange={e => setSelectedStickerInstanceId(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-700 bg-[#141b26] px-3 py-2 text-xs text-slate-100"
                    >
                      {ownedStickers.map(st => (
                        <option key={st.instanceId} value={st.instanceId}>
                          {st.name} · ({st.rarity} · Ref {st.price.toFixed(2)} CR)
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleApplyClick}
                      className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                    >
                      Apply to Slot {selectedSlot + 1}
                    </button>
                  </div>
                )}

                {statusMessage && (
                  <p className="text-xs text-amber-300 font-medium">{statusMessage}</p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-[#0d1117] p-4 text-xs text-slate-400">
                Counter-Strike 2 item rules: Knives and Gloves do not support sticker customization.
              </div>
            )}
          </div>

          {/* Right column: Wear & Pattern Telemetry + Evidence-Based Market Valuation Breakdown */}
          <div className="lg:col-span-6 space-y-5">
            <div className="rounded-xl border border-slate-800 bg-[#0d1117] p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-100">
                Finish Telemetry & Pattern Classification
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-[#141b26] border border-slate-800">
                  <span className="text-slate-400 block">Wear Rating</span>
                  <span className="font-semibold text-slate-100 mt-0.5 block">{skin.wear}</span>
                </div>
                <div className="p-3 rounded-lg bg-[#141b26] border border-slate-800">
                  <span className="text-slate-400 block">IEEE-754 Float</span>
                  <span className="font-mono text-amber-300 tabular-nums mt-0.5 block">
                    {skin.floatValue.toFixed(8)}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-[#141b26] border border-slate-800">
                  <span className="text-slate-400 block">Float Range Cap</span>
                  <span className="font-mono text-slate-200 tabular-nums mt-0.5 block">
                    {skin.minFloat.toFixed(2)} – {skin.maxFloat.toFixed(2)}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-[#141b26] border border-slate-800">
                  <span className="text-slate-400 block">Pattern Template</span>
                  <span className="font-mono text-slate-100 tabular-nums mt-0.5 block">
                    Seed #{skin.patternSeed}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-[#141b26] border border-slate-800 col-span-2">
                  <span className="text-slate-400 block">Pattern Classification</span>
                  <span
                    className="font-semibold mt-0.5 block"
                    style={{ color: skin.patternInfo.badgeColor || '#e2e8f0' }}
                  >
                    {skin.patternInfo.tierLabel || 'Standard Finish Distribution'}
                  </span>
                </div>
              </div>
              {skin.patternInfo.evidenceNote && (
                <p className="text-xs text-sky-300 bg-sky-950/40 border border-sky-800/50 rounded-lg p-3">
                  {skin.patternInfo.evidenceNote}
                </p>
              )}
            </div>

            {/* Evidence-Based Valuation Breakdown */}
            <div className="rounded-xl border border-slate-800 bg-[#0d1117] p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Evidence-Based Valuation Breakdown
                  </h3>
                  <p className="text-xs text-slate-400">
                    Reference: 1.00 CR = €1.00 (In-game non-redeemable currency)
                  </p>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <span className="text-xs text-slate-400 block">Estimated Total</span>
                  <span className="text-2xl font-bold text-emerald-400">
                    {valuation.totalEstimatedCr.toFixed(2)} CR
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-xs font-mono tabular-nums">
                <div className="flex justify-between text-slate-300">
                  <span>Baseline {skin.wear} Price:</span>
                  <span>{valuation.baseWearPrice.toFixed(2)} CR</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Float Rank Factor ({skin.floatValue.toFixed(4)}):</span>
                  <span>×{valuation.floatAdjustment.toFixed(2)}</span>
                </div>
                {skin.isStatTrak && (
                  <div className="flex justify-between text-amber-300">
                    <span>StatTrak™ Counter Multiplier:</span>
                    <span>×{valuation.stattrakMultiplier.toFixed(2)}</span>
                  </div>
                )}
                {skin.isSouvenir && (
                  <div className="flex justify-between text-amber-300">
                    <span>Souvenir Commemorative Edition Multiplier:</span>
                    <span>×{valuation.souvenirMultiplier.toFixed(2)}</span>
                  </div>
                )}
                {valuation.patternMultiplier > 1 && (
                  <div className="flex justify-between text-sky-300">
                    <span>Rare Pattern Multiplier ({valuation.patternTierLabel}):</span>
                    <span>×{valuation.patternMultiplier.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-300 pt-1 border-t border-slate-800/80">
                  <span>
                    Applied Sticker Craft Overpay ({valuation.appliedStickerRatePct}% SP — never 100% raw sticker cost):
                  </span>
                  <span className="text-emerald-300">+{valuation.appliedStickerBonus.toFixed(2)} CR</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800 text-xs font-mono tabular-nums">
                <div className="p-2.5 rounded bg-[#141b26]">
                  <span className="text-slate-400 block">Completed Sales Median</span>
                  <span className="text-slate-100 font-semibold">
                    {valuation.completedSalesMedianCr.toFixed(2)} CR
                  </span>
                </div>
                <div className="p-2.5 rounded bg-[#141b26]">
                  <span className="text-slate-400 block">Active Listings Floor</span>
                  <span className="text-slate-100 font-semibold">
                    {valuation.activeListingsFloorCr.toFixed(2)} CR
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 flex flex-wrap justify-between gap-2">
                <span>Source: {valuation.source}</span>
                <span>Updated: {valuation.updatedAt} · Confidence: {valuation.confidence}</span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onSellSkin(skin.instanceId, valuation.totalEstimatedCr);
                    onClose();
                  }}
                  className="px-4 py-2.5 rounded-lg border border-emerald-500/50 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-mono text-xs font-semibold tabular-nums transition-colors cursor-pointer"
                >
                  Sell Item for +{valuation.totalEstimatedCr.toFixed(2)} CR
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import { CatalogSkin, OwnedSkinItem } from '../types/cs2';
import {
  calculateItemValuation,
  getWearShortCode,
  validateTradeUpContract,
} from '../game/rules';
import { ItemArtwork } from './ItemArtwork';

interface TradeUpViewProps {
  ownedSkins: OwnedSkinItem[];
  allSkinsByCollection: Map<string, CatalogSkin[]>;
  onExecuteContract: (selectedInstanceIds: string[]) => OwnedSkinItem | null;
  onInspectSkin: (skin: OwnedSkinItem) => void;
}

const ELIGIBLE_RARITIES = [
  'Consumer Grade',
  'Industrial Grade',
  'Mil-Spec Grade',
  'Restricted',
  'Classified',
];

export const TradeUpView: React.FC<TradeUpViewProps> = ({
  ownedSkins,
  allSkinsByCollection,
  onExecuteContract,
  onInspectSkin,
}) => {
  const [selectedRarity, setSelectedRarity] = useState<string>('Mil-Spec Grade');
  const [statTrakMode, setStatTrakMode] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [craftedSkinResult, setCraftedSkinResult] = useState<OwnedSkinItem | null>(null);

  // Filter inventory items that are eligible for the chosen rarity + StatTrak mode
  const eligibleInventory = useMemo(() => {
    return ownedSkins.filter(item => {
      if (item.isSouvenir || item.isSpecialItem) return false;
      if (item.rarity !== selectedRarity) return false;
      if (item.isStatTrak !== statTrakMode) return false;
      const colPool = allSkinsByCollection.get(item.collectionName) || [];
      return colPool.length > 0;
    });
  }, [ownedSkins, selectedRarity, statTrakMode, allSkinsByCollection]);

  const selectedItems = useMemo(() => {
    return selectedIds
      .map(id => ownedSkins.find(s => s.instanceId === id))
      .filter((s): s is OwnedSkinItem => Boolean(s));
  }, [selectedIds, ownedSkins]);

  const validation = useMemo(() => {
    return validateTradeUpContract(selectedItems, allSkinsByCollection);
  }, [selectedItems, allSkinsByCollection]);

  const toggleSelectSkin = (instanceId: string) => {
    setCraftedSkinResult(null);
    setSelectedIds(prev => {
      if (prev.includes(instanceId)) {
        return prev.filter(id => id !== instanceId);
      }
      if (prev.length >= 10) return prev;
      return [...prev, instanceId];
    });
  };

  const handleAutoFill10 = () => {
    setCraftedSkinResult(null);
    const first10 = eligibleInventory.slice(0, 10).map(i => i.instanceId);
    setSelectedIds(first10);
  };

  const handleExecute = () => {
    if (!validation.valid) return;
    const result = onExecuteContract(selectedIds);
    if (result) {
      setCraftedSkinResult(result);
      setSelectedIds([]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-slate-100">
            CS2 Trade-Up Contract Exchange
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Exchange 10 owned skins of identical rarity (Consumer Grade through Classified, non-Souvenir) for 1 skin of the next rarity tier from the input collections. Output float follows official IEEE-754 trade-up math.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="tradeup-rarity-select" className="sr-only">
            Select Trade-Up Rarity Tier
          </label>
          <select
            id="tradeup-rarity-select"
            value={selectedRarity}
            onChange={e => {
              setSelectedRarity(e.target.value);
              setSelectedIds([]);
              setCraftedSkinResult(null);
            }}
            className="rounded-lg border border-slate-700 bg-[#0d1117] px-3 py-2 text-xs text-slate-100"
          >
            {ELIGIBLE_RARITIES.map(r => (
              <option key={r} value={r}>
                Input Tier: {r}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setStatTrakMode(m => !m);
              setSelectedIds([]);
              setCraftedSkinResult(null);
            }}
            className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
              statTrakMode
                ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                : 'border-slate-700 bg-[#0d1117] text-slate-300'
            }`}
          >
            {statTrakMode ? 'Mode: StatTrak™ Only' : 'Mode: Normal Only'}
          </button>

          <button
            type="button"
            disabled={eligibleInventory.length < 10}
            onClick={handleAutoFill10}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold text-slate-100 transition-colors cursor-pointer"
          >
            Auto-Fill 10 Eligible ({eligibleInventory.length} available)
          </button>
        </div>
      </div>

      {/* Crafted Result Banner if just executed */}
      {craftedSkinResult && (
        <div className="rounded-xl border border-emerald-500/60 bg-emerald-950/20 p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-20 h-16 rounded-lg bg-[#0d1117] border border-slate-800 p-1.5 flex items-center justify-center">
              <ItemArtwork
                src={craftedSkinResult.image}
                alt={craftedSkinResult.name}
                rarityColor={craftedSkinResult.rarityColor}
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <span className="text-xs font-mono text-emerald-400 uppercase font-semibold">
                Trade-Up Contract Fulfilled
              </span>
              <h2 className="font-display text-2xl font-bold text-white">
                {craftedSkinResult.name} ({craftedSkinResult.wear})
              </h2>
              <p className="text-xs font-mono text-slate-300 tabular-nums">
                Output Float: {craftedSkinResult.floatValue.toFixed(8)} · Collection: {craftedSkinResult.collectionName} · Est. Value:{' '}
                {calculateItemValuation(craftedSkinResult).totalEstimatedCr.toFixed(2)} CR
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onInspectSkin(craftedSkinResult)}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition-colors cursor-pointer"
          >
            Inspect Crafted Skin
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: 10 Contract Slots & Outcome Preview */}
        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-xl border border-slate-800 bg-[#11161f] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">
                Contract Input Slots ({selectedItems.length} / 10 Selected)
              </h2>
              {selectedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                >
                  Clear Slots
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {Array.from({ length: 10 }, (_, idx) => {
                const item = selectedItems[idx];
                return (
                  <div
                    key={idx}
                    onClick={() => item && toggleSelectSkin(item.instanceId)}
                    className={`h-32 rounded-lg border p-2 flex flex-col justify-between transition-colors ${
                      item
                        ? 'border-slate-700 bg-[#0d1117] hover:border-rose-500/60 cursor-pointer'
                        : 'border-dashed border-slate-800 bg-[#0b0f16] text-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span>#{idx + 1}</span>
                      {item && <span>{item.floatValue.toFixed(4)}</span>}
                    </div>
                    {item ? (
                      <>
                        <div className="h-14 flex items-center justify-center">
                          <ItemArtwork
                            src={item.image}
                            alt={item.name}
                            rarityColor={item.rarityColor}
                            className="max-h-12 w-auto object-contain"
                          />
                        </div>
                        <div className="text-[10px] text-slate-200 truncate" title={item.name}>
                          {item.name}
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-[11px]">
                        Empty Slot
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Outcome Calculation Summary */}
            <div className="rounded-lg border border-slate-800 bg-[#0d1117] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-300">
                  {validation.valid
                    ? `Ready: 10 ${selectedRarity} items → 1 ${validation.targetRarity} reward`
                    : validation.error}
                </span>
                {validation.avgFloat !== undefined && (
                  <span className="font-mono text-xs text-amber-300 tabular-nums">
                    Avg Input Float: {validation.avgFloat.toFixed(8)}
                  </span>
                )}
              </div>

              {validation.possibleOutcomes.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <span className="text-[11px] font-mono text-slate-400 uppercase block">
                    Verified Possible Outcomes ({validation.possibleOutcomes.length})
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {validation.possibleOutcomes.map(out => (
                      <div
                        key={out.skin.id}
                        className="p-2 rounded bg-[#141b26] border border-slate-800 flex items-center gap-2.5 text-xs"
                      >
                        <div className="w-10 h-8 shrink-0 flex items-center justify-center">
                          <ItemArtwork
                            src={out.skin.image}
                            alt={out.skin.name}
                            rarityColor={out.skin.rarityColor}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-100 truncate">
                            {out.skin.name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                            {getWearShortCode(out.outputWear)} ({out.outputFloat.toFixed(5)})
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  disabled={!validation.valid}
                  onClick={handleExecute}
                  className={`px-5 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                    validation.valid
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  Sign & Execute Trade-Up Contract
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Eligible Owned Skins Selector */}
        <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#11161f] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">
              Eligible {selectedRarity} Inventory ({eligibleInventory.length})
            </h2>
            <span className="text-xs text-slate-400">Click to add/remove</span>
          </div>

          {eligibleInventory.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-lg">
              You have 0 eligible {statTrakMode ? 'StatTrak™ ' : ''}{selectedRarity} skins in your inventory. Open Weapon Cases for free in the Unbox tab to collect skins for Trade-Up Contracts!
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[520px] overflow-y-auto pr-1">
              {eligibleInventory.map(item => {
                const isSelected = selectedIds.includes(item.instanceId);
                return (
                  <button
                    key={item.instanceId}
                    type="button"
                    onClick={() => toggleSelectSkin(item.instanceId)}
                    className={`p-3 rounded-lg border text-left transition-colors flex items-center gap-3 cursor-pointer ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/15'
                        : 'border-slate-800 bg-[#0d1117] hover:border-slate-700'
                    }`}
                  >
                    <div className="w-12 h-10 shrink-0 flex items-center justify-center">
                      <ItemArtwork
                        src={item.image}
                        alt={item.name}
                        rarityColor={item.rarityColor}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-100 truncate">
                        {item.name}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                        {getWearShortCode(item.wear)} · {item.floatValue.toFixed(5)}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {item.collectionName}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import {
  CatalogSkin,
  CatalogSticker,
  WeaponCaseContainer,
  WeaponCollection,
  WearCondition,
} from '../types/cs2';
import {
  getWearShortCode,
  matchesSearchQuery,
  sortByRarity,
  sortByReleaseDate,
} from '../game/rules';
import { ItemArtwork } from './ItemArtwork';

interface CollectionsStoreViewProps {
  balanceCr: number;
  weaponCollections: WeaponCollection[];
  weaponCases: WeaponCaseContainer[];
  stickers: CatalogSticker[];
  onBuySkin: (skin: CatalogSkin, wear: WearCondition, priceCr: number) => void;
  onBuySticker: (sticker: CatalogSticker) => void;
  onJumpToOpenContainer?: (containerName: string) => void;
}

const WEAR_OPTIONS: WearCondition[] = [
  'Factory New',
  'Minimal Wear',
  'Field-Tested',
  'Well-Worn',
  'Battle-Scarred',
];

function isWearSupported(skin: CatalogSkin, wear: WearCondition): boolean {
  const ranges: Record<WearCondition, [number, number]> = {
    'Factory New': [0.0, 0.07],
    'Minimal Wear': [0.07, 0.15],
    'Field-Tested': [0.15, 0.38],
    'Well-Worn': [0.38, 0.45],
    'Battle-Scarred': [0.45, 1.0],
  };
  const [lo, hi] = ranges[wear];
  return skin.minFloat < hi && skin.maxFloat > lo;
}

export const CollectionsStoreView: React.FC<CollectionsStoreViewProps> = ({
  balanceCr,
  weaponCollections,
  weaponCases,
  stickers,
  onBuySkin,
  onBuySticker,
  onJumpToOpenContainer,
}) => {
  const [storeSection, setStoreSection] = useState<'COLLECTIONS' | 'STICKERS'>('COLLECTIONS');
  const [collectionScope, setCollectionScope] = useState<'BASELINE_49' | 'ALL_52_NON_CASE' | 'CASE_42'>('BASELINE_49');
  const [dateOrder, setDateOrder] = useState<'newest' | 'oldest'>('newest');
  const [rarityOrder, setRarityOrder] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');
  const [selectedWearBySkin, setSelectedWearBySkin] = useState<Record<string, WearCondition>>({});

  // Sticker filters
  const [stickerSearch, setStickerSearch] = useState('');
  const [stickerRarityFilter, setStickerRarityFilter] = useState<string>('ALL');
  const [stickerSort, setStickerSort] = useState<'newest' | 'oldest' | 'rarity_desc' | 'price_asc' | 'price_desc'>('price_desc');
  const [stickerPage, setStickerPage] = useState(1);
  const STICKERS_PER_PAGE = 36;

  // Synthesize Case Collections when viewing the 42 Case Collections
  const synthesizedCaseCollections: WeaponCollection[] = useMemo(() => {
    return weaponCases.map(c => ({
      id: `case-col-${c.id}`,
      name: c.collectionName,
      releaseDate: c.releaseDate,
      releaseSource: c.releaseSource,
      isBaseline49: false,
      era: 'Weapon Case Collection',
      image: c.image,
      souvenirPackages: [c.name],
      contains: c.contains,
    }));
  }, [weaponCases]);

  const filteredCollections = useMemo(() => {
    let base: WeaponCollection[] = [];
    if (collectionScope === 'BASELINE_49') {
      base = weaponCollections.filter(c => c.isBaseline49);
    } else if (collectionScope === 'ALL_52_NON_CASE') {
      base = weaponCollections;
    } else {
      base = synthesizedCaseCollections;
    }

    const q = searchQuery.trim();
    if (q) {
      base = base.filter(
        c =>
          matchesSearchQuery(`${c.name} ${c.era} ${c.releaseDate}`, q) ||
          c.contains.some(s => matchesSearchQuery(s.name, q))
      );
    }

    return sortByReleaseDate(base, dateOrder);
  }, [weaponCollections, synthesizedCaseCollections, collectionScope, searchQuery, dateOrder]);

  const activeCollection = useMemo(() => {
    if (selectedCollectionId) {
      const found = filteredCollections.find(c => c.id === selectedCollectionId);
      if (found) return found;
    }
    return filteredCollections[0] || null;
  }, [filteredCollections, selectedCollectionId]);

  const sortedActiveSkins = useMemo(() => {
    if (!activeCollection) return [];
    const q = searchQuery.trim();
    let list = activeCollection.contains;
    if (q && !matchesSearchQuery(activeCollection.name, q)) {
      const matching = list.filter(s => matchesSearchQuery(s.name, q));
      if (matching.length > 0) list = matching;
    }
    return sortByRarity(list, rarityOrder);
  }, [activeCollection, rarityOrder, searchQuery]);

  // Stickers filtering & sorting
  const filteredStickers = useMemo(() => {
    let list = stickers;
    const q = stickerSearch.trim();
    if (q) {
      list = list.filter(s =>
        matchesSearchQuery(`${s.name} ${s.capsuleName} ${s.releaseDate} ${s.rarity}`, q)
      );
    }
    if (stickerRarityFilter !== 'ALL') {
      list = list.filter(s => s.rarity === stickerRarityFilter);
    }

    if (stickerSort === 'newest' || stickerSort === 'oldest') {
      return sortByReleaseDate(list, stickerSort);
    }
    if (stickerSort === 'rarity_desc') {
      return sortByRarity(list, 'desc');
    }
    if (stickerSort === 'price_asc') {
      return [...list].sort((a, b) => a.price - b.price);
    }
    return [...list].sort((a, b) => b.price - a.price);
  }, [stickers, stickerSearch, stickerRarityFilter, stickerSort]);

  const totalStickerPages = Math.max(1, Math.ceil(filteredStickers.length / STICKERS_PER_PAGE));
  const visibleStickers = filteredStickers.slice(
    (stickerPage - 1) * STICKERS_PER_PAGE,
    stickerPage * STICKERS_PER_PAGE
  );

  return (
    <div className="space-y-6">
      {/* Top Sub-Navigation & Balance Info */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-slate-100">
            CS2 Collections Catalog & Verified Item Store
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Browse all 49 baseline weapon skin collections (52 total non-case collections + 42 case collections) and {stickers.length.toLocaleString()} individually purchasable stickers (including Katowice 2014 Titan Holo &amp; iBUYPOWER Holo).
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[#0d1117] p-1 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setStoreSection('COLLECTIONS')}
            className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              storeSection === 'COLLECTIONS'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Weapon Skin Collections (49 Baseline)
          </button>
          <button
            type="button"
            onClick={() => setStoreSection('STICKERS')}
            className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              storeSection === 'STICKERS'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Individual Stickers Shop ({stickers.length.toLocaleString()})
          </button>
        </div>
      </div>

      {storeSection === 'COLLECTIONS' ? (
        <div className="space-y-5">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#11161f] p-4 rounded-xl border border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCollectionScope('BASELINE_49');
                  setSelectedCollectionId('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  collectionScope === 'BASELINE_49'
                    ? 'bg-slate-100 text-slate-950 font-semibold'
                    : 'bg-[#0d1117] text-slate-300 border border-slate-700 hover:border-slate-500'
                }`}
              >
                49 Baseline Collections
              </button>
              <button
                type="button"
                onClick={() => {
                  setCollectionScope('ALL_52_NON_CASE');
                  setSelectedCollectionId('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  collectionScope === 'ALL_52_NON_CASE'
                    ? 'bg-slate-100 text-slate-950 font-semibold'
                    : 'bg-[#0d1117] text-slate-300 border border-slate-700 hover:border-slate-500'
                }`}
              >
                All 52 Map / Operation / Armory Collections
              </button>
              <button
                type="button"
                onClick={() => {
                  setCollectionScope('CASE_42');
                  setSelectedCollectionId('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  collectionScope === 'CASE_42'
                    ? 'bg-slate-100 text-slate-950 font-semibold'
                    : 'bg-[#0d1117] text-slate-300 border border-slate-700 hover:border-slate-500'
                }`}
              >
                42 Weapon Case Collections
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="collection-search-input" className="sr-only">
                Search collections or skins
              </label>
              <input
                id="collection-search-input"
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search collection or weapon skin..."
                className="w-60 rounded-lg border border-slate-700 bg-[#0d1117] px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
              />

              <label htmlFor="collection-date-sort" className="sr-only">
                Sort collections by release date
              </label>
              <select
                id="collection-date-sort"
                value={dateOrder}
                onChange={e => setDateOrder(e.target.value as 'newest' | 'oldest')}
                className="rounded-lg border border-slate-700 bg-[#0d1117] px-3 py-1.5 text-xs text-slate-200"
              >
                <option value="newest">Release Date: Newest First</option>
                <option value="oldest">Release Date: Oldest First</option>
              </select>

              <label htmlFor="skin-rarity-sort" className="sr-only">
                Sort collection skins by rarity
              </label>
              <select
                id="skin-rarity-sort"
                value={rarityOrder}
                onChange={e => setRarityOrder(e.target.value as 'asc' | 'desc')}
                className="rounded-lg border border-slate-700 bg-[#0d1117] px-3 py-1.5 text-xs text-slate-200"
              >
                <option value="asc">Rarity: Consumer → Covert</option>
                <option value="desc">Rarity: Covert → Consumer</option>
              </select>
            </div>
          </div>

          {/* Split Master-Detail Layout: Left Collection Selector (49 Baseline), Right Skins Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Sidebar: Collections List */}
            <div className="lg:col-span-4 rounded-xl border border-slate-800 bg-[#11161f] overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-[#0d1117] flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">
                  Verified Collections ({filteredCollections.length})
                </span>
                <span className="text-[11px] font-mono text-slate-400">YYYY-MM-DD</span>
              </div>
              <div className="max-h-[680px] overflow-y-auto divide-y divide-slate-800/70">
                {filteredCollections.map((col, idx) => {
                  const isSelected = activeCollection?.id === col.id;
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => setSelectedCollectionId(col.id)}
                      className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/15 text-white'
                          : 'hover:bg-slate-800/40 text-slate-300'
                      }`}
                    >
                      <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded bg-[#0d1117] border border-slate-800 p-1">
                        <ItemArtwork
                          src={col.image}
                          alt={col.name}
                          category="Crate"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold truncate">
                            {idx + 1}. {col.name}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">
                            {col.releaseDate}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <span>{col.contains.length} skins</span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{col.era}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Area: Active Collection Details & Purchasable Skins */}
            <div className="lg:col-span-8 space-y-4">
              {activeCollection ? (
                <>
                  <div className="rounded-xl border border-slate-800 bg-[#11161f] p-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-lg bg-[#0d1117] border border-slate-800 p-2 flex items-center justify-center shrink-0">
                        <ItemArtwork
                          src={activeCollection.image}
                          alt={activeCollection.name}
                          category="Crate"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span>Verified Release: {activeCollection.releaseDate}</span>
                          <span aria-hidden="true">·</span>
                          <span>{activeCollection.era}</span>
                          <span aria-hidden="true">·</span>
                          <span>{activeCollection.contains.length} Skins</span>
                        </div>
                        <h2 className="font-display text-2xl font-bold text-white mt-0.5">
                          {activeCollection.name}
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Source: {activeCollection.releaseSource}
                        </p>
                      </div>
                    </div>

                    {activeCollection.souvenirPackages.length > 0 && onJumpToOpenContainer && (
                      <button
                        type="button"
                        onClick={() => onJumpToOpenContainer(activeCollection.souvenirPackages[0])}
                        className="px-3.5 py-2 rounded-lg border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Open {activeCollection.souvenirPackages[0]} (Free)
                      </button>
                    )}
                  </div>

                  {/* Skins Grid in Active Collection */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {sortedActiveSkins.map(skin => {
                      const supportedWears = WEAR_OPTIONS.filter(w => isWearSupported(skin, w));
                      const activeWear =
                        selectedWearBySkin[skin.id] && supportedWears.includes(selectedWearBySkin[skin.id])
                          ? selectedWearBySkin[skin.id]
                          : supportedWears.includes('Field-Tested')
                          ? 'Field-Tested'
                          : supportedWears[0] || 'Field-Tested';

                      const wearKey = getWearShortCode(activeWear).toLowerCase() as
                        | 'fn'
                        | 'mw'
                        | 'ft'
                        | 'ww'
                        | 'bs';
                      const priceCr = skin.prices[wearKey] || skin.prices.ft;
                      const canAfford = balanceCr >= priceCr;

                      return (
                        <div
                          key={skin.id}
                          className="rounded-xl border border-slate-800 bg-[#11161f] overflow-hidden flex flex-col justify-between"
                        >
                          <div>
                            <div
                              className="p-4 flex flex-col items-center justify-center relative h-40"
                              style={{
                                background: `radial-gradient(circle at 50% 60%, ${skin.rarityColor}26 0%, #0d1117 80%)`,
                              }}
                            >
                              <div className="w-full flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
                                <span style={{ color: skin.rarityColor }}>{skin.rarity}</span>
                                <span>
                                  {skin.minFloat.toFixed(2)}–{skin.maxFloat.toFixed(2)}
                                </span>
                              </div>
                              <ItemArtwork
                                src={skin.image}
                                alt={skin.name}
                                category={skin.category}
                                rarityColor={skin.rarityColor}
                                className="max-h-28 w-auto object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.75)]"
                              />
                            </div>
                            <div
                              className="h-1.5 w-full"
                              style={{ backgroundColor: skin.rarityColor }}
                            />
                          </div>

                          <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                            <div>
                              <h3 className="text-sm font-semibold text-slate-100 truncate" title={skin.name}>
                                {skin.name}
                              </h3>
                              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                                {skin.collectionName} · {skin.releaseDate}
                              </p>
                            </div>

                            {/* Wear Condition Selector */}
                            <div className="flex items-center gap-1">
                              {supportedWears.map(w => {
                                const code = getWearShortCode(w);
                                const isSel = activeWear === w;
                                return (
                                  <button
                                    key={w}
                                    type="button"
                                    onClick={() =>
                                      setSelectedWearBySkin(prev => ({ ...prev, [skin.id]: w }))
                                    }
                                    className={`px-2 py-1 rounded text-[10px] font-mono font-semibold transition-colors cursor-pointer ${
                                      isSel
                                        ? 'bg-slate-200 text-slate-950'
                                        : 'bg-[#0d1117] text-slate-400 hover:text-slate-200 border border-slate-800'
                                    }`}
                                    title={w}
                                  >
                                    {code}
                                  </button>
                                );
                              })}
                            </div>

                            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                              <div className="font-mono tabular-nums">
                                <span className="text-[10px] text-slate-400 block">
                                  {getWearShortCode(activeWear)} Estimate
                                </span>
                                <span className="text-sm font-bold text-emerald-400">
                                  {priceCr.toFixed(2)} CR
                                </span>
                              </div>
                              <button
                                type="button"
                                disabled={!canAfford}
                                onClick={() => onBuySkin(skin, activeWear, priceCr)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                                  canAfford
                                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                }`}
                              >
                                {canAfford ? `Buy ${getWearShortCode(activeWear)}` : 'Need CR'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-[#11161f] p-8 text-center text-sm text-slate-400">
                  No collections match your current search filter.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* INDIVIDUAL VERIFIED STICKERS STORE */
        <div className="space-y-5">
          <div className="bg-[#11161f] p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="sticker-store-search" className="sr-only">
                  Search verified stickers
                </label>
                <input
                  id="sticker-store-search"
                  type="search"
                  value={stickerSearch}
                  onChange={e => {
                    setStickerSearch(e.target.value);
                    setStickerPage(1);
                  }}
                  placeholder="Search sticker, team, or event (e.g. Titan Holo, iBUYPOWER, Katowice 2014)..."
                  className="w-80 rounded-lg border border-slate-700 bg-[#0d1117] px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
                />

                <label htmlFor="sticker-rarity-filter" className="sr-only">
                  Filter stickers by rarity
                </label>
                <select
                  id="sticker-rarity-filter"
                  value={stickerRarityFilter}
                  onChange={e => {
                    setStickerRarityFilter(e.target.value);
                    setStickerPage(1);
                  }}
                  className="rounded-lg border border-slate-700 bg-[#0d1117] px-3 py-1.5 text-xs text-slate-200"
                >
                  <option value="ALL">All Sticker Rarities</option>
                  <option value="High Grade">High Grade (Blue)</option>
                  <option value="Remarkable">Remarkable (Purple / Glitter)</option>
                  <option value="Exotic">Exotic (Pink / Holo)</option>
                  <option value="Extraordinary">Extraordinary (Red / Foil / Gold)</option>
                  <option value="Contraband">Contraband (Howling Dawn)</option>
                </select>

                <label htmlFor="sticker-sort-select" className="sr-only">
                  Sort stickers
                </label>
                <select
                  id="sticker-sort-select"
                  value={stickerSort}
                  onChange={e => {
                    setStickerSort(
                      e.target.value as
                        | 'newest'
                        | 'oldest'
                        | 'rarity_desc'
                        | 'price_asc'
                        | 'price_desc'
                    );
                    setStickerPage(1);
                  }}
                  className="rounded-lg border border-slate-700 bg-[#0d1117] px-3 py-1.5 text-xs text-slate-200"
                >
                  <option value="price_desc">Price: Highest First (Katowice 2014 Holos Top)</option>
                  <option value="price_asc">Price: Lowest First</option>
                  <option value="newest">Release Date: Newest First</option>
                  <option value="oldest">Release Date: Oldest First</option>
                  <option value="rarity_desc">Rarity: Extraordinary → High Grade</option>
                </select>
              </div>

              <div className="text-xs font-mono text-slate-400 tabular-nums">
                Showing {visibleStickers.length} of {filteredStickers.length} verified stickers
              </div>
            </div>

            {/* Quick Spotlight Filters for Iconic Series */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/70">
              <span className="text-[11px] font-mono text-slate-400 mr-1">Quick Filter:</span>
              {[
                { label: 'All Stickers', query: '' },
                { label: 'Titan Holo', query: 'Titan Holo' },
                { label: 'Katowice 2014', query: 'Katowice 2014' },
                { label: 'Katowice 2015', query: 'Katowice 2015' },
                { label: 'Crown & Howling Dawn', query: 'Crown' },
                { label: 'Austin 2025', query: 'Austin 2025' },
                { label: 'Cologne 2026', query: 'Cologne 2026' },
              ].map(preset => {
                const isActive = stickerSearch.trim().toLowerCase() === preset.query.toLowerCase();
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setStickerSearch(preset.query);
                      setStickerPage(1);
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'bg-[#0d1117] text-slate-300 border border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {visibleStickers.map(sticker => {
              const canAfford = balanceCr >= sticker.price;
              return (
                <div
                  key={sticker.id}
                  className="rounded-xl border border-slate-800 bg-[#11161f] overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div
                      className="p-4 h-36 flex flex-col items-center justify-center"
                      style={{
                        background: `radial-gradient(circle at 50% 55%, ${sticker.rarityColor}26 0%, #0d1117 80%)`,
                      }}
                    >
                      <div className="w-full flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                        <span style={{ color: sticker.rarityColor }}>{sticker.rarity}</span>
                        <span>{sticker.releaseDate}</span>
                      </div>
                      <ItemArtwork
                        src={sticker.image}
                        alt={sticker.name}
                        rarityColor={sticker.rarityColor}
                        className="max-h-24 w-auto object-contain drop-shadow"
                      />
                    </div>
                    <div className="h-1 w-full" style={{ backgroundColor: sticker.rarityColor }} />
                  </div>

                  <div className="p-3.5 space-y-2.5 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-slate-100 truncate" title={sticker.name}>
                        {sticker.name}
                      </h3>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5" title={sticker.capsuleName}>
                        {sticker.capsuleName}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-bold text-emerald-400 tabular-nums">
                        {sticker.price.toFixed(2)} CR
                      </span>
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => onBuySticker(sticker)}
                        aria-label={`Buy ${sticker.name} for ${sticker.price.toFixed(2)} CR`}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          canAfford
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {canAfford ? `Buy Sticker (${sticker.price.toFixed(2)} CR)` : 'Need CR'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalStickerPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                disabled={stickerPage <= 1}
                onClick={() => setStickerPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-700 bg-[#11161f] text-xs text-slate-200 disabled:opacity-40 cursor-pointer"
              >
                Previous Page
              </button>
              <span className="text-xs font-mono text-slate-400 tabular-nums">
                Page {stickerPage} of {totalStickerPages}
              </span>
              <button
                type="button"
                disabled={stickerPage >= totalStickerPages}
                onClick={() => setStickerPage(p => Math.min(totalStickerPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-700 bg-[#11161f] text-xs text-slate-200 disabled:opacity-40 cursor-pointer"
              >
                Next Page
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

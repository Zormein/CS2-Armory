import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import rawCatalog from './data/catalogData.json';
import {
  AuditEntry,
  CatalogSkin,
  CatalogSticker,
  OpenableContainer,
  OwnedSkinItem,
  OwnedStickerItem,
  SouvenirContainer,
  StickerCapsuleContainer,
  UnboxOutcome,
  WeaponCaseContainer,
  WeaponCollection,
  WearCondition,
} from './types/cs2';
import {
  applyStickerToSkin,
  calculateItemValuation,
  classifyPattern,
  executeTradeUpContract,
  generateBoundedFloat,
  generateContainerUnboxOutcome,
  getWearShortCode,
  matchesSearchQuery,
  RARITY_HEX_COLORS,
  scrapeStickerFromSkin,
  sortByRarity,
  sortByReleaseDate,
} from './game/rules';
import { soundEngine } from './utils/audio';
import { ItemArtwork, SpecialMysteryTileArtwork } from './components/ItemArtwork';
import { UnboxReel } from './components/UnboxReel';
import { InspectModal } from './components/InspectModal';
import { CollectionsStoreView } from './components/CollectionsStoreView';
import { TradeUpView } from './components/TradeUpModal';
import { AuditReportView } from './components/AuditReportView';

const STORAGE_KEY = 'cs2_armory_sim_state_v1';

interface PersistedSimulatorState {
  balanceCr: number;
  ownedSkins: OwnedSkinItem[];
  ownedStickers: OwnedStickerItem[];
  stats: {
    casesOpened: number;
    souvenirsOpened: number;
    capsulesOpened: number;
    tradeUpsCompleted: number;
  };
}

const INITIAL_PERSISTED_STATE: PersistedSimulatorState = {
  // Player strictly starts with ZERO CR and an EMPTY inventory per specification
  balanceCr: 0,
  ownedSkins: [],
  ownedStickers: [],
  stats: {
    casesOpened: 0,
    souvenirsOpened: 0,
    capsulesOpened: 0,
    tradeUpsCompleted: 0,
  },
};

type ActiveTab = 'UNBOX' | 'INVENTORY' | 'STORE' | 'TRADEUP' | 'AUDIT';

export default function App() {
  const catalog = rawCatalog as unknown as {
    weaponCases: WeaponCaseContainer[];
    weaponCollections: WeaponCollection[];
    souvenirPackages: SouvenirContainer[];
    stickerCapsules: StickerCapsuleContainer[];
    stickers: CatalogSticker[];
    auditReport: AuditEntry[];
  };

  // Check ?autostart=1 for instant entry into playing state
  const [gameState, setGameState] = useState<'title' | 'playing'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') return 'playing';
    }
    return 'title';
  });

  // Load persisted state (defaults strictly to 0.00 CR and 0 items)
  const [simState, setSimState] = useState<PersistedSimulatorState>(() => {
    if (typeof window === 'undefined') return INITIAL_PERSISTED_STATE;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return INITIAL_PERSISTED_STATE;
      const parsed = JSON.parse(raw);
      return {
        balanceCr: typeof parsed.balanceCr === 'number' && parsed.balanceCr >= 0 ? Number(parsed.balanceCr.toFixed(2)) : 0,
        ownedSkins: Array.isArray(parsed.ownedSkins) ? parsed.ownedSkins : [],
        ownedStickers: Array.isArray(parsed.ownedStickers) ? parsed.ownedStickers : [],
        stats: parsed.stats || INITIAL_PERSISTED_STATE.stats,
      };
    } catch {
      return INITIAL_PERSISTED_STATE;
    }
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.dataset.state = gameState;
    }
  }, [gameState]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(simState));
      } catch {
        // Ignore storage quota errors
      }
    }
  }, [simState]);

  // Title screen keyboard start listener (Enter / Space)
  const startSimulator = useCallback(() => {
    if (typeof document !== 'undefined') {
      document.body.dataset.state = 'playing';
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
    setGameState('playing');
  }, []);

  useEffect(() => {
    if (gameState !== 'title') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        startSimulator();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState, startSimulator]);

  const [activeTab, setActiveTab] = useState<ActiveTab>('UNBOX');
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.65);
  const [fastSpin, setFastSpin] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Unbox container browser state
  const [containerCategory, setContainerCategory] = useState<'Case' | 'Souvenir' | 'Sticker Capsule'>('Case');
  const [containerSortOrder, setContainerSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [containerSearch, setContainerSearch] = useState('');
  const [selectedContainerId, setSelectedContainerId] = useState<string>('');
  const [showSpecialPoolDetails, setShowSpecialPoolDetails] = useState(false);
  const [contentRaritySort, setContentRaritySort] = useState<'asc' | 'desc'>('asc');

  // Opening lock & modal state
  const [activeUnboxOutcome, setActiveUnboxOutcome] = useState<UnboxOutcome | null>(null);
  const isOpeningRef = useRef(false);
  const creditedOutcomeIdsRef = useRef<Set<string>>(new Set());

  // Inventory filters & inspector modal
  const [inventorySubTab, setInventorySubTab] = useState<'SKINS' | 'STICKERS'>('SKINS');
  const [invSearch, setInvSearch] = useState('');
  const [invRarityFilter, setInvRarityFilter] = useState('ALL');
  const [invSortBy, setInvSortBy] = useState<'newest' | 'rarity_desc' | 'rarity_asc' | 'value_desc' | 'float_asc'>('newest');
  const [groupByCollection, setGroupByCollection] = useState(false);
  const [inspectingSkinId, setInspectingSkinId] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 3500);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  // Build collection lookup map for Trade-Up Contracts
  const allSkinsByCollection = useMemo(() => {
    const map = new Map<string, CatalogSkin[]>();
    for (const col of catalog.weaponCollections) {
      map.set(col.name, col.contains);
    }
    for (const c of catalog.weaponCases) {
      map.set(c.collectionName, c.contains);
    }
    return map;
  }, [catalog.weaponCollections, catalog.weaponCases]);

  // Filter & sort openable containers (Cases, Souvenir Packages, Sticker Capsules)
  const filteredContainers: OpenableContainer[] = useMemo(() => {
    let base: OpenableContainer[] = [];
    if (containerCategory === 'Case') base = catalog.weaponCases;
    else if (containerCategory === 'Souvenir') base = catalog.souvenirPackages;
    else base = catalog.stickerCapsules;

    const q = containerSearch.trim();
    if (q) {
      base = base.filter(c => {
        if (matchesSearchQuery(`${c.name} ${c.releaseDate}`, q)) return true;
        return c.contains.some((item: { name: string }) => matchesSearchQuery(item.name, q));
      });
    }

    return sortByReleaseDate(base, containerSortOrder);
  }, [catalog, containerCategory, containerSearch, containerSortOrder]);

  const activeContainer: OpenableContainer | null = useMemo(() => {
    if (selectedContainerId) {
      const found = filteredContainers.find(c => c.id === selectedContainerId);
      if (found) return found;
    }
    return filteredContainers[0] || null;
  }, [filteredContainers, selectedContainerId]);

  const sortedContainerContents = useMemo(() => {
    if (!activeContainer) return [];
    return sortByRarity(activeContainer.contains as { rarity: string; name: string }[], contentRaritySort);
  }, [activeContainer, contentRaritySort]);

  // Trigger container opening (100% Free, double-click guarded)
  const handleStartOpenContainer = useCallback(
    (targetContainer?: OpenableContainer) => {
      const container = targetContainer || activeContainer;
      if (!container || isOpeningRef.current) return;
      isOpeningRef.current = true;
      const outcome = generateContainerUnboxOutcome(container);
      setActiveUnboxOutcome(outcome);
    },
    [activeContainer]
  );

  // Commit unboxed reward to inventory exactly once when reel animation completes
  const handleUnboxAnimationComplete = useCallback((outcome: UnboxOutcome) => {
    const uniqueKey = outcome.skinReward?.instanceId || outcome.stickerReward?.instanceId || outcome.containerId;
    if (creditedOutcomeIdsRef.current.has(uniqueKey)) return;
    creditedOutcomeIdsRef.current.add(uniqueKey);

    setSimState(prev => {
      if (outcome.rewardType === 'SKIN' && outcome.skinReward) {
        return {
          ...prev,
          ownedSkins: [outcome.skinReward, ...prev.ownedSkins],
          stats: {
            ...prev.stats,
            casesOpened:
              outcome.containerType === 'Case' ? prev.stats.casesOpened + 1 : prev.stats.casesOpened,
            souvenirsOpened:
              outcome.containerType === 'Souvenir'
                ? prev.stats.souvenirsOpened + 1
                : prev.stats.souvenirsOpened,
          },
        };
      }
      if (outcome.rewardType === 'STICKER' && outcome.stickerReward) {
        return {
          ...prev,
          ownedStickers: [outcome.stickerReward, ...prev.ownedStickers],
          stats: {
            ...prev.stats,
            capsulesOpened: prev.stats.capsulesOpened + 1,
          },
        };
      }
      return prev;
    });
  }, []);

  const handleCloseReelModal = useCallback(() => {
    isOpeningRef.current = false;
    setActiveUnboxOutcome(null);
  }, []);

  const handleOpenAnotherFromModal = useCallback(() => {
    if (!activeContainer) return;
    isOpeningRef.current = true;
    const nextOutcome = generateContainerUnboxOutcome(activeContainer);
    setActiveUnboxOutcome(nextOutcome);
  }, [activeContainer]);

  const handleQuickSellFromReveal = useCallback(
    (outcome: UnboxOutcome, creditAmount: number) => {
      soundEngine.playTransactionSound();
      setSimState(prev => {
        if (outcome.rewardType === 'SKIN' && outcome.skinReward) {
          const exists = prev.ownedSkins.some(s => s.instanceId === outcome.skinReward?.instanceId);
          if (!exists) return prev;
          return {
            ...prev,
            balanceCr: Number((prev.balanceCr + creditAmount).toFixed(2)),
            ownedSkins: prev.ownedSkins.filter(s => s.instanceId !== outcome.skinReward?.instanceId),
          };
        }
        if (outcome.rewardType === 'STICKER' && outcome.stickerReward) {
          const exists = prev.ownedStickers.some(st => st.instanceId === outcome.stickerReward?.instanceId);
          if (!exists) return prev;
          return {
            ...prev,
            balanceCr: Number((prev.balanceCr + creditAmount).toFixed(2)),
            ownedStickers: prev.ownedStickers.filter(
              st => st.instanceId !== outcome.stickerReward?.instanceId
            ),
          };
        }
        return prev;
      });
      showToast(`Sold unboxed item for +${creditAmount.toFixed(2)} CR.`);
    },
    [showToast]
  );

  // Sell skin from inventory
  const handleSellOwnedSkin = useCallback(
    (skinInstanceId: string, creditAmount: number) => {
      soundEngine.playTransactionSound();
      setSimState(prev => {
        const exists = prev.ownedSkins.some(s => s.instanceId === skinInstanceId);
        if (!exists) return prev;
        return {
          ...prev,
          balanceCr: Number((prev.balanceCr + creditAmount).toFixed(2)),
          ownedSkins: prev.ownedSkins.filter(s => s.instanceId !== skinInstanceId),
        };
      });
      showToast(`Sold weapon skin for +${creditAmount.toFixed(2)} CR.`);
    },
    [showToast]
  );

  // Sell unapplied sticker from inventory
  const handleSellOwnedSticker = useCallback(
    (stickerInstanceId: string, creditAmount: number) => {
      soundEngine.playTransactionSound();
      setSimState(prev => {
        const exists = prev.ownedStickers.some(st => st.instanceId === stickerInstanceId);
        if (!exists) return prev;
        return {
          ...prev,
          balanceCr: Number((prev.balanceCr + creditAmount).toFixed(2)),
          ownedStickers: prev.ownedStickers.filter(st => st.instanceId !== stickerInstanceId),
        };
      });
      showToast(`Sold sticker for +${creditAmount.toFixed(2)} CR.`);
    },
    [showToast]
  );

  // Buy collection skin from Store
  const handleBuySkinFromStore = useCallback(
    (skin: CatalogSkin, wear: WearCondition, priceCr: number) => {
      const wearBounds: Record<WearCondition, [number, number]> = {
        'Factory New': [0.0, 0.07],
        'Minimal Wear': [0.07, 0.15],
        'Field-Tested': [0.15, 0.38],
        'Well-Worn': [0.38, 0.45],
        'Battle-Scarred': [0.45, 1.0],
      };
      const [wLo, wHi] = wearBounds[wear];
      const lo = Math.max(skin.minFloat, wLo);
      const hi = Math.min(skin.maxFloat, wHi);
      const floatValue = generateBoundedFloat(lo, Math.max(lo, hi));
      const patternSeed = Math.floor(Math.random() * 1000) + 1;
      const patternInfo = classifyPattern(skin.name, patternSeed);

      let purchased = false;
      setSimState(prev => {
        if (prev.balanceCr < priceCr) return prev;
        purchased = true;
        const newOwned: OwnedSkinItem = {
          instanceId: `store-skin-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
          skinId: skin.id,
          name: skin.name,
          weapon: skin.weapon,
          skinName: skin.skinName,
          category: skin.category,
          rarity: skin.rarity,
          rarityColor: skin.rarityColor || RARITY_HEX_COLORS[skin.rarity] || '#4b69ff',
          isSpecialItem: skin.name.startsWith('★'),
          isStatTrak: false,
          isSouvenir: false,
          floatValue,
          wear,
          patternSeed,
          patternInfo,
          collectionName: skin.collectionName,
          containerName: 'Collection Store',
          releaseDate: skin.releaseDate,
          image: skin.image,
          minFloat: skin.minFloat,
          maxFloat: skin.maxFloat,
          basePrices: skin.prices,
          appliedStickers: [null, null, null, null, null],
          acquiredAt: new Date().toISOString(),
          acquiredVia: 'STORE_PURCHASE',
        };
        return {
          ...prev,
          balanceCr: Number((prev.balanceCr - priceCr).toFixed(2)),
          ownedSkins: [newOwned, ...prev.ownedSkins],
        };
      });

      if (purchased) {
        soundEngine.playTransactionSound();
        showToast(`Purchased ${skin.name} (${getWearShortCode(wear)}) for ${priceCr.toFixed(2)} CR.`);
      }
    },
    [showToast]
  );

  // Buy individual verified sticker from Store
  const handleBuyStickerFromStore = useCallback(
    (sticker: CatalogSticker) => {
      let purchased = false;
      setSimState(prev => {
        if (prev.balanceCr < sticker.price) return prev;
        purchased = true;
        const newSticker: OwnedStickerItem = {
          instanceId: `store-stk-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
          stickerId: sticker.id,
          name: sticker.name,
          rarity: sticker.rarity,
          rarityColor: sticker.rarityColor || RARITY_HEX_COLORS[sticker.rarity] || '#4b69ff',
          capsuleId: sticker.capsuleId,
          capsuleName: sticker.capsuleName,
          releaseDate: sticker.releaseDate,
          releaseSource: sticker.releaseSource,
          image: sticker.image,
          price: sticker.price,
          acquiredAt: new Date().toISOString(),
          acquiredVia: 'STORE_PURCHASE',
        };
        return {
          ...prev,
          balanceCr: Number((prev.balanceCr - sticker.price).toFixed(2)),
          ownedStickers: [newSticker, ...prev.ownedStickers],
        };
      });

      if (purchased) {
        soundEngine.playTransactionSound();
        showToast(`Purchased ${sticker.name} for ${sticker.price.toFixed(2)} CR.`);
      }
    },
    [showToast]
  );

  // Apply owned sticker to owned weapon skin
  const handleApplySticker = useCallback(
    (skinInstanceId: string, stickerInstanceId: string, slotIndex: 0 | 1 | 2 | 3 | 4) => {
      setSimState(prev => {
        const res = applyStickerToSkin(
          prev.ownedSkins,
          prev.ownedStickers,
          skinInstanceId,
          stickerInstanceId,
          slotIndex
        );
        if (!res.ok) return prev;
        soundEngine.playStickerApplySound();
        return {
          ...prev,
          ownedSkins: res.updatedSkins,
          ownedStickers: res.updatedStickers,
        };
      });
    },
    []
  );

  // Scrape sticker from weapon skin
  const handleScrapeSticker = useCallback(
    (skinInstanceId: string, slotIndex: 0 | 1 | 2 | 3 | 4) => {
      setSimState(prev => {
        const res = scrapeStickerFromSkin(prev.ownedSkins, skinInstanceId, slotIndex);
        if (!res.ok) return prev;
        return {
          ...prev,
          ownedSkins: res.updatedSkins,
        };
      });
    },
    []
  );

  // Execute 10-item Trade-Up Contract
  const handleExecuteTradeUp = useCallback(
    (selectedIds: string[]): OwnedSkinItem | null => {
      let crafted: OwnedSkinItem | null = null;
      setSimState(prev => {
        const res = executeTradeUpContract(prev.ownedSkins, selectedIds, allSkinsByCollection);
        if (!res.ok || !res.rewardSkin) return prev;
        crafted = res.rewardSkin;
        soundEngine.playRevealSound(res.rewardSkin.rarity, false);
        return {
          ...prev,
          ownedSkins: res.updatedSkins,
          stats: {
            ...prev.stats,
            tradeUpsCompleted: prev.stats.tradeUpsCompleted + 1,
          },
        };
      });
      if (crafted) {
        showToast(`Trade-Up Contract completed! Crafted ${(crafted as OwnedSkinItem).name}.`);
      }
      return crafted;
    },
    [allSkinsByCollection, showToast]
  );

  // Filtered & sorted inventory items
  const filteredOwnedSkins = useMemo(() => {
    let list = simState.ownedSkins;
    const q = invSearch.trim();
    if (q) {
      list = list.filter(s =>
        matchesSearchQuery(`${s.name} ${s.collectionName} ${s.wear}`, q)
      );
    }
    if (invRarityFilter !== 'ALL') {
      if (invRarityFilter === 'Special Item') {
        list = list.filter(s => s.isSpecialItem);
      } else {
        list = list.filter(s => s.rarity === invRarityFilter && !s.isSpecialItem);
      }
    }

    if (invSortBy === 'rarity_desc') return sortByRarity(list, 'desc');
    if (invSortBy === 'rarity_asc') return sortByRarity(list, 'asc');
    if (invSortBy === 'float_asc') return [...list].sort((a, b) => a.floatValue - b.floatValue);
    if (invSortBy === 'value_desc') {
      return [...list].sort(
        (a, b) =>
          calculateItemValuation(b).totalEstimatedCr - calculateItemValuation(a).totalEstimatedCr
      );
    }
    return list;
  }, [simState.ownedSkins, invSearch, invRarityFilter, invSortBy]);

  const totalInventoryValuationCr = useMemo(() => {
    const skinsVal = simState.ownedSkins.reduce(
      (sum, s) => sum + calculateItemValuation(s).totalEstimatedCr,
      0
    );
    const stickersVal = simState.ownedStickers.reduce((sum, st) => sum + st.price, 0);
    return Number((skinsVal + stickersVal).toFixed(2));
  }, [simState.ownedSkins, simState.ownedStickers]);

  const inspectingSkin = useMemo(() => {
    if (!inspectingSkinId) return null;
    return simState.ownedSkins.find(s => s.instanceId === inspectingSkinId) || null;
  }, [inspectingSkinId, simState.ownedSkins]);

  // Jump from collection store to opening a matching container
  const handleJumpToOpenContainer = useCallback(
    (containerName: string) => {
      const inCases = catalog.weaponCases.find(c => c.name === containerName);
      if (inCases) {
        setContainerCategory('Case');
        setSelectedContainerId(inCases.id);
        setActiveTab('UNBOX');
        return;
      }
      const inSouvenirs = catalog.souvenirPackages.find(s => s.name === containerName);
      if (inSouvenirs) {
        setContainerCategory('Souvenir');
        setSelectedContainerId(inSouvenirs.id);
        setActiveTab('UNBOX');
        return;
      }
    },
    [catalog.weaponCases, catalog.souvenirPackages]
  );

  // 1. TITLE SCREEN STAGE (Game Shell compliance)
  if (gameState === 'title') {
    return (
      <main className="min-h-screen w-full bg-[#090d14] text-slate-100 flex flex-col justify-between p-6 md:p-12 relative overflow-hidden select-none">
        {/* Atmospheric Source 2 Tactical Armory Lighting Backdrop */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 72% 38%, rgba(245, 158, 11, 0.14) 0%, rgba(59, 130, 246, 0.08) 38%, rgba(9, 13, 20, 0.98) 78%)',
          }}
        />

        {/* Top Bar Info */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 36 36" className="w-9 h-9 text-amber-400" fill="none">
              <polygon
                points="18,2 33,10 33,26 18,34 3,26 3,10"
                stroke="currentColor"
                strokeWidth="2.2"
                fill="rgba(245,158,11,0.12)"
              />
              <path
                d="M11 22 L16 14 L22 14 L26 11 M13 24 H24"
                stroke="#f8fafc"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
            <span className="font-display text-xl font-bold tracking-wider uppercase text-slate-100">
              COUNTER-STRIKE 2 · TACTICAL ARMORY SIMULATOR
            </span>
          </div>
          <span className="font-mono text-xs text-slate-400 tabular-nums">
            42 CASES · 49 BASELINE COLLECTIONS · 79 SOUVENIRS · 90 CAPSULES
          </span>
        </div>

        {/* Negative-Space Asymmetric Left Lockup + Right Case Showcase */}
        <div className="relative z-10 my-auto max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center py-8">
          <div className="lg:col-span-7 space-y-6">
            {/* Custom Inline SVG Title Lockup */}
            <div className="inline-flex items-center gap-4 w-full">
              <svg
                viewBox="0 0 560 96"
                className="w-full max-w-xl h-auto"
                role="img"
                aria-label="CS2 Armory Case & Collection Simulator"
              >
                <rect
                  x="2"
                  y="8"
                  width="92"
                  height="80"
                  rx="8"
                  fill="#f59e0b"
                />
                <text
                  x="48"
                  y="64"
                  textAnchor="middle"
                  fill="#090d14"
                  fontFamily="Barlow Condensed, sans-serif"
                  fontWeight="700"
                  fontSize="54"
                >
                  CS2
                </text>
                <text
                  x="112"
                  y="52"
                  fill="#f8fafc"
                  fontFamily="Barlow Condensed, sans-serif"
                  fontWeight="700"
                  fontSize="44"
                  letterSpacing="2"
                >
                  ARMORY VAULT
                </text>
                <text
                  x="114"
                  y="78"
                  fill="#94a3b8"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="500"
                  fontSize="12.5"
                  letterSpacing="1.2"
                >
                  CASE · SOUVENIR · STICKER · TRADE-UP SIMULATOR
                </text>
              </svg>
            </div>

            <p className="text-base text-slate-300 max-w-xl leading-relaxed">
              Experience authentic Counter-Strike 2 horizontal reel case openings, full 49-collection weapon catalogs, souvenir packages, 5-slot sticker crafting, IEEE-754 trade-up contracts, and release-date verified item telemetry.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                type="button"
                data-start="true"
                onClick={startSimulator}
                className="px-7 py-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display text-xl font-bold tracking-wider uppercase transition-transform active:scale-95 cursor-pointer shadow-lg"
              >
                Enter Armory Simulator
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('AUDIT');
                  startSimulator();
                }}
                className="px-5 py-3.5 rounded-lg border border-slate-700 hover:border-slate-500 bg-[#11161f] text-slate-200 text-sm font-medium transition-colors cursor-pointer"
              >
                Inspect Release-Date Audit Report
              </button>
            </div>
          </div>

          {/* Right Centerpiece Showcase Card */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-[#11161f]/90 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>FEATURED CS2 CONTAINER</span>
              <span>VERIFIED: 2025-03-31</span>
            </div>
            <div className="h-44 flex items-center justify-center">
              <ItemArtwork
                src={catalog.weaponCases[catalog.weaponCases.length - 1]?.image}
                alt="Fever Case"
                category="Case"
                className="max-h-40 w-auto object-contain drop-shadow-[0_16px_28px_rgba(0,0,0,0.8)]"
              />
            </div>
            <div className="space-y-1 text-center">
              <h2 className="font-display text-2xl font-bold text-white">
                All Openings Are 100% Free
              </h2>
              <p className="text-xs text-slate-400">
                Start at 0.00 CR and an empty inventory. Unbox Cases, Souvenir Packages, and Sticker Capsules for free, sell unwanted drops for CR, and craft or trade up your collection.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Control Hint */}
        <div className="relative z-10 text-xs font-mono text-slate-500 text-center">
          Press Enter or Space to Enter Armory · Click Any Container to Unbox Free · Press M to Mute Audio
        </div>
      </main>
    );
  }

  // 2. ACTIVE PLAYING ARMORY INTERFACE
  return (
    <div className="min-h-screen w-full bg-[#090d14] text-slate-100 flex flex-col">
      {/* Top Panorama Header Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#0d1117]/95 px-4 md:px-8 py-3">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('UNBOX')}
            className="font-display text-xl md:text-2xl font-bold tracking-wider text-white whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2"
          >
            <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950">CS2</span>
            <span>ARMORY</span>
          </button>

          {/* Zone 2: Primary Navigation Tabs */}
          <nav
            aria-label="Primary Armory Navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            <button
              type="button"
              onClick={() => setActiveTab('UNBOX')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'UNBOX'
                  ? 'border-amber-400 text-white font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-100'
              }`}
            >
              Unbox Containers
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('INVENTORY')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'INVENTORY'
                  ? 'border-amber-400 text-white font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-100'
              }`}
            >
              Inventory ({simState.ownedSkins.length + simState.ownedStickers.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('STORE')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'STORE'
                  ? 'border-amber-400 text-white font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-100'
              }`}
            >
              Collections & Store
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('TRADEUP')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'TRADEUP'
                  ? 'border-amber-400 text-white font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-100'
              }`}
            >
              Trade-Up Contract
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('AUDIT')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'AUDIT'
                  ? 'border-amber-400 text-white font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-100'
              }`}
            >
              Release-Date Audit
            </button>
          </nav>

          {/* Zone 3: Wallet Readout & Audio Controls */}
          <div className="flex items-center gap-3 shrink-0">
            <div
              data-testid="cr-balance-display"
              className="px-3 py-1.5 rounded-lg border border-slate-800 bg-[#141b26] font-mono text-xs tabular-nums flex items-center gap-2"
              title="In-game fictional currency (1 CR = €1 reference; earned by selling unboxed items)"
            >
              <span className="text-slate-400">BALANCE:</span>
              <span className="font-bold text-emerald-400 text-sm">
                {simState.balanceCr.toFixed(2)} CR
              </span>
            </div>

            <button
              type="button"
              aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
              onClick={() => {
                const next = !muted;
                setMuted(next);
                soundEngine.muted = next;
              }}
              className="p-2 rounded-lg border border-slate-800 bg-[#141b26] hover:border-slate-600 text-xs font-mono text-slate-300 cursor-pointer"
              title={muted ? 'Audio Muted' : 'Audio Active'}
            >
              {muted ? 'MUTE' : 'SFX'}
            </button>

            <label htmlFor="audio-volume-slider" className="sr-only">
              Master Audio Volume
            </label>
            <input
              id="audio-volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={e => {
                const v = parseFloat(e.target.value);
                setVolume(v);
                soundEngine.volume = v;
                if (v > 0 && muted) {
                  setMuted(false);
                  soundEngine.muted = false;
                }
              }}
              className="hidden sm:block w-16 accent-amber-400 cursor-pointer"
              title={`Volume: ${Math.round((muted ? 0 : volume) * 100)}%`}
            />
          </div>
        </div>

        {/* Mobile Responsive Navigation Strip */}
        <div className="grid grid-cols-5 md:hidden gap-1.5 pt-2.5 mt-2.5 border-t border-slate-800/80">
          {(
            [
              ['UNBOX', 'Unbox'],
              ['INVENTORY', `Inv (${simState.ownedSkins.length + simState.ownedStickers.length})`],
              ['STORE', 'Store'],
              ['TRADEUP', 'Trade-Up'],
              ['AUDIT', 'Audit'],
            ] as const
          ).map(([tabKey, label]) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => setActiveTab(tabKey)}
              className={`px-2 py-1.5 rounded-md text-[11px] font-semibold text-center whitespace-nowrap truncate ${
                activeTab === tabKey
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-[#141b26] text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Optional Toast Banner */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-40 rounded-lg border border-emerald-500/60 bg-[#0d1117]/95 px-4 py-3 text-xs font-medium text-emerald-300 shadow-xl"
        >
          {toastMessage}
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 md:px-8 py-6">
        {/* TAB 1: UNBOX CONTAINERS (CASES, SOUVENIR PACKAGES, STICKER CAPSULES) */}
        {activeTab === 'UNBOX' && (
          <div className="space-y-6">
            {/* Container Category & Chronological Sort Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-[#11161f] p-4 rounded-xl border border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setContainerCategory('Case');
                    setSelectedContainerId('');
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    containerCategory === 'Case'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-[#0d1117] text-slate-300 border border-slate-800 hover:border-slate-600'
                  }`}
                >
                  Weapon Cases ({catalog.weaponCases.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setContainerCategory('Souvenir');
                    setSelectedContainerId('');
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    containerCategory === 'Souvenir'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-[#0d1117] text-slate-300 border border-slate-800 hover:border-slate-600'
                  }`}
                >
                  Souvenir Packages ({catalog.souvenirPackages.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setContainerCategory('Sticker Capsule');
                    setSelectedContainerId('');
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    containerCategory === 'Sticker Capsule'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-[#0d1117] text-slate-300 border border-slate-800 hover:border-slate-600'
                  }`}
                >
                  Sticker Capsules ({catalog.stickerCapsules.length})
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                <label htmlFor="container-search-input" className="sr-only">
                  Search containers or skins
                </label>
                <input
                  id="container-search-input"
                  type="search"
                  value={containerSearch}
                  onChange={e => setContainerSearch(e.target.value)}
                  placeholder="Search case, souvenir, capsule, or skin..."
                  className="w-full sm:w-64 rounded-lg border border-slate-700 bg-[#0d1117] px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
                />

                <label htmlFor="container-date-sort" className="sr-only">
                  Sort containers by release date
                </label>
                <select
                  id="container-date-sort"
                  value={containerSortOrder}
                  onChange={e => setContainerSortOrder(e.target.value as 'newest' | 'oldest')}
                  className="rounded-lg border border-slate-700 bg-[#0d1117] px-3 py-1.5 text-xs text-slate-200"
                >
                  <option value="newest">Release Date: Newest First (Default)</option>
                  <option value="oldest">Release Date: Oldest First</option>
                </select>

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={fastSpin}
                    onChange={e => setFastSpin(e.target.checked)}
                    className="accent-amber-400 rounded"
                  />
                  <span>Fast Reel (1.4s)</span>
                </label>
              </div>
            </div>

            {/* Split Layout: Left Container Selector List, Right Selected Container Stage & Contents */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Sidebar: Sorted Containers (Ordered 2nd on mobile so active stage is immediately visible above the fold) */}
              <div className="order-2 lg:order-1 lg:col-span-4 rounded-xl border border-slate-800 bg-[#11161f] overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 bg-[#0d1117] flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">
                    Select {containerCategory} ({filteredContainers.length})
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {containerSortOrder === 'newest' ? 'Newest → Oldest' : 'Oldest → Newest'}
                  </span>
                </div>
                <div className="max-h-80 lg:max-h-[680px] overflow-y-auto divide-y divide-slate-800/70">
                  {filteredContainers.map(c => {
                    const isSelected = activeContainer?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedContainerId(c.id);
                          setShowSpecialPoolDetails(false);
                        }}
                        className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/15 text-white'
                            : 'hover:bg-slate-800/40 text-slate-300'
                        }`}
                      >
                        <div className="w-12 h-10 shrink-0 rounded bg-[#0d1117] border border-slate-800 p-1 flex items-center justify-center">
                          <ItemArtwork
                            src={c.image}
                            alt={c.name}
                            category="Case"
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold truncate" title={c.name}>
                            {c.name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 tabular-nums mt-0.5 flex items-center justify-between">
                            <span>
                              Released:{' '}
                              <strong
                                className={
                                  c.releaseDate === 'UNKNOWN' ? 'text-amber-400' : 'text-slate-300'
                                }
                              >
                                {c.releaseDate}
                              </strong>
                            </span>
                            <span>FREE</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Stage: Selected Container Showcase + Contents Grid */}
              <div className="order-1 lg:order-2 lg:col-span-8 space-y-5">
                {activeContainer ? (
                  <>
                    {/* Hero Container Stage Card */}
                    <div className="rounded-xl border border-slate-800 bg-[#11161f] p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                      <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
                        <div className="w-32 h-28 rounded-xl bg-[#0d1117] border border-slate-800 p-3 flex items-center justify-center shrink-0">
                          <ItemArtwork
                            src={activeContainer.image}
                            alt={activeContainer.name}
                            category="Case"
                            className="w-full h-full object-contain drop-shadow-[0_12px_20px_rgba(0,0,0,0.75)]"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-xs font-mono text-slate-400">
                            <span>{activeContainer.type.toUpperCase()}</span>
                            <span aria-hidden="true">·</span>
                            <span>RELEASED: {activeContainer.releaseDate}</span>
                            {activeContainer.type === 'Case' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{activeContainer.collectionName}</span>
                              </>
                            )}
                          </div>
                          <h1 className="font-display text-3xl font-bold tracking-wide text-white">
                            {activeContainer.name}
                          </h1>
                          <p className="text-xs text-slate-400 max-w-xl">
                            Verified Source: {activeContainer.releaseSource}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-center sm:items-end gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartOpenContainer(activeContainer)}
                          className="px-6 py-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display text-lg font-bold tracking-wider uppercase transition-transform active:scale-95 cursor-pointer shadow-lg whitespace-nowrap"
                        >
                          Open {activeContainer.type} (Free)
                        </button>
                        <span className="text-[11px] font-mono text-slate-400">
                          0.00 CR · Authentic Weighted CS2 Reel
                        </span>
                      </div>
                    </div>

                    {/* Container Contents Header & Rarity Sort */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-sm font-semibold text-slate-200">
                        Verified Container Contents ({activeContainer.contains.length} Regular Items
                        {activeContainer.type === 'Case' && activeContainer.containsRare.length > 0
                          ? ` + ★ Special Item Pool`
                          : ''}
                        )
                      </h2>

                      <div className="flex items-center gap-2">
                        <label htmlFor="contents-rarity-order" className="text-xs text-slate-400">
                          Rarity Order:
                        </label>
                        <select
                          id="contents-rarity-order"
                          value={contentRaritySort}
                          onChange={e => setContentRaritySort(e.target.value as 'asc' | 'desc')}
                          className="rounded-lg border border-slate-700 bg-[#0d1117] px-2.5 py-1 text-xs text-slate-200"
                        >
                          <option value="asc">Consumer / Mil-Spec → Covert</option>
                          <option value="desc">Covert → Consumer / Mil-Spec</option>
                        </select>
                      </div>
                    </div>

                    {/* Items Grid inside Container */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
                      {sortedContainerContents.map((item: CatalogSkin | CatalogSticker) => {
                        const isSkin = 'prices' in item;
                        const refValue = isSkin
                          ? (item as CatalogSkin).prices.ft
                          : (item as CatalogSticker).price;
                        return (
                          <div
                            key={item.id}
                            className="rounded-xl border border-slate-800 bg-[#11161f] overflow-hidden flex flex-col justify-between"
                          >
                            <div>
                              <div
                                className="p-3 h-32 flex items-center justify-center"
                                style={{
                                  background: `radial-gradient(circle at 50% 60%, ${item.rarityColor}24 0%, #0d1117 80%)`,
                                }}
                              >
                                <ItemArtwork
                                  src={item.image}
                                  alt={item.name}
                                  rarityColor={item.rarityColor}
                                  className="max-h-24 w-auto object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.75)]"
                                />
                              </div>
                              <div
                                className="h-1.5 w-full"
                                style={{ backgroundColor: item.rarityColor }}
                              />
                            </div>
                            <div className="p-3 space-y-1">
                              <div className="text-xs font-semibold text-slate-100 truncate" title={item.name}>
                                {item.name}
                              </div>
                              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                                <span style={{ color: item.rarityColor }}>{item.rarity}</span>
                                <span className="text-emerald-400">~{refValue.toFixed(2)} CR</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Authentic CS2 Gold Special Item Tile for Weapon Cases */}
                      {activeContainer.type === 'Case' && activeContainer.containsRare.length > 0 && (
                        <div className="rounded-xl border border-amber-500/60 bg-[#11161f] overflow-hidden flex flex-col justify-between">
                          <div className="h-32">
                            <SpecialMysteryTileArtwork />
                          </div>
                          <div className="h-1.5 w-full bg-amber-400" />
                          <div className="p-3 space-y-1.5">
                            <div className="text-xs font-semibold text-amber-300">
                              ★ Exceedingly Rare Special Item
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowSpecialPoolDetails(v => !v)}
                              className="text-[11px] text-amber-200 hover:underline font-mono cursor-pointer"
                            >
                              {showSpecialPoolDetails
                                ? 'Hide Supported Finishes'
                                : `Inspect ${activeContainer.containsRare.length} Supported Knives/Gloves`}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Expandable Supported Knives / Gloves Pool Drawer */}
                    {activeContainer.type === 'Case' &&
                      showSpecialPoolDetails &&
                      activeContainer.containsRare.length > 0 && (
                        <div className="rounded-xl border border-amber-500/40 bg-[#11161f] p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-mono uppercase text-amber-300 font-semibold">
                              Supported ★ Special Item Finishes in {activeContainer.name} (Hidden During Reel Spin)
                            </h3>
                            <button
                              type="button"
                              onClick={() => setShowSpecialPoolDetails(false)}
                              className="text-xs text-slate-400 hover:text-white cursor-pointer"
                            >
                              Collapse
                            </button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {activeContainer.containsRare.map(rare => (
                              <div
                                key={rare.id}
                                className="rounded-lg border border-slate-800 bg-[#0d1117] p-2.5 flex flex-col justify-between"
                              >
                                <div className="h-20 flex items-center justify-center">
                                  <ItemArtwork
                                    src={rare.image}
                                    alt={rare.name}
                                    category={rare.category}
                                    rarityColor="#ffd700"
                                    className="max-h-16 w-auto object-contain"
                                  />
                                </div>
                                <div className="mt-2">
                                  <div className="text-xs font-semibold text-amber-300 truncate" title={rare.name}>
                                    {rare.name}
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-400 tabular-nums flex justify-between mt-0.5">
                                    <span>
                                      Float {rare.minFloat.toFixed(2)}–{rare.maxFloat.toFixed(2)}
                                    </span>
                                    <span className="text-emerald-400">
                                      ~{rare.prices.ft.toFixed(0)} CR
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PERSISTENT INVENTORY & STICKER WORKBENCH */}
        {activeTab === 'INVENTORY' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h1 className="font-display text-3xl font-bold tracking-wide text-slate-100">
                  Player Inventory & Customization Vault
                </h1>
                <p className="text-sm text-slate-400 mt-0.5">
                  Inspect wear conditions, IEEE-754 floats, pattern seeds, and evidence-based valuations. Apply owned stickers across 5 weapon slots or sell items for CR.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums">
                <div className="px-3.5 py-2 rounded-lg border border-slate-800 bg-[#11161f]">
                  <span className="text-slate-400">OWNED SKINS: </span>
                  <strong className="text-white">{simState.ownedSkins.length}</strong>
                </div>
                <div className="px-3.5 py-2 rounded-lg border border-slate-800 bg-[#11161f]">
                  <span className="text-slate-400">OWNED STICKERS: </span>
                  <strong className="text-white">{simState.ownedStickers.length}</strong>
                </div>
                <div className="px-3.5 py-2 rounded-lg border border-slate-800 bg-[#11161f]">
                  <span className="text-slate-400">EST. PORTFOLIO: </span>
                  <strong className="text-emerald-400">{totalInventoryValuationCr.toFixed(2)} CR</strong>
                </div>
              </div>
            </div>

            {/* Sub-Tabs & Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#11161f] p-4 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInventorySubTab('SKINS')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    inventorySubTab === 'SKINS'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-[#0d1117] text-slate-300 border border-slate-800'
                  }`}
                >
                  Weapon Skins, Knives & Gloves ({simState.ownedSkins.length})
                </button>
                <button
                  type="button"
                  onClick={() => setInventorySubTab('STICKERS')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    inventorySubTab === 'STICKERS'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-[#0d1117] text-slate-300 border border-slate-800'
                  }`}
                >
                  Owned Unapplied Stickers ({simState.ownedStickers.length})
                </button>
              </div>

              {inventorySubTab === 'SKINS' && (
                <div className="flex flex-wrap items-center gap-3">
                  <label htmlFor="inv-search-input" className="sr-only">
                    Search inventory items
                  </label>
                  <input
                    id="inv-search-input"
                    type="search"
                    value={invSearch}
                    onChange={e => setInvSearch(e.target.value)}
                    placeholder="Search owned weapon, skin, or collection..."
                    className="w-56 rounded-lg border border-slate-700 bg-[#0d1117] px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
                  />

                  <label htmlFor="inv-rarity-filter" className="sr-only">
                    Filter inventory by rarity
                  </label>
                  <select
                    id="inv-rarity-filter"
                    value={invRarityFilter}
                    onChange={e => setInvRarityFilter(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-[#0d1117] px-3 py-1.5 text-xs text-slate-200"
                  >
                    <option value="ALL">All Rarities</option>
                    <option value="Consumer Grade">Consumer Grade</option>
                    <option value="Industrial Grade">Industrial Grade</option>
                    <option value="Mil-Spec Grade">Mil-Spec Grade</option>
                    <option value="Restricted">Restricted</option>
                    <option value="Classified">Classified</option>
                    <option value="Covert">Covert</option>
                    <option value="Special Item">★ Special Item (Knives/Gloves)</option>
                  </select>

                  <label htmlFor="inv-sort-select" className="sr-only">
                    Sort inventory items
                  </label>
                  <select
                    id="inv-sort-select"
                    value={invSortBy}
                    onChange={e =>
                      setInvSortBy(
                        e.target.value as
                          | 'newest'
                          | 'rarity_desc'
                          | 'rarity_asc'
                          | 'value_desc'
                          | 'float_asc'
                      )
                    }
                    className="rounded-lg border border-slate-700 bg-[#0d1117] px-3 py-1.5 text-xs text-slate-200"
                  >
                    <option value="newest">Acquired: Newest First</option>
                    <option value="rarity_desc">Rarity: Special / Covert → Consumer</option>
                    <option value="rarity_asc">Rarity: Consumer → Covert / Special</option>
                    <option value="value_desc">Estimated Value: High → Low</option>
                    <option value="float_asc">Float Value: Lowest → Highest</option>
                  </select>

                  <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={groupByCollection}
                      onChange={e => setGroupByCollection(e.target.checked)}
                      className="accent-amber-400"
                    />
                    <span>Group by Collection</span>
                  </label>
                </div>
              )}
            </div>

            {inventorySubTab === 'SKINS' ? (
              filteredOwnedSkins.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 bg-[#11161f] p-12 text-center space-y-3">
                  <h2 className="font-display text-2xl font-bold text-slate-200">
                    Your Weapon Skin Inventory Is Empty
                  </h2>
                  <p className="text-sm text-slate-400 max-w-md mx-auto">
                    You start with 0.00 CR and 0 items. Open any Weapon Case or Souvenir Package for free in the Unbox Containers tab to start building your collection!
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('UNBOX')}
                    className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Go to Unbox Containers (Free)
                  </button>
                </div>
              ) : groupByCollection ? (
                /* Grouped by Collection View */
                <div className="space-y-6">
                  {Array.from(
                    filteredOwnedSkins.reduce((acc, item) => {
                      const list = acc.get(item.collectionName) || [];
                      list.push(item);
                      acc.set(item.collectionName, list);
                      return acc;
                    }, new Map<string, OwnedSkinItem[]>())
                  ).map(([colName, items]) => (
                    <div key={colName} className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-200 border-b border-slate-800 pb-1.5">
                        {colName} ({items.length})
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {items.map(skin => {
                          const val = calculateItemValuation(skin);
                          const appliedList = skin.appliedStickers.filter(Boolean);
                          return (
                            <div
                              key={skin.instanceId}
                              className="rounded-xl border border-slate-800 bg-[#11161f] overflow-hidden flex flex-col justify-between"
                            >
                              <div
                                onClick={() => setInspectingSkinId(skin.instanceId)}
                                className="p-4 h-40 flex flex-col items-center justify-between cursor-pointer"
                                style={{
                                  background: `radial-gradient(circle at 50% 60%, ${skin.rarityColor}28 0%, #0d1117 80%)`,
                                }}
                              >
                                <div className="w-full flex justify-between text-[11px] font-mono text-slate-400">
                                  <span>{getWearShortCode(skin.wear)} · {skin.floatValue.toFixed(5)}</span>
                                  <span>#{skin.patternSeed}</span>
                                </div>
                                <ItemArtwork
                                  src={skin.image}
                                  alt={skin.name}
                                  category={skin.category}
                                  rarityColor={skin.rarityColor}
                                  className="max-h-24 w-auto object-contain"
                                />
                                {appliedList.length > 0 && (
                                  <div className="text-[10px] font-mono text-amber-300">
                                    {appliedList.length} Sticker(s) Applied
                                  </div>
                                )}
                              </div>
                              <div className="h-1.5 w-full" style={{ backgroundColor: skin.rarityColor }} />
                              <div className="p-3.5 space-y-2.5">
                                <div className="text-xs font-semibold text-slate-100 truncate" title={skin.name}>
                                  {skin.name}
                                </div>
                                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800">
                                  <span className="font-mono text-sm font-bold text-emerald-400 tabular-nums">
                                    {val.totalEstimatedCr.toFixed(2)} CR
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setInspectingSkinId(skin.instanceId)}
                                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 cursor-pointer"
                                    >
                                      Inspect
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSellOwnedSkin(skin.instanceId, val.totalEstimatedCr)}
                                      className="px-2.5 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-[11px] font-mono text-emerald-300 cursor-pointer"
                                    >
                                      Sell
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Standard Responsive Grid */
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filteredOwnedSkins.map(skin => {
                    const val = calculateItemValuation(skin);
                    const appliedList = skin.appliedStickers.filter(Boolean);
                    return (
                      <div
                        key={skin.instanceId}
                        className="rounded-xl border border-slate-800 bg-[#11161f] overflow-hidden flex flex-col justify-between"
                      >
                        <div>
                          <div
                            onClick={() => setInspectingSkinId(skin.instanceId)}
                            className="p-4 h-44 flex flex-col items-center justify-between cursor-pointer"
                            style={{
                              background: `radial-gradient(circle at 50% 60%, ${skin.rarityColor}28 0%, #0d1117 80%)`,
                            }}
                          >
                            <div className="w-full flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                              <span style={{ color: skin.rarityColor }}>{skin.rarity}</span>
                              <span>
                                {getWearShortCode(skin.wear)} · {skin.floatValue.toFixed(6)}
                              </span>
                            </div>
                            <ItemArtwork
                              src={skin.image}
                              alt={skin.name}
                              category={skin.category}
                              rarityColor={skin.rarityColor}
                              className="max-h-28 w-auto object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.75)]"
                            />
                            <div className="w-full flex items-center justify-between text-[10px] font-mono text-slate-400">
                              <span>Seed #{skin.patternSeed}</span>
                              {skin.patternInfo.tierLabel ? (
                                <span style={{ color: skin.patternInfo.badgeColor || '#38bdf8' }}>
                                  {skin.patternInfo.tierLabel}
                                </span>
                              ) : appliedList.length > 0 ? (
                                <span className="text-amber-300">
                                  {appliedList.length}/5 Stickers
                                </span>
                              ) : (
                                <span>{skin.releaseDate}</span>
                              )}
                            </div>
                          </div>
                          <div
                            className="h-1.5 w-full"
                            style={{ backgroundColor: skin.rarityColor }}
                          />
                        </div>

                        <div className="p-4 space-y-3">
                          <div>
                            <h3
                              className="text-sm font-semibold truncate"
                              style={{ color: skin.isSpecialItem ? '#ffd700' : '#f1f5f9' }}
                              title={skin.name}
                            >
                              {skin.name}
                            </h3>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {skin.wear} · {skin.collectionName}
                            </p>
                          </div>

                          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                            <div className="font-mono tabular-nums">
                              <span className="text-[10px] text-slate-400 block">Est. Value</span>
                              <span className="text-sm font-bold text-emerald-400">
                                {val.totalEstimatedCr.toFixed(2)} CR
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setInspectingSkinId(skin.instanceId)}
                                className="px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 bg-[#0d1117] text-xs font-medium text-slate-200 cursor-pointer"
                              >
                                Inspect / Craft
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSellOwnedSkin(skin.instanceId, val.totalEstimatedCr)}
                                className="px-3 py-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/15 hover:bg-emerald-500/25 text-xs font-mono font-semibold text-emerald-300 cursor-pointer"
                              >
                                Sell
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : /* Owned Unapplied Stickers Grid */
            simState.ownedStickers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 bg-[#11161f] p-12 text-center space-y-3">
                <h2 className="font-display text-2xl font-bold text-slate-200">
                  No Unapplied Stickers Owned
                </h2>
                <p className="text-sm text-slate-400 max-w-md mx-auto">
                  Open any Sticker Capsule for free in the Unbox tab or purchase individual verified stickers in the Store tab, then apply them to your weapon skins!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {simState.ownedStickers.map(st => (
                  <div
                    key={st.instanceId}
                    className="rounded-xl border border-slate-800 bg-[#11161f] overflow-hidden flex flex-col justify-between"
                  >
                    <div
                      className="p-4 h-36 flex flex-col items-center justify-center"
                      style={{
                        background: `radial-gradient(circle at 50% 55%, ${st.rarityColor}26 0%, #0d1117 80%)`,
                      }}
                    >
                      <ItemArtwork
                        src={st.image}
                        alt={st.name}
                        rarityColor={st.rarityColor}
                        className="max-h-24 w-auto object-contain"
                      />
                    </div>
                    <div className="h-1 w-full" style={{ backgroundColor: st.rarityColor }} />
                    <div className="p-3.5 space-y-2">
                      <div className="text-xs font-semibold text-slate-100 truncate" title={st.name}>
                        {st.name}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{st.capsuleName}</div>
                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                        <span className="font-mono text-sm font-bold text-emerald-400 tabular-nums">
                          {st.price.toFixed(2)} CR
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSellOwnedSticker(st.instanceId, st.price)}
                          className="px-3 py-1 rounded-lg border border-emerald-500/50 bg-emerald-500/15 hover:bg-emerald-500/25 text-xs font-mono text-emerald-300 cursor-pointer"
                        >
                          Sell (+{st.price.toFixed(2)} CR)
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: COLLECTIONS & VERIFIED ITEM STORE */}
        {activeTab === 'STORE' && (
          <CollectionsStoreView
            balanceCr={simState.balanceCr}
            weaponCollections={catalog.weaponCollections}
            weaponCases={catalog.weaponCases}
            stickers={catalog.stickers}
            onBuySkin={handleBuySkinFromStore}
            onBuySticker={handleBuyStickerFromStore}
            onJumpToOpenContainer={handleJumpToOpenContainer}
          />
        )}

        {/* TAB 4: 10-ITEM TRADE-UP CONTRACT */}
        {activeTab === 'TRADEUP' && (
          <TradeUpView
            ownedSkins={simState.ownedSkins}
            allSkinsByCollection={allSkinsByCollection}
            onExecuteContract={handleExecuteTradeUp}
            onInspectSkin={skin => setInspectingSkinId(skin.instanceId)}
          />
        )}

        {/* TAB 5: FULL RELEASE-DATE AUDIT REPORT */}
        {activeTab === 'AUDIT' && <AuditReportView auditReport={catalog.auditReport} />}
      </main>

      {/* Active Unbox Reel Modal */}
      {activeUnboxOutcome && (
        <UnboxReel
          outcome={activeUnboxOutcome}
          fastAnimation={fastSpin}
          onAnimationComplete={handleUnboxAnimationComplete}
          onKeepAndClose={handleCloseReelModal}
          onOpenAnother={handleOpenAnotherFromModal}
          onQuickSellReward={handleQuickSellFromReveal}
          onInspectSkin={skin => {
            handleCloseReelModal();
            setInspectingSkinId(skin.instanceId);
          }}
        />
      )}

      {/* Active Weapon Inspection & Sticker Crafting Modal */}
      {inspectingSkin && (
        <InspectModal
          skin={inspectingSkin}
          ownedStickers={simState.ownedStickers}
          onClose={() => setInspectingSkinId(null)}
          onApplySticker={handleApplySticker}
          onScrapeSticker={handleScrapeSticker}
          onSellSkin={handleSellOwnedSkin}
        />
      )}
    </div>
  );
}

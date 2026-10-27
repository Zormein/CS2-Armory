export type RarityName =
  | 'Consumer Grade'
  | 'Industrial Grade'
  | 'Mil-Spec Grade'
  | 'Restricted'
  | 'Classified'
  | 'Covert'
  | 'Contraband'
  | 'Special Item'
  | 'High Grade'
  | 'Remarkable'
  | 'Exotic'
  | 'Extraordinary';

export type WearCondition =
  | 'Factory New'
  | 'Minimal Wear'
  | 'Field-Tested'
  | 'Well-Worn'
  | 'Battle-Scarred';

export interface SkinValuationTable {
  fn: number;
  mw: number;
  ft: number;
  ww: number;
  bs: number;
  source: string;
  confidence: 'HIGH' | 'MEDIUM' | 'UNCERTAIN';
}

export interface CatalogSkin {
  id: string;
  name: string;
  weapon: string;
  skinName: string;
  category: string;
  rarity: string;
  rarityColor: string;
  minFloat: number;
  maxFloat: number;
  stattrakAvailable: boolean;
  souvenirAvailable: boolean;
  image: string;
  collectionName: string;
  releaseDate: string;
  prices: SkinValuationTable;
}

export interface CatalogSticker {
  id: string;
  name: string;
  rarity: string;
  rarityColor: string;
  capsuleId: string;
  capsuleName: string;
  releaseDate: string;
  releaseSource: string;
  image: string;
  price: number;
}

export interface WeaponCaseContainer {
  id: string;
  name: string;
  type: 'Case';
  releaseDate: string;
  releaseSource: string;
  auditStatus: string;
  auditNote: string;
  image: string;
  collectionName: string;
  contains: CatalogSkin[];
  containsRare: CatalogSkin[];
}

export interface SouvenirContainer {
  id: string;
  name: string;
  type: 'Souvenir';
  tournament: string;
  releaseDate: string;
  releaseSource: string;
  auditStatus: string;
  auditNote: string;
  image: string;
  contains: CatalogSkin[];
}

export interface StickerCapsuleContainer {
  id: string;
  name: string;
  type: 'Sticker Capsule';
  releaseDate: string;
  releaseSource: string;
  auditStatus: string;
  auditNote: string;
  image: string;
  contains: CatalogSticker[];
}

export type OpenableContainer =
  | WeaponCaseContainer
  | SouvenirContainer
  | StickerCapsuleContainer;

export interface WeaponCollection {
  id: string;
  name: string;
  releaseDate: string;
  releaseSource: string;
  isBaseline49: boolean;
  era: string;
  image: string;
  souvenirPackages: string[];
  contains: CatalogSkin[];
}

export interface AuditEntry {
  id: string;
  name: string;
  category: 'Weapon Case' | 'Weapon Collection' | 'Souvenir Package' | 'Sticker Capsule';
  rawDate: string;
  verifiedDate: string;
  status: 'VERIFIED' | 'CORRECTED' | 'CORRECTED_CRITICAL' | 'UNKNOWN';
  source: string;
  note: string;
}

export interface AppliedStickerSlot {
  slotIndex: 0 | 1 | 2 | 3 | 4;
  slotLabel: string;
  stickerId: string;
  name: string;
  rarity: string;
  rarityColor: string;
  image: string;
  referencePrice: number;
  isSouvenirGold?: boolean;
}

export interface PatternClassification {
  seed: number;
  tierLabel: string | null;
  badgeColor: string | null;
  multiplier: number;
  evidenceNote: string | null;
}

export interface ValuationBreakdown {
  baseWearPrice: number;
  floatAdjustment: number;
  stattrakMultiplier: number;
  souvenirMultiplier: number;
  patternMultiplier: number;
  patternTierLabel: string | null;
  appliedStickerBonus: number;
  appliedStickerRatePct: number;
  totalEstimatedCr: number;
  completedSalesMedianCr: number;
  activeListingsFloorCr: number;
  source: string;
  updatedAt: string;
  confidence: 'HIGH' | 'MEDIUM' | 'UNCERTAIN';
}

export interface OwnedSkinItem {
  instanceId: string;
  skinId: string;
  name: string;
  weapon: string;
  skinName: string;
  category: string;
  rarity: string;
  rarityColor: string;
  isSpecialItem: boolean;
  isStatTrak: boolean;
  isSouvenir: boolean;
  souvenirTournament?: string;
  floatValue: number;
  wear: WearCondition;
  patternSeed: number;
  patternInfo: PatternClassification;
  collectionName: string;
  containerName: string;
  releaseDate: string;
  image: string;
  minFloat: number;
  maxFloat: number;
  basePrices: SkinValuationTable;
  appliedStickers: (AppliedStickerSlot | null)[];
  acquiredAt: string;
  acquiredVia: 'CASE_OPEN' | 'SOUVENIR_OPEN' | 'STORE_PURCHASE' | 'TRADE_UP';
}

export interface OwnedStickerItem {
  instanceId: string;
  stickerId: string;
  name: string;
  rarity: string;
  rarityColor: string;
  capsuleId: string;
  capsuleName: string;
  releaseDate: string;
  releaseSource: string;
  image: string;
  price: number;
  acquiredAt: string;
  acquiredVia: 'CAPSULE_OPEN' | 'STORE_PURCHASE';
}

export interface ReelTile {
  tileId: string;
  isWinningTile: boolean;
  isSpecialMystery: boolean;
  rarity: string;
  rarityColor: string;
  image: string;
}

export interface UnboxOutcome {
  containerId: string;
  containerName: string;
  containerType: 'Case' | 'Souvenir' | 'Sticker Capsule';
  winningIndex: number;
  reelTiles: ReelTile[];
  rewardType: 'SKIN' | 'STICKER';
  skinReward?: OwnedSkinItem;
  stickerReward?: OwnedStickerItem;
}

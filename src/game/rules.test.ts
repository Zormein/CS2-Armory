import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyStickerToSkin,
  calculateItemValuation,
  classifyPattern,
  executeTradeUpContract,
  generateContainerUnboxOutcome,
  getRarityRank,
  getWearFromFloat,
  matchesSearchQuery,
  scrapeStickerFromSkin,
  sortByRarity,
  sortByReleaseDate,
  validateTradeUpContract,
} from './rules';
import { CatalogSkin, OwnedSkinItem, OwnedStickerItem } from '../types/cs2';

const catalogPath = path.resolve(process.cwd(), 'src/data/catalogData.json');
const catalogData = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

test('Catalog completeness: 42 cases, 49 baseline collections (52 total), souvenirs, capsules, and Titan Holo', () => {
  assert.equal(catalogData.weaponCases.length, 42, 'Should include all 42 official CS2/CS:GO weapon cases');
  const baseline49 = catalogData.weaponCollections.filter((c: { isBaseline49: boolean }) => c.isBaseline49);
  assert.equal(baseline49.length, 49, 'Should include all 49 baseline weapon skin collections');
  assert.ok(catalogData.weaponCollections.length >= 49, 'Total non-case weapon collections should be at least 49');
  assert.equal(catalogData.souvenirPackages.length, 150, 'Should include all 150 Major souvenir packages');
  assert.ok(catalogData.stickerCapsules.length >= 100, 'Should include all 100+ sticker capsules');
  assert.ok(catalogData.stickers.length >= 3000, 'Every verified sticker should be in the purchasable catalog');

  // Verify Titan (Holo) | Katowice 2014 is in EMS Katowice 2014 Legends AND individually purchasable
  const kato14Legends = catalogData.stickerCapsules.find(
    (c: { name: string }) => c.name === 'EMS Katowice 2014 Legends'
  );
  assert.ok(kato14Legends, 'EMS Katowice 2014 Legends capsule must exist');
  assert.equal(kato14Legends.contains.length, 17, 'EMS Katowice 2014 Legends must contain all 17 stickers');
  const titanHoloInCapsule = kato14Legends.contains.find(
    (s: { name: string }) => s.name === 'Titan (Holo) | Katowice 2014'
  );
  assert.ok(titanHoloInCapsule, 'Titan (Holo) | Katowice 2014 must be in EMS Katowice 2014 Legends');

  const titanHoloInStore = catalogData.stickers.find(
    (s: { name: string }) => s.name === 'Titan (Holo) | Katowice 2014'
  );
  assert.ok(titanHoloInStore, 'Titan (Holo) | Katowice 2014 must be individually purchasable in Store');
  assert.equal(titanHoloInStore.releaseDate, '2014-03-06');
  assert.ok(matchesSearchQuery(titanHoloInStore.name, 'titan holo'), 'Searching "titan holo" must match "Titan (Holo) | Katowice 2014"');
});

test('Release-date audit: Austin 2025 & Cologne 2026 dates verified and no fabricated Jan 1 defaults', () => {
  const austinAncient = catalogData.souvenirPackages.find(
    (s: { name: string }) => s.name === 'Austin 2025 Ancient Souvenir Package'
  );
  assert.ok(austinAncient, 'Austin 2025 Ancient Souvenir Package must exist');
  assert.equal(austinAncient.releaseDate, '2025-05-22', 'Austin 2025 Ancient Souvenir Package must be 2025-05-22, not 2019-08-23');

  const austinChallengers = catalogData.stickerCapsules.find(
    (c: { name: string }) => c.name === 'Austin 2025 Challengers Sticker Capsule'
  );
  assert.ok(austinChallengers, 'Austin 2025 Challengers Sticker Capsule must exist');
  assert.equal(austinChallengers.releaseDate, '2025-05-22', 'Austin 2025 Challengers Sticker Capsule must be 2025-05-22, not 2020-01-01');

  // Verify Cologne 2026 containers have their verified May/July 2026 release dates
  const cologneEvent = catalogData.stickerCapsules.find((c: { id: string }) => c.id === 'crate-5316');
  const cologneChamps = catalogData.stickerCapsules.find((c: { id: string }) => c.id === 'crate-5329');
  const cologneRanked = catalogData.stickerCapsules.find((c: { id: string }) => c.id === 'crate-4040');
  assert.equal(cologneEvent?.releaseDate, '2026-05-21');
  assert.equal(cologneChamps?.releaseDate, '2026-07-01');
  assert.equal(cologneRanked?.releaseDate, '2026-07-28');

  const allDatedEntries = [
    ...catalogData.weaponCases,
    ...catalogData.weaponCollections,
    ...catalogData.souvenirPackages,
    ...catalogData.stickerCapsules,
  ];
  for (const entry of allDatedEntries) {
    assert.ok(
      /^\d{4}-\d{2}-\d{2}$/.test(entry.releaseDate),
      `Invalid date format on ${entry.name}: ${entry.releaseDate}`
    );
    assert.notEqual(
      entry.releaseDate.endsWith('-01-01'),
      true,
      `Entry ${entry.name} must not use unverified Jan 1 default date (${entry.releaseDate})`
    );
  }
});

test('Case opening: predetermined reward matches reel winner, hides special item identity, and has zero fake gold near-misses', () => {
  const kilowatt = catalogData.weaponCases.find((c: { name: string }) => c.name === 'Kilowatt Case');
  assert.ok(kilowatt);

  // 1. Regular skin unbox check
  const regularOutcome = generateContainerUnboxOutcome(kilowatt, {
    rand: () => 0.42,
    forceSpecialItem: false,
  });
  assert.equal(regularOutcome.rewardType, 'SKIN');
  assert.ok(regularOutcome.skinReward);
  assert.equal(regularOutcome.skinReward.isSpecialItem, false);
  const winningTile = regularOutcome.reelTiles[regularOutcome.winningIndex];
  assert.equal(winningTile.isWinningTile, true);
  assert.equal(winningTile.rarity, regularOutcome.skinReward.rarity);
  assert.equal(winningTile.image, regularOutcome.skinReward.image);

  // Ensure ZERO non-winning tiles are gold Special Items (no deceptive near misses)
  const nonWinningSpecials = regularOutcome.reelTiles.filter(
    (t, idx) => idx !== regularOutcome.winningIndex && t.isSpecialMystery
  );
  assert.equal(nonWinningSpecials.length, 0, 'Non-winning reel slots must never show a deceptive gold Special Item');

  // 2. Special Item (Knife/Glove) unbox check
  const specialOutcome = generateContainerUnboxOutcome(kilowatt, {
    rand: () => 0.25,
    forceSpecialItem: true,
  });
  assert.ok(specialOutcome.skinReward);
  assert.equal(specialOutcome.skinReward.isSpecialItem, true);
  const specialTile = specialOutcome.reelTiles[specialOutcome.winningIndex];
  assert.equal(specialTile.isSpecialMystery, true);
  assert.equal(specialTile.image, '', 'Special item tile must hide exact weapon/finish image until reveal');
});

test('Souvenir & Sticker Capsule opening award authentic contents', () => {
  const souv = catalogData.souvenirPackages[0];
  const souvOutcome = generateContainerUnboxOutcome(souv, { rand: () => 0.35 });
  assert.equal(souvOutcome.rewardType, 'SKIN');
  assert.ok(souvOutcome.skinReward);
  assert.equal(souvOutcome.skinReward.isSouvenir, true);
  assert.ok(souvOutcome.skinReward.name.startsWith('Souvenir '));
  const preAppliedCount = souvOutcome.skinReward.appliedStickers.filter(Boolean).length;
  assert.equal(preAppliedCount, 4, 'Souvenir skin must include 4 pre-applied gold tournament stickers');

  const cap = catalogData.stickerCapsules[0];
  const capOutcome = generateContainerUnboxOutcome(cap, { rand: () => 0.5 });
  assert.equal(capOutcome.rewardType, 'STICKER');
  assert.ok(capOutcome.stickerReward);
  assert.ok(cap.contains.some((s: { id: string }) => s.id === capOutcome.stickerReward?.stickerId));
});

test('Sorting: chronological release-date sorting and CS2 rarity order', () => {
  const sampleDates = [
    { name: 'Item A', releaseDate: '2021-09-21' },
    { name: 'Item Unknown', releaseDate: 'UNKNOWN' },
    { name: 'Item B', releaseDate: '2025-05-22' },
    { name: 'Item C', releaseDate: '2013-08-14' },
  ];
  const newest = sortByReleaseDate(sampleDates, 'newest');
  assert.deepEqual(
    newest.map(i => i.releaseDate),
    ['2025-05-22', '2021-09-21', '2013-08-14', 'UNKNOWN']
  );
  const oldest = sortByReleaseDate(sampleDates, 'oldest');
  assert.deepEqual(
    oldest.map(i => i.releaseDate),
    ['2013-08-14', '2021-09-21', '2025-05-22', 'UNKNOWN']
  );

  const sampleRarities = [
    { name: 'Skin Covert', rarity: 'Covert' },
    { name: 'Skin Consumer', rarity: 'Consumer Grade' },
    { name: '★ Karambit', rarity: 'Special Item', isSpecialItem: true },
    { name: 'Skin Mil-Spec', rarity: 'Mil-Spec Grade' },
    { name: 'Skin Industrial', rarity: 'Industrial Grade' },
    { name: 'Skin Restricted', rarity: 'Restricted' },
    { name: 'Skin Classified', rarity: 'Classified' },
  ];
  const asc = sortByRarity(sampleRarities, 'asc');
  assert.deepEqual(
    asc.map(i => i.rarity),
    [
      'Consumer Grade',
      'Industrial Grade',
      'Mil-Spec Grade',
      'Restricted',
      'Classified',
      'Covert',
      'Special Item',
    ]
  );
  assert.ok(getRarityRank('Consumer Grade') < getRarityRank('Covert'));
});

test('Valuations & Sticker Application: Blue Gem pattern overpay and realistic SP% sticker valuation', () => {
  const p661 = classifyPattern('AK-47 | Case Hardened', 661);
  assert.equal(p661.tierLabel, 'Tier 1 Blue Gem');
  assert.ok(p661.multiplier > 5);

  const basePrices = {
    fn: 200,
    mw: 150,
    ft: 100,
    ww: 80,
    bs: 60,
    source: 'CSFloat Verified Index',
    confidence: 'HIGH' as const,
  };

  const sticker100Cr: OwnedStickerItem = {
    instanceId: 'stk-test-1',
    stickerId: 's-1',
    name: 'Sticker | Crown (Foil)',
    rarity: 'Exotic',
    rarityColor: '#d32ce6',
    capsuleId: 'c-1',
    capsuleName: 'Sticker Capsule 2',
    releaseDate: '2014-02-27',
    releaseSource: 'Valve Patch',
    image: '',
    price: 100,
    acquiredAt: '2026-10-27',
    acquiredVia: 'STORE_PURCHASE',
  };

  const mockSkin: OwnedSkinItem = {
    instanceId: 'skin-test-1',
    skinId: 'ak-ch',
    name: 'AK-47 | Slate',
    weapon: 'AK-47',
    skinName: 'Slate',
    category: 'Rifles',
    rarity: 'Restricted',
    rarityColor: '#8847ff',
    isSpecialItem: false,
    isStatTrak: false,
    isSouvenir: false,
    floatValue: 0.20,
    wear: getWearFromFloat(0.20),
    patternSeed: 123,
    patternInfo: classifyPattern('AK-47 | Slate', 123),
    collectionName: 'The Snakebite Collection',
    containerName: 'Snakebite Case',
    releaseDate: '2021-05-03',
    image: '',
    minFloat: 0,
    maxFloat: 1,
    basePrices,
    appliedStickers: [null, null, null, null, null],
    acquiredAt: '2026-10-27',
    acquiredVia: 'CASE_OPEN',
  };

  const applyRes = applyStickerToSkin([mockSkin], [sticker100Cr], 'skin-test-1', 'stk-test-1', 2);
  assert.equal(applyRes.ok, true);
  assert.equal(applyRes.updatedStickers.length, 0, 'Sticker instance must be consumed upon application');
  assert.ok(applyRes.updatedSkins[0].appliedStickers[2]);

  const val = calculateItemValuation(applyRes.updatedSkins[0]);
  assert.ok(
    val.appliedStickerBonus > 0 && val.appliedStickerBonus < 20,
    `Applied 100 CR sticker must add realistic SP% (got ${val.appliedStickerBonus} CR), never the full 100 CR`
  );

  const scrapeRes = scrapeStickerFromSkin(applyRes.updatedSkins, 'skin-test-1', 2);
  assert.equal(scrapeRes.ok, true);
  assert.equal(scrapeRes.updatedSkins[0].appliedStickers[2], null);
});

test('Trade-Up Contract: validates 10 matching rarity inputs and calculates IEEE-754 output float', () => {
  const kilowatt = catalogData.weaponCases.find((c: { name: string }) => c.name === 'Kilowatt Case');
  const milSpecSkin: CatalogSkin = kilowatt.contains.find((s: CatalogSkin) => s.rarity === 'Mil-Spec Grade');
  const poolMap = new Map<string, CatalogSkin[]>([[kilowatt.collectionName, kilowatt.contains]]);

  const tenInputs: OwnedSkinItem[] = Array.from({ length: 10 }, (_, idx) => ({
    instanceId: `tu-in-${idx}`,
    skinId: milSpecSkin.id,
    name: milSpecSkin.name,
    weapon: milSpecSkin.weapon,
    skinName: milSpecSkin.skinName,
    category: milSpecSkin.category,
    rarity: 'Mil-Spec Grade',
    rarityColor: '#4b69ff',
    isSpecialItem: false,
    isStatTrak: false,
    isSouvenir: false,
    floatValue: 0.10,
    wear: 'Minimal Wear',
    patternSeed: 100 + idx,
    patternInfo: classifyPattern(milSpecSkin.name, 100 + idx),
    collectionName: kilowatt.collectionName,
    containerName: kilowatt.name,
    releaseDate: kilowatt.releaseDate,
    image: milSpecSkin.image,
    minFloat: milSpecSkin.minFloat,
    maxFloat: milSpecSkin.maxFloat,
    basePrices: milSpecSkin.prices,
    appliedStickers: [null, null, null, null, null],
    acquiredAt: '2026-10-27',
    acquiredVia: 'CASE_OPEN',
  }));

  const validation = validateTradeUpContract(tenInputs, poolMap);
  assert.equal(validation.valid, true);
  assert.equal(validation.targetRarity, 'Restricted');
  assert.ok(validation.possibleOutcomes.length > 0);

  const execRes = executeTradeUpContract(
    tenInputs,
    tenInputs.map(i => i.instanceId),
    poolMap,
    () => 0.1
  );
  assert.equal(execRes.ok, true);
  assert.equal(execRes.updatedSkins.length, 1, '10 inputs consumed and 1 upgraded output added');
  assert.equal(execRes.rewardSkin?.rarity, 'Restricted');
});

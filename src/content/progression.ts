import type { ProgressBranch, ProgressNodeDef } from '@/types/content';
import { tableDefiner } from './define';

/**
 * The progression tree. Nodes refer to each other, so the id union is declared
 * by hand (like quests). Zero-cost nodes without parents are unlocked at the
 * start; everything else costs progression points earned from tier-ups,
 * quests and missions. Skills and stations are never here: skills grow by
 * use, stations stand in settlements. The tree opens zones, features and perks.
 */
export type ProgressNodeId =
  // gathering
  | 'gathering_basics' | 'deep_pockets' | 'quick_hands' | 'keen_eye' | 'pack_mule' | 'swift_hands' | 'master_gatherer'
  // crafting
  | 'crafting_basics' | 'steady_hands' | 'hot_coals' | 'batch_work' | 'careful_work' | 'master_artisan'
  // combat
  | 'combat_basics' | 'looter' | 'toughness' | 'second_wind' | 'dual_wield' | 'auto_eat' | 'veteran' | 'iron_skin' | 'champion'
  // world
  | 'world_basics' | 'kingsport' | 'barter' | 'haggling' | 'whispering_woods' | 'old_iron_mines' | 'blackfen_marsh' | 'grey_peaks' | 'merchant_prince' | 'ashen_wastes' | 'dragons_reach';

export const BRANCHES: readonly { id: ProgressBranch; title: string; blurb: string }[] = [
  { id: 'gathering', title: 'Gathering', blurb: 'Faster hands, bigger bags.' },
  { id: 'crafting', title: 'Crafting', blurb: 'Faster work, more from every cycle.' },
  { id: 'combat', title: 'Combat', blurb: 'Toughness, gold, two weapons, auto-eat.' },
  { id: 'world', title: 'World', blurb: 'Zones, the trade city, better prices.' },
];

const defineNodes = tableDefiner<ProgressNodeDef>();

export const PROGRESSION: { readonly [K in ProgressNodeId]: ProgressNodeDef & { readonly id: K } } = defineNodes({
  // ---- gathering ----
  gathering_basics: { name: 'Gathering Basics', description: 'Rocks, trees and water. +4 bag slots to start.', branch: 'gathering', cost: 0, requires: [], requirements: [], unlocks: [{ type: 'perk', perk: 'inventory_slots', value: 4 }] },
  deep_pockets: { name: 'Deep Pockets', description: '+8 bag slots.', branch: 'gathering', cost: 2, requires: ['gathering_basics'], requirements: [], unlocks: [{ type: 'perk', perk: 'inventory_slots', value: 8 }] },
  quick_hands: { name: 'Quick Hands', description: 'Gather 10% faster.', branch: 'gathering', cost: 2, requires: ['gathering_basics'], requirements: [{ type: 'any_tier', tier: 2 }], unlocks: [{ type: 'perk', perk: 'gather_speed', value: 0.1 }] },
  keen_eye: { name: 'Keen Eye', description: '+10% gathering xp.', branch: 'gathering', cost: 3, requires: ['quick_hands'], requirements: [], unlocks: [{ type: 'perk', perk: 'gather_xp', value: 0.1 }] },
  pack_mule: { name: 'Pack Mule', description: '+8 more bag slots.', branch: 'gathering', cost: 3, requires: ['deep_pockets'], requirements: [{ type: 'any_tier', tier: 3 }], unlocks: [{ type: 'perk', perk: 'inventory_slots', value: 8 }] },
  swift_hands: { name: 'Swift Hands', description: 'Gather another 15% faster.', branch: 'gathering', cost: 5, requires: ['keen_eye'], requirements: [{ type: 'any_tier', tier: 4 }], unlocks: [{ type: 'perk', perk: 'gather_speed', value: 0.15 }] },
  master_gatherer: { name: 'Master Gatherer', description: '+15% gathering xp and +8 bag slots.', branch: 'gathering', cost: 7, requires: ['swift_hands', 'pack_mule'], requirements: [{ type: 'any_tier', tier: 5 }], unlocks: [{ type: 'perk', perk: 'gather_xp', value: 0.15 }, { type: 'perk', perk: 'inventory_slots', value: 8 }] },

  // ---- crafting ----
  crafting_basics: { name: 'Crafting Basics', description: 'A campfire and the sense to use it. +5% crafting xp.', branch: 'crafting', cost: 0, requires: [], requirements: [], unlocks: [{ type: 'perk', perk: 'craft_xp', value: 0.05 }] },
  steady_hands: { name: 'Steady Hands', description: '+10% crafting xp.', branch: 'crafting', cost: 2, requires: ['crafting_basics'], requirements: [{ type: 'any_tier', tier: 2 }], unlocks: [{ type: 'perk', perk: 'craft_xp', value: 0.1 }] },
  hot_coals: { name: 'Hot Coals', description: 'Craft 10% faster.', branch: 'crafting', cost: 2, requires: ['crafting_basics'], requirements: [{ type: 'tier', skill: 'smithing', tier: 2 }], unlocks: [{ type: 'perk', perk: 'craft_speed', value: 0.1 }] },
  batch_work: { name: 'Batch Work', description: 'Craft another 15% faster.', branch: 'crafting', cost: 4, requires: ['hot_coals'], requirements: [{ type: 'any_tier', tier: 3 }], unlocks: [{ type: 'perk', perk: 'craft_speed', value: 0.15 }] },
  careful_work: { name: 'Careful Work', description: '+10% crafting xp.', branch: 'crafting', cost: 4, requires: ['steady_hands'], requirements: [{ type: 'any_tier', tier: 4 }], unlocks: [{ type: 'perk', perk: 'craft_xp', value: 0.1 }] },
  master_artisan: { name: 'Master Artisan', description: '+15% crafting xp and 10% faster work.', branch: 'crafting', cost: 7, requires: ['batch_work', 'careful_work'], requirements: [{ type: 'any_tier', tier: 5 }], unlocks: [{ type: 'perk', perk: 'craft_xp', value: 0.15 }, { type: 'perk', perk: 'craft_speed', value: 0.1 }] },

  // ---- combat ----
  combat_basics: { name: 'Combat Basics', description: 'A knife and the will to live. +5 max hp.', branch: 'combat', cost: 0, requires: [], requirements: [], unlocks: [{ type: 'perk', perk: 'max_hp', value: 5 }] },
  looter: { name: 'Looter', description: '+15% gold from monsters.', branch: 'combat', cost: 2, requires: ['combat_basics'], requirements: [{ type: 'any_tier', tier: 2 }], unlocks: [{ type: 'perk', perk: 'gold_find', value: 0.15 }] },
  toughness: { name: 'Toughness', description: '+10 max hp.', branch: 'combat', cost: 2, requires: ['combat_basics'], requirements: [{ type: 'tier', skill: 'vitality', tier: 2 }], unlocks: [{ type: 'perk', perk: 'max_hp', value: 10 }] },
  second_wind: { name: 'Second Wind', description: 'Regenerate hp 25% faster.', branch: 'combat', cost: 3, requires: ['toughness'], requirements: [], unlocks: [{ type: 'perk', perk: 'regen', value: 0.25 }] },
  dual_wield: { name: 'Dual Wield', description: 'Fight with a dagger in the off hand for half its stats.', branch: 'combat', cost: 3, requires: ['combat_basics'], requirements: [{ type: 'tier', skill: 'hand_weapons', tier: 2 }], unlocks: [{ type: 'feature', feature: 'dual_wield' }] },
  auto_eat: { name: 'Auto-Eat', description: 'Eat food automatically when below half hp.', branch: 'combat', cost: 4, requires: ['second_wind'], requirements: [{ type: 'tier', skill: 'vitality', tier: 3 }], unlocks: [{ type: 'feature', feature: 'auto_eat' }] },
  veteran: { name: 'Veteran', description: '+10% combat xp.', branch: 'combat', cost: 4, requires: ['toughness'], requirements: [{ type: 'any_tier', tier: 3 }], unlocks: [{ type: 'perk', perk: 'combat_xp', value: 0.1 }] },
  iron_skin: { name: 'Iron Skin', description: '+20 max hp.', branch: 'combat', cost: 5, requires: ['veteran'], requirements: [{ type: 'tier', skill: 'vitality', tier: 3 }], unlocks: [{ type: 'perk', perk: 'max_hp', value: 20 }] },
  champion: { name: 'Champion', description: '+15% combat xp and +20 max hp.', branch: 'combat', cost: 7, requires: ['iron_skin', 'auto_eat'], requirements: [{ type: 'tier', skill: 'vitality', tier: 5 }], unlocks: [{ type: 'perk', perk: 'combat_xp', value: 0.15 }, { type: 'perk', perk: 'max_hp', value: 20 }] },

  // ---- world ----
  world_basics: { name: 'Greenhollow', description: 'The village and the hills beyond it.', branch: 'world', cost: 0, requires: [], requirements: [], unlocks: [{ type: 'zone', zoneId: 'greenhollow' }, { type: 'zone', zoneId: 'copper_hills' }] },
  kingsport: { name: 'Kingsport', description: 'The road to the trade city and its market.', branch: 'world', cost: 2, requires: ['world_basics'], requirements: [], unlocks: [{ type: 'zone', zoneId: 'kingsport' }, { type: 'feature', feature: 'market' }] },
  barter: { name: 'Barter', description: 'Deal with wandering traders.', branch: 'world', cost: 1, requires: ['world_basics'], requirements: [], unlocks: [{ type: 'feature', feature: 'traders' }] },
  haggling: { name: 'Haggling', description: 'Shops pay 10% more for your goods.', branch: 'world', cost: 3, requires: ['kingsport'], requirements: [{ type: 'any_tier', tier: 2 }], unlocks: [{ type: 'perk', perk: 'sell_bonus', value: 0.1 }] },
  whispering_woods: { name: 'Whispering Woods', description: 'The lumber camp past the hills, once the goblins are handled.', branch: 'world', cost: 1, requires: ['world_basics'], requirements: [{ type: 'quest', questId: 'goblin_menace' }], unlocks: [{ type: 'zone', zoneId: 'whispering_woods' }] },
  old_iron_mines: { name: 'Old Iron Mines', description: 'Iron, coal and the old forge.', branch: 'world', cost: 2, requires: ['world_basics'], requirements: [{ type: 'any_tier', tier: 2 }], unlocks: [{ type: 'zone', zoneId: 'old_iron_mines' }] },
  blackfen_marsh: { name: 'Blackfen Marsh', description: 'Maples, salmon, the marsh tannery.', branch: 'world', cost: 3, requires: ['old_iron_mines', 'whispering_woods'], requirements: [{ type: 'any_tier', tier: 3 }], unlocks: [{ type: 'zone', zoneId: 'blackfen_marsh' }] },
  grey_peaks: { name: 'Grey Peaks', description: 'Mithril, yews and trolls.', branch: 'world', cost: 4, requires: ['blackfen_marsh'], requirements: [{ type: 'any_tier', tier: 4 }], unlocks: [{ type: 'zone', zoneId: 'grey_peaks' }] },
  merchant_prince: { name: 'Merchant Prince', description: 'Shops pay 15% more and monsters drop 10% more gold.', branch: 'world', cost: 5, requires: ['haggling'], requirements: [{ type: 'any_tier', tier: 4 }], unlocks: [{ type: 'perk', perk: 'sell_bonus', value: 0.15 }, { type: 'perk', perk: 'gold_find', value: 0.1 }] },
  ashen_wastes: { name: 'Ashen Wastes', description: 'Adamant under the cinders and the Ashforge.', branch: 'world', cost: 5, requires: ['grey_peaks'], requirements: [{ type: 'any_tier', tier: 5 }], unlocks: [{ type: 'zone', zoneId: 'ashen_wastes' }] },
  dragons_reach: { name: "Dragon's Reach", description: 'Rune, elder trees, and the two things that rule there.', branch: 'world', cost: 7, requires: ['ashen_wastes'], requirements: [{ type: 'any_tier', tier: 6 }], unlocks: [{ type: 'zone', zoneId: 'dragons_reach' }] },
});

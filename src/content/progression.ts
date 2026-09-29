import type { ProgressBranch, ProgressNodeDef } from '@/types/content';
import { tableDefiner } from './define';

/**
 * The progression tree. Nodes refer to each other, so the id union is declared
 * by hand (like quests). Zero-cost nodes without parents are unlocked at the
 * start; everything else costs progression points earned from tier-ups and
 * quests. Total cost is tuned to what a completed character can earn.
 */
export type ProgressNodeId =
  // gathering
  | 'gathering_basics' | 'farming' | 'harvesting' | 'quick_hands' | 'keen_eye' | 'deep_pockets' | 'pack_mule' | 'swift_hands' | 'master_gatherer'
  // crafting
  | 'crafting_basics' | 'furnace' | 'anvil' | 'sawbench' | 'tannery' | 'hot_coals' | 'steady_hands' | 'batch_work' | 'master_artisan'
  // combat
  | 'combat_basics' | 'swordplay' | 'axework' | 'armor_training' | 'shield_training' | 'toughness' | 'second_wind' | 'auto_eat' | 'looter' | 'veteran' | 'iron_skin' | 'champion'
  // world
  | 'world_basics' | 'market_access' | 'barter' | 'haggling' | 'whispering_woods' | 'old_iron_mines' | 'blackfen_marsh' | 'grey_peaks' | 'ashen_wastes' | 'dragons_reach' | 'merchant_prince';

export const BRANCHES: readonly { id: ProgressBranch; title: string; blurb: string }[] = [
  { id: 'gathering', title: 'Gathering', blurb: 'New gathering skills, faster hands, bigger bags.' },
  { id: 'crafting', title: 'Crafting', blurb: 'Stations and the skills that use them.' },
  { id: 'combat', title: 'Combat', blurb: 'Weapon and armor skills, toughness, auto-eat.' },
  { id: 'world', title: 'World', blurb: 'Zones, the market, and better prices.' },
];

const defineNodes = tableDefiner<ProgressNodeDef>();

export const PROGRESSION: { readonly [K in ProgressNodeId]: ProgressNodeDef & { readonly id: K } } = defineNodes({
  // ---- gathering ----
  gathering_basics: {
    name: 'Gathering Basics', description: 'Rocks, trees and water. Where everyone starts.', branch: 'gathering', cost: 0, requires: [], requirements: [],
    unlocks: [{ type: 'skill', skillId: 'mining' }, { type: 'skill', skillId: 'woodcutting' }, { type: 'skill', skillId: 'fishing' }],
  },
  farming: {
    name: 'Farming', description: 'Work the fields. Crops for the kitchen.', branch: 'gathering', cost: 1, requires: ['gathering_basics'], requirements: [],
    unlocks: [{ type: 'skill', skillId: 'farming' }],
  },
  harvesting: {
    name: 'Harvesting', description: 'Know which weeds are worth money.', branch: 'gathering', cost: 1, requires: ['farming'], requirements: [],
    unlocks: [{ type: 'skill', skillId: 'harvesting' }],
  },
  deep_pockets: {
    name: 'Deep Pockets', description: '+8 inventory slots.', branch: 'gathering', cost: 2, requires: ['gathering_basics'], requirements: [],
    unlocks: [{ type: 'perk', perk: 'inventory_slots', value: 8 }],
  },
  quick_hands: {
    name: 'Quick Hands', description: 'Gather 10% faster.', branch: 'gathering', cost: 2, requires: ['gathering_basics'], requirements: [{ type: 'any_tier', tier: 2 }],
    unlocks: [{ type: 'perk', perk: 'gather_speed', value: 0.1 }],
  },
  keen_eye: {
    name: 'Keen Eye', description: '+10% gathering xp.', branch: 'gathering', cost: 2, requires: ['quick_hands'], requirements: [],
    unlocks: [{ type: 'perk', perk: 'gather_xp', value: 0.1 }],
  },
  pack_mule: {
    name: 'Pack Mule', description: '+8 more inventory slots.', branch: 'gathering', cost: 3, requires: ['deep_pockets'], requirements: [{ type: 'any_tier', tier: 3 }],
    unlocks: [{ type: 'perk', perk: 'inventory_slots', value: 8 }],
  },
  swift_hands: {
    name: 'Swift Hands', description: 'Gather another 15% faster.', branch: 'gathering', cost: 4, requires: ['keen_eye'], requirements: [{ type: 'any_tier', tier: 4 }],
    unlocks: [{ type: 'perk', perk: 'gather_speed', value: 0.15 }],
  },
  master_gatherer: {
    name: 'Master Gatherer', description: '+15% gathering xp.', branch: 'gathering', cost: 5, requires: ['swift_hands', 'pack_mule'], requirements: [{ type: 'any_tier', tier: 5 }],
    unlocks: [{ type: 'perk', perk: 'gather_xp', value: 0.15 }],
  },

  // ---- crafting ----
  crafting_basics: {
    name: 'Crafting Basics', description: 'A campfire and the sense to use it.', branch: 'crafting', cost: 0, requires: [], requirements: [],
    unlocks: [{ type: 'skill', skillId: 'cooking' }, { type: 'station', stationId: 'campfire' }],
  },
  furnace: {
    name: 'Furnace', description: 'Smelt ore into bars. Opens Blacksmithing.', branch: 'crafting', cost: 1, requires: ['crafting_basics'], requirements: [],
    unlocks: [{ type: 'skill', skillId: 'blacksmithing' }, { type: 'station', stationId: 'furnace' }],
  },
  anvil: {
    name: 'Anvil', description: 'Forge bars into weapons and armor.', branch: 'crafting', cost: 1, requires: ['furnace'], requirements: [],
    unlocks: [{ type: 'station', stationId: 'anvil' }],
  },
  sawbench: {
    name: 'Sawbench', description: 'Shields from logs. Opens Woodworking.', branch: 'crafting', cost: 1, requires: ['crafting_basics'], requirements: [],
    unlocks: [{ type: 'skill', skillId: 'woodworking' }, { type: 'station', stationId: 'sawbench' }],
  },
  tannery: {
    name: 'Tannery', description: 'Light armor from hides. Opens Leatherworking.', branch: 'crafting', cost: 1, requires: ['crafting_basics'], requirements: [],
    unlocks: [{ type: 'skill', skillId: 'leatherworking' }, { type: 'station', stationId: 'tannery' }],
  },
  steady_hands: {
    name: 'Steady Hands', description: '+10% crafting xp.', branch: 'crafting', cost: 2, requires: ['crafting_basics'], requirements: [{ type: 'any_tier', tier: 2 }],
    unlocks: [{ type: 'perk', perk: 'craft_xp', value: 0.1 }],
  },
  hot_coals: {
    name: 'Hot Coals', description: 'Craft 10% faster.', branch: 'crafting', cost: 2, requires: ['anvil'], requirements: [{ type: 'tier', skill: 'blacksmithing', tier: 2 }],
    unlocks: [{ type: 'perk', perk: 'craft_speed', value: 0.1 }],
  },
  batch_work: {
    name: 'Batch Work', description: 'Craft another 15% faster.', branch: 'crafting', cost: 3, requires: ['hot_coals'], requirements: [{ type: 'any_tier', tier: 3 }],
    unlocks: [{ type: 'perk', perk: 'craft_speed', value: 0.15 }],
  },
  master_artisan: {
    name: 'Master Artisan', description: '+15% crafting xp.', branch: 'crafting', cost: 5, requires: ['batch_work', 'steady_hands'], requirements: [{ type: 'any_tier', tier: 5 }],
    unlocks: [{ type: 'perk', perk: 'craft_xp', value: 0.15 }],
  },

  // ---- combat ----
  combat_basics: {
    name: 'Combat Basics', description: 'A knife and the will to live.', branch: 'combat', cost: 0, requires: [], requirements: [],
    unlocks: [{ type: 'skill', skillId: 'daggers' }, { type: 'skill', skillId: 'vitality' }],
  },
  swordplay: {
    name: 'Swordplay', description: 'Wield swords. Opens the Swords skill.', branch: 'combat', cost: 1, requires: ['combat_basics'], requirements: [],
    unlocks: [{ type: 'skill', skillId: 'swords' }],
  },
  axework: {
    name: 'Axework', description: 'Wield axes. Opens the Axes skill.', branch: 'combat', cost: 1, requires: ['combat_basics'], requirements: [],
    unlocks: [{ type: 'skill', skillId: 'axes' }],
  },
  armor_training: {
    name: 'Armor Training', description: 'Wear armor. Opens the Armor skill.', branch: 'combat', cost: 1, requires: ['combat_basics'], requirements: [],
    unlocks: [{ type: 'skill', skillId: 'armor' }],
  },
  shield_training: {
    name: 'Shield Training', description: 'Carry a shield. Opens the Shields skill.', branch: 'combat', cost: 1, requires: ['armor_training'], requirements: [],
    unlocks: [{ type: 'skill', skillId: 'shields' }],
  },
  looter: {
    name: 'Looter', description: '+15% gold from monsters.', branch: 'combat', cost: 2, requires: ['combat_basics'], requirements: [{ type: 'any_tier', tier: 2 }],
    unlocks: [{ type: 'perk', perk: 'gold_find', value: 0.15 }],
  },
  toughness: {
    name: 'Toughness', description: '+10 max hp.', branch: 'combat', cost: 2, requires: ['combat_basics'], requirements: [{ type: 'tier', skill: 'vitality', tier: 2 }],
    unlocks: [{ type: 'perk', perk: 'max_hp', value: 10 }],
  },
  second_wind: {
    name: 'Second Wind', description: 'Regenerate hp 25% faster.', branch: 'combat', cost: 2, requires: ['toughness'], requirements: [],
    unlocks: [{ type: 'perk', perk: 'regen', value: 0.25 }],
  },
  auto_eat: {
    name: 'Auto-Eat', description: 'Eat food automatically when below half hp.', branch: 'combat', cost: 3, requires: ['second_wind'], requirements: [{ type: 'tier', skill: 'vitality', tier: 3 }],
    unlocks: [{ type: 'feature', feature: 'auto_eat' }],
  },
  veteran: {
    name: 'Veteran', description: '+10% combat xp.', branch: 'combat', cost: 3, requires: ['toughness'], requirements: [{ type: 'any_tier', tier: 3 }],
    unlocks: [{ type: 'perk', perk: 'combat_xp', value: 0.1 }],
  },
  iron_skin: {
    name: 'Iron Skin', description: '+20 max hp.', branch: 'combat', cost: 4, requires: ['veteran', 'armor_training'], requirements: [{ type: 'tier', skill: 'armor', tier: 3 }],
    unlocks: [{ type: 'perk', perk: 'max_hp', value: 20 }],
  },
  champion: {
    name: 'Champion', description: '+15% combat xp and +20 max hp.', branch: 'combat', cost: 5, requires: ['iron_skin'], requirements: [{ type: 'tier', skill: 'vitality', tier: 5 }],
    unlocks: [{ type: 'perk', perk: 'combat_xp', value: 0.15 }, { type: 'perk', perk: 'max_hp', value: 20 }],
  },

  // ---- world ----
  world_basics: {
    name: 'Greenhollow', description: 'The village and the hills beyond it.', branch: 'world', cost: 0, requires: [], requirements: [],
    unlocks: [{ type: 'zone', zoneId: 'greenhollow' }, { type: 'zone', zoneId: 'copper_hills' }],
  },
  market_access: {
    name: 'Market Access', description: 'Trade on the village market.', branch: 'world', cost: 1, requires: ['world_basics'], requirements: [],
    unlocks: [{ type: 'feature', feature: 'market' }],
  },
  barter: {
    name: 'Barter', description: 'Deal with wandering traders.', branch: 'world', cost: 1, requires: ['world_basics'], requirements: [],
    unlocks: [{ type: 'feature', feature: 'traders' }],
  },
  haggling: {
    name: 'Haggling', description: 'Shops pay 10% more for your goods.', branch: 'world', cost: 2, requires: ['market_access'], requirements: [{ type: 'any_tier', tier: 2 }],
    unlocks: [{ type: 'perk', perk: 'sell_bonus', value: 0.1 }],
  },
  whispering_woods: {
    name: 'Whispering Woods', description: 'The road past the hills, once the goblins are handled.', branch: 'world', cost: 1, requires: ['world_basics'], requirements: [{ type: 'quest', questId: 'goblin_menace' }],
    unlocks: [{ type: 'zone', zoneId: 'whispering_woods' }],
  },
  old_iron_mines: {
    name: 'Old Iron Mines', description: 'Iron and coal under the hills.', branch: 'world', cost: 1, requires: ['world_basics'], requirements: [{ type: 'any_tier', tier: 2 }],
    unlocks: [{ type: 'zone', zoneId: 'old_iron_mines' }],
  },
  blackfen_marsh: {
    name: 'Blackfen Marsh', description: 'Maples, salmon, and mud with intent.', branch: 'world', cost: 2, requires: ['old_iron_mines', 'whispering_woods'], requirements: [{ type: 'any_tier', tier: 3 }],
    unlocks: [{ type: 'zone', zoneId: 'blackfen_marsh' }],
  },
  grey_peaks: {
    name: 'Grey Peaks', description: 'Mithril, yews and trolls.', branch: 'world', cost: 3, requires: ['blackfen_marsh'], requirements: [{ type: 'any_tier', tier: 4 }],
    unlocks: [{ type: 'zone', zoneId: 'grey_peaks' }],
  },
  merchant_prince: {
    name: 'Merchant Prince', description: 'Shops pay 15% more and monsters drop 10% more gold.', branch: 'world', cost: 4, requires: ['haggling'], requirements: [{ type: 'any_tier', tier: 4 }],
    unlocks: [{ type: 'perk', perk: 'sell_bonus', value: 0.15 }, { type: 'perk', perk: 'gold_find', value: 0.1 }],
  },
  ashen_wastes: {
    name: 'Ashen Wastes', description: 'Adamant under the cinders.', branch: 'world', cost: 4, requires: ['grey_peaks'], requirements: [{ type: 'any_tier', tier: 5 }],
    unlocks: [{ type: 'zone', zoneId: 'ashen_wastes' }],
  },
  dragons_reach: {
    name: "Dragon's Reach", description: 'Rune, elder trees, and the two things that rule there.', branch: 'world', cost: 5, requires: ['ashen_wastes'], requirements: [{ type: 'any_tier', tier: 6 }],
    unlocks: [{ type: 'zone', zoneId: 'dragons_reach' }],
  },
});

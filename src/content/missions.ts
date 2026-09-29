import type { ChapterDef, MissionDef } from '@/types/content';
import { tableDefiner } from './define';

/** The campaign. Chapter N opens when every mission of chapter N-1 has been claimed. */
export const CHAPTERS: readonly ChapterDef[] = [
  { number: 1, name: 'First Steps', blurb: 'Learn the village and what your hands can do.' },
  { number: 2, name: 'Copper and Tin', blurb: 'The smelting camp in the hills, and the goblins in it.' },
  { number: 3, name: 'The Trade City', blurb: 'Kingsport, where everything has a price.' },
  { number: 4, name: 'Whispering Woods', blurb: 'Timber, trout, wolves and a hermit.' },
  { number: 5, name: 'Iron Age', blurb: 'The old mines and the old forge.' },
  { number: 6, name: 'Blackfen', blurb: 'Steel, studded leather, and a lot of mud.' },
  { number: 7, name: 'Grey Peaks', blurb: 'Mithril and the things that guard it.' },
  { number: 8, name: 'Ashes and Dragons', blurb: 'Adamant, rune, and the end of the road.' },
];

const defineMissions = tableDefiner<MissionDef>();

export const MISSIONS = defineMissions({
  // ---- 1: First Steps ----
  first_logs: { name: 'First Logs', description: 'Chop ten oak logs in the village grove.', chapter: 1, objectives: [{ type: 'gather', itemId: 'oak_log', count: 10 }], rewards: [{ type: 'gold', amount: 20 }, { type: 'xp', skill: 'woodcutting', amount: 100 }] },
  first_catch: { name: 'First Catch', description: 'Fish ten shrimp from the shallows.', chapter: 1, objectives: [{ type: 'gather', itemId: 'raw_shrimp', count: 10 }], rewards: [{ type: 'gold', amount: 20 }, { type: 'xp', skill: 'fishing', amount: 100 }] },
  first_meal: { name: 'First Meal', description: 'Cook five shrimp at the campfire.', chapter: 1, objectives: [{ type: 'craft', recipeId: 'cook_shrimp', count: 5 }], rewards: [{ type: 'gold', amount: 30 }, { type: 'xp', skill: 'cooking', amount: 150 }] },
  pest_control: { name: 'Pest Control', description: 'Kill five giant rats.', chapter: 1, objectives: [{ type: 'kill', monsterId: 'rat', count: 5 }], rewards: [{ type: 'gold', amount: 30 }, { type: 'xp', skill: 'vitality', amount: 100 }] },
  meet_the_elder: { name: 'Meet the Elder', description: 'Talk to Maren.', chapter: 1, objectives: [{ type: 'talk', npcId: 'elder_maren' }], rewards: [{ type: 'gold', amount: 10 }, { type: 'points', amount: 1 }] },
  armed: { name: 'Armed', description: 'Equip a weapon in your main hand.', chapter: 1, objectives: [{ type: 'equip', kind: 'weapon' }], rewards: [{ type: 'gold', amount: 20 }, { type: 'xp', skill: 'daggers', amount: 100 }] },

  // ---- 2: Copper and Tin ----
  into_the_hills: { name: 'Into the Hills', description: 'Walk to Copper Hills.', chapter: 2, objectives: [{ type: 'visit', zoneId: 'copper_hills' }], rewards: [{ type: 'gold', amount: 20 }, { type: 'points', amount: 1 }] },
  ore_haul: { name: 'Ore Haul', description: 'Mine twenty copper and twenty tin.', chapter: 2, objectives: [{ type: 'gather', itemId: 'copper_ore', count: 20 }, { type: 'gather', itemId: 'tin_ore', count: 20 }], rewards: [{ type: 'gold', amount: 60 }, { type: 'xp', skill: 'mining', amount: 200 }] },
  meet_the_prospector: { name: 'Meet the Prospector', description: 'Talk to Dun at the outpost.', chapter: 2, objectives: [{ type: 'talk', npcId: 'prospector_dun' }], rewards: [{ type: 'gold', amount: 20 }, { type: 'points', amount: 1 }] },
  first_bars: { name: 'First Bars', description: 'Smelt ten bronze bars.', chapter: 2, objectives: [{ type: 'craft', recipeId: 'smelt_bronze_bar', count: 10 }], rewards: [{ type: 'gold', amount: 80 }, { type: 'xp', skill: 'blacksmithing', amount: 250 }] },
  blade_of_bronze: { name: 'Blade of Bronze', description: 'Forge a bronze sword at the anvil.', chapter: 2, objectives: [{ type: 'craft', recipeId: 'smith_bronze_sword', count: 1 }], rewards: [{ type: 'gold', amount: 100 }, { type: 'xp', skill: 'blacksmithing', amount: 200 }, { type: 'item', itemId: 'bronze_helmet', qty: 1 }] },
  goblin_hunt: { name: 'Goblin Hunt', description: 'Kill fifteen goblins.', chapter: 2, objectives: [{ type: 'kill', monsterId: 'goblin', count: 15 }], rewards: [{ type: 'gold', amount: 120 }, { type: 'xp', skill: 'vitality', amount: 300 }, { type: 'points', amount: 1 }] },

  // ---- 3: The Trade City ----
  city_gates: { name: 'City Gates', description: 'Unlock Kingsport and walk through its gates.', chapter: 3, objectives: [{ type: 'unlock', nodeId: 'kingsport' }, { type: 'visit', zoneId: 'kingsport' }], rewards: [{ type: 'gold', amount: 50 }, { type: 'points', amount: 1 }] },
  first_sale: { name: 'First Sale', description: 'Make five trades on the market.', chapter: 3, objectives: [{ type: 'trade', kind: 'market', count: 5 }], rewards: [{ type: 'gold', amount: 100 }] },
  stocking_up: { name: 'Stocking Up', description: 'Buy or sell five times at shops.', chapter: 3, objectives: [{ type: 'trade', kind: 'shop', count: 5 }], rewards: [{ type: 'gold', amount: 60 }] },
  dressed_for_town: { name: 'Dressed for Town', description: 'Wear something on your head and torso.', chapter: 3, objectives: [{ type: 'equip', kind: 'head' }, { type: 'equip', kind: 'body' }], rewards: [{ type: 'gold', amount: 80 }, { type: 'xp', skill: 'armor', amount: 200 }] },
  second_tier: { name: 'Second Tier', description: 'Bring any skill to tier 2.', chapter: 3, objectives: [{ type: 'any_tier', tier: 2 }], rewards: [{ type: 'gold', amount: 100 }, { type: 'points', amount: 1 }] },

  // ---- 4: Whispering Woods ----
  open_the_woods: { name: 'Open the Woods', description: 'Unlock Whispering Woods.', chapter: 4, objectives: [{ type: 'unlock', nodeId: 'whispering_woods' }], rewards: [{ type: 'points', amount: 1 }] },
  willow_run: { name: 'Willow Run', description: 'Chop thirty willow logs.', chapter: 4, objectives: [{ type: 'gather', itemId: 'willow_log', count: 30 }], rewards: [{ type: 'gold', amount: 150 }, { type: 'xp', skill: 'woodcutting', amount: 400 }] },
  trout_run: { name: 'Trout Run', description: 'Catch fifteen trout.', chapter: 4, objectives: [{ type: 'gather', itemId: 'raw_trout', count: 15 }], rewards: [{ type: 'gold', amount: 120 }, { type: 'xp', skill: 'fishing', amount: 300 }] },
  shield_wall: { name: 'Shield Wall', description: 'Carve a willow shield at the sawbench.', chapter: 4, objectives: [{ type: 'craft', recipeId: 'carve_willow_shield', count: 1 }], rewards: [{ type: 'gold', amount: 100 }, { type: 'xp', skill: 'woodworking', amount: 300 }] },
  wolf_pack: { name: 'Wolf Pack', description: 'Kill fifteen wolves.', chapter: 4, objectives: [{ type: 'kill', monsterId: 'wolf', count: 15 }], rewards: [{ type: 'gold', amount: 200 }, { type: 'xp', skill: 'vitality', amount: 400 }, { type: 'points', amount: 1 }] },
  hermit_deal: { name: "Hermit's Deal", description: 'Barter once with a wandering trader.', chapter: 4, objectives: [{ type: 'trade', kind: 'barter', count: 1 }], rewards: [{ type: 'gold', amount: 80 }] },

  // ---- 5: Iron Age ----
  down_the_shaft: { name: 'Down the Shaft', description: 'Unlock the Old Iron Mines.', chapter: 5, objectives: [{ type: 'unlock', nodeId: 'old_iron_mines' }], rewards: [{ type: 'points', amount: 1 }] },
  iron_haul: { name: 'Iron Haul', description: 'Mine forty iron ore.', chapter: 5, objectives: [{ type: 'gather', itemId: 'iron_ore', count: 40 }], rewards: [{ type: 'gold', amount: 250 }, { type: 'xp', skill: 'mining', amount: 600 }] },
  iron_bars: { name: 'Iron Bars', description: 'Smelt twenty iron bars at the mine forge.', chapter: 5, objectives: [{ type: 'craft', recipeId: 'smelt_iron_bar', count: 20 }], rewards: [{ type: 'gold', amount: 300 }, { type: 'xp', skill: 'blacksmithing', amount: 700 }] },
  iron_clad: { name: 'Iron Clad', description: 'Forge an iron platebody.', chapter: 5, objectives: [{ type: 'craft', recipeId: 'smith_iron_platebody', count: 1 }], rewards: [{ type: 'gold', amount: 400 }, { type: 'xp', skill: 'armor', amount: 500 }, { type: 'points', amount: 1 }] },
  bone_collector: { name: 'Bone Collector', description: 'Kill twenty skeleton miners.', chapter: 5, objectives: [{ type: 'kill', monsterId: 'skeleton', count: 20 }], rewards: [{ type: 'gold', amount: 400 }, { type: 'xp', skill: 'vitality', amount: 800 }] },
  black_seam: { name: 'Black Seam', description: 'Mine twenty coal.', chapter: 5, objectives: [{ type: 'gather', itemId: 'coal', count: 20 }], rewards: [{ type: 'gold', amount: 300 }, { type: 'xp', skill: 'mining', amount: 500 }, { type: 'points', amount: 1 }] },

  // ---- 6: Blackfen ----
  into_the_fen: { name: 'Into the Fen', description: 'Unlock Blackfen Marsh.', chapter: 6, objectives: [{ type: 'unlock', nodeId: 'blackfen_marsh' }], rewards: [{ type: 'points', amount: 2 }] },
  maple_and_salmon: { name: 'Maple and Salmon', description: 'Gather forty maple logs and twenty salmon.', chapter: 6, objectives: [{ type: 'gather', itemId: 'maple_log', count: 40 }, { type: 'gather', itemId: 'raw_salmon', count: 20 }], rewards: [{ type: 'gold', amount: 500 }, { type: 'xp', skill: 'woodcutting', amount: 800 }, { type: 'xp', skill: 'fishing', amount: 800 }] },
  studded: { name: 'Studded', description: 'Craft a studded body at the marsh tannery.', chapter: 6, objectives: [{ type: 'craft', recipeId: 'craft_studded_body', count: 1 }], rewards: [{ type: 'gold', amount: 600 }, { type: 'xp', skill: 'leatherworking', amount: 800 }] },
  steel_edge: { name: 'Steel Edge', description: 'Forge a steel sword.', chapter: 6, objectives: [{ type: 'craft', recipeId: 'smith_steel_sword', count: 1 }], rewards: [{ type: 'gold', amount: 800 }, { type: 'xp', skill: 'blacksmithing', amount: 1000 }, { type: 'points', amount: 1 }] },
  bear_necessities: { name: 'Bear Necessities', description: 'Kill twenty fen bears.', chapter: 6, objectives: [{ type: 'kill', monsterId: 'bear', count: 20 }], rewards: [{ type: 'gold', amount: 700 }, { type: 'xp', skill: 'vitality', amount: 1200 }] },

  // ---- 7: Grey Peaks ----
  up_the_peaks: { name: 'Up the Peaks', description: 'Unlock Grey Peaks.', chapter: 7, objectives: [{ type: 'unlock', nodeId: 'grey_peaks' }], rewards: [{ type: 'points', amount: 2 }] },
  mithril_vein: { name: 'Mithril Vein', description: 'Mine forty mithril ore.', chapter: 7, objectives: [{ type: 'gather', itemId: 'mithril_ore', count: 40 }], rewards: [{ type: 'gold', amount: 1500 }, { type: 'xp', skill: 'mining', amount: 2000 }] },
  mithril_works: { name: 'Mithril Works', description: 'Forge a mithril platebody and a mithril sword.', chapter: 7, objectives: [{ type: 'craft', recipeId: 'smith_mithril_platebody', count: 1 }, { type: 'craft', recipeId: 'smith_mithril_sword', count: 1 }], rewards: [{ type: 'gold', amount: 2500 }, { type: 'xp', skill: 'blacksmithing', amount: 3000 }, { type: 'points', amount: 2 }] },
  troll_toll: { name: 'Troll Toll', description: 'Kill twenty trolls and twenty harpies.', chapter: 7, objectives: [{ type: 'kill', monsterId: 'troll', count: 20 }, { type: 'kill', monsterId: 'harpy', count: 20 }], rewards: [{ type: 'gold', amount: 3000 }, { type: 'xp', skill: 'vitality', amount: 4000 }] },

  // ---- 8: Ashes and Dragons ----
  ashen_road: { name: 'Ashen Road', description: 'Unlock the Ashen Wastes.', chapter: 8, objectives: [{ type: 'unlock', nodeId: 'ashen_wastes' }], rewards: [{ type: 'points', amount: 3 }] },
  adamant: { name: 'Adamant', description: 'Smelt twenty adamant bars at the Ashforge.', chapter: 8, objectives: [{ type: 'craft', recipeId: 'smelt_adamant_bar', count: 20 }], rewards: [{ type: 'gold', amount: 5000 }, { type: 'xp', skill: 'blacksmithing', amount: 6000 }] },
  cult_breaker: { name: 'Cult Breaker', description: 'Kill twenty cultists and twenty wyverns.', chapter: 8, objectives: [{ type: 'kill', monsterId: 'cultist', count: 20 }, { type: 'kill', monsterId: 'wyvern', count: 20 }], rewards: [{ type: 'gold', amount: 6000 }, { type: 'xp', skill: 'vitality', amount: 8000 }, { type: 'points', amount: 2 }] },
  the_reach: { name: 'The Reach', description: "Unlock Dragon's Reach.", chapter: 8, objectives: [{ type: 'unlock', nodeId: 'dragons_reach' }], rewards: [{ type: 'points', amount: 3 }] },
  runeblade: { name: 'Runeblade', description: 'Forge a rune sword.', chapter: 8, objectives: [{ type: 'craft', recipeId: 'smith_rune_sword', count: 1 }], rewards: [{ type: 'gold', amount: 15000 }, { type: 'xp', skill: 'blacksmithing', amount: 20000 }, { type: 'points', amount: 3 }] },
  dragonslayer: { name: 'Dragonslayer', description: 'Kill ten drakes and ten liches.', chapter: 8, objectives: [{ type: 'kill', monsterId: 'drake', count: 10 }, { type: 'kill', monsterId: 'lich', count: 10 }], rewards: [{ type: 'gold', amount: 30000 }, { type: 'xp', skill: 'vitality', amount: 40000 }, { type: 'points', amount: 5 }] },
});

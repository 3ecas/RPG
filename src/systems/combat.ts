/** Idle auto-battle. Both sides have an attack timer; each fires when it fills. */
import { BALANCE } from '@/content/balance';
import type { Keyed, MonsterDef } from '@/types/content';
import type { MonsterId } from '@/types/ids';
import type { Activity, GameState } from '@/types/state';
import { fail, ok, type Result } from '@/types/result';
import * as activity from './activity';
import * as consumables from './consumables';
import type { Ctx } from './ctx';
import { combatXpForDamage, defenceXpForAttack, hitChance, maxHit } from './formulas';
import * as inventory from './inventory';
import { log } from './log';
import * as progression from './progression';
import * as skills from './skills';
import { armorPiecesWorn, derive, type DerivedStats, weaponSkill } from './stats';

type CombatActivity = Extract<Activity, { kind: 'combat' }>;

export function canFight(state: GameState, ctx: Ctx, monsterId: MonsterId): Result {
  const zone = ctx.content.zone(state.player.zoneId);
  if (!zone.monsters.includes(monsterId)) return fail(`There are no ${ctx.content.monster(monsterId).name}s in ${zone.name}.`);
  return ok();
}

export function start(state: GameState, ctx: Ctx, monsterId: MonsterId): Result {
  const check = canFight(state, ctx, monsterId);
  if (!check.ok) return check;
  activity.begin(state, ctx, { kind: 'combat', zoneId: state.player.zoneId, monsterId });
  spawn(state, ctx.content.monster(monsterId), 0);
  log(state, ctx, 'combat', `You attack a ${ctx.content.monster(monsterId).name}.`);
  return ok();
}

function spawn(state: GameState, monster: Keyed<MonsterDef, MonsterId>, kills: number): void {
  state.combat = { monsterId: monster.id, monsterHp: monster.hp, playerTimerMs: 0, monsterTimerMs: 0, kills };
}

export function tick(state: GameState, ctx: Ctx, a: CombatActivity, dtMs: number): void {
  const stats = derive(state, ctx);
  const autoEat = progression.hasFeature(state, ctx, 'auto_eat');
  let remaining = dtMs;
  // Sub-step so that attacks from both sides interleave correctly even for large dt (offline catch-up).
  while (remaining > 0 && state.activity === a) {
    const step = Math.min(remaining, BALANCE.TICK_MS);
    remaining -= step;
    const combat = state.combat;
    if (!combat) {
      spawn(state, ctx.content.monster(a.monsterId), 0);
      continue;
    }
    const monster = ctx.content.monster(combat.monsterId);
    if (autoEat) consumables.autoEat(state, ctx, stats.maxHp);
    combat.playerTimerMs += step;
    combat.monsterTimerMs += step;

    if (combat.playerTimerMs >= stats.attackIntervalMs) {
      combat.playerTimerMs -= stats.attackIntervalMs;
      playerAttack(state, ctx, stats, monster);
      if (combat.monsterHp <= 0) {
        onMonsterDeath(state, ctx, monster, combat.kills + 1);
        continue;
      }
    }
    if (combat.monsterTimerMs >= monster.attackIntervalMs) {
      combat.monsterTimerMs -= monster.attackIntervalMs;
      monsterAttack(state, ctx, stats, monster);
      if (state.player.hp <= 0) {
        onPlayerDeath(state, ctx, stats, monster);
        return;
      }
    }
  }
}

function playerAttack(state: GameState, ctx: Ctx, stats: DerivedStats, monster: Keyed<MonsterDef, MonsterId>): void {
  const combat = state.combat!;
  if (!ctx.rng.chance(hitChance(stats.attack, monster.defence))) {
    log(state, ctx, 'combat', `You miss the ${monster.name}.`);
    return;
  }
  const damage = Math.min(combat.monsterHp, ctx.rng.int(1, maxHit(stats.strength)));
  combat.monsterHp -= damage;
  const xp = combatXpForDamage(damage);
  const skill = weaponSkill(state, ctx);
  if (skill) skills.addXp(state, ctx, skill, xp.weapon);
  skills.addXp(state, ctx, 'vitality', xp.vitality);
  log(state, ctx, 'combat', `You hit the ${monster.name} for ${damage}.`);
}

function monsterAttack(state: GameState, ctx: Ctx, stats: DerivedStats, monster: Keyed<MonsterDef, MonsterId>): void {
  const xp = defenceXpForAttack(monster.tier, armorPiecesWorn(state), state.player.equipment.shield !== null);
  skills.addXp(state, ctx, 'armor', xp.armor);
  skills.addXp(state, ctx, 'shields', xp.shields);
  if (!ctx.rng.chance(hitChance(monster.attack, stats.defence))) {
    log(state, ctx, 'combat', `The ${monster.name} misses you.`);
    return;
  }
  const damage = Math.min(state.player.hp, ctx.rng.int(1, maxHit(monster.strength)));
  state.player.hp -= damage;
  log(state, ctx, 'combat', `The ${monster.name} hits you for ${damage}.`);
}

function onMonsterDeath(state: GameState, ctx: Ctx, monster: Keyed<MonsterDef, MonsterId>, kills: number): void {
  const gold = Math.round(ctx.rng.int(monster.gold[0], monster.gold[1]) * (1 + progression.perk(state, ctx, 'gold_find')));
  const drops: string[] = [];
  if (gold > 0) {
    state.player.gold += gold;
    drops.push(`${gold} gold`);
  }
  for (const entry of monster.loot) {
    if (!ctx.rng.chance(entry.chance)) continue;
    const qty = ctx.rng.int(entry.min, entry.max);
    const name = ctx.content.item(entry.itemId).name;
    if (inventory.add(state, ctx, entry.itemId, qty, 'loot')) drops.push(`${qty}× ${name}`);
    else log(state, ctx, 'warn', `Inventory full: ${qty}× ${name} left behind.`);
  }
  log(state, ctx, 'loot', drops.length ? `${monster.name} defeated. Loot: ${drops.join(', ')}.` : `${monster.name} defeated.`);
  ctx.events.emit('monster:killed', { monsterId: monster.id, zoneId: state.player.zoneId });
  if (state.activity?.kind === 'combat') spawn(state, ctx.content.monster(state.activity.monsterId), kills);
}

function onPlayerDeath(state: GameState, ctx: Ctx, stats: DerivedStats, monster: Keyed<MonsterDef, MonsterId>): void {
  const home = ctx.content.zone(BALANCE.START_ZONE);
  activity.stop(state, ctx, 'You died.');
  state.player.hp = stats.maxHp;
  state.player.zoneId = BALANCE.START_ZONE;
  log(state, ctx, 'warn', `You were killed by a ${monster.name}. You wake up in ${home.name}.`);
  ctx.events.emit('player:died', { by: monster.id });
}

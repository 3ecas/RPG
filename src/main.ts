/** Bootstrap: content → save → offline catch-up → UI → loop → autosave. */
import { CONTENT } from '@/content';
import { BALANCE } from '@/content/balance';
import { startLoop } from '@/core/loop';
import { Registry } from '@/core/registry';
import { storage } from '@/core/storage';
import { Game } from '@/game';
import { fail, ok, type Result } from '@/types/result';
import { App } from '@/ui/app';
import { toast } from '@/ui/toast';
import { decodeBase64, encodeBase64 } from '@/util/base64';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');

const content = new Registry(CONTENT);
const problems = content.validate();
if (problems.length > 0) {
  root.innerHTML = `<pre class="fatal">Content errors:\n${problems.map((p) => `  - ${p}`).join('\n')}</pre>`;
  throw new Error(`Content validation failed:\n${problems.join('\n')}`);
}

function loadGame(): Game {
  const json = storage.load();
  if (json) {
    try {
      return Game.fromSave(content, json);
    } catch (error) {
      console.error('Save could not be read', error);
      const backup = storage.loadBackup();
      if (backup) {
        try {
          const game = Game.fromSave(content, backup);
          toast('Your save was unreadable; the previous autosave was restored.', 'warn', 8000);
          return game;
        } catch (backupError) {
          console.error('Backup could not be read either', backupError);
        }
      }
      toast('Your save could not be read. Starting a new character.', 'warn', 8000);
    }
  }
  return Game.newGame(content);
}

let game = loadGame();

function save(): void {
  if (!storage.save(game.save())) toast('Could not save: browser storage is unavailable.', 'warn');
  app.lastSavedAt = Date.now();
  app.markDirty();
}

function exportSave(): string {
  return encodeBase64(game.save());
}

function importSave(text: string): Result {
  const trimmed = text.trim();
  let json: string;
  try {
    json = trimmed.startsWith('{') ? trimmed : decodeBase64(trimmed);
  } catch {
    return fail('That does not look like an exported save.');
  }
  try {
    const imported = Game.fromSave(content, json);
    game = imported;
    app.setGame(game);
    save();
    return ok();
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Save could not be read.');
  }
}

function reset(): void {
  storage.clear();
  game = Game.newGame(content);
  app.setGame(game);
  save();
  toast('New character created.', 'good');
}

const app = new App(root, game, { save, exportSave, importSave, reset });
app.offline = game.offlineCatchUp();
app.mount();
save();

startLoop({
  tickMs: BALANCE.TICK_MS,
  maxTicksPerFrame: 100,
  tick: (dt) => game.tick(dt),
  render: () => app.render(),
});

setInterval(save, BALANCE.AUTOSAVE_MS);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save();
});
window.addEventListener('beforeunload', save);

if (import.meta.env.DEV) {
  // Handy in the browser console: game.state, game.startGathering('copper_rock'), app.openWindow('anvil'), ...
  Object.defineProperty(window, 'game', { get: () => game });
  Object.defineProperty(window, 'app', { get: () => app });
}

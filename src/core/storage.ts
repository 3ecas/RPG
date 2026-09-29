/** The only place that touches localStorage. Every call is guarded: storage can be missing or full. */
const KEY = 'rpg.save';
const BACKUP_KEY = 'rpg.save.backup';

export const storage = {
  load(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  loadBackup(): string | null {
    try {
      return localStorage.getItem(BACKUP_KEY);
    } catch {
      return null;
    }
  },
  /** Keeps the previous save as a backup. Returns false if storage is unavailable. */
  save(json: string): boolean {
    try {
      const previous = localStorage.getItem(KEY);
      if (previous && previous !== json) localStorage.setItem(BACKUP_KEY, previous);
      localStorage.setItem(KEY, json);
      return true;
    } catch {
      return false;
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(BACKUP_KEY);
    } catch {
      /* nothing to clear */
    }
  },
};

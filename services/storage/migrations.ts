import { mmkvStorage } from './mmkvStorage';

const CURRENT_VERSION = 1;

export function runMigrations(): void {
  const version = mmkvStorage.getString('schema_version');
  const parsedVersion = version ? parseInt(version, 10) : 0;

  if (parsedVersion < CURRENT_VERSION) {
    mmkvStorage.set('schema_version', CURRENT_VERSION);
  }
}

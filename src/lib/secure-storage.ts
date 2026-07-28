import * as SecureStore from 'expo-secure-store';

/**
 * Session storage for Supabase Auth, backed by the iOS Keychain.
 *
 * SecureStore warns and misbehaves past 2048 bytes per value, and a Supabase
 * session comfortably exceeds that — the access-token JWT alone is around a
 * kilobyte. So values are split across numbered chunks, with an index entry
 * recording how many there are. AsyncStorage would sidestep the limit but would
 * also leave refresh tokens sitting in plaintext on disk.
 */

const CHUNK_SIZE = 1800;

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

function countKey(key: string): string {
  return `${key}.chunks`;
}

export const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const rawCount = await SecureStore.getItemAsync(countKey(key));
    if (rawCount === null) return null;

    const count = Number(rawCount);
    if (!Number.isInteger(count) || count < 1) return null;

    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      // A partially written value is unusable; treat it as absent so the user
      // is asked to sign in again rather than handed a corrupt session.
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  setItem: async (key: string, value: string): Promise<void> => {
    // Clear first so shrinking from 3 chunks to 2 cannot leave a stale tail.
    await secureStorage.removeItem(key);

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }

    for (const [index, chunk] of chunks.entries()) {
      await SecureStore.setItemAsync(chunkKey(key, index), chunk);
    }
    await SecureStore.setItemAsync(countKey(key), String(chunks.length));
  },

  removeItem: async (key: string): Promise<void> => {
    const rawCount = await SecureStore.getItemAsync(countKey(key));
    if (rawCount === null) return;

    const count = Number(rawCount);
    for (let i = 0; i < count; i++) {
      await SecureStore.deleteItemAsync(chunkKey(key, i));
    }
    await SecureStore.deleteItemAsync(countKey(key));
  },
};

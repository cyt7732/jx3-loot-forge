import { describe, expect, it } from 'vitest';
import { validateCatalogSnapshot } from '../src/storage/catalog';
import type { CatalogSnapshot } from '../src/domain/types';

async function catalogFixture(overrides: Partial<CatalogSnapshot> = {}): Promise<CatalogSnapshot> {
  const snapshot: CatalogSnapshot = {
    schemaVersion: 1,
    client: 'std',
    catalogVersion: 'fixture',
    generatedAt: '2026-08-23T00:00:00.000Z',
    contentHash: '',
    source: 'fixture',
    stats: { maps: 1, bosses: 1, drops: 1, uniqueItems: 1 },
    completeness: {
      status: 'complete', expectedMapCount: 1, fetchedMapCount: 1,
      metadataMissing: 0, metadataMismatch: 0, failures: [],
    },
    maps: [{ mapId: 1, name: '副本', expansion: '版本', difficulty: '难度', bossNames: ['首领'], itemIds: ['物品'] }],
    items: [{ id: '物品', name: '物品', category: 'equipment', sources: [{ mapId: 1, mapName: '副本', expansion: '版本', difficulty: '难度', bossName: '首领' }] }],
    ...overrides,
  };
  const hashInput = JSON.stringify({ ...snapshot, catalogVersion: '', generatedAt: '', contentHash: '' });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashInput));
  snapshot.contentHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return snapshot;
}

describe('catalog data-pack validation', () => {
  it('accepts a complete self-consistent snapshot with a stable content hash', async () => {
    const snapshot = await catalogFixture();
    await expect(validateCatalogSnapshot(snapshot)).resolves.toBe(snapshot);
    const recrawled = await catalogFixture({ generatedAt: '2026-08-24T00:00:00.000Z' });
    expect(recrawled.contentHash).toBe(snapshot.contentHash);
  });

  it('rejects a snapshot that claims complete while fetched maps or failures disagree', async () => {
    const partial = await catalogFixture({
      completeness: { status: 'complete', expectedMapCount: 2, fetchedMapCount: 1, metadataMissing: 0, metadataMismatch: 0, failures: ['MapID 2 failed'] },
    });
    await expect(validateCatalogSnapshot(partial)).rejects.toThrow('完整性');
  });

  it('rejects dangling map item references even when the hash is self-consistent', async () => {
    const dangling = await catalogFixture({
      maps: [{ mapId: 1, name: '副本', expansion: '版本', difficulty: '难度', bossNames: ['首领'], itemIds: ['不存在'] }],
    });
    await expect(validateCatalogSnapshot(dangling)).rejects.toThrow('不存在的物品');
  });
});

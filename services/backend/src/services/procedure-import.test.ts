import { describe, expect, it } from 'vitest';

import { decideImportAction } from './procedure-import.js';

describe('decideImportAction (content-hash drift gate)', () => {
  it('no-ops when the active snapshot has the same content hash', () => {
    expect(decideImportAction({ contentHash: 'abc' }, { contentHash: 'abc' })).toBe('unchanged');
  });

  it('creates a new version when the content hash differs', () => {
    expect(decideImportAction({ contentHash: 'abc' }, { contentHash: 'def' })).toBe('create');
  });

  it('creates the first snapshot when none exists', () => {
    expect(decideImportAction(undefined, { contentHash: 'abc' })).toBe('create');
  });
});

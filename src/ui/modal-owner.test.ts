import { beforeEach, describe, expect, it } from 'vitest';
import { claimModal, releaseModal, useModalOwner } from './modal-owner.ts';

describe('modal owner', () => {
  beforeEach(() => useModalOwner.setState({ owner: null }));

  it('allows one owner and rejects a competing modal', () => {
    expect(claimModal('permissions')).toBe(true);
    expect(claimModal('today-details')).toBe(false);
    expect(useModalOwner.getState().owner).toBe('permissions');
  });

  it('only lets the current owner release the host', () => {
    claimModal('welcome');
    releaseModal('today-details');
    expect(useModalOwner.getState().owner).toBe('welcome');
    releaseModal('welcome');
    expect(useModalOwner.getState().owner).toBeNull();
  });
});

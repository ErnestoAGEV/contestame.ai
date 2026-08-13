import { describe, it, expect } from 'vitest';
import { findMenuItem } from './restaurant.js';

describe('findMenuItem', () => {
  it('finds an exact match case-insensitively', () => {
    const result = findMenuItem('taco de asada');
    expect(result?.name).toBe('Taco de asada');
  });

  it('finds a partial match by substring', () => {
    const result = findMenuItem('pastor');
    expect(result?.name).toBe('Taco de pastor');
  });

  it('returns undefined for dishes not on the menu', () => {
    expect(findMenuItem('pizza hawaiana')).toBeUndefined();
  });
});

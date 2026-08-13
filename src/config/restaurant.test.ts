import { describe, it, expect } from 'vitest';
import {
  findMenuItem,
  buildSystemPrompt,
  RESTAURANT_NAME,
  MENU,
} from './restaurant.js';

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

  it('returns undefined for empty input', () => {
    expect(findMenuItem('')).toBeUndefined();
  });

  it('returns undefined for whitespace-only input', () => {
    expect(findMenuItem('   ')).toBeUndefined();
  });

  it('returns undefined for an ambiguous substring matching multiple items (taco)', () => {
    expect(findMenuItem('taco')).toBeUndefined();
  });

  it('returns undefined for an ambiguous substring matching multiple items (asada)', () => {
    expect(findMenuItem('asada')).toBeUndefined();
  });
});

describe('buildSystemPrompt', () => {
  it('includes the restaurant name', () => {
    expect(buildSystemPrompt()).toContain(RESTAURANT_NAME);
  });

  it('includes every menu item name', () => {
    const prompt = buildSystemPrompt();
    for (const item of MENU) {
      expect(prompt).toContain(item.name);
    }
  });

  it('mentions all tool names the voice agent needs to invoke', () => {
    const prompt = buildSystemPrompt();
    const toolNames = [
      'add_item',
      'remove_item',
      'set_order_type',
      'set_delivery_address',
      'set_customer_name',
      'finalize_order',
    ];
    for (const toolName of toolNames) {
      expect(prompt).toContain(toolName);
    }
  });
});

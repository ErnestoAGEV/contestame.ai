import { describe, it, expect, beforeEach } from 'vitest';
import { createSession } from './callSession.js';
import type { CallSession } from './callSession.js';
import {
  addItem,
  removeItem,
  setOrderType,
  setDeliveryAddress,
  setCustomerName,
  validateFinalize,
} from './realtimeTools.js';

describe('realtimeTools', () => {
  let session: CallSession;

  beforeEach(() => {
    session = createSession('CA-test');
  });

  describe('addItem', () => {
    it('adds a valid menu item to the session', () => {
      const result = addItem(session, { name: 'Taco de asada', quantity: 2, notes: 'sin cebolla' });
      expect(result.ok).toBe(true);
      expect(session.items).toEqual([{ name: 'Taco de asada', quantity: 2, notes: 'sin cebolla' }]);
    });

    it('rejects an item not on the menu', () => {
      const result = addItem(session, { name: 'Pizza hawaiana', quantity: 1 });
      expect(result.ok).toBe(false);
      expect(session.items).toEqual([]);
    });
  });

  describe('removeItem', () => {
    it('removes an existing item', () => {
      addItem(session, { name: 'Taco de asada', quantity: 2 });
      const result = removeItem(session, { name: 'Taco de asada' });
      expect(result.ok).toBe(true);
      expect(session.items).toEqual([]);
    });

    it('reports failure when item is not in the order', () => {
      const result = removeItem(session, { name: 'Taco de asada' });
      expect(result.ok).toBe(false);
    });
  });

  describe('setOrderType', () => {
    it('clears address when switching from delivery to pickup', () => {
      session.address = 'Av. Reforma 123';
      setOrderType(session, { type: 'pickup' });
      expect(session.address).toBeUndefined();
    });
  });

  describe('setDeliveryAddress', () => {
    it('rejects setting address when type is not delivery', () => {
      const result = setDeliveryAddress(session, { address: 'Av. Reforma 123' });
      expect(result.ok).toBe(false);
      expect(session.address).toBeUndefined();
    });

    it('sets address when type is delivery', () => {
      setOrderType(session, { type: 'delivery' });
      const result = setDeliveryAddress(session, { address: 'Av. Reforma 123' });
      expect(result.ok).toBe(true);
      expect(session.address).toBe('Av. Reforma 123');
    });
  });

  describe('setCustomerName', () => {
    it('sets the customer name', () => {
      setCustomerName(session, { name: 'Juan' });
      expect(session.customerName).toBe('Juan');
    });
  });

  describe('validateFinalize', () => {
    it('fails when there are no items', () => {
      setOrderType(session, { type: 'pickup' });
      expect(validateFinalize(session).ok).toBe(false);
    });

    it('fails when order type is not set', () => {
      addItem(session, { name: 'Taco de asada', quantity: 1 });
      expect(validateFinalize(session).ok).toBe(false);
    });

    it('fails when delivery has no address', () => {
      addItem(session, { name: 'Taco de asada', quantity: 1 });
      setOrderType(session, { type: 'delivery' });
      expect(validateFinalize(session).ok).toBe(false);
    });

    it('passes for a valid pickup order', () => {
      addItem(session, { name: 'Taco de asada', quantity: 1 });
      setOrderType(session, { type: 'pickup' });
      expect(validateFinalize(session).ok).toBe(true);
    });

    it('passes for a valid delivery order with address', () => {
      addItem(session, { name: 'Taco de asada', quantity: 1 });
      setOrderType(session, { type: 'delivery' });
      setDeliveryAddress(session, { address: 'Av. Reforma 123' });
      expect(validateFinalize(session).ok).toBe(true);
    });
  });
});

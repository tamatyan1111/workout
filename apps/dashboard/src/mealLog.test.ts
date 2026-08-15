import { describe, expect, it } from 'vitest';
import type { MealItem } from './types';
import { itemKcal } from './mealLog';

function makeItem(overrides: Partial<MealItem> = {}): MealItem {
  return {
    id: 1,
    master_food_id: 1,
    custom_food_id: null,
    food_name: '白米',
    kcal_per_100g: 342,
    protein_g_per_100g: 6.1,
    fat_g_per_100g: 0.9,
    carb_g_per_100g: 77.6,
    quantity_g: 100,
    recipe_batch_id: null,
    recipe_name: null,
    ...overrides,
  };
}

// design.md §2.15: meal_itemsはkcal_per_100g_snapshot等を保持し、実際に食べた量(quantity_g)は
// 100gあたりの値から都度計算する
describe('itemKcal', () => {
  it('scales kcal_per_100g by quantity_g / 100', () => {
    expect(itemKcal(makeItem({ kcal_per_100g: 342, quantity_g: 100 }))).toBe(342);
    expect(itemKcal(makeItem({ kcal_per_100g: 342, quantity_g: 150 }))).toBeCloseTo(513);
    expect(itemKcal(makeItem({ kcal_per_100g: 200, quantity_g: 50 }))).toBe(100);
  });

  it('returns 0 for a zero-quantity item', () => {
    expect(itemKcal(makeItem({ quantity_g: 0 }))).toBe(0);
  });
});

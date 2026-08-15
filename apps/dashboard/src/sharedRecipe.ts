import { getSharedRecipe } from './api';
import type { SharedRecipe } from './types';
import { escapeHtml } from 'shared';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// design.md §2.19: レシピの共有リンク(/?share_recipe=...)経由の閲覧ページ。ログイン不要で、
// ダッシュボードのUIには一切依存しない(auth.tsのパスワードリセット画面と同じ.auth-screenの体裁)。
export function renderSharedRecipe(container: HTMLElement, token: string): void {
  container.innerHTML = '<div class="auth-screen"><p>読み込み中...</p></div>';

  void getSharedRecipe(token)
    .then((recipe) => draw(recipe))
    .catch((err) => {
      const message =
        errorMessage(err) === 'レシピが見つかりません'
          ? 'このリンクは無効です(共有が停止されたか、URLが間違っています)。'
          : `読み込みに失敗しました: ${errorMessage(err)}`;
      container.innerHTML = `<div class="auth-screen"><h1>共有レシピ</h1><p class="error">${escapeHtml(message)}</p></div>`;
    });

  function draw(recipe: SharedRecipe): void {
    container.innerHTML = `
      <div class="auth-screen">
        <h1>${escapeHtml(recipe.name)}</h1>
        <ul class="recipe-item-list">
          ${recipe.items
            .map((item) => {
              const kcal = Math.round((item.food.kcal_per_100g * item.quantity_g) / 100);
              const protein = ((item.food.protein_g_per_100g * item.quantity_g) / 100).toFixed(1);
              const fat = ((item.food.fat_g_per_100g * item.quantity_g) / 100).toFixed(1);
              const carb = ((item.food.carb_g_per_100g * item.quantity_g) / 100).toFixed(1);
              return `
              <li>
                <span>
                  ${escapeHtml(item.food.name)} ${item.quantity_g}g
                  <span class="field-note">${kcal}kcal / P${protein}g F${fat}g C${carb}g</span>
                </span>
              </li>
            `;
            })
            .join('')}
        </ul>
      </div>
    `;
  }
}

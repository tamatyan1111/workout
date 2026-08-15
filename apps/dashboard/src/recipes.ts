import { addRecipe, deleteRecipe, editRecipe, getRecipes, shareRecipe, unshareRecipe } from './api';
import { renderFoodSearch } from './foodSearch';
import type { CartItem, Recipe } from './types';
import { escapeHtml } from 'shared';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// design.md §2.14「recipes/recipe_items」対応。複数食材をまとめて「料理」として保存し、
// 食事ログに1回で追加できるようにするテンプレート機能。
export function renderRecipes(container: HTMLElement, onChanged: () => void): void {
  let recipes: Recipe[] = [];
  let editingId: number | null = null;
  let draftName = '';
  let draftItems: CartItem[] = [];
  // design.md §2.19: 生の共有URLはshare_recipe.phpの応答でしか得られない(DBはハッシュのみ保持)。
  // refresh()でrecipesを取り直してもこのMapはクロージャ内に残るので、発行直後だけ表示できる
  const shareUrlsById = new Map<number, string>();

  refresh();

  function refresh(): void {
    container.innerHTML = '<p>読み込み中...</p>';
    void getRecipes()
      .then((r) => {
        recipes = r;
        draw();
      })
      .catch((err) => {
        container.innerHTML = `<p class="error">レシピの取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
      });
  }

  function startCreate(): void {
    editingId = -1; // -1 = 新規作成中(既存recipeのidと衝突しない)
    draftName = '';
    draftItems = [];
    draw();
  }

  function startEdit(recipe: Recipe): void {
    editingId = recipe.id;
    draftName = recipe.name;
    draftItems = recipe.items.map((i) => ({
      ref: i.master_food_id !== null ? { source: 'master' as const, id: i.master_food_id } : { source: 'custom' as const, id: i.custom_food_id! },
      name: i.food_name,
      quantityG: i.quantity_g,
      kcalPer100g: 0,
      proteinPer100g: 0,
      fatPer100g: 0,
      carbPer100g: 0,
    }));
    draw();
  }

  function cancelEdit(): void {
    editingId = null;
    draw();
  }

  function draw(): void {
    container.innerHTML = `
      <div id="recipe-list"></div>
      ${editingId === null ? '<button type="button" id="new-recipe-btn">新しいレシピを作る</button>' : '<div id="recipe-editor"></div>'}
    `;

    if (editingId === null) {
      renderList();
      container.querySelector('#new-recipe-btn')!.addEventListener('click', startCreate);
    } else {
      renderList();
      renderEditor();
    }
  }

  function renderList(): void {
    const listEl = container.querySelector<HTMLElement>('#recipe-list')!;
    if (recipes.length === 0) {
      listEl.innerHTML = '<p>レシピがまだ登録されていません</p>';
      return;
    }
    listEl.innerHTML = recipes
      .map((r) => {
        const shareUrl = shareUrlsById.get(r.id);
        return `
      <div class="recipe-card" data-id="${r.id}">
        <strong>${escapeHtml(r.name)}</strong>
        <ul class="recipe-item-list">
          ${r.items.map((i) => `<li>${escapeHtml(i.food_name)} ${i.quantity_g}g</li>`).join('')}
        </ul>
        <button type="button" class="edit-recipe-btn">編集</button>
        <button type="button" class="delete-recipe-btn danger">削除</button>
        ${
          r.is_shared
            ? '<button type="button" class="unshare-recipe-btn danger">共有を解除</button>'
            : '<button type="button" class="share-recipe-btn">共有リンクを発行</button>'
        }
        <div class="recipe-share-info">
          ${
            shareUrl
              ? `<input type="text" class="share-url-input" value="${escapeHtml(shareUrl)}" readonly />
                 <button type="button" class="copy-share-url-btn">コピー</button>`
              : r.is_shared
                ? '<span class="field-note">共有中です。リンクをもう一度確認したい場合は「共有を解除」してから再度発行してください(古いリンクは無効になります)</span>'
                : ''
          }
        </div>
        <p class="recipe-share-status"></p>
      </div>
    `;
      })
      .join('');

    listEl.querySelectorAll<HTMLElement>('.recipe-card').forEach((card) => {
      const recipe = recipes.find((r) => r.id === Number(card.dataset.id))!;
      const statusEl = card.querySelector<HTMLParagraphElement>('.recipe-share-status')!;
      card.querySelector('.edit-recipe-btn')!.addEventListener('click', () => startEdit(recipe));
      card.querySelector('.delete-recipe-btn')!.addEventListener('click', async () => {
        if (!confirm(`レシピ「${recipe.name}」を削除しますか?`)) return;
        try {
          await deleteRecipe(recipe.id);
          shareUrlsById.delete(recipe.id);
          refresh();
          onChanged();
        } catch (err) {
          alert(`削除に失敗しました: ${errorMessage(err)}`);
        }
      });
      card.querySelector('.share-recipe-btn')?.addEventListener('click', async () => {
        statusEl.textContent = '発行中...';
        try {
          const { share_url: shareUrl } = await shareRecipe(recipe.id);
          shareUrlsById.set(recipe.id, shareUrl);
          refresh();
        } catch (err) {
          statusEl.textContent = `発行に失敗しました: ${errorMessage(err)}`;
        }
      });
      card.querySelector('.unshare-recipe-btn')?.addEventListener('click', async () => {
        if (!confirm('共有を解除しますか?(発行済みのリンクは無効になります)')) return;
        try {
          await unshareRecipe(recipe.id);
          shareUrlsById.delete(recipe.id);
          refresh();
        } catch (err) {
          statusEl.textContent = `共有の解除に失敗しました: ${errorMessage(err)}`;
        }
      });
      card.querySelector('.copy-share-url-btn')?.addEventListener('click', async () => {
        const url = card.querySelector<HTMLInputElement>('.share-url-input')!.value;
        try {
          await navigator.clipboard.writeText(url);
          statusEl.textContent = 'コピーしました';
        } catch (err) {
          statusEl.textContent = `コピーに失敗しました: ${errorMessage(err)}`;
        }
      });
    });
  }

  function renderEditor(): void {
    const editorEl = container.querySelector<HTMLElement>('#recipe-editor')!;
    editorEl.innerHTML = `
      <h4>${editingId === -1 ? '新しいレシピ' : 'レシピを編集'}</h4>
      <form id="recipe-name-form">
        <label>レシピ名 <input type="text" id="recipe-name-input" value="${escapeHtml(draftName)}" required /></label>
      </form>
      <div id="recipe-food-search"></div>
      <h5>構成食材</h5>
      <ul id="recipe-draft-items"></ul>
      <button type="button" id="save-recipe-btn">保存</button>
      <button type="button" id="cancel-recipe-btn">キャンセル</button>
      <p id="recipe-editor-status"></p>
    `;

    renderFoodSearch(editorEl.querySelector<HTMLElement>('#recipe-food-search')!, (item) => {
      draftItems.push(item);
      renderDraftItems();
    });
    renderDraftItems();

    editorEl.querySelector('#cancel-recipe-btn')!.addEventListener('click', cancelEdit);
    editorEl.querySelector('#save-recipe-btn')!.addEventListener('click', async () => {
      const statusEl = editorEl.querySelector<HTMLParagraphElement>('#recipe-editor-status')!;
      const name = editorEl.querySelector<HTMLInputElement>('#recipe-name-input')!.value.trim();
      if (!name) {
        statusEl.textContent = 'レシピ名を入力してください';
        return;
      }
      if (draftItems.length === 0) {
        statusEl.textContent = '食材を1つ以上追加してください';
        return;
      }
      statusEl.textContent = '保存中...';
      try {
        if (editingId === -1) {
          await addRecipe(name, draftItems);
        } else {
          await editRecipe(editingId!, name, draftItems);
        }
        editingId = null;
        refresh();
        onChanged();
      } catch (err) {
        statusEl.textContent = `保存に失敗しました: ${errorMessage(err)}`;
      }
    });

    function renderDraftItems(): void {
      const listEl = editorEl.querySelector<HTMLElement>('#recipe-draft-items')!;
      if (draftItems.length === 0) {
        listEl.innerHTML = '<li>まだ食材がありません</li>';
        return;
      }
      listEl.innerHTML = draftItems
        .map((item, i) => `<li>${escapeHtml(item.name)} ${item.quantityG}g <button type="button" class="remove-draft-item" data-index="${i}">削除</button></li>`)
        .join('');
      listEl.querySelectorAll<HTMLButtonElement>('.remove-draft-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          draftItems.splice(Number(btn.dataset.index), 1);
          renderDraftItems();
        });
      });
    }
  }
}

import { expect, test } from '@playwright/test';

// design.md §2.19対応。レシピの共有リンクが「ログイン不要で閲覧できる」「共有を解除すると
// 旧リンクが無効になる」という、この機能の核心部分を実ブラウザで検証する。
// CI上のe2e用DBにはfoodsマスタ(sql/foods_seed.sql)を投入していないため、食材はレシピに
// 使う前に独自食材として登録する(golden-pathのsignup-and-tabs.spec.tsと同じ制約)。

test('レシピの共有リンクは未ログインで閲覧でき、共有を解除すると無効になる', async ({ page, browser }) => {
  const uniqueEmail = `e2e-share-${Date.now()}@example.com`;

  await page.goto('/');
  await page.getByRole('button', { name: '新規登録' }).click();
  await page.locator('#display-name').fill('E2E共有テストユーザー');
  await page.locator('#email').fill(uniqueEmail);
  await page.locator('#password').fill('e2e-test-password-123');
  await page.locator('#agree-terms').check();
  await page.getByRole('button', { name: '登録する' }).click();

  await expect(page.getByRole('heading', { name: 'ようこそ' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /フルボディ/ }).click();
  await expect(page.getByText('ようこそ、E2E共有テストユーザーさん')).toBeVisible({ timeout: 10_000 });

  await page.locator('.tab-button[data-tab="nutrition"]').click();
  const panel = page.locator('#tab-nutrition');
  await expect(panel.getByText('読み込み中...')).toHaveCount(0, { timeout: 15_000 });

  // 独自食材を1件登録してからレシピに使う
  const customFoods = panel.locator('#custom-foods');
  await customFoods.getByRole('button', { name: '独自食材を追加' }).click();
  await customFoods.locator('#cf-name').fill('E2Eテスト食材');
  await customFoods.locator('#cf-kcal').fill('200');
  await customFoods.locator('#cf-protein').fill('10');
  await customFoods.locator('#cf-fat').fill('5');
  await customFoods.locator('#cf-carb').fill('20');
  await customFoods.getByRole('button', { name: '保存' }).click();
  await expect(customFoods.getByText('E2Eテスト食材')).toBeVisible();

  // レシピを作成
  const recipes = panel.locator('#recipes');
  await recipes.getByRole('button', { name: '新しいレシピを作る' }).click();
  await recipes.locator('#recipe-name-input').fill('E2E共有レシピ');
  await recipes.locator('#recipe-food-search').getByRole('textbox', { name: '食品名で検索' }).fill('E2Eテスト食材');
  await recipes.locator('#recipe-food-search').getByRole('button', { name: '検索' }).click();
  await recipes.getByRole('button', { name: '追加', exact: true }).click();
  await recipes.getByRole('button', { name: '保存', exact: true }).click();
  await expect(recipes.getByText('E2E共有レシピ')).toBeVisible();

  // 共有リンクを発行し、URLを取得する
  await recipes.getByRole('button', { name: '共有リンクを発行' }).click();
  const shareUrlInput = recipes.locator('.share-url-input');
  await expect(shareUrlInput).toBeVisible();
  const shareUrl = await shareUrlInput.inputValue();
  expect(shareUrl).toContain('share_recipe=');

  // 未ログインの別コンテキストで開く(Cookie等を一切共有しない、本来の第三者からのアクセスを再現)
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await guestPage.goto(shareUrl);
  await expect(guestPage.getByRole('heading', { name: 'E2E共有レシピ' })).toBeVisible();
  await expect(guestPage.getByText('E2Eテスト食材')).toBeVisible();
  await guestContext.close();

  // 共有を解除する
  page.once('dialog', (dialog) => void dialog.accept());
  await recipes.getByRole('button', { name: '共有を解除' }).click();
  await expect(recipes.getByRole('button', { name: '共有リンクを発行' })).toBeVisible();

  // 解除後は旧リンクが無効になる
  const revokedContext = await browser.newContext();
  const revokedPage = await revokedContext.newPage();
  await revokedPage.goto(shareUrl);
  await expect(revokedPage.getByText('このリンクは無効です')).toBeVisible();
  await revokedContext.close();
});

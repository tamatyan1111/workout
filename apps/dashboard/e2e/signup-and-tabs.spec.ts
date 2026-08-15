import { expect, test, type Locator } from '@playwright/test';

// design.md §3の3状態(未ログイン→オンボーディング→通常ダッシュボード)を、
// サインアップから実際に一通り遷移させて確認するゴールデンパステスト。
// 2026-08-14に本番デプロイ後、php/private配下のファイル取りこぼしで「食事」タブだけ
// 500エラーになる不具合が発生した(手動確認まで気づけなかった)。同じ種類の不具合を
// 自動で検知できるようにするのが主目的で、各タブのパネルにエラー表示(class="error")が
// 出ていないことを共通のチェックとしている。

const TABS: { dataTab: string; label: string }[] = [
  { dataTab: 'exercise', label: '運動' },
  { dataTab: 'nutrition', label: '食事' },
  { dataTab: 'profile', label: 'プロフィール' },
];

async function assertNoErrorInPanel(panel: Locator): Promise<void> {
  // 各タブは初回表示時に「読み込み中...」→ 実データ or エラー、に変わる。
  // 読み込み中の間はエラー要素が無くて当然なので、まず読み込み完了を待ってから判定する。
  await expect(panel.getByText('読み込み中...')).toHaveCount(0, { timeout: 15_000 });
  await expect(panel.locator('.error')).toHaveCount(0);
}

test('サインアップ→オンボーディング→全タブが正常表示される', async ({ page }) => {
  const uniqueEmail = `e2e-${Date.now()}@example.com`;

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'たまちゃんの筋トレ管理' })).toBeVisible();

  // ログインフォームがデフォルトなので、サインアップに切り替える
  await page.getByRole('button', { name: '新規登録' }).click();
  await page.locator('#display-name').fill('E2Eテストユーザー');
  await page.locator('#email').fill(uniqueEmail);
  await page.locator('#password').fill('e2e-test-password-123');
  await page.locator('#agree-terms').check();
  await page.getByRole('button', { name: '登録する' }).click();

  // オンボーディング: 一番シンプルな「フルボディ」テンプレートを選ぶ
  await expect(page.getByRole('heading', { name: 'ようこそ' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /フルボディ/ }).click();

  // 通常のダッシュボードに遷移する
  await expect(page.getByText('ようこそ、E2Eテストユーザーさん')).toBeVisible({ timeout: 10_000 });

  for (const tab of TABS) {
    if (tab.dataTab !== 'exercise') {
      await page.locator(`.tab-button[data-tab="${tab.dataTab}"]`).click();
    }
    const panel = page.locator(`#tab-${tab.dataTab}`);
    await expect(panel).toBeVisible();
    await assertNoErrorInPanel(panel);
  }
});

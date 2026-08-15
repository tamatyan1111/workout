import { deleteAccount, logout } from './api';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// design.md §3「プロフィールタブ」対応。ログアウト・アカウント削除(US-16)。
export function renderAccount(container: HTMLElement, onAccountDeleted: () => void): void {
  container.innerHTML = `
    <button type="button" id="logout-btn">ログアウト</button>
    <button type="button" id="delete-account-btn" class="danger">アカウントを削除する</button>
  `;

  container.querySelector('#logout-btn')!.addEventListener('click', async () => {
    await logout();
    window.location.reload();
  });
  container.querySelector('#delete-account-btn')!.addEventListener('click', async () => {
    if (!confirm('本当にアカウントを削除しますか?この操作は取り消せず、全てのデータが即座に失われます。')) return;
    try {
      await deleteAccount();
      onAccountDeleted();
    } catch (err) {
      alert(`削除に失敗しました: ${errorMessage(err)}`);
    }
  });
}

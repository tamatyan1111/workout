import {
  addCycle,
  deleteAccount,
  deleteCycle,
  editCycle,
  exportUrl,
  getCycles,
  getMe,
  logout,
  updateMe,
} from './api';
import type { Cycle, Gender, Profile } from './types';
import { escapeHtml } from 'shared';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const GENDER_LABELS: Record<Gender, string> = {
  male: '男性',
  female: '女性',
  unspecified: '回答しない',
};

// design.md §3「設定タブ」対応。プロフィール編集(US-14)・サイクル管理(US-13)・
// CSVエクスポート(US-17)・アカウント削除(US-16)をまとめる。
export function renderSettings(container: HTMLElement, onAccountDeleted: () => void): void {
  container.innerHTML = '<p>読み込み中...</p>';

  void Promise.all([getMe(), getCycles()])
    .then(([profile, cycles]) => draw(profile, cycles))
    .catch((err) => {
      container.innerHTML = `<p class="error">設定の取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
    });

  function draw(profile: Profile, cycles: Cycle[]): void {
    container.innerHTML = `
      <section>
        <h3>プロフィール</h3>
        <form id="profile-form">
          <label>表示名 <input type="text" id="profile-name" value="${escapeHtml(profile.display_name)}" required /></label>
          <label>生年月日 <input type="date" id="profile-birth-date" value="${escapeHtml(profile.birth_date ?? '')}" /></label>
          <label>性別
            <select id="profile-gender">
              ${(Object.keys(GENDER_LABELS) as Gender[])
                .map(
                  (g) =>
                    `<option value="${g}" ${g === profile.gender ? 'selected' : ''}>${escapeHtml(GENDER_LABELS[g])}</option>`
                )
                .join('')}
            </select>
          </label>
          <button type="submit">保存</button>
          <p id="profile-status"></p>
        </form>
      </section>

      <section>
        <h3>サイクル管理</h3>
        <table class="cycle-table">
          <thead><tr><th>サイクル名</th><th></th></tr></thead>
          <tbody>
            ${cycles
              .map(
                (c) => `
              <tr data-id="${c.id}">
                <td><input type="text" class="cycle-label" value="${escapeHtml(c.label)}" /></td>
                <td>
                  <button type="button" class="save-cycle-btn">保存</button>
                  <button type="button" class="delete-cycle-btn">削除</button>
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
        <form id="add-cycle-form">
          <label>新しいサイクル名 <input type="text" id="new-cycle-label" required /></label>
          <button type="submit">追加</button>
        </form>
        <p id="cycle-status"></p>
      </section>

      <section>
        <h3>データのエクスポート</h3>
        <p><a href="${exportUrl}">記録・体重データをCSVでダウンロード</a></p>
      </section>

      <section>
        <h3>アカウント</h3>
        <button type="button" id="logout-btn">ログアウト</button>
        <button type="button" id="delete-account-btn" class="danger">アカウントを削除する</button>
      </section>
    `;

    bindProfileForm(profile);
    bindCycleManagement(cycles);
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

  function bindProfileForm(profile: Profile): void {
    const formEl = container.querySelector<HTMLFormElement>('#profile-form')!;
    const statusEl = container.querySelector<HTMLParagraphElement>('#profile-status')!;
    formEl.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const displayName = container.querySelector<HTMLInputElement>('#profile-name')!.value;
      const birthDate = container.querySelector<HTMLInputElement>('#profile-birth-date')!.value;
      const gender = container.querySelector<HTMLSelectElement>('#profile-gender')!.value as Gender;
      statusEl.textContent = '保存中...';
      try {
        await updateMe(displayName, birthDate, gender);
        profile.display_name = displayName;
        statusEl.textContent = '保存しました';
      } catch (err) {
        statusEl.textContent = `保存に失敗しました: ${errorMessage(err)}`;
      }
    });
  }

  function bindCycleManagement(cycles: Cycle[]): void {
    const statusEl = container.querySelector<HTMLParagraphElement>('#cycle-status')!;

    cycles.forEach((c) => {
      const row = container.querySelector<HTMLTableRowElement>(`tr[data-id="${c.id}"]`)!;
      row.querySelector('.save-cycle-btn')!.addEventListener('click', async () => {
        const label = row.querySelector<HTMLInputElement>('.cycle-label')!.value;
        try {
          await editCycle(c.id, label);
          statusEl.textContent = '保存しました';
        } catch (err) {
          statusEl.textContent = `保存に失敗しました: ${errorMessage(err)}`;
        }
      });
      row.querySelector('.delete-cycle-btn')!.addEventListener('click', async () => {
        if (!confirm(`サイクル「${c.label}」を削除しますか?`)) return;
        try {
          await deleteCycle(c.id);
          void Promise.all([getMe(), getCycles()]).then(([profile, updatedCycles]) => draw(profile, updatedCycles));
        } catch (err) {
          const message = errorMessage(err).includes('has_exercises')
            ? 'このサイクルには種目が登録されているため削除できません'
            : `削除に失敗しました: ${errorMessage(err)}`;
          alert(message);
        }
      });
    });

    container.querySelector<HTMLFormElement>('#add-cycle-form')!.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const input = container.querySelector<HTMLInputElement>('#new-cycle-label')!;
      const label = input.value;
      statusEl.textContent = '追加中...';
      try {
        await addCycle(label);
        void Promise.all([getMe(), getCycles()]).then(([profile, updatedCycles]) => draw(profile, updatedCycles));
      } catch (err) {
        statusEl.textContent = `追加に失敗しました: ${errorMessage(err)}`;
      }
    });
  }
}

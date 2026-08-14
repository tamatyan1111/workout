import {
  addCycle,
  deleteAccount,
  deleteCycle,
  downloadExport,
  editCycle,
  getCycles,
  getMe,
  logout,
  updateMe,
} from './api';
import type { Cycle, Profile } from './types';
import { escapeHtml } from 'shared';
import type { ActivityLevel, Gender } from 'shared';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const GENDER_LABELS: Record<Gender, string> = {
  male: '男性',
  female: '女性',
  unspecified: '回答しない',
};

// nutrition_calc.php ACTIVITY_LEVEL_FACTORSと対応(design.md §2.11)
const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'デスクワーク中心・ほぼ運動しない',
  light: '軽い運動習慣(週1〜3日)',
  moderate: '立ち仕事や中程度の運動(週3〜5日)',
  active: '激しい運動習慣(週6〜7日)',
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
          <label>身長(cm)<span class="field-note">BMI・食事機能の目標カロリー計算に使用</span>
            <input type="number" id="profile-height" min="1" value="${profile.height_cm ?? ''}" />
          </label>
          <label>活動レベル<span class="field-note">TDEE(維持カロリー)計算に使用</span>
            <select id="profile-activity-level">
              <option value="">未設定</option>
              ${(Object.keys(ACTIVITY_LEVEL_LABELS) as ActivityLevel[])
                .map(
                  (a) =>
                    `<option value="${a}" ${a === profile.activity_level ? 'selected' : ''}>${escapeHtml(ACTIVITY_LEVEL_LABELS[a])}</option>`
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
        <button type="button" id="export-btn">記録・体重データをCSVでダウンロード</button>
        <p id="export-status"></p>
      </section>

      <section>
        <h3>アカウント</h3>
        <button type="button" id="logout-btn">ログアウト</button>
        <button type="button" id="delete-account-btn" class="danger">アカウントを削除する</button>
      </section>
    `;

    bindProfileForm(profile);
    bindCycleManagement(cycles);
    container.querySelector('#export-btn')!.addEventListener('click', async () => {
      const statusEl = container.querySelector<HTMLParagraphElement>('#export-status')!;
      statusEl.textContent = 'ダウンロード中...';
      try {
        await downloadExport();
        statusEl.textContent = '';
      } catch (err) {
        statusEl.textContent = `ダウンロードに失敗しました: ${errorMessage(err)}`;
      }
    });
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
      const heightCm = container.querySelector<HTMLInputElement>('#profile-height')!.value;
      const activityLevel = container.querySelector<HTMLSelectElement>('#profile-activity-level')!.value as
        | ActivityLevel
        | '';
      statusEl.textContent = '保存中...';
      try {
        await updateMe(displayName, birthDate, gender, heightCm, activityLevel);
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

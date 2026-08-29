import type { Exercise } from './types';
import { escapeHtml } from 'shared';
import { getBoard } from './api';
import { addDays, todayStr } from './date';
import { summaryHeaderHtml, wireSummaryHeader } from './summaryHeader';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// exercisesは呼び出し元(dashboard.ts)で取得済みの「今日」のものを初回描画にだけ使う
// (グラフセクションと二重取得しない)。日付ナビで別の日に切り替えたときは、この関数の中で
// 独立してgetBoard(date)を呼び直す(2026-08-20、食事タブと同じ方式の日付ナビを追加)。
// design.md §2.3: サイクルはユーザーごとに自由なため、[1,2,3,4]のような固定反復はせず、
// 実際に種目が属しているサイクルをid昇順(作成順)でグルーピングして表示する。
export function renderBoard(container: HTMLElement, exercises: Exercise[]): void {
  let currentDate = todayStr();
  // 目標一覧を開いているかどうか。日付ナビをまたいでも開閉状態は保持する
  // (2026-08-29、サイクルごとの目標ボタンを1つの共通ボタンにまとめた際もこの考え方を踏襲)
  let showTargets = false;

  draw(exercises);

  function draw(ex: Exercise[]): void {
    container.innerHTML = `
      ${summaryHeaderHtml(currentDate)}
      ${renderCycles(ex)}
      <button type="button" class="link-button toggle-target-btn">${showTargets ? '目標を隠す' : '目標を見る'}</button>
      ${showTargets ? renderAllTargets(ex) : ''}
    `;

    wireSummaryHeader(container, currentDate, (deltaDays) => void navigate(deltaDays));
    container.querySelector<HTMLButtonElement>('.toggle-target-btn')!.addEventListener('click', () => {
      showTargets = !showTargets;
      draw(ex);
    });
  }

  async function navigate(deltaDays: number): Promise<void> {
    currentDate = addDays(currentDate, deltaDays);
    // 日付ナビを連続クリックしたときに、後発のリクエストより先発のリクエストが遅れて
    // 返ってきて表示を上書きしてしまわないよう、リクエスト時点の日付と現在の日付が
    // 一致するときだけ描画する(2026-08-20、実機検証で発覚した競合状態への対処)
    const requestedDate = currentDate;
    container.innerHTML = '<p>読み込み中...</p>';
    try {
      const fresh = await getBoard(requestedDate);
      if (requestedDate !== currentDate) return;
      draw(fresh);
    } catch (err) {
      if (requestedDate !== currentDate) return;
      container.innerHTML = `<p class="error">サマリーの取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
    }
  }
}

// 記録の無いサイクルはカードごと出さない(2026-08-20、「Pushをしていないのにそのカードを
// 出す必要はない」との指摘。2026-08-26に一度サイクルごとの目標ボタン付きで常設する形に
// 変えたが、2026-08-29に「記録が無いところの枠は出したくない」との指摘を受けて元の方針に
// 戻した。目標の確認はrenderAllTargetsの共通ボタン1つに分離してある)。
function renderCycles(exercises: Exercise[]): string {
  const active = exercises.filter((e) => !e.is_discontinued);
  const cycleIds = [...new Set(active.map((e) => e.cycle.id))].sort((a, b) => a - b);

  if (cycleIds.length === 0) {
    return '<p>まだ種目が登録されていません。「種目管理」から追加してください。</p>';
  }

  return cycleIds
    .map((cycleId) => {
      const cycleExercises = active.filter((e) => e.cycle.id === cycleId);
      const recordedExercises = cycleExercises.filter((e) => e.current.length > 0);
      if (recordedExercises.length === 0) return '';
      const label = cycleExercises[0].cycle.label;
      return `
        <section class="cycle-block">
          <h3>${escapeHtml(label)}</h3>
          ${renderTable(recordedExercises)}
        </section>
      `;
    })
    .join('');
}

// 目標はその日の記録の有無に関わらずいつでも確認できるよう、サイクルごとではなく
// 画面に1つだけ置いた共通ボタンで開閉する(2026-08-29)。開いたときはサイクルごとに
// 見出しを分けて全種目の目標を並べる。
function renderAllTargets(exercises: Exercise[]): string {
  const active = exercises.filter((e) => !e.is_discontinued);
  const cycleIds = [...new Set(active.map((e) => e.cycle.id))].sort((a, b) => a - b);

  return cycleIds
    .map((cycleId) => {
      const cycleExercises = active.filter((e) => e.cycle.id === cycleId);
      const label = cycleExercises[0].cycle.label;
      return `
        <section class="cycle-block">
          <h3>${escapeHtml(label)}</h3>
          ${renderTargetTable(cycleExercises)}
        </section>
      `;
    })
    .join('');
}

// 実績(現在の重量・回数・セット)だけの表。目標は別テーブル(renderTargetTable)に分離した
// (2026-08-20、同じ行に並べると横幅が窮屈になるとの指摘を受けて)。
function renderTable(exercises: Exercise[]): string {
  return `
    <table class="board-table">
      <colgroup>
        <col />
        <col class="col-weight" /><col class="col-count" /><col class="col-count-sets" />
      </colgroup>
      <thead>
        <tr>
          <th>種目名</th><th>重量(kg)</th><th>回数</th><th>セット</th>
        </tr>
      </thead>
      <tbody>
        ${exercises.map((e) => renderRowGroup(e)).join('')}
      </tbody>
    </table>
  `;
}

function renderRowGroup(e: Exercise): string {
  const lineCount = Math.max(e.current.length, 1);

  const lines = Array.from({ length: lineCount }, (_, i) => {
    const group = e.current[i];
    return {
      weight: group ? formatWeight(group.weight) : '-',
      reps: group ? String(group.reps) : '-',
      sets: group ? String(group.sets) : '-',
    };
  });

  return lines
    .map((line, i) => {
      const nameCell = i === 0 ? `<td rowspan="${lineCount}">${escapeHtml(e.name)}</td>` : '';
      return `
        <tr>
          ${nameCell}
          <td>${escapeHtml(line.weight)}</td>
          <td>${escapeHtml(line.reps)}</td>
          <td>${escapeHtml(line.sets)}</td>
        </tr>
      `;
    })
    .join('');
}

function renderTargetTable(exercises: Exercise[]): string {
  return `
    <table class="board-table board-target-table">
      <colgroup>
        <col />
        <col class="col-weight" /><col class="col-count" /><col class="col-count-sets" />
      </colgroup>
      <thead>
        <tr>
          <th>種目名</th><th>重量(kg)</th><th>回数</th><th>セット</th>
        </tr>
      </thead>
      <tbody>
        ${exercises
          .map(
            (e) => `
          <tr>
            <td>${escapeHtml(e.name)}</td>
            <td>${escapeHtml(formatWeight(e.target.weight))}</td>
            <td>${escapeHtml(valueOrDash(e.target.reps))}</td>
            <td>${escapeHtml(valueOrDash(e.target.sets))}</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  `;
}

export function valueOrDash(v: number | null): string {
  return v === null ? '-' : String(v);
}

// 重量は小数点1桁で表記を統一する(design.md §3)。重量なし種目はダッシュ表示。
export function formatWeight(v: number | null): string {
  if (v === null) return '-';
  return v.toFixed(1);
}

import type { Exercise } from './types';
import { escapeHtml } from 'shared';
import { getBoard } from './api';
import { addDays, todayStr, weekdayLabel } from './date';
import { captureElementToClipboard } from './captureImage';

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

  draw(exercises);

  function draw(ex: Exercise[]): void {
    const isToday = currentDate === todayStr();
    container.innerHTML = `
      <div class="date-nav">
        <button type="button" class="date-nav-prev link-button">← 前の日</button>
        <strong class="date-nav-current">${escapeHtml(currentDate)}(${weekdayLabel(currentDate)}${isToday ? '・今日' : ''})</strong>
        <button type="button" class="date-nav-next link-button" ${isToday ? 'disabled' : ''}>次の日 →</button>
      </div>
      <div class="capture-controls">
        <button type="button" class="link-button capture-btn">画像をコピー</button>
        <span class="capture-status"></span>
      </div>
      ${renderCycles(ex)}
    `;

    container.querySelector('.date-nav-prev')!.addEventListener('click', () => void navigate(-1));
    container.querySelector<HTMLButtonElement>('.date-nav-next')!.addEventListener('click', () => {
      if (isToday) return;
      void navigate(1);
    });
    container.querySelector('.capture-btn')!.addEventListener('click', () => {
      const cardEl = container.closest<HTMLElement>('.card') ?? container;
      void captureElementToClipboard(cardEl, container.querySelector('.capture-status'));
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

function renderCycles(exercises: Exercise[]): string {
  const active = exercises.filter((e) => !e.is_discontinued);
  const cycleIds = [...new Set(active.map((e) => e.cycle.id))].sort((a, b) => a - b);

  if (cycleIds.length === 0) {
    return '<p>まだ種目が登録されていません。「種目管理」から追加してください。</p>';
  }

  return cycleIds
    .map((cycleId) => {
      const cycleExercises = active.filter((e) => e.cycle.id === cycleId);
      // その日に記録の無い種目は行ごと表示しない(2026-08-20、「記録がない日にも種目名が
      // 出ているのは何故」との指摘を受けて、目標だけの行が並ぶ状態をやめた)
      const recordedExercises = cycleExercises.filter((e) => e.current.length > 0);
      const label = cycleExercises[0].cycle.label;
      return `
        <section class="cycle-block">
          <h3>${escapeHtml(label)}</h3>
          ${recordedExercises.length > 0 ? renderTable(recordedExercises) : '<p class="field-note">この日の記録はありません</p>'}
        </section>
      `;
    })
    .join('');
}

function renderTable(exercises: Exercise[]): string {
  return `
    <table class="board-table">
      <colgroup>
        <col />
        <col class="col-weight" /><col class="col-count" /><col class="col-count-sets" />
        <col class="col-weight col-group-target" /><col class="col-count col-group-target" /><col class="col-count-sets col-group-target" />
      </colgroup>
      <thead>
        <tr>
          <th rowspan="2">種目名</th>
          <th colspan="3">現在</th>
          <th colspan="3" class="col-group-target col-group-target-start col-group-target-end">目標</th>
        </tr>
        <tr>
          <th>重量(kg)</th><th>回数</th><th class="col-group-end">セット</th>
          <th class="col-group-target col-group-target-start">重量(kg)</th><th class="col-group-target">回数</th><th class="col-group-target col-group-target-end">セット</th>
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

  const targetWeight = formatWeight(e.target.weight);
  const targetReps = valueOrDash(e.target.reps);
  const targetSets = valueOrDash(e.target.sets);

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
      const targetCells =
        i === 0
          ? `
            <td rowspan="${lineCount}" class="col-group-target col-group-target-start">${escapeHtml(targetWeight)}</td>
            <td rowspan="${lineCount}" class="col-group-target">${escapeHtml(targetReps)}</td>
            <td rowspan="${lineCount}" class="col-group-target col-group-target-end">${escapeHtml(targetSets)}</td>
          `
          : '';
      return `
        <tr>
          ${nameCell}
          <td>${escapeHtml(line.weight)}</td>
          <td>${escapeHtml(line.reps)}</td>
          <td class="col-group-end">${escapeHtml(line.sets)}</td>
          ${targetCells}
        </tr>
      `;
    })
    .join('');
}

export function valueOrDash(v: number | null): string {
  return v === null ? '-' : String(v);
}

// 重量は小数点1桁で表記を統一する(design.md §3)。重量なし種目はダッシュ表示。
export function formatWeight(v: number | null): string {
  if (v === null) return '-';
  return v.toFixed(1);
}

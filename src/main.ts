import './style.css';
import { getBoard, getLogs } from './api';
import { renderBoard } from './board';
import { renderGraph } from './graph';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <header class="site-header">
    <h1>たまちゃんの筋トレ管理</h1>
    <nav class="tabs">
      <button type="button" class="tab-button active" data-tab="board">管理表</button>
      <button type="button" class="tab-button" data-tab="graph">グラフ</button>
    </nav>
  </header>
  <main>
    <section id="tab-board" class="tab-panel"><p>読み込み中...</p></section>
    <section id="tab-graph" class="tab-panel" hidden><p>読み込み中...</p></section>
  </main>
`;

const tabButtons = app.querySelectorAll<HTMLButtonElement>('.tab-button');
const panels: Record<string, HTMLElement> = {
  board: app.querySelector<HTMLElement>('#tab-board')!,
  graph: app.querySelector<HTMLElement>('#tab-graph')!,
};

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    Object.entries(panels).forEach(([key, el]) => {
      el.hidden = key !== btn.dataset.tab;
    });
  });
});

// 管理表・記録ログ(全件)をページ読み込み時に1回だけ並列取得し、タブ間で共有する。
// グラフタブの種目・期間切り替えはAPIを呼び直さず、取得済みデータをブラウザ側でフィルタするだけにする。
Promise.all([getBoard(), getLogs()])
  .then(([board, logs]) => {
    renderBoard(panels.board, board);
    renderGraph(panels.graph, board, logs);
  })
  .catch((err) => {
    const message = `<p class="error">データの取得に失敗しました: ${String(err)}</p>`;
    panels.board.innerHTML = message;
    panels.graph.innerHTML = message;
  });

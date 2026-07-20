import './style.css';
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
    <section id="tab-board" class="tab-panel"></section>
    <section id="tab-graph" class="tab-panel" hidden></section>
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

renderBoard(panels.board);
renderGraph(panels.graph);

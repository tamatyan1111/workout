// タブの中を「ランディング」「詳細」にさらに分割するための軽量な画面切替ヘルパー。
// URLとは連動しない(design.md記載のタブ切替と同じ考え方)。root直下のdata-screen属性を
// 持つ要素を画面として登録し、root内のどこにあってもdata-goto属性を持つ要素のクリックで
// 対応する画面に切り替える(UI再設計フェーズ2、運動/食事/プロフィール各タブで共通利用)。
export function initScreenNav(root: HTMLElement, defaultScreen: string): void {
  const screens = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>(':scope > [data-screen]').forEach((el) => {
    screens.set(el.dataset.screen!, el);
  });

  function show(name: string): void {
    screens.forEach((el, key) => {
      el.hidden = key !== name;
    });
  }

  root.querySelectorAll<HTMLElement>('[data-goto]').forEach((el) => {
    el.addEventListener('click', () => show(el.dataset.goto!));
  });

  show(defaultScreen);
}

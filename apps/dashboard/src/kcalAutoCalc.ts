// たんぱく質・脂質・炭水化物からカロリーを自動計算する(2026-08-26、手入力の手間を
// 減らしたいとの要望を受けて追加。customFoods.ts・eatingOut.tsに同じロジックが
// コピーされていたため2026-08-29に共通化)。カロリー欄を直接編集した後は、その値を
// 尊重して自動上書きしない(商品表示のカロリーと計算値がわずかに違う場合に合わせられるように)
export function wireKcalAutoCalc(root: ParentNode, selectors: { kcal: string; protein: string; fat: string; carb: string }): void {
  const kcalInput = root.querySelector<HTMLInputElement>(selectors.kcal)!;
  let kcalManuallyEdited = false;
  kcalInput.addEventListener('input', () => {
    kcalManuallyEdited = true;
  });
  [selectors.protein, selectors.fat, selectors.carb].forEach((selector) => {
    root.querySelector<HTMLInputElement>(selector)!.addEventListener('input', () => {
      if (kcalManuallyEdited) return;
      const protein = Number(root.querySelector<HTMLInputElement>(selectors.protein)!.value) || 0;
      const fat = Number(root.querySelector<HTMLInputElement>(selectors.fat)!.value) || 0;
      const carb = Number(root.querySelector<HTMLInputElement>(selectors.carb)!.value) || 0;
      kcalInput.value = (protein * 4 + fat * 9 + carb * 4).toFixed(1);
    });
  });
}

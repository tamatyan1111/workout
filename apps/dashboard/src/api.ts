import type {
  ApiResponse,
  BodyWeightLog,
  CartItem,
  Cycle,
  CustomFood,
  Exercise,
  FoodRef,
  FoodSearchResult,
  Gender,
  LogRow,
  Meal,
  MealType,
  NutritionGoal,
  NutritionSummary,
  PfcMode,
  Profile,
  Recipe,
  RecentLog,
  SetInput,
} from './types';
import type { ActivityLevel } from 'shared';

// ダッシュボードとAPIは同一オリジン(design.md §1)のため、絶対パスの相対参照で呼び出せる。
const API_DIR = '/api';

export class UnauthorizedError extends Error {}

async function parseResponse<T>(res: Response): Promise<T> {
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.ok || body.data === undefined) {
    if (res.status === 401) {
      throw new UnauthorizedError(body.error ?? 'ログインが必要です');
    }
    throw new Error(body.error ?? '通信に失敗しました');
  }
  return body.data;
}

async function callGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${API_DIR}/${path}`, window.location.href);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  const res = await fetch(url.toString(), { credentials: 'same-origin' });
  return parseResponse<T>(res);
}

// design.md §1.1「CSRF対策」: 単純なクロスサイトフォーム送信では付与できないカスタムヘッダーを付ける
async function callPost<T = void>(path: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_DIR}/${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify(payload),
  });
  return parseResponse<T>(res);
}

// design.md §2.18: 写真アップロードはmultipart/form-data(callPostのJSON専用body組み立てが使えない)。
// Content-Typeはbrowserがboundary付きで自動設定するため明示しない。
async function callPostFormData<T = void>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_DIR}/${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    body: formData,
  });
  return parseResponse<T>(res);
}

// ==== 認証(design.md §2.10「認証API」) ====

export const signup = (email: string, password: string, displayName: string): Promise<void> =>
  callPost('auth/signup.php', { email, password, display_name: displayName });

export const login = (email: string, password: string): Promise<void> =>
  callPost('auth/login.php', { email, password });

export const logout = (): Promise<void> => callPost('auth/logout.php', {});

export const googleLoginUrl = `${API_DIR}/auth/google_start.php`;

export const requestPasswordReset = (email: string): Promise<void> =>
  callPost('auth/password_reset_request.php', { email });

export const confirmPasswordReset = (token: string, newPassword: string): Promise<void> =>
  callPost('auth/password_reset_confirm.php', { token, new_password: newPassword });

// ==== プロフィール ====

export const getMe = (): Promise<Profile> => callGet<Profile>('get_me.php');

export const updateMe = (
  displayName: string,
  birthDate: string,
  gender: Gender,
  heightCm: string,
  activityLevel: ActivityLevel | ''
): Promise<void> =>
  callPost('update_me.php', {
    display_name: displayName,
    birth_date: birthDate || undefined,
    gender,
    height_cm: heightCm || undefined,
    activity_level: activityLevel || undefined,
  });

export const deleteAccount = (): Promise<void> => callPost('delete_account.php', {});

// design.md §3「設定タブ」US-17対応。<a href>によるページ遷移だと、Service Workerの
// SPAナビゲーションフォールバック(§design.md 相当の既知の落とし穴)に巻き込まれて
// index.htmlが返ってしまうことがあるため、fetch + Blobで明示的にダウンロードさせる
// (fetchはnavigateモードのリクエストではないため、Service Workerの当該フォールバックの
// 対象にならず、この問題を構造的に回避できる)。
export async function downloadExport(): Promise<void> {
  const res = await fetch(`${API_DIR}/export.php`, { credentials: 'same-origin' });
  if (!res.ok) {
    if (res.status === 401) {
      throw new UnauthorizedError('ログインが必要です');
    }
    throw new Error('エクスポートに失敗しました');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'workout_export.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ==== サイクル ====

export const getCycles = (): Promise<Cycle[]> => callGet<{ cycles: Cycle[] }>('get_cycles.php').then((d) => d.cycles);

export const addCycle = (label: string): Promise<{ id: number }> => callPost('add_cycle.php', { label });

export const editCycle = (id: number, label: string): Promise<void> => callPost('edit_cycle.php', { id, label });

export const deleteCycle = (id: number): Promise<void> => callPost('delete_cycle.php', { id });

// ==== 管理表・種目 ====

export const getBoard = (): Promise<Exercise[]> =>
  callGet<{ exercises: Exercise[] }>('get_board.php').then((d) => d.exercises);

export const addExercise = (
  cycleId: number,
  name: string,
  targetWeight: string,
  targetReps: string,
  targetSets: string
): Promise<{ id: number }> =>
  callPost('add_exercise.php', {
    cycle_id: cycleId,
    name,
    target_weight: targetWeight || undefined,
    target_reps: targetReps || undefined,
    target_sets: targetSets || undefined,
  });

export const editExercise = (
  id: number,
  targetWeight: string,
  targetReps: string,
  targetSets: string,
  discontinued: boolean
): Promise<void> =>
  callPost('edit_exercise.php', {
    id,
    target_weight: targetWeight || undefined,
    target_reps: targetReps || undefined,
    target_sets: targetSets || undefined,
    discontinued,
  });

export const deleteExercise = (id: number): Promise<void> => callPost('delete_exercise.php', { id });

// ==== 記録ログ ====

export const getLogs = (exerciseId?: number, from?: string, to?: string): Promise<LogRow[]> =>
  callGet<{ logs: LogRow[] }>('get_logs.php', {
    exercise_id: exerciseId ? String(exerciseId) : '',
    date_from: from ?? '',
    date_to: to ?? '',
  }).then((d) => d.logs);

export const getRecentLogs = (limit = 20): Promise<RecentLog[]> =>
  callGet<{ logs: RecentLog[] }>('get_recent_logs.php', { limit: String(limit) }).then((d) => d.logs);

// レスポンスの ids (採番された記録ID。setsと同じ順序) を返す
export const addLog = (exerciseId: number, loggedDate: string, sets: SetInput[]): Promise<number[]> =>
  callPost<{ ids: number[] }>('add_log.php', {
    exercise_id: exerciseId,
    logged_date: loggedDate,
    sets: sets.map((s) => ({ weight: s.weight || undefined, reps: s.reps })),
  }).then((data) => data.ids);

export const editLog = (id: number, loggedDate: string, weight: string, reps: string): Promise<void> =>
  callPost('edit_log.php', { id, logged_date: loggedDate, weight: weight || undefined, reps });

export const deleteLog = (id: number): Promise<void> => callPost('delete_log.php', { id });

// ==== 体重の推移(design.md §2.6) ====

export const getBodyWeightLogs = (from?: string, to?: string): Promise<BodyWeightLog[]> =>
  callGet<{ logs: BodyWeightLog[] }>('get_body_weight_logs.php', {
    date_from: from ?? '',
    date_to: to ?? '',
  }).then((d) => d.logs);

export const addBodyWeightLog = (loggedDate: string, weight: string): Promise<void> =>
  callPost('add_body_weight_log.php', { logged_date: loggedDate, weight });

export const editBodyWeightLog = (id: number, loggedDate: string, weight: string): Promise<void> =>
  callPost('edit_body_weight_log.php', { id, logged_date: loggedDate, weight });

export const deleteBodyWeightLog = (id: number): Promise<void> => callPost('delete_body_weight_log.php', { id });

// ==== 食事記録機能(design.md §2.11〜2.17、§7対応) ====

// FoodRef(source/id)を、API側が期待するmaster_food_id/custom_food_idの排他ペアに変換する
function foodRefParams(ref: FoodRef): { master_food_id?: number; custom_food_id?: number } {
  return ref.source === 'master' ? { master_food_id: ref.id } : { custom_food_id: ref.id };
}

export const getNutritionSummary = (): Promise<NutritionSummary> => callGet<NutritionSummary>('get_nutrition_summary.php');

export const getNutritionGoal = (): Promise<NutritionGoal | null> =>
  callGet<{ goal: NutritionGoal | null }>('get_nutrition_goal.php').then((d) => d.goal);

export const addNutritionGoal = (
  targetWeight: string,
  targetDate: string,
  pfcMode: PfcMode,
  customProteinG: string,
  customFatG: string,
  customCarbG: string
): Promise<{ id: number }> =>
  callPost('add_nutrition_goal.php', {
    target_weight: targetWeight,
    target_date: targetDate,
    pfc_mode: pfcMode,
    custom_protein_g: pfcMode === 'custom' ? customProteinG : undefined,
    custom_fat_g: pfcMode === 'custom' ? customFatG : undefined,
    custom_carb_g: pfcMode === 'custom' ? customCarbG : undefined,
  });

export const searchFoods = (q: string, foodGroupCode?: string): Promise<FoodSearchResult[]> =>
  callGet<{ foods: FoodSearchResult[] }>('search_foods.php', {
    q,
    food_group_code: foodGroupCode ?? '',
  }).then((d) => d.foods);

export const getCustomFoods = (): Promise<CustomFood[]> =>
  callGet<{ foods: CustomFood[] }>('get_custom_foods.php').then((d) => d.foods);

export const addCustomFood = (
  name: string,
  kcal: string,
  protein: string,
  fat: string,
  carb: string
): Promise<{ id: number }> =>
  callPost('add_custom_food.php', {
    name,
    kcal_per_100g: kcal,
    protein_g_per_100g: protein,
    fat_g_per_100g: fat,
    carb_g_per_100g: carb,
  });

export const editCustomFood = (
  id: number,
  name: string,
  kcal: string,
  protein: string,
  fat: string,
  carb: string
): Promise<void> =>
  callPost('edit_custom_food.php', {
    id,
    name,
    kcal_per_100g: kcal,
    protein_g_per_100g: protein,
    fat_g_per_100g: fat,
    carb_g_per_100g: carb,
  });

export const deleteCustomFood = (id: number): Promise<void> => callPost('delete_custom_food.php', { id });

export const getRecipes = (): Promise<Recipe[]> => callGet<{ recipes: Recipe[] }>('get_recipes.php').then((d) => d.recipes);

export const addRecipe = (name: string, items: CartItem[]): Promise<{ id: number }> =>
  callPost('add_recipe.php', {
    name,
    items: items.map((i) => ({ ...foodRefParams(i.ref), quantity_g: i.quantityG })),
  });

export const editRecipe = (id: number, name: string, items: CartItem[]): Promise<void> =>
  callPost('edit_recipe.php', {
    id,
    name,
    items: items.map((i) => ({ ...foodRefParams(i.ref), quantity_g: i.quantityG })),
  });

export const deleteRecipe = (id: number): Promise<void> => callPost('delete_recipe.php', { id });

export const getMeals = (from?: string, to?: string): Promise<Meal[]> =>
  callGet<{ meals: Meal[] }>('get_meals.php', { date_from: from ?? '', date_to: to ?? '' }).then((d) => d.meals);

export const addMeal = (
  loggedDate: string,
  mealType: MealType,
  items: CartItem[]
): Promise<{ id: number; item_ids: number[] }> =>
  callPost('add_meal.php', {
    logged_date: loggedDate,
    meal_type: mealType,
    items: items.map((i) => ({ ...foodRefParams(i.ref), quantity_g: i.quantityG })),
  });

export const addMealFromRecipe = (
  loggedDate: string,
  mealType: MealType,
  recipeId: number
): Promise<{ id: number; item_ids: number[] }> =>
  callPost('add_meal.php', { logged_date: loggedDate, meal_type: mealType, recipe_id: recipeId });

export const addMealItem = (mealId: number, item: CartItem): Promise<{ ids: number[] }> =>
  callPost('add_meal_item.php', { meal_id: mealId, ...foodRefParams(item.ref), quantity_g: item.quantityG });

export const addMealItemFromRecipe = (mealId: number, recipeId: number): Promise<{ ids: number[] }> =>
  callPost('add_meal_item.php', { meal_id: mealId, recipe_id: recipeId });

export const editMealItem = (id: number, ref: FoodRef, quantityG: string): Promise<void> =>
  callPost('edit_meal_item.php', { id, ...foodRefParams(ref), quantity_g: quantityG });

export const deleteMealItem = (id: number): Promise<void> => callPost('delete_meal_item.php', { id });

export const deleteMealItemGroup = (recipeBatchId: string): Promise<void> =>
  callPost('delete_meal_item_group.php', { recipe_batch_id: recipeBatchId });

export const deleteMeal = (id: number): Promise<void> => callPost('delete_meal.php', { id });

// design.md §2.18: 写真は認証付きAPI経由で配信するため、<img src>にセッションCookieが
// 必要になる(same-origin配信なのでcredentials指定不要でブラウザが自動付与する)
export const mealPhotoUrl = (mealId: number): string => `${API_DIR}/get_meal_photo.php?meal_id=${mealId}`;

export const uploadMealPhoto = (mealId: number, file: File): Promise<void> => {
  const formData = new FormData();
  formData.append('meal_id', String(mealId));
  formData.append('photo', file);
  return callPostFormData('upload_meal_photo.php', formData);
};

export const deleteMealPhoto = (mealId: number): Promise<void> => callPost('delete_meal_photo.php', { meal_id: mealId });

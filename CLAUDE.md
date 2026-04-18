# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev    # Dev server → http://localhost:3000
npm run build  # Production build
npm run lint   # ESLint
```

Path prefix: all commands run from `nextjs-app/`.

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript 5** · **Tailwind CSS v4**
- Tailwind v4 uses `@import "tailwindcss"` in CSS (not `@tailwind` directives). Theme tokens go in `@theme` blocks inside `globals.css`.
- Server Components are the default. Add `'use client'` only at the boundary where interactivity starts — child files don't need it.

## Architecture

```
src/app/
  layout.tsx        Root layout — Geist fonts, dark background
  page.tsx          Home route: renders <PuyoGame />
  globals.css       Global styles + CSS keyframe animations
  game/
    types.ts        PuyoColor, Cell, Board, ActivePiece, GameState, GamePhase
    logic.ts        Pure board functions (no React): createEmptyBoard, canPieceFit,
                    rotateCW/CCW, lockPiece, applyGravity, findClearGroups, calcScore
    PuyoGame.tsx    'use client' entry — useReducer game loop + all rendering
```

### Game state machine (`GamePhase`)

```
idle → dropping ⟶ clearAnimation ⟶ (loop back until no more chains)
                ↘ gameover               ↘ dropping (spawn next piece)
```

- `dropping`: active piece falls on `setInterval` at `dropSpeed(level)` ms/tick.
- `clearAnimation`: `setTimeout` 480 ms → `CLEAR_TICK` removes cells, applies gravity, re-checks.
- Chain count (`state.chain`) increments each `CLEAR_TICK`; resets to 0 on new piece spawn.

### Board conventions

- `board[y][x]`, y = 0 is the top row.
- Board is 6 columns × 12 rows (`BOARD_WIDTH` / `BOARD_HEIGHT` in `logic.ts`).
- Active piece is tracked in `state.activePiece` (not embedded in the board); merged into a display copy at render time.
- Ghost piece is computed on the fly from `canPieceFit` drops; shown as a transparent outline.

### Score formula

`calcScore(chain, count)` = `10 × count × bonuses[chain]`  
where `bonuses = [1, 1, 8, 16, 32, 64, ...]` (chain 0 = first clear, chain 1 = first combo, etc.)

Level advances every 2 000 points; `dropSpeed` decreases by 70 ms per level, floored at 100 ms.

---

## 要件定義 — ぷよぷよ

### 1. 目的

ブラウザ上で遊べるぷよぷよ風落ち物パズルゲームを提供する。  
Next.js + React でシングルページアプリとして動作し、インストール不要でプレイできる。

---

### 2. ゲームルール

#### 2-1. ボード

| 項目 | 仕様 |
|------|------|
| サイズ | 6列 × 12行 |
| 座標系 | `board[y][x]`、y=0 が最上行 |
| 初期状態 | 全セル空 |

#### 2-2. ぷよ

- 色は **赤・緑・青・黄・紫** の 5 色。
- 2個 1組（メイン＋サブ）でスポーン。スポーン位置はメイン (x=2, y=1)、サブ (x=2, y=0)。
- 同色が上下左右に **4個以上** つながると消滅する。

#### 2-3. ピース操作

| 操作 | キー |
|------|------|
| 左移動 | `←` |
| 右移動 | `→` |
| 右回転 | `↑` / `X` |
| 左回転 | `Z` |
| 低速落下 | `↓` |
| 一気落下（ハードドロップ） | `Space` |

- 回転時は壁・他ぷよとの衝突を検出し、最大 ±2 列のウォールキックを試みる。
- ハードドロップは即着地・即ロック。

#### 2-4. 落下・ロック

- ピースは `dropSpeed(level)` ms ごとに 1 行落下。
- 落下不能になった瞬間にボードへロックされる（ロック猶予なし）。
- ロック後、重力を適用してぷよを最下行へ詰める。

#### 2-5. 連鎖

1. ロック後に消滅グループを検出。
2. 消滅アニメーション（480 ms）ののち消去・重力適用。
3. 再度消滅グループを検索し、あれば 2 へ戻る（連鎖カウントをインクリメント）。
4. 消滅グループがなければ次のピースをスポーン。

#### 2-6. スコア

```
加算スコア = 10 × 消滅数 × chainBonus[chain]
chainBonus = [1, 1, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256]
```

- `chain` は 0-indexed（最初の消滅が chain=0、最初のコンボが chain=1）。
- 累積スコアが 2 000 点ごとにレベルアップ。

#### 2-7. レベル・速度

| レベル | 落下速度 (ms/行) |
|--------|----------------|
| 0 | 800 |
| 1 | 730 |
| … | … |
| 10+ | 100（下限） |

計算式: `max(100, 800 - level × 70)`

#### 2-8. ゲームオーバー

スポーン位置 (x=2, y=0/1) がすでに埋まっている場合、即ゲームオーバー。

---

### 3. 画面・UI

#### 3-1. ゲームボード

- セルサイズ 44 px、ギャップ 2 px。
- 同色の隣接ぷよ間に接続ブリッジを描画し、融合した見た目を表現。
- 落下予測位置を半透明のゴーストピースで表示。
- 消去対象のぷよは点滅アニメーション（`puyoClear` キーフレーム）。

#### 3-2. サイドパネル

| 表示項目 | 内容 |
|----------|------|
| NEXT | 次のピース（メイン・サブ）をミニサイズで表示 |
| SCORE | 現在の累積スコア（カンマ区切り） |
| LEVEL | 現在レベル（1 始まり表示） |
| MAX CHAIN | セッション中の最大連鎖数 |
| 操作説明 | キーバインド一覧 |

#### 3-3. オーバーレイ

| フェーズ | 表示内容 |
|----------|----------|
| `idle` | "PRESS ENTER" スタート案内 |
| `clearAnimation` | "N連鎖！" チェーンポップアップ（`chainPop` アニメーション） |
| `gameover` | "GAME OVER" + 最終スコア + リトライ案内 |

#### 3-4. ビジュアルデザイン

- 背景: ダークネイビーグラデーション。
- ボード: グラスモーフィズム（`rgba` + `backdrop-filter: blur`）。
- ぷよ: 色ごとのラジアルグラデーション + 内部ハイライット + 目。
- タイトル: 虹色アニメーション（`rainbowShift` キーフレーム）。

---

### 4. 非機能要件

| 項目 | 要件 |
|------|------|
| 動作環境 | モダンブラウザ（Chrome / Firefox / Safari 最新版） |
| レスポンシブ | デスクトップ優先（幅 500 px 以上を想定） |
| フレームレート | `setInterval` ベース（アニメーションは CSS キーフレーム） |
| 永続化 | なし（スコアはセッション内のみ） |
| アクセシビリティ | キーボード操作のみ対応（タッチ・ゲームパッド対応は対象外） |

---

### 5. 将来検討事項（対象外）

- ハイスコアのローカル保存
- モバイルタッチ操作
- 対戦モード・CPU 対戦
- BGM / SE
- アニメーションのフレームパーフェクト対応（`requestAnimationFrame` 移行）

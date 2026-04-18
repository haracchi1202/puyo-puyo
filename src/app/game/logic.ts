import type { Board, Cell, PuyoColor, ActivePiece } from './types';

export const BOARD_WIDTH = 6;
export const CLEAR_ANIM_MS = 480;
export const BOARD_HEIGHT = 12;
export const COLORS: PuyoColor[] = ['red', 'green', 'blue', 'yellow', 'purple'];

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, () =>
    Array.from({ length: BOARD_WIDTH }, (): Cell => null)
  );
}

export function randomColor(): PuyoColor {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export function randomPair(): [PuyoColor, PuyoColor] {
  return [randomColor(), randomColor()];
}

export function createActivePiece(mainColor: PuyoColor, subColor: PuyoColor): ActivePiece {
  return { mainX: 2, mainY: 1, subX: 2, subY: 0, mainColor, subColor };
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT;
}

export function canPieceFit(board: Board, piece: ActivePiece, dx = 0, dy = 0): boolean {
  const mx = piece.mainX + dx, my = piece.mainY + dy;
  const sx = piece.subX + dx, sy = piece.subY + dy;
  if (!inBounds(mx, my) || !inBounds(sx, sy)) return false;
  if (board[my][mx] !== null || board[sy][sx] !== null) return false;
  return true;
}

export function rotateCW(board: Board, piece: ActivePiece): ActivePiece {
  const dx = piece.subX - piece.mainX, dy = piece.subY - piece.mainY;
  const ndx = -dy, ndy = dx;
  const rotated = { ...piece, subX: piece.mainX + ndx, subY: piece.mainY + ndy };
  if (canPieceFit(board, rotated)) return rotated;
  for (const kick of [-1, 1, -2, 2]) {
    const kicked = { ...rotated, mainX: rotated.mainX + kick, subX: rotated.subX + kick };
    if (canPieceFit(board, kicked)) return kicked;
  }
  return piece;
}

export function rotateCCW(board: Board, piece: ActivePiece): ActivePiece {
  const dx = piece.subX - piece.mainX, dy = piece.subY - piece.mainY;
  const ndx = dy, ndy = -dx;
  const rotated = { ...piece, subX: piece.mainX + ndx, subY: piece.mainY + ndy };
  if (canPieceFit(board, rotated)) return rotated;
  for (const kick of [-1, 1, -2, 2]) {
    const kicked = { ...rotated, mainX: rotated.mainX + kick, subX: rotated.subX + kick };
    if (canPieceFit(board, kicked)) return kicked;
  }
  return piece;
}

export function lockPiece(board: Board, piece: ActivePiece): Board {
  const nb = board.map(r => [...r]);
  nb[piece.mainY][piece.mainX] = piece.mainColor;
  nb[piece.subY][piece.subX] = piece.subColor;
  return nb;
}

export function applyGravity(board: Board): Board {
  const nb = createEmptyBoard();
  for (let x = 0; x < BOARD_WIDTH; x++) {
    let wy = BOARD_HEIGHT - 1;
    for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
      if (board[y][x] !== null) { nb[wy][x] = board[y][x]; wy--; }
    }
  }
  return nb;
}

export function findConnected(board: Board, sx: number, sy: number): { x: number; y: number }[] {
  const color = board[sy][sx];
  if (!color) return [];
  const visited = new Set<string>();
  const stack = [{ x: sx, y: sy }];
  const result: { x: number; y: number }[] = [];
  while (stack.length) {
    const { x, y } = stack.pop()!;
    const k = `${x},${y}`;
    if (visited.has(k)) continue;
    visited.add(k); result.push({ x, y });
    for (const [ddx, ddy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + ddx, ny = y + ddy;
      if (inBounds(nx, ny) && board[ny][nx] === color && !visited.has(`${nx},${ny}`))
        stack.push({ x: nx, y: ny });
    }
  }
  return result;
}

export function findClearGroups(board: Board): { x: number; y: number }[] {
  const visited = new Set<string>();
  const toClear: { x: number; y: number }[] = [];
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (board[y][x] && !visited.has(`${x},${y}`)) {
        const group = findConnected(board, x, y);
        group.forEach(p => visited.add(`${p.x},${p.y}`));
        if (group.length >= 4) toClear.push(...group);
      }
    }
  }
  return toClear;
}

export function removeCells(board: Board, cells: { x: number; y: number }[]): Board {
  const nb = board.map(r => [...r]);
  cells.forEach(({ x, y }) => { nb[y][x] = null; });
  return nb;
}

export function calcScore(chain: number, count: number): number {
  const bonuses = [1, 1, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256];
  return 10 * count * bonuses[Math.min(chain, bonuses.length - 1)];
}

export function dropSpeed(level: number): number {
  return Math.max(100, 800 - level * 70);
}

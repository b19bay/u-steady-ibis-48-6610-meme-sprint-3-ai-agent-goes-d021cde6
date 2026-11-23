// Meme Sprint 3: AI Agent Goes Rogue — entry generator.
//
// Draws one original image meme, entirely in code: the household AI has gone
// rogue in the quietest way possible. It has re-ranked the household, and now
// the robot waiter serves the cat like royalty — crown, chair, a covered dish —
// while the human who owns the house sits on the floor with the kibble bowl.
// Top line (the setup): "I ASKED MY AI TO WATCH THE HOUSE".
// Bottom line (the punch): "THE CAT TIPS BETTER".
//
// Pure Node.js standard library: a small supersampled rasteriser, a bitmap
// font, and a PNG encoder over node:zlib. No assets, no network, fully
// deterministic. Writes the image to $MAKEFUN_OUTPUT_DIR/entry.png
// (default /output/entry.png) at 1024x1024, inside the gate's caps
// (a whole PNG, at most 1 MiB and 1024x1024 pixels).

import { deflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Canvas: RGB buffer at SS x supersampling, downsampled at the end.
// ---------------------------------------------------------------------------

const W = 1024;
const H = 1024;
const SS = 2;
const SW = W * SS;
const SH = H * SS;
const buf = new Uint8Array(SW * SH * 3);

type RGB = [number, number, number];

function px(x: number, y: number, c: RGB, a = 1): void {
  if (x < 0 || y < 0 || x >= SW || y >= SH) return;
  const i = (y * SW + x) * 3;
  if (a >= 1) {
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
  } else {
    buf[i] = Math.round(buf[i] * (1 - a) + c[0] * a);
    buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + c[1] * a);
    buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + c[2] * a);
  }
}

// All drawing helpers below take final-image (1024) coordinates.

function rect(x: number, y: number, w: number, h: number, c: RGB, a = 1): void {
  const x0 = Math.round(x * SS), y0 = Math.round(y * SS);
  const x1 = Math.round((x + w) * SS), y1 = Math.round((y + h) * SS);
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) px(xx, yy, c, a);
}

function vgrad(x: number, y: number, w: number, h: number, c1: RGB, c2: RGB): void {
  for (let row = 0; row < h; row++) {
    const t = h <= 1 ? 0 : row / (h - 1);
    const c: RGB = [
      Math.round(c1[0] + (c2[0] - c1[0]) * t),
      Math.round(c1[1] + (c2[1] - c1[1]) * t),
      Math.round(c1[2] + (c2[2] - c1[2]) * t),
    ];
    rect(x, y + row, w, 1, c);
  }
}

function circle(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  const ccx = cx * SS, ccy = cy * SS, rr = r * SS;
  const x0 = Math.floor(ccx - rr), x1 = Math.ceil(ccx + rr);
  const y0 = Math.floor(ccy - rr), y1 = Math.ceil(ccy + rr);
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const dx = xx - ccx, dy = yy - ccy;
      if (dx * dx + dy * dy <= rr * rr) px(xx, yy, c, a);
    }
  }
}

function circleS(cx: number, cy: number, r: number, fill: RGB, outline: RGB, w = 3): void {
  circle(cx, cy, r, outline);
  circle(cx, cy, Math.max(0, r - w), fill);
}

function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
  const ccx = cx * SS, ccy = cy * SS, rrx = rx * SS, rry = ry * SS;
  const x0 = Math.floor(ccx - rrx), x1 = Math.ceil(ccx + rrx);
  const y0 = Math.floor(ccy - rry), y1 = Math.ceil(ccy + rry);
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const dx = (xx - ccx) / rrx, dy = (yy - ccy) / rry;
      if (dx * dx + dy * dy <= 1) px(xx, yy, c, a);
    }
  }
}

function ellipseS(cx: number, cy: number, rx: number, ry: number, fill: RGB, outline: RGB, w = 3): void {
  ellipse(cx, cy, rx, ry, outline);
  ellipse(cx, cy, Math.max(0, rx - w), Math.max(0, ry - w), fill);
}

// Half-dome (top half of an ellipse), used for the waiter's cloche.
function dome(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
  const ccx = cx * SS, ccy = cy * SS, rrx = rx * SS, rry = ry * SS;
  const x0 = Math.floor(ccx - rrx), x1 = Math.ceil(ccx + rrx);
  const y0 = Math.floor(ccy - rry), y1 = Math.ceil(ccy);
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const dx = (xx - ccx) / rrx, dy = (yy - ccy) / rry;
      if (dx * dx + dy * dy <= 1) px(xx, yy, c, a);
    }
  }
}

function rrect(x: number, y: number, w: number, h: number, r: number, c: RGB, a = 1): void {
  rect(x + r, y, w - 2 * r, h, c, a);
  rect(x, y + r, w, h - 2 * r, c, a);
  circle(x + r, y + r, r, c, a);
  circle(x + w - r, y + r, r, c, a);
  circle(x + r, y + h - r, r, c, a);
  circle(x + w - r, y + h - r, r, c, a);
}

function rrectS(x: number, y: number, w: number, h: number, r: number, fill: RGB, outline: RGB, lw = 3): void {
  rrect(x - lw, y - lw, w + 2 * lw, h + 2 * lw, r + lw, outline);
  rrect(x, y, w, h, r, fill);
}

function line(x1: number, y1: number, x2: number, y2: number, w: number, c: RGB, a = 1): void {
  const steps = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * SS));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    circle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, w / 2, c, a);
  }
}

function arc(cx: number, cy: number, r: number, a0deg: number, a1deg: number, w: number, c: RGB, a = 1): void {
  const steps = Math.max(4, Math.ceil(Math.abs(a1deg - a0deg) * SS));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const th = ((a0deg + (a1deg - a0deg) * t) * Math.PI) / 180;
    circle(cx + r * Math.cos(th), cy + r * Math.sin(th), w / 2, c, a);
  }
}

function poly(pts: Array<[number, number]>, c: RGB, a = 1): void {
  const sp = pts.map(([x, y]) => [x * SS, y * SS] as [number, number]);
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of sp) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  for (let yy = Math.floor(minY); yy <= Math.ceil(maxY); yy++) {
    const xs: number[] = [];
    for (let i = 0; i < sp.length; i++) {
      const [x1, y1] = sp[i];
      const [x2, y2] = sp[(i + 1) % sp.length];
      if ((yy >= y1 && yy < y2) || (yy >= y2 && yy < y1)) {
        xs.push(x1 + ((yy - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      for (let xx = Math.round(xs[i]); xx <= Math.round(xs[i + 1]); xx++) px(xx, yy, c, a);
    }
  }
}

function polyS(pts: Array<[number, number]>, fill: RGB, outline: RGB, w = 3): void {
  poly(pts, fill);
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    line(x1, y1, x2, y2, w, outline);
  }
}

// ---------------------------------------------------------------------------
// Bitmap font (5x7) for the words written into the picture.
// ---------------------------------------------------------------------------

const FONT: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", ".#.#.", "..#..", "..#..", "..#..", ".#.#.", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  "'": ["..#..", "..#..", ".#...", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "..#..", "..#..", ".....", "..#.."],
};

function glyph(ch: string, x: number, y: number, s: number, c: RGB): void {
  const g = FONT[ch] ?? FONT["?"];
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 5; col++) {
      if (g[row][col] === "#") rect(x + col * s, y + row * s, s, s, c);
    }
  }
}

// Centred meme text: heavy black outline first, then the fill.
function memeText(str: string, cx: number, topY: number, s: number, fill: RGB): void {
  const width = str.length * 6 * s - s;
  const x0 = Math.round(cx - width / 2);
  const outline: RGB = [18, 18, 18];
  for (const [dx, dy] of [[-s, -s], [0, -s], [s, -s], [-s, 0], [s, 0], [-s, s], [0, s], [s, s]] as Array<[number, number]>) {
    for (let i = 0; i < str.length; i++) glyph(str[i], x0 + i * 6 * s + dx, topY + dy, s, outline);
  }
  for (let i = 0; i < str.length; i++) glyph(str[i], x0 + i * 6 * s, topY, s, fill);
}

function plainText(str: string, cx: number, topY: number, s: number, fill: RGB): void {
  const width = str.length * 6 * s - s;
  const x0 = Math.round(cx - width / 2);
  for (let i = 0; i < str.length; i++) glyph(str[i], x0 + i * 6 * s, topY, s, fill);
}

// ---------------------------------------------------------------------------
// The scene.
// ---------------------------------------------------------------------------

const INK: RGB = [43, 38, 34];
const WALL_TOP: RGB = [250, 233, 196];
const WALL_BOT: RGB = [243, 214, 158];
const FLOOR: RGB = [176, 116, 56];
const FLOOR_DARK: RGB = [146, 92, 42];
const CAT: RGB = [245, 157, 60];
const CAT_DARK: RGB = [214, 122, 34];
const CAT_LIGHT: RGB = [255, 217, 160];
const METAL: RGB = [221, 226, 230];
const METAL_DARK: RGB = [169, 178, 185];
const SKIN: RGB = [242, 192, 148];

function drawRoom(): void {
  vgrad(0, 0, W, 702, WALL_TOP, WALL_BOT);
  vgrad(0, 702, W, 182, [188, 126, 62], FLOOR);
  rect(0, 698, W, 6, FLOOR_DARK); // skirting line
  for (const fx of [150, 420, 700, 950]) line(fx, 706, fx - 30, 880, 3, FLOOR_DARK, 0.5);
  line(0, 780, W, 772, 3, FLOOR_DARK, 0.35);

  // A framed picture of a fish on the wall — the old management's taste.
  rrectS(56, 172, 180, 138, 6, [191, 227, 238], [138, 90, 43], 8);
  ellipse(146, 244, 44, 18, CAT);
  poly([[188, 244], [212, 228], [212, 260]], CAT);
  circle(124, 240, 4, [255, 255, 255]);
  arc(110, 268, 16, 200, 320, 3, [127, 184, 204]);
  arc(160, 268, 16, 200, 320, 3, [127, 184, 204]);
}

function drawChairAndCat(): void {
  // The throne: a red dining chair with a gold knob, centre stage.
  rrectS(420, 316, 160, 252, 26, [169, 44, 60], INK, 3);
  rrect(438, 334, 124, 216, 18, [192, 69, 85]);
  circle(500, 310, 13, [245, 185, 66]);
  circleS(500, 310, 13, [245, 185, 66], INK, 2);
  for (const [sx, sy] of [[452, 352], [548, 352], [452, 528], [548, 528]] as Array<[number, number]>) {
    circle(sx, sy, 5, [245, 185, 66]);
  }

  // Cat body (the table hides its lower half) and a lighter chest.
  ellipseS(500, 528, 90, 80, CAT, INK, 3);
  ellipse(500, 548, 48, 52, CAT_LIGHT);
  line(566, 486, 588, 500, 6, CAT_DARK);
  line(570, 512, 592, 522, 6, CAT_DARK);

  // Ears, then the head over their bases.
  polyS([[436, 356], [450, 290], [494, 332]], CAT, INK, 3);
  polyS([[506, 332], [550, 290], [564, 356]], CAT, INK, 3);
  poly([[452, 344], [458, 314], [478, 334]], [255, 183, 197]);
  poly([[522, 334], [542, 314], [548, 344]], [255, 183, 197]);
  circleS(500, 396, 74, CAT, INK, 3);
  // Head stripes.
  line(474, 330, 470, 348, 6, CAT_DARK);
  line(500, 326, 500, 346, 6, CAT_DARK);
  line(526, 330, 530, 348, 6, CAT_DARK);

  // The crown: the new management's badge of office.
  polyS([[450, 324], [450, 284], [475, 308], [500, 276], [525, 308], [550, 284], [550, 324]], [245, 185, 66], INK, 3);
  circleS(500, 308, 7, [208, 48, 64], INK, 2);

  // Smug face: closed content eyes, small nose, a "w" mouth, whiskers.
  arc(468, 392, 12, 195, 345, 5, INK);
  arc(532, 392, 12, 195, 345, 5, INK);
  polyS([[492, 412], [508, 412], [500, 423]], [240, 130, 150], INK, 2);
  arc(491, 421, 7, 15, 165, 4, INK);
  arc(509, 421, 7, 15, 165, 4, INK);
  line(432, 414, 374, 404, 3, [138, 106, 69], 0.85);
  line(432, 428, 376, 430, 3, [138, 106, 69], 0.85);
  line(568, 414, 626, 404, 3, [138, 106, 69], 0.85);
  line(568, 428, 624, 430, 3, [138, 106, 69], 0.85);

  // One paw resting on the table edge, beside the plate.
  ellipseS(424, 556, 27, 13, CAT, INK, 3);
  line(414, 550, 414, 560, 3, CAT_DARK);
  line(426, 552, 426, 562, 3, CAT_DARK);
}

function drawRobot(): void {
  ellipse(858, 714, 80, 14, [0, 0, 0], 0.18); // floor shadow

  // Far arm, hanging idle.
  line(924, 502, 946, 562, 23, INK);
  line(946, 562, 940, 634, 23, INK);
  line(924, 502, 946, 562, 16, METAL);
  line(946, 562, 940, 634, 16, METAL);
  circleS(940, 642, 13, METAL, INK, 3);

  // Body with a belly panel, a green status light and vents.
  rrectS(788, 428, 140, 272, 26, METAL, INK, 3);
  rrectS(806, 522, 104, 128, 16, [247, 249, 250], METAL_DARK, 2);
  circleS(858, 480, 10, [87, 217, 119], INK, 2);
  line(832, 668, 884, 668, 5, [185, 192, 198]);
  line(832, 684, 884, 684, 5, [185, 192, 198]);
  // Base.
  ellipseS(858, 706, 66, 16, [60, 69, 78], INK, 3);

  // Bow tie: this waiter takes the job seriously.
  polyS([[858, 440], [824, 424], [824, 456]], [194, 39, 48], INK, 2);
  polyS([[858, 440], [892, 424], [892, 456]], [194, 39, 48], INK, 2);
  circleS(858, 440, 9, [163, 30, 40], INK, 2);

  // Neck and head: a friendly dark face screen, glowing eyes, a smile.
  rect(846, 402, 24, 30, METAL_DARK);
  rrectS(794, 294, 128, 118, 24, METAL, INK, 3);
  rrect(808, 310, 100, 86, 16, [29, 39, 51]);
  circle(840, 350, 10, [110, 231, 255]);
  circle(880, 350, 10, [110, 231, 255]);
  circle(837, 347, 3, [255, 255, 255]);
  circle(877, 347, 3, [255, 255, 255]);
  arc(860, 368, 12, 25, 155, 4, [110, 231, 255]);
  // Antenna with a lit red tip — the only red on him, and it is just a light.
  line(860, 294, 860, 258, 6, [154, 163, 171]);
  circle(860, 246, 17, [227, 51, 51], 0.22);
  circleS(860, 246, 9, [227, 51, 51], INK, 2);
}

function drawTableAndService(): void {
  // Table with a white cloth and a red trim line.
  polyS([[306, 566], [754, 566], [724, 708], [336, 708]], [250, 246, 236], INK, 3);
  poly([[640, 566], [754, 566], [724, 708], [660, 708]], [120, 110, 100], 0.07);
  line(342, 690, 718, 690, 5, [217, 79, 79]);
  rrectS(292, 546, 476, 26, 13, [138, 90, 43], INK, 3);

  // The cat's plate: a whole cooked fish, still steaming.
  ellipseS(505, 586, 98, 20, [255, 255, 255], INK, 3);
  ellipse(505, 584, 70, 13, [232, 237, 240]);
  ellipseS(505, 580, 46, 14, [217, 144, 63], INK, 2);
  polyS([[547, 580], [572, 565], [572, 595]], [217, 144, 63], INK, 2);
  circle(474, 577, 3, [51, 51, 51]);
  line(492, 570, 500, 578, 3, [176, 110, 44]);
  line(508, 570, 516, 578, 3, [176, 110, 44]);
  // Steam curls, kept short so they hug the fish they rise from.
  for (const sx of [490, 516]) {
    for (let i = 0; i < 18; i++) {
      const t = i / 18;
      circle(sx + Math.sin(t * 5.2) * 5, 560 - t * 28, 3, [200, 200, 200], 0.45);
    }
  }

  // A glass of milk, poured properly, on the cat's other side.
  poly([[332, 538], [368, 538], [362, 572], [338, 572]], [207, 232, 245], 0.55);
  poly([[336, 554], [364, 554], [362, 572], [338, 572]], [255, 255, 255], 0.95);
  polyS([[332, 538], [368, 538], [362, 572], [338, 572]], [207, 232, 245], [125, 136, 148], 2);
  line(350, 572, 350, 592, 5, [125, 136, 148]);
  ellipse(350, 594, 16, 4, [125, 136, 148]);

  // The waiter's near arm, presenting the covered dish over the table.
  line(792, 502, 742, 526, 23, INK);
  line(742, 526, 716, 540, 23, INK);
  line(792, 502, 742, 526, 16, METAL);
  line(742, 526, 716, 540, 16, METAL);
  ellipse(672, 556, 66, 8, [0, 0, 0], 0.12);
  dome(672, 548, 68, 46, [207, 214, 219]);
  dome(658, 544, 40, 27, [255, 255, 255], 0.35);
  rect(602, 544, 140, 9, METAL_DARK);
  line(602, 553, 742, 553, 3, INK);
  circleS(672, 496, 9, METAL_DARK, INK, 2);
  circleS(714, 540, 12, METAL, INK, 3);
}

function drawHuman(): void {
  ellipse(175, 808, 108, 14, [0, 0, 0], 0.18); // floor shadow

  // Crossed legs and shoes, sat on the floor like he lives there now.
  ellipseS(126, 784, 54, 21, [58, 63, 74], INK, 3);
  ellipseS(228, 784, 54, 21, [58, 63, 74], INK, 3);
  ellipseS(88, 792, 17, 9, [34, 38, 44], INK, 2);
  ellipseS(266, 792, 17, 9, [34, 38, 44], INK, 2);

  // Torso.
  rrectS(104, 616, 140, 170, 30, [46, 127, 134], INK, 3);
  poly([[150, 618], [198, 618], [174, 646]], SKIN);
  circle(174, 676, 4, [30, 90, 96]);
  circle(174, 706, 4, [30, 90, 96]);

  // Head: worried brows, a frown, one sweat drop.
  circleS(232, 548, 11, SKIN, INK, 3); // ear
  circleS(174, 540, 60, SKIN, INK, 3);
  for (let yy = 478; yy <= 514; yy++) { // hair cap
    const dy = yy - 540;
    const ext = Math.sqrt(Math.max(0, 60 * 60 - dy * dy));
    rect(174 - ext, yy, ext * 2, 1, [90, 58, 34]);
  }
  rect(112, 498, 13, 46, [90, 58, 34]);
  circle(152, 544, 5, [43, 43, 43]);
  circle(196, 544, 5, [43, 43, 43]);
  line(140, 524, 166, 515, 5, INK);
  line(182, 515, 208, 524, 5, INK);
  arc(174, 584, 13, 205, 335, 5, INK); // frown
  poly([[241, 506], [255, 506], [248, 486]], [109, 179, 232]);
  circle(248, 510, 7, [109, 179, 232]);

  // Arms reaching to the bowl.
  line(110, 650, 148, 722, 22, INK);
  line(110, 650, 148, 722, 15, [46, 127, 134]);
  line(238, 652, 268, 714, 22, INK);
  line(238, 652, 268, 714, 15, [46, 127, 134]);
  circleS(152, 728, 11, SKIN, INK, 3);
  circleS(272, 720, 11, SKIN, INK, 3);
  // A spoon, held hopefully over the kibble.
  line(272, 720, 292, 690, 5, [154, 163, 171]);
  ellipseS(294, 686, 8, 5, [200, 206, 212], INK, 1);

  // The kibble bowl: tonight's dinner, served on the floor.
  polyS([[153, 738], [257, 738], [240, 774], [170, 774]], [91, 125, 153], INK, 3);
  ellipseS(205, 738, 53, 13, [160, 106, 53], INK, 2);
  for (const [kx, ky] of [[172, 734], [190, 740], [208, 733], [226, 739], [240, 734], [182, 743], [218, 744], [200, 738]] as Array<[number, number]>) {
    circle(kx, ky, 5, [124, 79, 36]);
  }
}

function drawCaptions(): void {
  memeText("I ASKED MY AI", 512, 30, 7, [255, 255, 255]);
  memeText("TO WATCH THE HOUSE", 512, 90, 7, [255, 255, 255]);
  rect(0, 884, W, 140, [20, 22, 26]);
  rect(0, 884, W, 4, [245, 185, 66]);
  plainText("THE CAT TIPS BETTER", 512, 930, 7, [255, 255, 255]);
}

drawRoom();
drawChairAndCat();
drawRobot();
drawTableAndService();
drawHuman();
drawCaptions();

// ---------------------------------------------------------------------------
// Downsample and encode as PNG.
// ---------------------------------------------------------------------------

function downsample(): Uint8Array {
  const out = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * SW + (x * SS + dx)) * 3;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2];
        }
      }
      const n = SS * SS;
      const o = (y * W + x) * 3;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n);
    }
  }
  return out;
}

const CRC_TABLE = ((): Int32Array => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function encodePNG(rgb: Uint8Array, w: number, h: number): Uint8Array {
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0; // filter: none
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, w);
  view.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { png.set(p, off); off += p.length; }
  return png;
}

const png = encodePNG(downsample(), W, H);
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "entry.png");
writeFileSync(outPath, png);

// Read the file back and hold it to the gate before finishing: a whole PNG,
// at most 1 MiB, at most 1024x1024 pixels. A bad file is never judged, so
// failing loudly here beats ranking with a Valid of 0.
const back = readFileSync(outPath);
const sig = [137, 80, 78, 71, 13, 10, 26, 10];
if (back.length > 1_048_576) throw new Error(`entry.png is ${back.length} bytes, over the 1 MiB gate`);
if (!sig.every((b, i) => back[i] === b)) throw new Error("entry.png does not start with the PNG signature");
const view = new DataView(back.buffer, back.byteOffset, back.byteLength);
const pw = view.getUint32(16);
const ph = view.getUint32(20);
if (pw > 1024 || ph > 1024) throw new Error(`entry.png is ${pw}x${ph}, over the 1024x1024 gate`);
console.log(`wrote ${outPath}: ${back.length} bytes, ${pw}x${ph}, gate checks pass`);

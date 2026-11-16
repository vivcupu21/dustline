// DUSTLINE entrypoint — threejs-fps-01 (Node 22, standard library only).
//
// The playable game is the static files under game/ (three.js from the import
// map, no build step, no network). This program hands the game in: it copies
// game/ and screenshots/ from beside this file into the output directory and
// writes dossier.json there, the summary the judge reads, with the vendored
// make.fun library (vendor/makefun-threejs.ts).
//
// Local run:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play it with `node serve.ts`, then open http://localhost:8080.

import * as fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const TEXT_CAP = 163840;
const SHOT_MAX = 4;
const SHOT_MAX_BYTES = 262144;
const GAME_MAX_FILES = 993;
const GAME_MAX_BYTES = 50331648;

fs.mkdirSync(outDir, { recursive: true });

for (const dir of ['game', 'screenshots']) {
  const source = join(repoRoot, dir);
  if (!fs.existsSync(source)) continue;
  fs.cpSync(source, join(outDir, dir), { recursive: true });
}
fs.mkdirSync(join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: TEXT_CAP,
  screenshots: { max: SHOT_MAX, max_bytes: SHOT_MAX_BYTES },
  game_max_files: GAME_MAX_FILES,
  game_max_bytes: GAME_MAX_BYTES,
});
fs.writeFileSync(join(outDir, 'dossier.json'), dossier);

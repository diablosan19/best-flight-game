// Kestrel Run — make.fun hand-in program (Node 22, standard library only).
//
// What it does: takes this repository's game/ (the static flight game) and
// screenshots/ (the maker's renders of it), copies both into the output
// directory the grader provides, and writes dossier.json there with the
// vendored make.fun dossier builder. The grader runs this program twice and
// requires byte-identical output both times; everything here is a plain
// deterministic copy, so the two runs match.
//
// Run locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });

const shotsOut = join(outputDir, 'screenshots');
mkdirSync(shotsOut, { recursive: true });
const shotsIn = join(repoRoot, 'screenshots');
if (existsSync(shotsIn)) cpSync(shotsIn, shotsOut, { recursive: true });

// Caps mirror the gate's own limits so a bad entry fails here, loudly,
// instead of silently passing a dossier the scorer would refuse:
// at most 4 screenshots of 256 KiB, game/ under 993 files and 48 MiB,
// paths under game/ at most 1000 bytes, dossier text capped at 160 KiB.
const dossierText = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossierText);

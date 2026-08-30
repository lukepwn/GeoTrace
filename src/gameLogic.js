// Geotrace core game data & pure logic (no React/DOM dependencies).
import wordsRaw from "./words.txt?raw";
import solutionsRaw from "./solutions.txt?raw";

export const MAP_WIDTH = 1200;
export const MAP_HEIGHT = 900;
export const MAX_GUESSES = 6;
export const WORD_LENGTH = 5;

// Radii (in map units) used for flag/beacon hit-testing and precision scoring.
export const BEACON_RADIUS = 20;
export const FLAG_RADIUS = 16;
export const HIT_RADIUS = BEACON_RADIUS + FLAG_RADIUS;
export const BASE_BEACON_BONUS = 30;
export const MAX_CENTER_BONUS = 20;
export const MAX_PRECISION_BONUS = 50;

/**
 * Converts a flag's distance from a beacon's center into a precision bonus.
 * Hitting any beacon awards a base of 30 points, plus up to 20 additional precision
 * points for landing close to dead-center (30 to 50 total points per letter).
 * @param {number} distance
 * @returns {{ precision: number, bonus: number }}
 */
export function computePrecisionBonus(distance) {
  const precision = Math.max(0, 1 - distance / BEACON_RADIUS);
  const bonus = BASE_BEACON_BONUS + Math.round(precision * MAX_CENTER_BONUS);
  return { precision, bonus };
}

// Solutions and valid guesses are maintained as separate word pools.
export const TARGET_WORDS = solutionsRaw
  .split(/\r?\n/)
  .map((w) => w.trim().toUpperCase())
  .filter((w) => w.length === WORD_LENGTH);

export const ALLOWED_GUESSES = new Set(
  wordsRaw
    .split(/\r?\n/)
    .map((w) => w.trim().toUpperCase())
    .filter((w) => w.length === WORD_LENGTH),
);

// Region bounding boxes the beacons are distributed across (1200x900 canvas).
const REGIONS = [
  { name: "Ember Coast", x0: 60, y0: 60, x1: 380, y1: 380 },
  { name: "Frostpeak Range", x0: 430, y0: 60, x1: 780, y1: 340 },
  { name: "Crystal Highlands", x0: 830, y0: 60, x1: 1140, y1: 380 },
  { name: "Sunken Delta", x0: 60, y0: 480, x1: 380, y1: 840 },
  { name: "Shadow Marsh", x0: 430, y0: 500, x1: 780, y1: 840 },
  { name: "Storm Isles", x0: 830, y0: 480, x1: 1140, y1: 840 },
];

// Deterministic pseudo-random generator so beacon layout is stable across sessions.
function seededRandom(seed) {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Letter pool: repeated entries create multiple beacons for frequently-used letters.
// All 26 letters are represented; higher-frequency letters get more beacons.
const LETTER_POOL = [
  "E",
  "E",
  "E",
  "E",
  "E",
  "E",
  "A",
  "A",
  "A",
  "A",
  "A",
  "R",
  "R",
  "R",
  "R",
  "R",
  "I",
  "I",
  "I",
  "I",
  "I",
  "O",
  "O",
  "O",
  "O",
  "T",
  "T",
  "T",
  "T",
  "N",
  "N",
  "N",
  "N",
  "S",
  "S",
  "S",
  "S",
  "L",
  "L",
  "L",
  "C",
  "C",
  "C",
  "U",
  "U",
  "U",
  "D",
  "D",
  "D",
  "P",
  "P",
  "P",
  "M",
  "M",
  "M",
  "H",
  "H",
  "G",
  "G",
  "G",
  "B",
  "B",
  "B",
  "F",
  "F",
  "F",
  "Y",
  "Y",
  "W",
  "W",
  "K",
  "K",
  "V",
  "V",
  "X",
  "X",
  "Z",
  "Z",
  "Z",
  "J",
  "J",
  "Q",
  "Q",
];

export function generateBeacons(customRegions = REGIONS, seed = 0) {
  const regions =
    customRegions && customRegions.length > 0 ? customRegions : REGIONS;
  // Group letters by their assigned region while keeping the original round-robin mapping.
  const regionGroups = regions.map(() => []);
  LETTER_POOL.forEach((char, index) => {
    regionGroups[index % regions.length].push({ char, index });
  });

  const beaconDiameter = BEACON_RADIUS * 2;
  const minGap = 8; // extra breathing room so hit areas never touch.
  const beacons = [];

  regionGroups.forEach((group, regionIndex) => {
    const region = regions[regionIndex];
    const count = group.length;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const pad = 30;
    const cellW = (region.x1 - region.x0 - pad * 2) / cols;
    const cellH = (region.y1 - region.y0 - pad * 2) / rows;
    // Jitter is capped so neighboring cells' beacons can never overlap.
    const maxJitterX = Math.max(0, (cellW - beaconDiameter - minGap) / 2);
    const maxJitterY = Math.max(0, (cellH - beaconDiameter - minGap) / 2);

    group.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const seedOffset = seed ? seed * 100 : 0;
      const rx = seededRandom(item.index * 2 + 1 + seedOffset) * 2 - 1;
      const ry = seededRandom(item.index * 2 + 2 + seedOffset) * 2 - 1;
      const x = Math.round(
        region.x0 + pad + (col + 0.5) * cellW + rx * maxJitterX,
      );
      const y = Math.round(
        region.y0 + pad + (row + 0.5) * cellH + ry * maxJitterY,
      );
      beacons.push({
        id: `beacon-${item.index}-${item.char}`,
        char: item.char,
        x,
        y,
        region: region.name,
      });
    });
  });

  return beacons;
}

export const BEACONS = generateBeacons();

export function pickRandomSolution() {
  return TARGET_WORDS[Math.floor(Math.random() * TARGET_WORDS.length)];
}

/**
 * Standard two-pass Wordle evaluation with correct duplicate-letter handling.
 * @param {string} guess - 5 letter guess.
 * @param {string} solution - 5 letter solution.
 * @returns {('correct'|'present'|'absent')[]}
 */
export function evaluateGuess(guess, solution) {
  const guessLetters = guess.toUpperCase().split("");
  const solutionLetters = solution.toUpperCase().split("");
  const statuses = new Array(guessLetters.length).fill("absent");
  const remainingCounts = {};

  // Pass 1: mark exact matches, tally remaining (unmatched) solution letters.
  for (let i = 0; i < guessLetters.length; i += 1) {
    if (guessLetters[i] === solutionLetters[i]) {
      statuses[i] = "correct";
    } else {
      remainingCounts[solutionLetters[i]] =
        (remainingCounts[solutionLetters[i]] || 0) + 1;
    }
  }

  // Pass 2: mark present letters, consuming from the remaining letter pool.
  for (let i = 0; i < guessLetters.length; i += 1) {
    if (statuses[i] === "correct") continue;
    const letter = guessLetters[i];
    if (remainingCounts[letter] > 0) {
      statuses[i] = "present";
      remainingCounts[letter] -= 1;
    }
  }

  return statuses;
}

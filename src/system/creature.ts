export type CreatureMood = "awake" | "sleepy" | "evolving" | "sick" | "playful";
export type CreatureStage = "egg" | "hatchling" | "juvenile" | "adult" | "elder";

export interface CreatureInput {
  seed: string;
  commitCount: number;
  sleepCycles: number;
  successfulMutations: number;
  totalMutations: number;
  curiosity: number;
  energyLevel: "High" | "Low" | "Critical";
  safeMode: boolean;
  lowEnergy: boolean;
}

export interface CreatureRender {
  stage: CreatureStage;
  mood: CreatureMood;
  variantId: string;
  lines: string[];
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick<T>(items: T[], n: number): T {
  return items[n % items.length];
}

function stageFromSignals(input: CreatureInput): CreatureStage {
  const score = input.commitCount + input.successfulMutations * 3 + input.sleepCycles * 2;
  if (score < 3) return "egg";
  if (score < 12) return "hatchling";
  if (score < 30) return "juvenile";
  if (score < 70) return "adult";
  return "elder";
}

function moodFromSignals(input: CreatureInput): CreatureMood {
  if (input.safeMode) return "sick";
  if (input.totalMutations > 0 && input.successfulMutations < input.totalMutations / 2) return "evolving";
  if (input.lowEnergy || input.energyLevel !== "High") return "sleepy";
  if (input.curiosity >= 7) return "playful";
  return "awake";
}

function decorateByMood(base: string[], mood: CreatureMood): string[] {
  if (mood === "sleepy") return base.map((line) => line.replace(/o/g, "-"));
  if (mood === "sick") return base.map((line) => line.replace(/\^/g, "x"));
  if (mood === "evolving") return [`~ ${base[0]} ~`, ...base.slice(1)];
  if (mood === "playful") return [...base, "   * zoomies *"];
  return base;
}

function baseBody(stage: CreatureStage, gene: number): string[] {
  const eye = pick(["o", "O", "^", "*"], gene + 1);
  const body = pick(["()", "[]", "{}"], gene + 3);
  const tail = pick(["~", "-", "="], gene + 7);
  const crest = pick(["'", "`", "."], gene + 11);

  if (stage === "egg") {
    return [
      "    __",
      `  /${crest}${crest}\\`,
      " | () |",
      "  \\__/",
    ];
  }
  if (stage === "hatchling") {
    return [
      `  /\\_/\\${tail}`,
      ` (${eye}.${eye})`,
      `  ${body}_${body}`,
    ];
  }
  if (stage === "juvenile") {
    return [
      `  /\\_/\\${tail}`,
      ` (${eye}_${eye})`,
      ` /${body} ${body}\\`,
      "  /   \\",
    ];
  }
  if (stage === "adult") {
    return [
      ` /\\___/\\${tail}`,
      `(${eye} \\_/ ${eye})`,
      ` /${body} ${body}\\`,
      "/_/   \\_\\",
    ];
  }
  return [
    ` /\\___/\\${tail}`,
    `(${eye}==${eye})`,
    ` /${body}${body}${body}\\`,
    "/_/|_|\\_\\",
  ];
}

export function renderCreature(input: CreatureInput): CreatureRender {
  const seedHash = hashSeed(input.seed);
  const stage = stageFromSignals(input);
  const mood = moodFromSignals(input);
  const base = baseBody(stage, seedHash);
  const lines = decorateByMood(base, mood);
  return {
    stage,
    mood,
    variantId: `v${(seedHash % 1000).toString().padStart(3, "0")}`,
    lines,
  };
}

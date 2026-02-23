export type CreatureMood = "awake" | "sleepy" | "evolving" | "sick" | "playful";
export type CreatureStage = "egg" | "hatchling" | "juvenile" | "adult" | "elder";
export type CreaturePalette = "forest" | "sunset" | "ocean" | "ember";
export type CreatureBody = "round" | "square" | "spiky";
export type CreatureEyes = "dot" | "wide" | "star" | "caret";
export type CreatureAccent = "stripe" | "spots" | "cheeks" | "none";

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
  palette?: CreaturePalette;
  body?: CreatureBody;
  eyes?: CreatureEyes;
  accent?: CreatureAccent;
}

export interface CreatureRender {
  stage: CreatureStage;
  mood: CreatureMood;
  variantId: string;
  lines: string[];
}

export interface CreatureAnimationFrame {
  index: number;
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

function eyesAscii(kind: CreatureEyes | undefined, fallback: string): string {
  if (!kind) return fallback;
  if (kind === "dot") return "o";
  if (kind === "wide") return "O";
  if (kind === "star") return "*";
  return "^";
}

function bodyAscii(kind: CreatureBody | undefined, fallback: string): string {
  if (!kind) return fallback;
  if (kind === "round") return "()";
  if (kind === "square") return "[]";
  return "{}";
}

function accentLine(kind: CreatureAccent | undefined): string {
  if (kind === "stripe") return "   ===";
  if (kind === "spots") return "   . .";
  if (kind === "cheeks") return "   o o";
  return "";
}

export function renderCreature(input: CreatureInput): CreatureRender {
  const seedHash = hashSeed(input.seed);
  const stage = stageFromSignals(input);
  const mood = moodFromSignals(input);
  const base = baseBody(stage, seedHash);
  const eyeSymbol = eyesAscii(input.eyes, pick(["o", "O", "^", "*"], seedHash + 1));
  const bodySymbol = bodyAscii(input.body, pick(["()", "[]", "{}"], seedHash + 3));
  const customized = base.map((line) =>
    line
      .replace(/[oO\^\*]/g, eyeSymbol)
      .replace(/\(\)|\[\]|\{\}/g, bodySymbol)
  );
  const accent = accentLine(input.accent);
  const lines = decorateByMood(accent ? [...customized, accent] : customized, mood);
  return {
    stage,
    mood,
    variantId: `v${(seedHash % 1000).toString().padStart(3, "0")}`,
    lines,
  };
}

function blinkLines(lines: string[]): string[] {
  return lines.map((line) => line.replace(/[oO\^\*]/g, "-"));
}

function shiftLines(lines: string[], spaces: number): string[] {
  const pad = " ".repeat(Math.max(0, spaces));
  return lines.map((line) => `${pad}${line}`);
}

export function renderCreatureAnimationFrames(
  creature: CreatureRender,
  frameCount = 8,
): CreatureAnimationFrame[] {
  const count = Math.max(1, Math.floor(frameCount));
  const frames: CreatureAnimationFrame[] = [];
  for (let i = 0; i < count; i += 1) {
    const bob = i % 4 === 2 ? 1 : 0;
    const shouldBlink = creature.mood !== "sick" && i % 6 === 3;
    const base = shouldBlink ? blinkLines(creature.lines) : creature.lines;
    const moodLine =
      creature.mood === "playful"
        ? i % 2 === 0 ? "  ~ wiggle ~" : "  ~ zoom ~"
        : creature.mood === "sleepy"
          ? "  z z z"
          : creature.mood === "evolving"
            ? i % 2 === 0 ? "  ✦ mutate ✦" : "  ✧ adapt ✧"
            : creature.mood === "sick"
              ? "  ...recovering..."
              : "  ...";
    frames.push({
      index: i,
      lines: [...shiftLines(base, bob), moodLine],
    });
  }
  return frames;
}

function paletteColors(palette: CreaturePalette | undefined): { skin: string; detail: string; bg: string } {
  if (palette === "sunset") return { skin: "#ff9f68", detail: "#7f3b2f", bg: "#fff3e8" };
  if (palette === "ocean") return { skin: "#79c6ff", detail: "#1e4a67", bg: "#e9f6ff" };
  if (palette === "ember") return { skin: "#ff8a5b", detail: "#5f1f1f", bg: "#fff0ea" };
  return { skin: "#8dcf8a", detail: "#23442a", bg: "#eef9ef" };
}

function moodAnimation(mood: CreatureMood): string {
  if (mood === "sleepy") return "breath 2.8s ease-in-out infinite";
  if (mood === "evolving") return "pulse 1.4s ease-in-out infinite";
  if (mood === "sick") return "wobble 1.6s linear infinite";
  return "breath 2.1s ease-in-out infinite";
}

export function renderCreatureSvg(creature: CreatureRender, input: CreatureInput): string {
  const colors = paletteColors(input.palette);
  const anim = moodAnimation(creature.mood);
  const eye = input.eyes || "dot";
  const accent = input.accent || "none";
  const face = eye === "wide"
    ? `<ellipse cx="78" cy="88" rx="7" ry="5"/><ellipse cx="122" cy="88" rx="7" ry="5"/>`
    : eye === "star"
      ? `<text x="78" y="91" font-size="10" text-anchor="middle">*</text><text x="122" y="91" font-size="10" text-anchor="middle">*</text>`
      : eye === "caret"
        ? `<text x="78" y="91" font-size="10" text-anchor="middle">^</text><text x="122" y="91" font-size="10" text-anchor="middle">^</text>`
        : `<circle cx="78" cy="88" r="4"/><circle cx="122" cy="88" r="4"/>`;

  const body = input.body === "square"
    ? `<rect x="52" y="56" width="96" height="92" rx="16"/>`
    : input.body === "spiky"
      ? `<path d="M48,144 L58,70 L72,78 L84,58 L100,74 L116,58 L128,78 L142,70 L152,144 Z"/>`
      : `<ellipse cx="100" cy="104" rx="56" ry="50"/>`;

  const accentSvg = accent === "stripe"
    ? `<rect x="58" y="108" width="84" height="10" rx="5" fill="${colors.detail}" opacity="0.35"/>`
    : accent === "spots"
      ? `<circle cx="70" cy="120" r="4" fill="${colors.detail}" opacity="0.45"/><circle cx="130" cy="118" r="5" fill="${colors.detail}" opacity="0.45"/>`
      : accent === "cheeks"
        ? `<circle cx="63" cy="102" r="7" fill="#ff7b89" opacity="0.45"/><circle cx="137" cy="102" r="7" fill="#ff7b89" opacity="0.45"/>`
        : "";

  return `
<svg viewBox="0 0 200 200" role="img" aria-label="Hatchling creature ${creature.stage} ${creature.mood}">
  <defs>
    <style>
      .creature { transform-origin: 100px 110px; animation: ${anim}; }
      @keyframes breath { 0%,100% { transform: translateY(0px) scale(1); } 50% { transform: translateY(1.5px) scale(1.01); } }
      @keyframes pulse { 0%,100% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(255,156,110,0.0)); } 50% { transform: scale(1.03); filter: drop-shadow(0 0 6px rgba(255,156,110,0.55)); } }
      @keyframes wobble { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(1deg); } 75% { transform: rotate(-1deg); } }
      .spark { animation: twinkle 1.8s ease-in-out infinite; }
      @keyframes twinkle { 0%,100% { opacity: 0.1; } 50% { opacity: 0.8; } }
    </style>
  </defs>
  <rect x="0" y="0" width="200" height="200" rx="28" fill="${colors.bg}" />
  <g class="creature" fill="${colors.skin}" stroke="${colors.detail}" stroke-width="4">
    ${body}
    ${accentSvg}
    <g fill="${colors.detail}" stroke="none">
      ${face}
      <path d="M86 110 Q100 122 114 110" fill="none" stroke="${colors.detail}" stroke-width="3" stroke-linecap="round"/>
    </g>
  </g>
  <circle class="spark" cx="32" cy="36" r="3" fill="${colors.detail}" />
  <circle class="spark" cx="166" cy="44" r="2.5" fill="${colors.detail}" style="animation-delay: .4s" />
</svg>`.trim();
}

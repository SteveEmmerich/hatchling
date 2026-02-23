import fs from "fs/promises";
import path from "path";
import { z } from "zod";

const CreatureGenomeSchema = z.object({
  version: z.literal(1),
  seed: z.string().min(1),
  palette: z.enum(["forest", "sunset", "ocean", "ember"]),
  body: z.enum(["round", "square", "spiky"]),
  eyes: z.enum(["dot", "wide", "star", "caret"]),
  accent: z.enum(["stripe", "spots", "cheeks", "none"]),
  mutationCount: z.number().int().min(0),
  updatedAt: z.string().min(1),
});

export type CreatureGenome = z.infer<typeof CreatureGenomeSchema>;

const GENOME_FILE = "brain/creature_genome.json";

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

export function defaultGenome(seed: string): CreatureGenome {
  const h = hashSeed(seed);
  const now = new Date().toISOString();
  return {
    version: 1,
    seed,
    palette: pick(["forest", "sunset", "ocean", "ember"], h + 1),
    body: pick(["round", "square", "spiky"], h + 3),
    eyes: pick(["dot", "wide", "star", "caret"], h + 5),
    accent: pick(["stripe", "spots", "cheeks", "none"], h + 7),
    mutationCount: 0,
    updatedAt: now,
  };
}

export function validateGenome(raw: unknown): CreatureGenome {
  return CreatureGenomeSchema.parse(raw);
}

export async function loadGenome(rootDir: string, seed: string): Promise<CreatureGenome> {
  const target = path.join(rootDir, GENOME_FILE);
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8"));
    return validateGenome(parsed);
  } catch {
    const genome = defaultGenome(seed);
    await saveGenome(rootDir, genome);
    return genome;
  }
}

export async function saveGenome(rootDir: string, genome: CreatureGenome): Promise<void> {
  const target = path.join(rootDir, GENOME_FILE);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(validateGenome(genome), null, 2), "utf-8");
}

export async function mutateGenome(
  rootDir: string,
  seed: string,
  patch: Partial<Pick<CreatureGenome, "palette" | "body" | "eyes" | "accent">>,
): Promise<CreatureGenome> {
  const current = await loadGenome(rootDir, seed);
  const next: CreatureGenome = {
    ...current,
    ...patch,
    mutationCount: current.mutationCount + 1,
    updatedAt: new Date().toISOString(),
  };
  await saveGenome(rootDir, next);
  return next;
}

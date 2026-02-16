import { mkdir, readdir, access } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

export interface HatchlingInstance {
  name: string;
  path: string;
  config: {
    provider: string;
    model: string;
  };
}

export class InstanceManager {
  private instancesRoot: string;

  constructor() {
    // Store instances in user's home directory
    this.instancesRoot = join(homedir(), ".hatchlings");
  }

  async ensureInstancesRoot(): Promise<void> {
    try {
      await access(this.instancesRoot);
    } catch {
      await mkdir(this.instancesRoot, { recursive: true });
    }
  }

  getInstancePath(name: string): string {
    return join(this.instancesRoot, `.hatchling-${name}`);
  }

  async createInstance(name: string, provider: string, model: string): Promise<string> {
    await this.ensureInstancesRoot();
    const instancePath = this.getInstancePath(name);

    // Create instance directory structure
    await mkdir(instancePath, { recursive: true });
    await mkdir(join(instancePath, "brain"), { recursive: true });
    await mkdir(join(instancePath, "memory", "daily"), { recursive: true });
    await mkdir(join(instancePath, "memory", "sleep_logs"), { recursive: true });
    await mkdir(join(instancePath, "memory", "telemetry"), { recursive: true });
    await mkdir(join(instancePath, "memory", "backups"), { recursive: true });
    await mkdir(join(instancePath, "limbs"), { recursive: true });
    await mkdir(join(instancePath, "limbs_staging"), { recursive: true });
    await mkdir(join(instancePath, "projects"), { recursive: true });

    // Create config
    const Bun = (await import("bun")).default;
    await Bun.write(
      join(instancePath, "brain", "config.json"),
      JSON.stringify(
        {
          name,
          provider,
          model,
          createdAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    return instancePath;
  }

  async instanceExists(name: string): Promise<boolean> {
    try {
      await access(this.getInstancePath(name));
      return true;
    } catch {
      return false;
    }
  }

  async listInstances(): Promise<HatchlingInstance[]> {
    await this.ensureInstancesRoot();
    try {
      const entries = await readdir(this.instancesRoot);
      const instances: HatchlingInstance[] = [];

      for (const entry of entries) {
        if (entry.startsWith(".hatchling-")) {
          const name = entry.replace(".hatchling-", "");
          const instancePath = join(this.instancesRoot, entry);
          
          try {
            const Bun = (await import("bun")).default;
            const configPath = join(instancePath, "brain", "config.json");
            const configFile = Bun.file(configPath);
            const config = await configFile.json();
            
            instances.push({
              name,
              path: instancePath,
              config: {
                provider: config.provider || "unknown",
                model: config.model || "unknown",
              },
            });
          } catch {
            // Skip invalid instances
          }
        }
      }

      return instances;
    } catch {
      return [];
    }
  }

  async getCurrentInstance(): Promise<string | null> {
    // Check for instance name in environment or current directory marker
    const envInstance = process.env.HATCHLING_INSTANCE;
    if (envInstance) {
      return this.getInstancePath(envInstance);
    }

    // Check for .hatchling file in current directory
    try {
      const Bun = (await import("bun")).default;
      const markerFile = Bun.file(".hatchling");
      const instanceName = await markerFile.text();
      return this.getInstancePath(instanceName.trim());
    } catch {
      return null;
    }
  }

  async setCurrentInstance(name: string): Promise<void> {
    // Create .hatchling marker file in current directory
    const fs = await import("fs/promises");
    await fs.writeFile(".hatchling", name, "utf-8");
  }

  async registerInstance(name: string, instancePath: string): Promise<void> {
    // Verify the instance exists and has valid structure
    try {
      await access(instancePath);
      await access(join(instancePath, "brain", "config.json"));
      // Instance is valid, no additional registration needed
      // The directory already exists with the right structure
    } catch (error) {
      throw new Error(`Invalid instance at ${instancePath}: ${error}`);
    }
  }
}

export const instanceManager = new InstanceManager();

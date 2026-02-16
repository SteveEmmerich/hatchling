import path from 'path';
import fs from 'fs/promises';
import { SecurityScanner } from './scanner.js';
import { PathGuard } from './pathGuard.js';
export class MutationEngine {
    static async getMutationBudget() {
        const statePath = await PathGuard.validatePath('brain/mutation_state.json', 'read');
        const state = await Bun.file(statePath).json();
        const configPath = await PathGuard.validatePath('brain/config.json', 'read');
        const config = await Bun.file(configPath).json();
        return config.mutations.dailyCap - state.mutationsToday;
    }
    static async useMutationBudget(name) {
        const budget = await this.getMutationBudget();
        if (budget <= 0) {
            throw new Error(`Mutation Budget Exhausted: Daily limit reached.`);
        }
        const statePath = await PathGuard.validatePath('brain/mutation_state.json', 'write');
        const state = await Bun.file(statePath).json();
        state.mutationsToday++;
        state.totalMutations++;
        state.mutationsThisCycle++;
        await fs.writeFile(statePath, JSON.stringify(state, null, 2));
        console.log(`🧬 Mutation recorded: ${name} (Remaining Budget: ${budget - 1})`);
    }
    static async stageMutation(code, manifest) {
        // 1. Scan Code for Lethal Patterns
        try {
            SecurityScanner.scanCode(code, manifest.name);
        }
        catch (e) {
            console.error(`❌ Security Rejection: ${e.message}`);
            throw e;
        }
        // 2. Validate Budget
        await this.useMutationBudget(manifest.name);
        // 3. Write to Limbs Staging
        const stagingDir = await PathGuard.validatePath('limbs_staging', 'write');
        const stagingPath = path.join(stagingDir, `${manifest.name}.ts`);
        const manifestPath = path.join(stagingDir, `${manifest.name}.json`);
        await fs.writeFile(stagingPath, code);
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
        console.log(`📦 Staged mutation: ${stagingPath}`);
        // 4. Dry-run Dependencies
        if (Object.keys(manifest.dependencies).length > 0) {
            console.log(`🔍 Checking dependencies for ${manifest.name}...`);
            // Simulating dependency check or installing to temp location
            // In a real scenario, we might use bun install --dry-run or similar in isolation
        }
        // 5. Syntax Verification
        try {
            console.log(`🔬 Verifying syntax...`);
            // Bun build --dry-run (checking if it compiles)
            const proc = Bun.spawn(['bun', 'build', stagingPath, '--no-bundle'], {
                stderr: 'pipe'
            });
            const exitCode = await proc.exited;
            if (exitCode !== 0) {
                const error = await new Response(proc.stderr).text();
                throw new Error(`Syntax Error: ${error}`);
            }
            console.log(`✅ Syntax Verified`);
        }
        catch (e) {
            console.error(`❌ Validation Failed: ${e.message}`);
            // Refund budget on failure? Maybe not, failure costs energy.
            throw e;
        }
        return stagingPath;
    }
}
//# sourceMappingURL=mutate.js.map
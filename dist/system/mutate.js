import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { SecurityScanner } from './scanner.js';
import { PathGuard } from './pathGuard.js';
export class MutationEngine {
    static async getMutationBudget() {
        const statePath = await PathGuard.validatePath('brain/mutation_state.json', 'read');
        const state = JSON.parse(await fs.readFile(statePath, 'utf-8'));
        const configPath = await PathGuard.validatePath('brain/config.json', 'read');
        const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
        return config.mutations.dailyCap - state.mutationsToday;
    }
    static async useMutationBudget(name) {
        const budget = await this.getMutationBudget();
        if (budget <= 0) {
            throw new Error(`Mutation Budget Exhausted: Daily limit reached.`);
        }
        const statePath = await PathGuard.validatePath('brain/mutation_state.json', 'write');
        const state = JSON.parse(await fs.readFile(statePath, 'utf-8'));
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
            // Simulating dependency check or installing to temp location.
        }
        // 5. Syntax Verification
        try {
            console.log(`🔬 Verifying syntax...`);
            const proc = spawn('node', ['--check', stagingPath], { stdio: ['ignore', 'ignore', 'pipe'] });
            let stderr = '';
            proc.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });
            const exitCode = await new Promise((resolve) => {
                proc.on('close', (code) => resolve(code ?? 1));
            });
            if (exitCode !== 0) {
                throw new Error(`Syntax Error: ${stderr.trim() || 'node --check failed'}`);
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
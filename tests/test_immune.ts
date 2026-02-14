import { PathGuard, ProtectedFileError } from '../system/pathGuard.js';
import { SecurityScanner } from '../system/scanner.js';
import { MutationEngine } from '../system/mutate.js';
import fs from 'fs/promises';

async function testPathGuard() {
  console.log('🛡️  Testing PathGuard...');
  
  // 1. Valid Path
  try {
    await PathGuard.validatePath('brain/config.json', 'read');
    console.log('  ✅ Valid path allowed');
  } catch (e) {
    console.error('  ❌ Valid path failed:', e);
  }

  // 2. Invalid Path (Traversal)
  try {
    await PathGuard.validatePath('../outside.txt', 'read');
    console.error('  ❌ Path traversal NOT blocked');
  } catch (e: any) {
    if (e.message.includes('outside territory')) {
      console.log('  ✅ Path traversal blocked');
    } else {
      console.error('  ❌ Path traversal error mismatch:', e.message);
    }
  }

  // 3. Protected File Write
  try {
    await PathGuard.validatePath('brain/CONSTITUTION.md', 'write');
    console.error('  ❌ Protected file write NOT blocked');
  } catch (e: any) {
    if (e instanceof ProtectedFileError) {
      console.log('  ✅ Protected file write blocked');
    } else {
      console.error('  ❌ Protected file error mismatch:', e);
    }
  }
}

async function testScanner() {
  console.log('\n🔬 Testing SecurityScanner...');

  // 1. Safe Code
  const safeCode = `console.log("Hello"); const x = 1 + 1;`;
  try {
    SecurityScanner.scanCode(safeCode, 'safe.ts');
    console.log('  ✅ Safe code passed');
  } catch (e) {
    console.error('  ❌ Safe code failed:', e);
  }

  // 2. Lethal Code (eval)
  const lethalCode = `const x = eval("1+1");`;
  try {
    SecurityScanner.scanCode(lethalCode, 'lethal.ts');
    console.error('  ❌ Lethal code (eval) NOT detected');
  } catch (e: any) {
    if (e.message.includes('eval()')) {
      console.log('  ✅ Lethal code (eval) detected');
    } else {
      console.error('  ❌ Lethal code error mismatch:', e.message);
    }
  }

  // 3. Command Injection
  const injectionCode = `import { exec } from 'child_process'; exec(\`rm -rf \${userArgs}\`);`;
  try {
    SecurityScanner.scanCode(injectionCode, 'injection.ts');
    console.error('  ❌ Command injection NOT detected');
  } catch (e: any) {
    if (e.message.includes('Template literal')) {
      console.log('  ✅ Command injection detected');
    } else {
      console.error('  ❌ Injection error mismatch:', e.message);
    }
  }
}

async function main() {
  await testPathGuard();
  await testScanner();
}

if (import.meta.main) {
  main().catch(console.error);
}

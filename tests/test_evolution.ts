import { loadCompleteIdentity, getAgentName } from '../system/soul.js';
import { checkHealth } from '../system/health.js';
import { sleep } from '../system/sleep.js';

async function testSoul() {
  console.log('🧬 Testing Soul (Identity)...');
  const identity = await loadCompleteIdentity();
  const name = await getAgentName();
  
  if (name === 'Hatchling') {
    console.log('  ✅ Agent Name correct');
  } else {
    console.error(`  ❌ Agent Name mismatch: ${name}`);
  }

  if (identity.includes('# CONSTITUTION') && identity.includes('# SOUL')) {
    console.log('  ✅ Identity assembled correctly');
  } else {
    console.error('  ❌ Identity missing sections');
    console.log(identity.substring(0, 200));
  }
}

async function testHealth() {
  console.log('\n🏥 Testing Health...');
  const health = await checkHealth();
  
  if (health.safeMode === false) {
    console.log('  ✅ Healthy by default');
  } else {
    console.error('  ❌ Unexpected safe mode:', health.reason);
  }
}

async function main() {
  await testSoul();
  await testHealth();
  // Not calling sleep() here as it triggers git commits, might be disruptive for testing
  // But we can check if the module loads.
  if (sleep) {
    console.log('\n💤 Sleep module loaded successfully');
  }
}

if (import.meta.main) {
  main().catch(console.error);
}

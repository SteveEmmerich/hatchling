import { getVitals } from '../system/vitals.js';
import { Telemetry } from '../system/telemetry.js';
import { QuotaManager } from '../system/quotas.js';
import { PathGuard } from '../system/pathGuard.js';
import fs from 'fs/promises';

async function testVitals() {
  console.log('📊 Testing Vitals...');
  const vitals = await getVitals();
  
  if (vitals.includes('🧬 Age (Commits)') && vitals.includes('⚡ Energy')) {
    console.log('  ✅ Vitals structure correct');
  } else {
    console.error('  ❌ Vitals structure incomplete:', vitals);
  }
}

async function testTelemetry() {
  console.log('\n📡 Testing Telemetry...');
  
  // Log event
  const testMsg = "Test Event with PII sk-1234567890abcdef1234567890abcdef";
  await Telemetry.info(testMsg);
  
  // Check file
  const today = new Date().toISOString().split('T')[0];
  const logPath = await PathGuard.validatePath(`memory/telemetry/${today}.jsonl`, 'read');
  const content = await fs.readFile(logPath, 'utf-8');
  
  if (content.includes('Test Event with PII [REDACTED]')) {
    console.log('  ✅ Telemetry logged and scrubbed correctly');
  } else {
    console.error('  ❌ Telemetry scrubbing failed or not logged');
  }
}

async function testQuotas() {
  console.log('\n🔋 Testing Quotas...');
  
  try {
    // Check initial usage
    const quotas = await QuotaManager.getQuotas();
    console.log(`  Current usage: ${quotas.tokens.today}/${quotas.tokens.maxPerDay}`);
    
    // Simulate usage
    await QuotaManager.recordTokenUsage(100);
    const newQuotas = await QuotaManager.getQuotas();
    
    if (newQuotas.tokens.today === quotas.tokens.today + 100) {
      console.log('  ✅ Quota tracking working');
    } else {
      console.error('  ❌ Quota update failed');
    }
  } catch (e: any) {
    console.error('  ❌ Quota test failed:', e);
  }
}

async function main() {
  await testVitals();
  await testTelemetry();
  await testQuotas();
}

if (import.meta.main) {
  main().catch(console.error);
}

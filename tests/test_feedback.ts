import { recordFeedback } from '../system/feedback.js';
import { PathGuard } from '../system/pathGuard.js';

async function testFeedback() {
  console.log('🗣️  Testing Feedback Loop...');
  
  // 1. Initial State
  const curiosityPath = await PathGuard.validatePath('brain/curiosity_state.json', 'read');
  const initial = await Bun.file(curiosityPath).json();
  console.log(`  Initial Curiosity: ${initial.adjustedCuriosity}`);
  
  // 2. Positive Feedback (+0.5)
  const result1 = await recordFeedback('positive', 'Good job!');
  console.log(`  Received: ${result1.message}`);
  
  if (result1.newCuriosity === initial.adjustedCuriosity + 0.5) {
    console.log('  ✅ Curiosity increased correctly');
  } else {
    console.error(`  ❌ Curiosity mismatch: Expected ${initial.adjustedCuriosity + 0.5}, got ${result1.newCuriosity}`);
  }
  
  // 3. Negative Feedback (-1.0)
  const result2 = await recordFeedback('negative', 'Bad answer.');
  console.log(`  Received: ${result2.message}`);
  
  if (result2.newCuriosity === result1.newCuriosity - 1.0) {
    console.log('  ✅ Curiosity dampened correctly');
  } else {
    console.error(`  ❌ Curiosity mismatch: Expected ${result1.newCuriosity - 1.0}, got ${result2.newCuriosity}`);
  }
}

async function main() {
  await testFeedback();
}

if (import.meta.main) {
  main().catch(console.error);
}

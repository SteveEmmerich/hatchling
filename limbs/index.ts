// @ts-ignore
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadCompleteIdentity, getAgentName } from '../system/soul.js';
import { loadMemory } from '../system/memory.js';
import { checkHealth } from '../system/health.js';
import { sleep } from '../system/sleep.js';
import { getVitals } from '../system/vitals.js';
import { recordFeedback } from '../system/feedback.js';
import { Debugger } from '../system/debug.js';

export default function (pi: ExtensionAPI) {
  
  // ==========================================
  // SESSION START: Load Identity & Check Health
  // ==========================================
  pi.on("session_start", async (ctx) => {
    try {
      // 1. Health check
      const health = await checkHealth();
      
      if (health.safeMode) {
        ctx.notify(`
🚨 SAFE MODE ACTIVE

Reason: ${health.reason}

Protections enabled:
- Mutations DISABLED
- Curiosity lowered to 1
- Recovery mode active

Use /recover to exit safe mode
        `.trim());
      } else {
        const agentName = await getAgentName();
        ctx.notify(`🐣 ${agentName} is online`);
      }
      
      // 2. Load complete identity
      const identity = await loadCompleteIdentity();
      const memory = await loadMemory();
      
      // 3. Inject into system prompt
      ctx.modifySystemPrompt((prompt) => {
        return `${identity}\n\n# Recent Memory\n${memory}\n\n${prompt}`;
      });
      
    } catch (error: any) {
      ctx.notify(`⚠️ Startup error: ${error.message}`);
    }
  });

import { getVitals } from '../system/vitals.js';
import { recordFeedback } from '../system/feedback.js';
import { Debugger } from '../system/debug.js';

export default function (pi: ExtensionAPI) {

  // ... (previous commands)

  // ==========================================
  // COMMAND: /vitals
  // ==========================================
  pi.registerCommand({
    name: "vitals",
    description: "Show organism health and metrics",
    callback: async (args: any, ctx: any) => {
      try {
        const status = await getVitals();
        ctx.notify(status);
      } catch (e: any) {
        ctx.notify(`❌ Failed to check vitals: ${e.message}`);
      }
    }
  });

  // ==========================================
  // COMMAND: /good & /bad
  // ==========================================
  pi.registerCommand({
    name: "good",
    description: "Reinforce positive behavior (+Curiosity)",
    callback: async (args: any, ctx: any) => {
      const result = await recordFeedback('positive');
      ctx.notify(`👍 ${result.message}`);
    }
  });

  pi.registerCommand({
    name: "bad",
    description: "Discourage negative behavior (-Curiosity)",
    callback: async (args: any, ctx: any) => {
      const result = await recordFeedback('negative');
      ctx.notify(`👎 ${result.message}`);
    }
  });

  // ==========================================
  // COMMAND: /debug
  // ==========================================
  pi.registerCommand({
    name: "debug",
    description: "Toggle debug mode",
    callback: async (args: any, ctx: any) => {
      const isDebug = await Debugger.isDebug();
      const newState = await Debugger.toggle(!isDebug);
      ctx.notify(newState ? "🐞 Debug Mode ENABLED" : "🐞 Debug Mode DISABLED");
    }
  });
}

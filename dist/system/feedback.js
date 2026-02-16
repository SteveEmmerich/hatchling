import { PathGuard } from './pathGuard.js';
import fs from 'fs/promises';
import { Telemetry } from './telemetry.js';
export async function recordFeedback(sentiment, context) {
    const timestamp = new Date().toISOString();
    // 1. Log to Telemetry
    await Telemetry.log(sentiment === 'positive' ? 'info' : 'warn', `User Feedback: ${sentiment.toUpperCase()}`, { context });
    // 2. Adjust Curiosity State
    try {
        const curiosityPath = await PathGuard.validatePath('brain/curiosity_state.json', 'write');
        const curiosity = await Bun.file(curiosityPath).json();
        // Simple heuristic: Good = +0.5, Bad = -1.0
        // But keep within 1-10 bounds
        const delta = sentiment === 'positive' ? 0.5 : -1.0;
        let newLevel = curiosity.adjustedCuriosity + delta;
        // Clamp
        if (newLevel < 1)
            newLevel = 1;
        if (newLevel > 10)
            newLevel = 10;
        curiosity.adjustedCuriosity = newLevel;
        curiosity.lastCalculated = timestamp;
        curiosity.adjustments.push({
            timestamp,
            reason: `User Feedback: ${sentiment}`,
            delta
        });
        // Keep adjustments log trim (last 50)
        if (curiosity.adjustments.length > 50) {
            curiosity.adjustments = curiosity.adjustments.slice(-50);
        }
        await fs.writeFile(curiosityPath, JSON.stringify(curiosity, null, 2));
        return {
            newCuriosity: newLevel,
            message: sentiment === 'positive'
                ? `Thanks! Curiosity increased to ${newLevel.toFixed(1)}.`
                : `Understood. Curiosity dampened to ${newLevel.toFixed(1)}.`
        };
    }
    catch (e) {
        console.error('Failed to update curiosity from feedback:', e);
        return { newCuriosity: 0, message: 'Feedback recorded, but curiosity update failed.' };
    }
}
//# sourceMappingURL=feedback.js.map
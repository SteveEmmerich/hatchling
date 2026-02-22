/**
 * Identity Schema - Zod validation for discovery output
 */

import { z } from "zod";

export const IdentitySchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name too long"),
  purpose: z.string().min(1, "Purpose is required"),
  personality: z.array(z.string()).min(1, "At least one personality trait required"),
});

export type Identity = z.infer<typeof IdentitySchema>;

/**
 * Parse and validate identity from discovery conversation
 */
export function parseIdentity(data: unknown): Identity {
  return IdentitySchema.parse(data);
}

/**
 * Safe parse that returns errors instead of throwing
 */
export function safeParseIdentity(data: unknown): { success: boolean; data?: Identity; error?: string } {
  const result = IdentitySchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error.message };
  }
}

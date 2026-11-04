import { z } from "zod";

/** Bound donor input before it becomes a Checkout Session or Stripe metadata. */
export const contributionSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(254).pipe(z.email()),
  message: z.string().trim().max(500),
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,6}(?:\.\d{1,2})?$/)
    .refine((value) => Number(value) >= 1),
  goods: z.literal("yes").optional(),
  coverProcessing: z.literal("yes").optional(),
  attempt: z.uuid(),
  website: z.literal(""),
});

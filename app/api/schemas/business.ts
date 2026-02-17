import { z } from "zod";

export const completeOnboardingSchema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  termsAccepted: z.literal(true, {
    errorMap: () => ({
      message: "You must accept the Terms of Service to complete onboarding",
    }),
  }),
});

export const businessParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, "Invalid business ID").transform(Number),
});

export type CompleteOnboardingData = z.infer<typeof completeOnboardingSchema>;
export type BusinessParams = z.infer<typeof businessParamsSchema>;

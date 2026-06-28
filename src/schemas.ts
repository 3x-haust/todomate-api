import { z } from "zod";

export const yyyymmddSchema = z.coerce.number().int().min(20_000_000).max(29_991_231);

export const createTodoInputSchema = z.object({
  content: z.string().min(1),
  date: yyyymmddSchema.optional(),
  goalId: z.string().min(1),
  remindAt: z.number().int().nonnegative().nullable().optional(),
});

export const updateTodoInputSchema = z
  .object({
    content: z.string().min(1).optional(),
    date: yyyymmddSchema.optional(),
    goalId: z.string().min(1).optional(),
    remindAt: z.number().int().nonnegative().nullable().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "At least one todo field is required",
  });

export const setTodoDoneInputSchema = z.object({
  done: z.boolean().default(true),
  spentTime: z.number().int().nonnegative().nullable().optional(),
});

export const reminderInputSchema = z.object({
  time: z.number().int().nonnegative(),
});

export const chatMessageInputSchema = z.object({
  content: z.string().min(1),
});

export const loginInputSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const chatMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ChatMessageInput = z.infer<typeof chatMessageInputSchema>;
export type CreateTodoInput = z.infer<typeof createTodoInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type ReminderInput = z.infer<typeof reminderInputSchema>;
export type SetTodoDoneInput = z.infer<typeof setTodoDoneInputSchema>;
export type UpdateTodoInput = z.infer<typeof updateTodoInputSchema>;

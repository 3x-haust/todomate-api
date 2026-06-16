import ky from "ky";
import { z } from "zod";
import { runtimeEnv } from "../src/runtime-env.ts";

const envSchema = z.object({
  TODOMATE_API_BASE_URL: z.url().default("https://todomate-api.3xhaust.dev"),
  TODOMATE_API_TOKEN: z.string().min(1),
  TODOMATE_SMOKE_GOAL_ID: z.string().min(1).optional(),
});

const goalSchema = z.object({ id: z.string() }).passthrough();
const goalsSchema = z.array(goalSchema);
const todoSchema = z
  .object({
    id: z.string(),
    isDone: z.boolean().optional(),
  })
  .passthrough();

const env = envSchema.parse(runtimeEnv());
const api = ky.create({
  headers: { authorization: `Bearer ${env.TODOMATE_API_TOKEN}` },
  prefix: env.TODOMATE_API_BASE_URL.replace(/\/+$/, ""),
  retry: { limit: 1 },
  timeout: 15_000,
});

const goals = goalsSchema.parse(await api.get("goals").json());
const goalId = env.TODOMATE_SMOKE_GOAL_ID ?? firstGoalId(goals);

if (goalId === undefined) {
  throw new Error("No Todomate goal was available for the reversible API smoke test.");
}

const date = todayYyyymmdd();
const content = `todomate-api smoke ${new Date().toISOString()}`;
const created = todoSchema.parse(
  await api
    .post("todos", {
      json: { content, date, goalId },
    })
    .json(),
);
const completed = todoSchema.parse(
  await api
    .patch(`todos/${created.id}/complete`, {
      json: { done: true },
    })
    .json(),
);

await api.delete(`todos/${created.id}`);

console.log(
  JSON.stringify(
    {
      deleted: true,
      goalCount: goals.length,
      ok: true,
      todo: {
        completed: completed.isDone === true,
        created: true,
        date,
        idLength: created.id.length,
      },
    },
    null,
    2,
  ),
);

function firstGoalId(goals: readonly z.infer<typeof goalSchema>[]): string | undefined {
  return goals[0]?.id;
}

function todayYyyymmdd(): number {
  const now = new Date();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  return Number(`${now.getFullYear()}${month}${day}`);
}

import { z } from "zod";
import { baseProcedure, createTRPCRouter } from "../init";
import { feedsRouter } from "./feeds";

export const appRouter = createTRPCRouter({
  feeds: feedsRouter,
  hello: baseProcedure
    .input(
      z.object({
        text: z.string(),
      }),
    )
    .query((opts) => {
      return {
        greeting: `hello ${opts.input.text}`,
      };
    }),
});

// export type definition of API
export type AppRouter = typeof appRouter;

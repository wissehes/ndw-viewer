import { getDrips } from "@/app/lib/feeds/drips";
import { baseProcedure, createTRPCRouter } from "../init";

// Thin wiring only — the per-feed fetch/parse/transform logic lives in
// app/lib/feeds/<feed>.ts so this router stays small as feeds are added.
export const feedsRouter = createTRPCRouter({
  drips: baseProcedure.query(() => getDrips()),
});

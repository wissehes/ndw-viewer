import { getActueelBeeld } from "@/app/lib/feeds/actueel-beeld";
import { getAfsluitingen } from "@/app/lib/feeds/afsluitingen";
import { getDrips } from "@/app/lib/feeds/drips";
import { getMsi } from "@/app/lib/feeds/msi";
import { getTrafficSpeed } from "@/app/lib/feeds/traffic-speed";
import { baseProcedure, createTRPCRouter } from "../init";

// Thin wiring only. the per-feed fetch/parse/transform logic lives in
// app/lib/feeds/<feed>.ts so this router stays small as feeds are added.
export const feedsRouter = createTRPCRouter({
  actueelBeeld: baseProcedure.query(() => getActueelBeeld()),
  afsluitingen: baseProcedure.query(() => getAfsluitingen()),
  drips: baseProcedure.query(() => getDrips()),
  msi: baseProcedure.query(() => getMsi()),
  trafficSpeed: baseProcedure.query(() => getTrafficSpeed()),
});

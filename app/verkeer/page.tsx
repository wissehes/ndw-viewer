import MapNav from "@/app/components/MapNav";
import VerkeerMapView from "@/app/components/traffic/VerkeerMapView";

export default function VerkeerPage() {
  return (
    <main className="relative h-dvh w-full">
      <MapNav />
      <VerkeerMapView />
    </main>
  );
}

import MapNav from "@/app/components/MapNav";
import MapView from "@/app/components/MapView";

export default function Home() {
  return (
    <main className="relative h-dvh w-full">
      <MapNav />
      <MapView />
    </main>
  );
}

import MapNav from "@/app/components/MapNav";
import SignsMapView from "@/app/components/signs/SignsMapView";

export default function SignsPage() {
  return (
    <main className="relative h-dvh w-full">
      <MapNav />
      <SignsMapView />
    </main>
  );
}

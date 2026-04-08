import { GoogleMapsIcon, GoogleMapsPlatformText } from "@/components/icons";
import Image from "next/image";

import hal from "./hal.png";

export default function ItineraryNotFound() {
  return (
    <div className="flex flex-col gap-10 font-[family-name:var(--font-google-sans)]">
      <div className="flex items-end gap-2 p-4">
        <GoogleMapsIcon />
        <GoogleMapsPlatformText />
      </div>

      <div className="flex flex-col items-center justify-center">
        <Image src={hal} width={280} height={280} alt="" />
      </div>
      <div className="p-4 text-center">
        <h1 className="mb-4 text-3xl">
          404. <span className="text-gray-400">That’s an error</span>
        </h1>
        <p className="mb-8 leading-6">
          The requested Itinerary URL was not found on this server.
          <span className="text-gray-400"> That’s all we know.</span>
        </p>
      </div>
    </div>
  );
}

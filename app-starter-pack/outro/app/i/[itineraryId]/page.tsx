import { z } from "zod";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import {
  DirectionIcon,
  GoogleMapsIcon,
  GoogleMapsPlatformText,
} from "@/components/icons";
import map from "./map.png";
import Image from "next/image";
import type { Weather } from "@/types/weather";
import { Suspense } from "react";
import {
  ItineraryItem,
  ItineraryItemType,
  PlaceCard,
} from "@/components/place-card/place-card";
import { notFound } from "next/navigation";

// TODO: Replace the following with your app's Firebase project configuration
// See: https://support.google.com/firebase/answer/7015592
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);

const itinerarySchema = z.object({
  lodging: z
    .object({
      placeId: z.string(),
      title: z.string(),
      order: z.number().default(0),
    })
    .nullable()
    .optional(),
  restaurant: z
    .object({
      placeId: z.string(),
      title: z.string(),
      order: z.number().default(0),
    })
    .nullable()
    .optional(),
  activity: z
    .object({
      placeId: z.string(),
      title: z.string(),
      order: z.number().default(0),
    })
    .nullable()
    .optional(),
});

export default async function ItineraryPage({
  params,
}: {
  params: Promise<{ itineraryId: string }>;
}) {
  const { itineraryId } = await params;

  const docRef = doc(db, "itineraries", itineraryId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    notFound();
  }

  const itinerary = itinerarySchema.parse(docSnap.data());

  const sortedItinerary: Array<ItineraryItem> = Object.entries(itinerary)
    .filter(
      (entry): entry is [ItineraryItemType, ItineraryItem] => entry[1] !== null,
    )
    .toSorted(([, a], [, b]) => a.order - b.order)
    .map(([type, item]) => {
      return {
        ...item,
        type,
      };
    });

  const url = generateMapsDirectionsUrl(sortedItinerary);

  return (
    <div className="font-[family-name:var(--font-google-sans)]">
      <div className="flex items-end gap-2 p-4">
        <GoogleMapsIcon />
        <GoogleMapsPlatformText />
      </div>
      <header className="px-4 py-8">
        <h1 className="mb-4 text-3xl leading-9 font-bold">
          Here is your AI-Powered Personalized Evening.
        </h1>
      </header>
      <div className="mb-4 flex flex-col gap-2 px-4">
        <div className="flex gap-2">
          <Image
            className="rounded-3xl object-cover"
            src={map}
            width={136}
            alt=""
          />
          <div className="bg-type-grey-800 grow rounded-3xl p-4">
            <Suspense fallback={<p>...loading</p>}>
              <GetWeather />
            </Suspense>
          </div>
        </div>
        <div className="flex flex-col gap-4 py-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-button text-type-grey flex h-10 items-center justify-center gap-2 self-stretch rounded-[100px] px-2"
          >
            <DirectionIcon /> Open itinerary on map
          </a>
          <p>Details</p>
        </div>
        {sortedItinerary.map((item) => (
          <PlaceCard itineraryItem={item} key={item.type} />
        ))}
      </div>
    </div>
  );
}

async function GetWeather() {
  const apiKey = process.env.NEXT_PUBLIC_WEATHER_API_KEY;
  const weather: Weather = await fetch(
    `https://weather.googleapis.com/v1/currentConditions:lookup?key=${apiKey}&units_system=IMPERIAL&location.latitude=36.0919&location.longitude=-115.1749`,
  ).then((res) => res.json());

  return (
    <>
      <div className="flex justify-between">
        <div>
          <p className="leading-7">Las Vegas</p>
          <p className="leading-7 text-gray-400">Nevada · USA</p>
        </div>
        <div className="flex items-center gap-2.5 py-1">
          <Image
            src={weather.weatherCondition.iconBaseUri + ".svg"}
            width={32}
            height={32}
            alt=""
          />
        </div>
      </div>
      <div className="flex items-center gap-2"></div>
      <div className="flex items-center gap-2">
        {weather.weatherCondition.description.text} ·{" "}
        {weather.temperature.degrees}°F
      </div>
    </>
  );
}

/**
 * Generates a Google Maps directions URL with a hotel as origin and a restaurant as destination,
 * with an optional activity as a final destination (making restaurant a waypoint)
 * @param itinerary - An array of itinerary items with placeId, title, order, and type
 * @returns Formatted Google Maps directions URL
 */
function generateMapsDirectionsUrl(
  itinerary: Array<{
    placeId: string;
    title: string;
    order: number;
    type: string;
  }>,
): string {
  if (itinerary?.length < 2) {
    console.info(
      "At least two locations are required to generate a directions URL",
    );
    return "";
  }

  const itineraryCopy = structuredClone(itinerary);

  const destination = itineraryCopy.pop();
  const [origin, ...waypoints] = itineraryCopy;

  // Create the base URL
  const url = new URL("https://www.google.com/maps/dir/?api=1");

  // Add origin to url
  if (origin) {
    const encodedOrigin = encodeURIComponent(origin.title);
    url.searchParams.append("origin", encodedOrigin);
    url.searchParams.append("origin_place_id", origin.placeId);
  }

  // Add destination to url
  if (destination) {
    const encodedDestination = encodeURIComponent(destination.title);
    url.searchParams.append("destination", encodedDestination);
    url.searchParams.append("destination_place_id", destination.placeId);
  }

  // Add waypoint(s) to url
  if (waypoints?.length) {
    url.searchParams.append(
      "waypoints",
      waypoints.map((waypoint) => encodeURIComponent(waypoint.title)).join("|"),
    );
    url.searchParams.append(
      "waypoint_place_ids",
      waypoints.map((waypoint) => waypoint.placeId).join("|"),
    );
  }

  return url.toString();
}

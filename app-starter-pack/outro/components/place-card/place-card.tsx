import { DirectionIcon } from "@/components/icons";
import { PlaceRatings } from "../place-ratings/place-ratings";
import Image from "next/image";
import { z } from "zod";

const placesSchema = z.object({
  id: z.string(),
  rating: z.number().nullable().optional(),
  googleMapsUri: z.string().nullable().optional(),
  userRatingCount: z.number().nullable().optional(),
  displayName: z
    .object({
      text: z.string(),
      languageCode: z.string().default("en-US"),
    })
    .nullable()
    .optional(),
  displayNameLanguageCode: z.string().nullable().optional(),
  primaryTypeDisplayName: z
    .object({
      text: z.string(),
      languageCode: z.string().default("en-US"),
    })
    .nullable()
    .optional(),
  primaryTypeDisplayNameLanguageCode: z.string().nullable().optional(),
  photos: z
    .array(
      z.object({
        // Match the Photo type structure from Google Maps API
        name: z.string().optional(),
        widthPx: z.number().optional(),
        heightPx: z.number().optional(),
        authorAttributions: z
          .array(
            z.object({
              displayName: z.string().optional(),
              uri: z.string().optional(),
              photoUri: z.string().optional(),
            }),
          )
          .optional(),
        flagContentUri: z.string().optional(),
        googleMapsUri: z.string().optional(),
      }),
    )
    .optional(),
});

export type ItineraryItemType = "lodging" | "restaurant" | "activity";
export type ItineraryItem = {
  type: ItineraryItemType;
  placeId: string;
  title: string;
  order: number;
  details?: google.maps.places.Place;
};

export async function PlaceCard({
  itineraryItem,
}: {
  itineraryItem: ItineraryItem;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${itineraryItem.placeId}?fields=id,displayName,rating,userRatingCount,primaryTypeDisplayName,photos,googleMapsUri&key=${apiKey}`,
  );

  if (!response.ok) {
    throw new Error(
      "Failed to fetch place details. PlaceId seems to be invalid.",
    );
  }
  const data: google.maps.places.Place = await response.json();
  const {
    displayName,
    rating,
    userRatingCount,
    primaryTypeDisplayName,
    photos,
    googleMapsUri,
  } = placesSchema.parse(data);

  const displayNameText = displayName?.text;
  const primaryTypeDisplayNameText = primaryTypeDisplayName?.text;

  const photoName = photos?.[0].name;

  return (
    <div className="bg-type-grey-800 flex flex-col gap-4 rounded-3xl p-4">
      <div className="flex gap-4">
        <div className="flex flex-1 flex-col items-start gap-1 px-1">
          <h2>{displayNameText}</h2>
          <div>
            <PlaceRatings rating={rating} userRatingCount={userRatingCount} />

            <p>{primaryTypeDisplayNameText}</p>
          </div>
        </div>
        <Image
          src={`https://places.googleapis.com/v1/${photoName}/media?key=${apiKey}&maxWidthPx=425`}
          width={80}
          height={80}
          alt=""
          className="rounded-2xl object-cover"
        />
      </div>
      <a
        href={googleMapsUri ?? undefined}
        target="_blank"
        className="bg-button text-type-grey flex h-10 items-center justify-center gap-2 self-stretch rounded-[100px] px-2"
      >
        <DirectionIcon /> Show on map
      </a>
    </div>
  );
}

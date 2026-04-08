import {useEffect, useState} from 'react';
import {ItineraryItem} from '../../store/store';
import PlaceRatings from '../place-ratings/place-ratings';
import styles from './place-card.module.css';

export default function PlaceCard({
  itineraryItem
}: {
  itineraryItem: ItineraryItem;
}) {
  const {summary, title} = itineraryItem;
  const {displayName, rating, userRatingCount, primaryTypeDisplayName, photos} =
    itineraryItem.details ?? {};

  const [photoUrl, setFotoUrl] = useState<string | null>(null);

  // @ts-expect-error Property 'text' does not exist on type 'string'. Google Maps types are incorrect here
  const displayNameText = title ?? displayName?.text ?? displayName;
  const primaryTypeDisplayNameText =
    // @ts-expect-error Property 'text' does not exist on type 'string'. Google Maps types are incorrect here
    primaryTypeDisplayName?.text ?? primaryTypeDisplayName;
  // @ts-expect-error Property 'name' does not exist on type 'Photo'. Google Maps types are incorrect here
  const photoName = photos?.[0]?.name;

  useEffect(() => {
    if (!photoName) return;

    const fetchPhotoUrl = async () => {
      if (photoName) {
        const response = await fetch(
          `https://places.googleapis.com/v1/${photoName}/media?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&maxWidthPx=425&skipHttpRedirect=true`
        );
        if (response.ok) {
          const result = await response.json();

          setFotoUrl(result.photoUri);
        } else {
          console.error('Failed to fetch photo URL:', response.statusText);
        }
      }
    };

    fetchPhotoUrl();
  }, [photoName]);

  return (
    <div className={styles.placeCard}>
      <div className={styles.info}>
        <h2 className={styles.title}>{displayNameText}</h2>
        <div className={styles.rating}>
          <PlaceRatings rating={rating} userRatingCount={userRatingCount} />
        </div>
        <div className={styles.type}>
          {summary ?? primaryTypeDisplayNameText}
        </div>
      </div>
      {photoUrl && (
        <div className={styles.image}>
          <img referrerPolicy="no-referrer" src={photoUrl} />
        </div>
      )}
    </div>
  );
}

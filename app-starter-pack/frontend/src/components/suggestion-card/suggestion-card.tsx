import {useLiveAPIContext} from '../../contexts/LiveAPIContext';
import {ItineraryItem} from '../../store/store';
import PlaceRatings from '../place-ratings/place-ratings';
import styles from './suggestion-card.module.css';

export default function SuggestionCard({
  suggestionItem
}: {
  suggestionItem: ItineraryItem;
}) {
  const {connected, client} = useLiveAPIContext();

  const {title, summary} = suggestionItem;
  const {displayName, primaryTypeDisplayName, rating, userRatingCount} =
    suggestionItem.details ?? {};

  // @ts-expect-error Property 'text' does not exist on type 'string'. Google Maps types are incorrect here
  const displayNameText = title ?? displayName?.text ?? displayName;
  const primaryTypeDisplayNameText =
    // @ts-expect-error Property 'text' does not exist on type 'string'. Google Maps types are incorrect here
    primaryTypeDisplayName?.text ?? primaryTypeDisplayName;

  const sendText = (text: string) => {
    if (connected) {
      client.send([{text}]);
    }
  };

  return (
    <div
      className={styles.suggestionCard}
      onClick={() => {
        sendText(`Let's go with the ${title}`);
      }}>
      <div className={styles.arrow}>
        <span className="material-icons">arrow_forward</span>
      </div>
      <div className={styles.info}>
        <div className={styles.title}>{displayNameText}</div>
        <div className={styles.subtitle}>
          <div className={styles.rating}>
            <PlaceRatings rating={rating} userRatingCount={userRatingCount} />
          </div>
          {summary ?? primaryTypeDisplayNameText}
        </div>
      </div>
    </div>
  );
}

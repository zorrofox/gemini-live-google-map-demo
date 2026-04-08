import {useGlobalStore} from '../../store/store';
import PlaceCard from '../place-card/place-card';
import SuggestionCard from '../suggestion-card/suggestion-card';

import styles from './itinerary-stack.module.css';

export default function ItineraryStack() {
  const itineraryItems = useGlobalStore(state => state.itineraryItems);
  const currentSuggestions = useGlobalStore(state => state.currentSuggestions);

  return (
    <div className={styles.itineraryStack}>
      {itineraryItems.map(item => (
        <PlaceCard key={item.placeId} itineraryItem={item} />
      ))}
      {currentSuggestions.map(item => (
        <SuggestionCard key={item.placeId} suggestionItem={item} />
      ))}
    </div>
  );
}

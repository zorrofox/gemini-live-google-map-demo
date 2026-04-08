import {useEffect} from 'react';

import {useGlobalStore} from '../../store/store';
import {useMapsLibrary} from '@vis.gl/react-google-maps';

export default function PlacesHandler() {
  const itineraryItems = useGlobalStore(state => state.itineraryItems);
  const photoGallery = useGlobalStore(state => state.ui.photoGallery);
  const currentSuggestions = useGlobalStore(state => state.currentSuggestions);
  const placeDetails = useGlobalStore(state => state.placeDetails);
  const addPlaceDetails = useGlobalStore(state => state.addPlaceDetails);

  const placesLibrary = useMapsLibrary('places');

  useEffect(() => {
    if (!placesLibrary) return;

    const fetchPlaceDetails = async (placeId: string) => {
      const place = new placesLibrary.Place({id: placeId});
      const response = await place.fetchFields({
        fields: [
          'displayName',
          'formattedAddress',
          'location',
          'photos',
          'primaryTypeDisplayName',
          'primaryType',
          'rating',
          'userRatingCount'
        ]
      });

      if (response?.place) {
        addPlaceDetails(placeId, response?.place);
      }
    };

    [...itineraryItems, ...currentSuggestions]
      .filter(item => !placeDetails[item.placeId])
      .forEach(item => fetchPlaceDetails(item?.placeId ?? ''));

    if (photoGallery && !placeDetails[photoGallery]) {
      fetchPlaceDetails(photoGallery);
    }
  }, [itineraryItems, currentSuggestions, photoGallery, placesLibrary]);

  return null;
}

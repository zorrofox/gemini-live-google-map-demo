import {useCallback, useEffect, useRef, useState} from 'react';
import {useGlobalStore} from '../../store/store';
import {Map3D, Map3DCameraProps} from '../map-3d';
import {lookAt} from './look-at';

import {useMapElements} from './use-map-elements';
import {RoutesApi} from './routes-api';
import {useOrbitsParams} from '../../hooks/use-query-state';

export const ALTITUDE_DUBAI = 5; // meters (Dubai is at low altitude)
export const markerAltitude = 50;

const apiClient = new RoutesApi();

export default function MapHandler({isBlur = false}: {isBlur?: boolean}) {
  const itineraryItems = useGlobalStore(state => state.itineraryItems);
  const currentSuggestions = useGlobalStore(state => state.currentSuggestions);
  const setMapTrigger = useGlobalStore(state => state.setMapTrigger);
  const setView = useGlobalStore(state => state.setView);
  const {showSelection, showSuggestions, showFinalItinerary} = useGlobalStore(
    state => state.mapTriggers
  );
  const [orbitsActive] = useOrbitsParams();

  const [route, setRoute] = useState(null);

  const mapRef = useRef<google.maps.maps3d.Map3DElement | null>(null);

  const [cameraProps, setCameraProps] = useState<Map3DCameraProps>({
    center: {
      lat: 25.2048,
      lng: 55.2708,
      altitude: 1500
    },
    range: 8000,
    heading: 61,
    tilt: 69,
    roll: 0
  });

  const handleCameraChange = useCallback(
    (props: Map3DCameraProps) => setCameraProps(props),
    []
  );

  useEffect(() => {
    if (!mapRef.current) return;

    // @ts-expect-error Property 'stopCameraAnimation' does not exist on type 'Map3DElement'. Google Maps types not up to date
    const stopCameraAnimation = () => mapRef.current?.stopCameraAnimation();

    mapRef.current.addEventListener('gmp-click', stopCameraAnimation);

    return () => {
      mapRef.current?.removeEventListener('gmp-click', stopCameraAnimation);
    };
  });

  useMapElements(mapRef, route);

  useEffect(() => {
    if (!showFinalItinerary || !mapRef.current) return;

    const itineraryLocations = itineraryItems
      .map(item => item.details?.location?.toJSON())
      .filter(location => location !== undefined);

    console.log(
      '🗺️  showFinalItinerary triggered, itineraryLocations:',
      itineraryLocations.length
    );

    // If only one location (e.g., just a restaurant), use Dubai Mall as origin
    const DUBAI_MALL = {lat: 25.1978, lng: 55.2794};

    let origin: google.maps.LatLngLiteral | undefined;
    let destination: google.maps.LatLngLiteral | undefined;
    let waypoints: google.maps.LatLngLiteral[] = [];

    if (itineraryLocations.length === 1) {
      // Only one destination (restaurant) - route from Dubai Mall
      origin = DUBAI_MALL;
      destination = itineraryLocations[0];
      console.log('✅ Route from Dubai Mall to restaurant:', destination);
    } else if (itineraryLocations.length > 1) {
      // Multiple locations - use first as origin, last as destination
      const lastLocation = itineraryLocations.pop();
      const firstLocation = itineraryLocations.shift();
      origin = firstLocation;
      destination = lastLocation;
      waypoints = itineraryLocations;
      console.log(
        '✅ Route from',
        origin,
        'to',
        destination,
        'via',
        waypoints.length,
        'waypoints'
      );
    } else {
      // No locations
      console.log('❌ No locations in itinerary');
      return;
    }

    if (!origin || !destination) {
      console.log('❌ Missing origin or destination');
      return;
    }

    console.log('🚗 Computing route...');
    apiClient
      .computeRoutes(origin, destination, waypoints)
      .then(res => {
        const [route] = res.routes;
        setRoute(route);
        console.log('✅ Route computed successfully:', route);
      })
      .catch(err => {
        console.error('❌ Route computation failed:', err);
      });
  }, [showFinalItinerary, itineraryItems]);

  // selection flyTo and orbit
  useEffect(() => {
    if (!showSelection || !mapRef.current) return;

    const latestItineraryItem = itineraryItems.find(item => item.latestEntry);
    const {lat, lng} = latestItineraryItem?.details?.location?.toJSON() ?? {};

    if (!lat || !lng) return;

    // Calculate route from Dubai Mall to selected restaurant
    const DUBAI_MALL = {lat: 25.1978, lng: 55.2794};
    const destination = {lat, lng};

    apiClient
      .computeRoutes(DUBAI_MALL, destination, [])
      .then(res => {
        const [route] = res.routes;
        setRoute(route);
      })
      .catch(err => {
        console.error('Failed to compute route:', err);
      });

    setMapTrigger('showSelection', false);

    const heading = Math.random() * 360;

    // @ts-expect-error Property 'stopCameraAnimation' does not exist on type 'Map3DElement'. Google Maps types not up to date
    mapRef.current.stopCameraAnimation();

    mapRef.current.flyCameraTo({
      endCamera: {
        center: {
          lat,
          lng,
          altitude: ALTITUDE_DUBAI + markerAltitude
        },
        range: 1500,
        heading,
        tilt: 69,
        roll: 0
      },
      durationMillis: 5000
    });

    const orbitDirection = 2 * (Math.random() > 0.5 ? -1 : 1);

    const orbit = () => {
      mapRef.current?.removeEventListener('gmp-animationend', orbit);
      mapRef.current?.flyCameraAround({
        camera: {
          center: {
            lat,
            lng,
            altitude: ALTITUDE_DUBAI + markerAltitude
          },
          range: 1500,
          heading,
          tilt: 69,
          roll: 0
        },
        durationMillis: 100_000,
        rounds: orbitDirection
      });
    };

    if (orbitsActive) {
      mapRef.current.addEventListener('gmp-animationend', orbit);
    }
  }, [showSelection, itineraryItems]);

  // suggestions flyTo and orbit
  useEffect(() => {
    if (!showSuggestions || !mapRef.current) return;

    const suggestionLocations = currentSuggestions
      .filter(item => item.details?.location)
      .map(({details}) => ({
        altitude: 0,
        lat: 0,
        lng: 0,
        ...(details?.location?.toJSON() ?? {})
      }));

    if (
      !suggestionLocations.length ||
      currentSuggestions.length !== suggestionLocations.length
    )
      return;

    setMapTrigger('showSuggestions', false);

    const heading = Math.random() * 360;

    const {lat, lng, altitude, range, tilt} = lookAt([
      ...suggestionLocations,
      ...suggestionLocations.map(l => ({...l, alt: markerAltitude}))
    ]);

    // @ts-expect-error Property 'stopCameraAnimation' does not exist on type 'Map3DElement'. Google Maps types not up to date
    mapRef.current.stopCameraAnimation();

    mapRef.current.flyCameraTo({
      endCamera: {
        center: {
          lat,
          lng,
          altitude
        },
        range: range + 800,
        heading,
        tilt,
        roll: 0
      },
      durationMillis: 5000
    });

    const orbitDirection = 2 * (Math.random() > 0.5 ? -1 : 1);

    const orbit = () => {
      mapRef.current?.removeEventListener('gmp-animationend', orbit);
      mapRef.current?.flyCameraAround({
        camera: {
          center: {
            lat,
            lng,
            altitude
          },
          range: range + 800,
          heading,
          tilt,
          roll: 0
        },
        durationMillis: 100_000,
        rounds: orbitDirection
      });
    };

    if (orbitsActive) {
      mapRef.current.addEventListener('gmp-animationend', orbit);
    }
  }, [showSuggestions, currentSuggestions]);

  useEffect(() => {
    if (!showFinalItinerary || !mapRef.current) return;

    const itineraryLocations = itineraryItems
      .filter(item => item.details?.location)
      .map(({details}) => ({
        altitude: 0,
        lat: 0,
        lng: 0,
        ...(details?.location?.toJSON() ?? {})
      }));

    if (!itineraryLocations.length) return;

    setMapTrigger('showFinalItinerary', false);

    const heading = Math.random() * 360;

    const {lat, lng, altitude, range, tilt} = lookAt([
      ...itineraryLocations,
      ...itineraryLocations.map(l => ({...l, alt: markerAltitude}))
    ]);

    // @ts-expect-error Property 'stopCameraAnimation' does not exist on type 'Map3DElement'. Google Maps types not up to date
    mapRef.current.stopCameraAnimation();

    mapRef.current.flyCameraTo({
      endCamera: {
        center: {
          lat,
          lng,
          altitude
        },
        range: range + 800,
        heading,
        tilt,
        roll: 0
      },
      durationMillis: 5000
    });

    const orbitDirection = 2 * (Math.random() > 0.5 ? -1 : 1);

    const orbitListener = () => {
      orbit();
      setView('end-summary');
    };

    const orbit = () => {
      mapRef.current?.removeEventListener('gmp-animationend', orbitListener);
      mapRef.current?.flyCameraAround({
        camera: {
          center: {
            lat,
            lng,
            altitude
          },
          range: range + 800,
          heading,
          tilt,
          roll: 0
        },
        durationMillis: 100_000,
        rounds: orbitDirection
      });
    };

    if (orbitsActive) {
      mapRef.current.addEventListener('gmp-animationend', orbitListener);
    }
  }, [showFinalItinerary]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--Google-Type-Grey-900, #202124)',
        filter: isBlur ? 'blur(5px)' : 'none'
      }}>
      <Map3D
        ref={mapRef}
        {...cameraProps}
        onCameraChange={handleCameraChange}></Map3D>
    </div>
  );
}

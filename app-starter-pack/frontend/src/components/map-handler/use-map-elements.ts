/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {useMapsLibrary} from '@vis.gl/react-google-maps';
import {RefObject, useEffect} from 'react';
import {useGlobalStore} from '../../store/store';
import {markerAltitude} from './map-handler';

import iconLodging from '../../assets/icon-lodging.png';
import iconRestaurant from '../../assets/icon-restaurant.png';
import iconActivity from '../../assets/icon-activity.png';

const ICONS = {
  lodging: iconLodging,
  restaurant: iconRestaurant,
  activity: iconActivity
};

interface Route {
  polyline?: {
    geoJsonLinestring?: {
      coordinates: Array<[number, number]>;
    };
  };
}

export function useMapElements(
  mapRef: RefObject<google.maps.maps3d.Map3DElement | null>,
  route: Route | null
): null {
  const itineraryItems = useGlobalStore(state => state.itineraryItems);
  const currentSuggestions = useGlobalStore(state => state.currentSuggestions);
  const view = useGlobalStore(state => state.ui.view) as string;

  const maps3dLib = useMapsLibrary('maps3d');
  const markerLib = useMapsLibrary('marker');

  const isFinalOverview = view === 'end-summary';

  // handle markers
  useEffect(() => {
    if (!mapRef.current || !markerLib || !maps3dLib) return;

    mapRef.current.innerHTML = '';

    // ITINERARY MARKERS
    itineraryItems
      .filter(item => item.details)
      .forEach(item => {
        const {lat, lng} = item.details?.location?.toJSON() ?? {};

        const markerOptions: {
          position: {lat: number; lng: number; altitude: number};
          altitudeMode: string;
          label?: string;
          drawsWhenOccluded: boolean;
          extruded: boolean;
        } = {
          position: {lat: lat ?? 0, lng: lng ?? 0, altitude: markerAltitude},
          altitudeMode: 'RELATIVE_TO_MESH',
          label:
            item.title ??
            // @ts-expect-error Property 'text' does not exist on type 'string'. Google Maps types are incorrect here
            item.details?.displayName?.text ??
            item.details?.displayName ??
            ' ',
          drawsWhenOccluded: true,
          extruded: true
        };

        if (isFinalOverview) {
          delete markerOptions.label;
        }

        // @ts-expect-error Marker3DElement is not in the types yet
        const marker = new maps3dLib.Marker3DInteractiveElement(markerOptions);

        const templateForImg = document.createElement('template');
        const img = document.createElement('img');

        img.src = ICONS[item.type];
        templateForImg.content.append(img);
        marker.append(templateForImg);

        if (mapRef.current) {
          mapRef.current.append(marker);

          if (isFinalOverview) {
            // @ts-expect-error Property 'PopoverElement' does not exist on type 'typeof maps3d'.
            const popover = new maps3dLib.PopoverElement({
              open: true,
              positionAnchor: marker,
              lightDismissDisabled: true
            });

            const content = document.createElement('div');
            content.classList.add('infowindow');
            content.innerHTML = `
              <div class="title">${item.title}</div>
              <div class="rating">
                <span>${item.details?.rating}</span>
                <span class="material-icons star">
                  star
                </span>
                <span>(${item.details?.userRatingCount})</span>
              </div>
            `;

            popover.append(content);
            mapRef.current.append(popover);
          }
        }
      });

    // SUGGESTION MARKERS
    currentSuggestions
      .filter(item => item.details)
      .forEach(item => {
        const {lat, lng} = item.details?.location?.toJSON() ?? {};

        // @ts-expect-error Marker3DElement is not in the types yet
        const marker = new maps3dLib.Marker3DElement({
          position: {lat, lng, altitude: markerAltitude},
          altitudeMode: 'RELATIVE_TO_MESH',
          label:
            item.title ??
            // @ts-expect-error Property 'text' does not exist on type 'string'. Google Maps types are incorrect here
            item.details?.displayName?.text ??
            item.details?.displayName ??
            ' ',
          drawsWhenOccluded: true,
          extruded: true
        });

        const templateForImg = document.createElement('template');
        const img = document.createElement('img');

        img.src = ICONS[item.type];
        templateForImg.content.append(img);
        marker.append(templateForImg);

        if (mapRef.current) {
          mapRef.current.appendChild(marker);
        }
      });

    // ROUTE
    if (route) {
      console.log('📍 Route object received:', route);
      const {polyline} = route;
      const {geoJsonLinestring} = polyline ?? {};

      if (geoJsonLinestring) {
        const coordinates = geoJsonLinestring.coordinates.map(([lng, lat]) => ({
          lat,
          lng,
          altitude: 2
        }));

        console.log('🎨 Drawing route with', coordinates.length, 'points');

        const polyline3d = new maps3dLib.Polyline3DElement({
          altitudeMode: maps3dLib.AltitudeMode.RELATIVE_TO_GROUND,
          coordinates,
          strokeColor: '#00B0FF',
          strokeWidth: 6
        });

        mapRef.current?.append(polyline3d);
        console.log('✅ Route polyline added to map');
      } else {
        console.log('❌ No geoJsonLinestring in route');
      }
    } else {
      console.log('⚪ No route to draw');
    }
  }, [
    isFinalOverview,
    itineraryItems,
    currentSuggestions,
    markerLib,
    maps3dLib,
    route
  ]);

  return null;
}

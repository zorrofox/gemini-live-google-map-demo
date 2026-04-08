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

import {ItineraryItem} from '../../store/store';
import {parseGroundingText} from './parse-grounding-text';

export function getItineraryItems(
  content: any,
  type: string,
  placeDetails: Record<string, google.maps.places.Place>
): Array<ItineraryItem> {
  const dataFromText: {
    [key: string]: {summary: string};
  } | null = parseGroundingText(content.groundingResponse?.model_text);

  if (dataFromText) {
    const itineraryItems = Object.entries(dataFromText).map(([name, item]) => {
      const groundedItem =
        content.groundingResponse?.grounding_metadata?.supportChunks.find(
          (chunk: any) => {
            const placeTitle = chunk.sourceMetadata.title;
            return placeTitle.includes(name) || name.includes(placeTitle);
          }
        )?.sourceMetadata;

      if (groundedItem) {
        const placeId = groundedItem?.document_id?.slice(7) ?? '';

        const itineraryItem: ItineraryItem = {
          type,
          placeId,
          title: groundedItem.title ?? '',
          summary: item.summary ?? '',
          ...(placeId &&
            placeDetails[placeId] && {details: placeDetails[placeId]})
        };

        return itineraryItem;
      }
    });

    return itineraryItems.filter(Boolean) as Array<ItineraryItem>;
  } else {
    const payload =
      content.groundingResponse?.grounding_metadata?.supportChunks;

    if (payload) {
      const itineraryItems = payload.map(({sourceMetadata: item}: any) => {
        const placeId = item?.document_id?.slice(7) ?? '';

        const itineraryItem: ItineraryItem = {
          type,
          placeId,
          title: item?.title ?? '',
          summary: item?.summary ?? '',
          ...(placeId &&
            placeDetails[placeId] && {details: placeDetails[placeId]})
        };

        return itineraryItem;
      });

      return itineraryItems;
    }
  }

  return [];
}

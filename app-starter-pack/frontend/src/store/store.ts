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

import {create} from 'zustand';
import {immer} from 'zustand/middleware/immer';
import {STATUS_MAPPING} from '../config/status-mapping';

export type ItineraryItemType = 'lodging' | 'restaurant' | 'activity';
export interface ItineraryItem {
  type: ItineraryItemType;
  placeId: string;
  title: string;
  latestEntry: boolean;
  summary?: string;
  details?: google.maps.places.Place;
}

type View = 'intro' | 'map' | 'end-summary';

interface GlobalState {
  // places
  itineraryItems: Array<ItineraryItem>;
  currentSuggestions: Array<ItineraryItem>;
  placeDetails: Record<string, google.maps.places.Place>;
  addItineraryItem: (item: ItineraryItem) => void;
  setCurrentSuggestions: (items: Array<ItineraryItem>) => void;
  addPlaceDetails: (placeId: string, details: google.maps.places.Place) => void;

  //map
  mapTriggers: {
    showSelection: boolean;
    showSuggestions: boolean;
    showFinalItinerary: boolean;
  };
  setMapTrigger: (
    type: 'showSelection' | 'showSuggestions' | 'showFinalItinerary',
    value: boolean
  ) => void;

  geminiStatus: string;
  currentGroundingPrompt: string;

  geminiTextResponse: string;
  responseInProgress: boolean;
  buildGeminiTextResponse: (textChunk: string) => void;
  setResponseInProgress: (responseInProgress: boolean) => void;

  setGeminiStatus: (
    status: keyof typeof STATUS_MAPPING | string,
    currentGroundingPrompt?: string
  ) => void;

  ui: {
    view: View;
    showItineraryStack: boolean;
    photoGallery: string;
  };

  setView: (view: View) => void;

  changeItineraryOrder: (order: Array<ItineraryItemType>) => void;
  setShowInitineraryStack: (showItineraryStack: boolean) => void;

  activity: {
    videoOut: boolean;
    audioIn: boolean;
    audioOut: boolean;
  };
  setVideoOut: (videoOut: boolean) => void;
  setAudioIn: (audioIn: boolean) => void;
  setAudioOut: (audioOut: boolean) => void;

  conversationChips: Array<string>;
  setConversationChips: (chips: Array<string>) => void;

  setPhotoGallery: (placeId: string) => void;
}

export const useGlobalStore = create<GlobalState>()(
  immer(set => ({
    // places initial state
    itineraryItems: [],
    currentSuggestions: [],
    placeDetails: {},

    // map triggers
    mapTriggers: {
      showSelection: false,
      showSuggestions: false,
      showFinalItinerary: false
    },

    geminiTextResponse: '',
    responseInProgress: false,

    geminiStatus: '',
    currentGroundingPrompt: '',

    ui: {
      view: 'intro',
      showItineraryStack: true,
      photoGallery: ''
    },

    activity: {
      videoOut: false,
      audioIn: false,
      audioOut: false
    },

    conversationChips: [],

    // places updaters
    addItineraryItem: item =>
      set(state => {
        state.itineraryItems.forEach(item => {
          item.latestEntry = false;
        });

        const newItem = {
          ...item,
          latestEntry: true,
          ...(state.placeDetails[item.placeId] && {
            details: state.placeDetails[item.placeId]
          })
        };

        const existingItemIndex = state.itineraryItems.findIndex(
          item => item.type === newItem.type
        );

        if (existingItemIndex !== -1) {
          state.itineraryItems[existingItemIndex] = newItem;
        } else {
          state.itineraryItems.push(newItem);
        }

        state.mapTriggers.showSelection = true;
        state.currentSuggestions = [];
      }),
    setCurrentSuggestions: items =>
      set(state => {
        state.currentSuggestions = items;
        state.mapTriggers.showSuggestions = true;
      }),
    addPlaceDetails: (placeId, details) => {
      set(state => {
        state.placeDetails[placeId] = details;

        state.itineraryItems.forEach(item => {
          if (item.placeId === placeId) {
            item.details = details;
          }
        });
        state.currentSuggestions.forEach(item => {
          if (item.placeId === placeId) {
            item.details = details;
          }
        });
      });
    },

    setMapTrigger: (type, value) => {
      set(state => {
        state.mapTriggers[type] = value;
      });
    },

    setGeminiStatus: (status, currentGroundingPrompt) => {
      set(state => {
        state.geminiStatus =
          status in STATUS_MAPPING
            ? STATUS_MAPPING[status as keyof typeof STATUS_MAPPING]
            : status;

        if (currentGroundingPrompt) {
          state.currentGroundingPrompt = currentGroundingPrompt;
        }
      });
    },

    setView: view => {
      set(state => {
        state.ui.view = view;
      });
    },

    setPhotoGallery: (placeId: string) => {
      set(state => {
        state.ui.photoGallery = placeId;
      });
    },

    setShowInitineraryStack: (showItineraryStack: boolean) => {
      set(state => {
        state.ui.showItineraryStack = showItineraryStack;
      });
    },

    setVideoOut: (videoOut: boolean) => {
      set(state => {
        state.activity.videoOut = videoOut;
      });
    },
    setAudioIn: (audioIn: boolean) => {
      set(state => {
        state.activity.audioIn = audioIn;
      });
    },
    setAudioOut: (audioOut: boolean) => {
      set(state => {
        state.activity.audioOut = audioOut;
      });
    },
    changeItineraryOrder: order => {
      set(state => {
        const reorderItineraryItems = (
          items: Array<ItineraryItem>,
          order: Array<ItineraryItemType>
        ) => {
          // Create a mapping from type to its index in the order array
          const orderMap = order.reduce<Record<ItineraryItemType, number>>(
            (map, type, index) => {
              map[type] = index;
              return map;
            },
            {} as Record<ItineraryItemType, number>
          );

          // Sort the array using the mapping
          return items.sort((a, b) => orderMap[a.type] - orderMap[b.type]);
        };

        state.itineraryItems = reorderItineraryItems(
          state.itineraryItems,
          order
        );
      });
    },

    setConversationChips: (chips: Array<string>) => {
      set(state => {
        state.conversationChips = chips;
      });
    },

    buildGeminiTextResponse: (textChunk: string) => {
      set(state => {
        if (state.responseInProgress) {
          state.geminiTextResponse += textChunk;
        } else {
          state.geminiTextResponse = textChunk;
        }
      });
    },

    setResponseInProgress: (isInProgress: boolean) => {
      set(state => {
        state.responseInProgress = isInProgress;
      });
    }
  }))
);

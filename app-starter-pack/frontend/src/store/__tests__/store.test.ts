import {describe, it, expect, beforeEach} from 'vitest';
import {useGlobalStore, ItineraryItem} from '../store';

function makeItem(overrides: Partial<ItineraryItem> = {}): ItineraryItem {
  return {
    type: 'restaurant',
    placeId: 'place_001',
    title: 'Nobu Dubai',
    latestEntry: false,
    summary: 'great sushi',
    ...overrides,
  };
}

// Reset Zustand store state before each test
beforeEach(() => {
  useGlobalStore.setState({
    itineraryItems: [],
    currentSuggestions: [],
    placeDetails: {},
    mapTriggers: {showSelection: false, showSuggestions: false, showFinalItinerary: false},
    geminiTextResponse: '',
    responseInProgress: false,
    geminiStatus: '',
    currentGroundingPrompt: '',
    ui: {view: 'intro', showItineraryStack: true, photoGallery: ''},
    activity: {videoOut: false, audioIn: false, audioOut: false},
    conversationChips: [],
  });
});

describe('addItineraryItem', () => {
  it('adds a new item to the itinerary', () => {
    const item = makeItem();
    useGlobalStore.getState().addItineraryItem(item);
    expect(useGlobalStore.getState().itineraryItems).toHaveLength(1);
    expect(useGlobalStore.getState().itineraryItems[0].title).toBe('Nobu Dubai');
  });

  it('sets latestEntry=true on new item', () => {
    useGlobalStore.getState().addItineraryItem(makeItem());
    expect(useGlobalStore.getState().itineraryItems[0].latestEntry).toBe(true);
  });

  it('replaces an existing item of the same type', () => {
    useGlobalStore.getState().addItineraryItem(makeItem({title: 'First'}));
    useGlobalStore.getState().addItineraryItem(makeItem({title: 'Second', placeId: 'place_002'}));
    const items = useGlobalStore.getState().itineraryItems;
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Second');
  });

  it('sets latestEntry=false on previously-added items', () => {
    useGlobalStore.getState().addItineraryItem(makeItem({type: 'restaurant'}));
    useGlobalStore.getState().addItineraryItem(makeItem({type: 'activity', placeId: 'act_001', title: 'Desert Safari'}));
    const items = useGlobalStore.getState().itineraryItems;
    const restaurant = items.find(i => i.type === 'restaurant')!;
    expect(restaurant.latestEntry).toBe(false);
  });

  it('sets mapTriggers.showSelection to true', () => {
    useGlobalStore.getState().addItineraryItem(makeItem());
    expect(useGlobalStore.getState().mapTriggers.showSelection).toBe(true);
  });

  it('clears currentSuggestions after adding', () => {
    useGlobalStore.getState().setCurrentSuggestions([makeItem()]);
    useGlobalStore.getState().addItineraryItem(makeItem({placeId: 'p2'}));
    expect(useGlobalStore.getState().currentSuggestions).toHaveLength(0);
  });
});

describe('setCurrentSuggestions', () => {
  it('sets suggestions and enables showSuggestions trigger', () => {
    const items = [makeItem(), makeItem({placeId: 'p2', title: 'Zuma'})];
    useGlobalStore.getState().setCurrentSuggestions(items);
    expect(useGlobalStore.getState().currentSuggestions).toHaveLength(2);
    expect(useGlobalStore.getState().mapTriggers.showSuggestions).toBe(true);
  });
});

describe('buildGeminiTextResponse', () => {
  it('resets text when responseInProgress is false', () => {
    useGlobalStore.setState({geminiTextResponse: 'old', responseInProgress: false});
    useGlobalStore.getState().buildGeminiTextResponse('new');
    expect(useGlobalStore.getState().geminiTextResponse).toBe('new');
  });

  it('accumulates text when responseInProgress is true', () => {
    useGlobalStore.setState({geminiTextResponse: 'Hello ', responseInProgress: true});
    useGlobalStore.getState().buildGeminiTextResponse('world');
    expect(useGlobalStore.getState().geminiTextResponse).toBe('Hello world');
  });
});

describe('setMapTrigger', () => {
  it('updates only the specified trigger key', () => {
    useGlobalStore.getState().setMapTrigger('showFinalItinerary', true);
    const triggers = useGlobalStore.getState().mapTriggers;
    expect(triggers.showFinalItinerary).toBe(true);
    expect(triggers.showSelection).toBe(false);
    expect(triggers.showSuggestions).toBe(false);
  });
});

describe('changeItineraryOrder', () => {
  it('reorders items according to the provided type order', () => {
    useGlobalStore.getState().addItineraryItem(makeItem({type: 'restaurant', title: 'Rest'}));
    useGlobalStore.getState().addItineraryItem(makeItem({type: 'activity', placeId: 'a1', title: 'Act'}));
    useGlobalStore.getState().changeItineraryOrder(['activity', 'restaurant']);
    const items = useGlobalStore.getState().itineraryItems;
    expect(items[0].type).toBe('activity');
    expect(items[1].type).toBe('restaurant');
  });
});

describe('setView', () => {
  it('changes the view state', () => {
    useGlobalStore.getState().setView('map');
    expect(useGlobalStore.getState().ui.view).toBe('map');
  });
});

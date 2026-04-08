import {describe, it, expect} from 'vitest';
import {getItineraryItems} from '../get-itinerary-items';

// Minimal grounding content shape used across tests
function makeContent(modelText: string, chunks: Array<{title: string; document_id: string}>) {
  return {
    groundingResponse: {
      model_text: modelText,
      grounding_metadata: {
        supportChunks: chunks.map(c => ({
          sourceMetadata: {
            title: c.title,
            document_id: c.document_id,
            text: modelText,
          },
        })),
      },
    },
  };
}

describe('getItineraryItems', () => {
  it('parses items from JSON code fence in model_text', () => {
    const places = {
      'Nobu Dubai': {summary: 'great sushi', text: 'Japanese restaurant'},
    };
    const content = makeContent(
      '```json\n' + JSON.stringify(places) + '\n```',
      [{title: 'Nobu Dubai', document_id: 'places/place_001'}]
    );

    const result = getItineraryItems(content, 'restaurant', {});
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Nobu Dubai');
    expect(result[0].placeId).toBe('place_001'); // slice(7) removes 'places/'
    expect(result[0].summary).toBe('great sushi');
    expect(result[0].type).toBe('restaurant');
  });

  it('falls back to supportChunks when model_text is not JSON', () => {
    const content = makeContent('Here are my recommendations.', [
      {title: 'Zuma Dubai', document_id: 'places/zuma_001'},
    ]);

    const result = getItineraryItems(content, 'restaurant', {});
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Zuma Dubai');
    expect(result[0].placeId).toBe('zuma_001');
  });

  it('returns empty array when content has no grounding data', () => {
    const content = {groundingResponse: {model_text: '', grounding_metadata: null}};
    const result = getItineraryItems(content, 'restaurant', {});
    expect(result).toEqual([]);
  });

  it('attaches placeDetails when available', () => {
    const places = {'Pierchic': {summary: 'seafood', text: 'over water'}};
    const content = makeContent(
      '```json\n' + JSON.stringify(places) + '\n```',
      [{title: 'Pierchic', document_id: 'places/pier_001'}]
    );
    const mockDetails = {pier_001: {displayName: 'Pierchic'} as any};

    const result = getItineraryItems(content, 'restaurant', mockDetails);
    expect(result[0].details).toBeDefined();
    expect((result[0].details as any).displayName).toBe('Pierchic');
  });

  it('filters out items with no matching grounding chunk', () => {
    const places = {
      'Known Place': {summary: 'ok', text: 'desc'},
      'Unknown Place': {summary: 'missing', text: 'no chunk'},
    };
    const content = makeContent(
      '```json\n' + JSON.stringify(places) + '\n```',
      [{title: 'Known Place', document_id: 'places/known_001'}]
    );

    const result = getItineraryItems(content, 'restaurant', {});
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Known Place');
  });

  it('handles empty supportChunks array gracefully', () => {
    const content = makeContent('not json', []);
    const result = getItineraryItems(content, 'restaurant', {});
    expect(result).toEqual([]);
  });
});

import {describe, it, expect} from 'vitest';
import {parseGroundingText} from '../parse-grounding-text';

describe('parseGroundingText', () => {
  it('extracts and parses JSON from a markdown code fence', () => {
    const input = '```json\n{"Nobu Dubai": {"text": "desc", "summary": "great"}}\n```';
    const result = parseGroundingText(input);
    expect(result).toEqual({'Nobu Dubai': {text: 'desc', summary: 'great'}});
  });

  it('returns null for plain text without a code fence', () => {
    const result = parseGroundingText('Here are some restaurants in Dubai.');
    expect(result).toBeNull();
  });

  it('returns null when the fenced content is not valid JSON', () => {
    const input = '```json\nthis is not json\n```';
    const result = parseGroundingText(input);
    expect(result).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseGroundingText('')).toBeNull();
  });

  it('handles whitespace inside the code fence', () => {
    const input = '```json\n\n  {"key": "value"}  \n\n```';
    const result = parseGroundingText(input);
    expect(result).toEqual({key: 'value'});
  });

  it('returns null when code fence has no closing backticks', () => {
    const input = '```json\n{"key": "value"}';
    expect(parseGroundingText(input)).toBeNull();
  });

  it('handles multiple places in the JSON object', () => {
    const places = {
      'Al Nafoorah': {text: 'Lebanese food', summary: 'great mezze'},
      Zuma: {text: 'Japanese cuisine', summary: 'modern robata'},
    };
    const input = '```json\n' + JSON.stringify(places) + '\n```';
    expect(parseGroundingText(input)).toEqual(places);
  });
});

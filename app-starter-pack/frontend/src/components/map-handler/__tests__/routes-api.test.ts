import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {RoutesApi} from '../routes-api';

const ORIGIN = {lat: 25.2048, lng: 55.2708};
const DESTINATION = {lat: 25.1972, lng: 55.2796};
const WAYPOINT = {lat: 25.2, lng: 55.28};

const MOCK_ROUTE_RESPONSE = {
  routes: [{polyline: {geoJsonLinestring: {type: 'LineString', coordinates: []}}}],
};

describe('RoutesApi', () => {
  let api: RoutesApi;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    api = new RoutesApi();
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls /api/routes with POST and JSON body', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => MOCK_ROUTE_RESPONSE,
    });

    await api.computeRoutes(ORIGIN, DESTINATION);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/routes');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.origin.location.latLng.latitude).toBe(ORIGIN.lat);
    expect(body.destination.location.latLng.latitude).toBe(DESTINATION.lat);
    expect(body.polylineEncoding).toBe('GEO_JSON_LINESTRING');
  });

  it('does NOT send an API key in the request', async () => {
    fetchSpy.mockResolvedValue({ok: true, json: async () => MOCK_ROUTE_RESPONSE});
    await api.computeRoutes(ORIGIN, DESTINATION);

    const [, options] = fetchSpy.mock.calls[0];
    expect(options.headers['X-Goog-Api-Key']).toBeUndefined();
    // Also verify the URL has no key query param
    expect(String(options.url ?? '')).not.toContain('key=');
  });

  it('returns the parsed JSON response', async () => {
    fetchSpy.mockResolvedValue({ok: true, json: async () => MOCK_ROUTE_RESPONSE});
    const result = await api.computeRoutes(ORIGIN, DESTINATION);
    expect(result).toEqual(MOCK_ROUTE_RESPONSE);
  });

  it('throws an error when the response is not ok', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    await expect(api.computeRoutes(ORIGIN, DESTINATION)).rejects.toThrow(
      'Request failed with status: 403 - Forbidden'
    );
  });

  it('includes intermediates in the body when waypoints are provided', async () => {
    fetchSpy.mockResolvedValue({ok: true, json: async () => MOCK_ROUTE_RESPONSE});

    await api.computeRoutes(ORIGIN, DESTINATION, [WAYPOINT]);

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.intermediates).toHaveLength(1);
    expect(body.intermediates[0].location.latLng.latitude).toBe(WAYPOINT.lat);
  });

  it('omits intermediates when no waypoints are provided', async () => {
    fetchSpy.mockResolvedValue({ok: true, json: async () => MOCK_ROUTE_RESPONSE});

    await api.computeRoutes(ORIGIN, DESTINATION);

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.intermediates).toBeUndefined();
  });
});

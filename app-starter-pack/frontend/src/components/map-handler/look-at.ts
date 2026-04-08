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

import {ALTITUDE_DUBAI} from './map-handler';

type Location = {
  lat: number;
  lng: number;
  alt?: number;
};

export function lookAt(locations: Array<Location>, heading = 0) {
  const degToRad = Math.PI / 180;

  // Compute bounding box of the locations
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  locations.forEach(loc => {
    if (loc.lat < minLat) minLat = loc.lat;
    if (loc.lat > maxLat) maxLat = loc.lat;
    if (loc.lng < minLng) minLng = loc.lng;
    if (loc.lng > maxLng) maxLng = loc.lng;
  });

  // Center of the bounding box
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  // If locations include an altitude property, average them; otherwise assume 0
  let sumAlt = 0;
  let countAlt = 0;

  locations.forEach(loc => {
    sumAlt += ALTITUDE_DUBAI + (loc.alt ?? 0); // Dubai altitude as default
    countAlt++;
  });
  const lookAtAltitude = countAlt > 0 ? sumAlt / countAlt : 0;

  // Haversine function: returns angular distance in radians
  function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
    const dLat = (lat2 - lat1) * degToRad;
    const dLng = (lng2 - lng1) * degToRad;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * degToRad) *
        Math.cos(lat2 * degToRad) *
        Math.sin(dLng / 2) ** 2;
    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Find the maximum angular distance (in radians) from the center to any location
  let maxAngularDistance = 0;
  locations.forEach(loc => {
    const d = haversine(centerLat, centerLng, loc.lat, loc.lng);
    if (d > maxAngularDistance) maxAngularDistance = d;
  });

  // Convert the angular distance to a linear ground distance (in meters)
  const earthRadius = 6371000; // meters
  const maxDistance = maxAngularDistance * earthRadius;

  // Define the needed horizontal distance as a margin (twice the max ground distance)
  const horizontalDistance = maxDistance * 2;

  const targetTiltDeg = 60;
  const verticalDistance =
    horizontalDistance / Math.tan(targetTiltDeg * degToRad);

  // Compute the slant range (straight-line distance from camera to look-at point)
  const slantRange = Math.sqrt(horizontalDistance ** 2 + verticalDistance ** 2);

  // Return the computed camera view, including the orbit/heading angle
  return {
    lat: centerLat,
    lng: centerLng,
    altitude: lookAtAltitude,
    range: slantRange,
    tilt: targetTiltDeg,
    heading
  };
}

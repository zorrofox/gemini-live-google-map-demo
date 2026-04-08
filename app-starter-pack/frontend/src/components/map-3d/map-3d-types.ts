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

/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/no-explicit-any */

import {DOMAttributes, RefAttributes} from 'react';

// add an overload signature for the useMapsLibrary hook, so typescript
// knows what the 'maps3d' library is.
declare module '@vis.gl/react-google-maps' {
  export function useMapsLibrary(
    name: 'maps3d'
  ): typeof google.maps.maps3d | null;
}

// temporary fix until @types/google.maps is updated with the latest changes
declare global {
  namespace google.maps.maps3d {
    interface CameraOptions {
      center?: google.maps.LatLngAltitude | google.maps.LatLngAltitudeLiteral;
      heading?: number;
      range?: number;
      roll?: number;
      tilt?: number;
    }

    interface FlyAroundAnimationOptions {
      camera: CameraOptions;
      durationMillis?: number;
      rounds?: number;
    }

    interface FlyToAnimationOptions {
      endCamera: CameraOptions;
      durationMillis?: number;
    }
    interface Map3DElement extends HTMLElement {
      mode?: 'HYBRID' | 'SATELLITE';
      flyCameraAround: (options: FlyAroundAnimationOptions) => void;
      flyCameraTo: (options: FlyToAnimationOptions) => void;
    }
  }
}

// add the <gmp-map-3d> custom-element to the JSX.IntrinsicElements
// interface, so it can be used in jsx
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      ['gmp-map-3d']: CustomElement<
        google.maps.maps3d.Map3DElement,
        google.maps.maps3d.Map3DElement
      >;
    }
  }
}

// a helper type for CustomElement definitions
type CustomElement<TElem, TAttr> = Partial<
  TAttr &
    DOMAttributes<TElem> &
    RefAttributes<TElem> & {
      // for whatever reason, anything else doesn't work as children
      // of a custom element, so we allow `any` here
      children: any;
    }
>;

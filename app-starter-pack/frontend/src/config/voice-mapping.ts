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

import {WaveformType} from '../components/ai-voice-visualizer/ai-voice-visualizer';

export type VoiceColor = 'color-1' | 'color-2' | 'color-3' | 'color-4';

export interface VoiceConfig {
  waveForm: WaveformType;
  color: VoiceColor;
}

export const defaultVoice = 'Aoede';

export const VOICE_MAPPING: {
  [key: string]: VoiceConfig;
} = {
  Charon: {
    waveForm: 'sine',
    color: 'color-1'
  },
  Aoede: {
    waveForm: 'square',
    color: 'color-2'
  },
  Fenrir: {
    waveForm: 'triangle',
    color: 'color-3'
  },
  Kore: {
    waveForm: 'sine',
    color: 'color-2'
  },
  Puck: {
    waveForm: 'square',
    color: 'color-1'
  },
  Marvin: {
    waveForm: 'square',
    color: 'color-1'
  }
};

export type VoiceKey = keyof typeof VOICE_MAPPING;

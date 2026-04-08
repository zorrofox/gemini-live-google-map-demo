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

import {parseAsBoolean, useQueryState} from 'nuqs';

import {defaultVoice} from '../config/voice-mapping';

// 生产环境后端地址（根据需要切换注释）：
// 美国中部：restaurant-guide-service-224077212497.us-central1.run.app
// 新加坡：restaurant-guide-service-sg-224077212497.asia-southeast1.run.app
// 切换方法：注释掉当前使用的地址，取消注释要使用的地址

const defaultHost =
  window.location.hostname === 'localhost'
    ? 'localhost:8080'  // 本地开发
    // : 'restaurant-guide-service-224077212497.us-central1.run.app';  // 美国中部（已注释）
    : 'restaurant-guide-service-sg-224077212497.asia-southeast1.run.app';  // ✅ 当前使用：新加坡

const defaultProtocol = window.location.hostname === 'localhost' ? 'ws' : 'wss';
const userId = `user${Math.floor(Math.random() * 100)}`;

export const useVideoParam = () =>
  useQueryState('video', parseAsBoolean.withDefault(true));

export const useAudioParam = () =>
  useQueryState('audio', parseAsBoolean.withDefault(true));

export const useOrbitsParams = () =>
  useQueryState('orbits', parseAsBoolean.withDefault(true));

export const useVoiceParam = () =>
  useQueryState('voice', {
    defaultValue: defaultVoice
  });
export const useTextOnlyParam = () =>
  useQueryState('textOnly', parseAsBoolean.withDefault(false));

export const useMenuOpenParam = () =>
  useQueryState('menuOpen', parseAsBoolean.withDefault(false));

export const useDevModeParam = () =>
  useQueryState('devMode', parseAsBoolean.withDefault(false));

export const useServerOptionsParam = () =>
  useQueryState('serverOptions', parseAsBoolean.withDefault(false));

export const useChatEnabledParam = () =>
  useQueryState('chatEnabled', parseAsBoolean.withDefault(false));

export const useSnippetButtonsParam = () =>
  useQueryState('snippetButtons', parseAsBoolean.withDefault(false));

export const useProtocolParam = () =>
  useQueryState('protocol', {defaultValue: defaultProtocol});
export const useHostParam = () =>
  useQueryState('host', {defaultValue: defaultHost});

export const useUserIdParam = () =>
  useQueryState('userId', {defaultValue: userId});

// 客户端类型：用于区分眼镜端（glasses）和Web端（web）
// 默认为 'web'（观察者模式），但可以通过URL参数改为 'glasses' 用于测试
export const useClientTypeParam = () =>
  useQueryState('clientType', {defaultValue: 'web'});

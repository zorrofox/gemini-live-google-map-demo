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

// 本地开发连 localhost:8000；生产环境直接用当前页面的域名（Cloud Run 前端和后端同服务）
const defaultHost =
  window.location.hostname === 'localhost'
    ? 'localhost:8000'
    : window.location.host;

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

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

import {useEffect} from 'react';
import {APIProvider} from '@vis.gl/react-google-maps';
import {AnimatePresence} from 'motion/react';

import LiveClientHandler from './components/live-client-handler/live-client-handler';
import PlacesHandler from './components/places-handler/places-handler';
import {CamAudio} from './components/cam-audio/cam-audio';
import MapHandler from './components/map-handler/map-handler';
import ItineraryStack from './components/itinerary-stack/itinerary-stack';
import {Header} from './components/header/header';
import AiPersonaPanel from './components/ai-persona-panel/ai-persona-panel';
import Intro from './components/intro/intro';
import Chat from './components/chat/chat';

import {LiveAPIProvider} from './contexts/LiveAPIContext';
import {useGlobalStore} from './store/store';
import {
  useChatEnabledParam,
  useClientTypeParam,
  useHostParam,
  useProtocolParam,
  useTextOnlyParam,
  useUserIdParam
} from './hooks/use-query-state';
import {PhotoGallery} from './components/photo-gallery/photo-gallery';
import {ResetButton} from './components/reset-button/reset-button';

function App() {
  const view = useGlobalStore(state => state.ui.view);

  const [chatEnabled] = useChatEnabledParam();
  const [clientType] = useClientTypeParam();
  const [protocol] = useProtocolParam();
  const [textOnly] = useTextOnlyParam();
  const [host] = useHostParam();
  const [userId] = useUserIdParam();

  const serverUrl = `${protocol}://${host}/`;

  // 防止车机浏览器滚动和下拉刷新
  useEffect(() => {
    const preventScroll = (e: TouchEvent) => {
      // 允许地图容器的触摸交互
      const target = e.target as HTMLElement;
      if (target.closest('gmp-map-3d') || target.closest('.map-container')) {
        return;
      }
      // 阻止单指滑动的默认行为
      if (e.touches.length === 1) {
        e.preventDefault();
      }
    };

    // 阻止双击缩放
    const preventZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchmove', preventScroll, {passive: false});
    document.addEventListener('touchstart', preventZoom, {passive: false});

    return () => {
      document.removeEventListener('touchmove', preventScroll);
      document.removeEventListener('touchstart', preventZoom);
    };
  }, []);

  return (
    <div className="App">
      <APIProvider
        apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
        version={'alpha'}>
        <LiveAPIProvider url={serverUrl} userId={userId}>
          <Header isBlur={false} />
          <LiveClientHandler />

          <AnimatePresence>
            {!textOnly && clientType === 'glasses' ? <CamAudio isBlur={false} /> : null}
          </AnimatePresence>

          <PhotoGallery />
          {chatEnabled && view !== 'intro' && <Chat />}
          <AnimatePresence>
            <AiPersonaPanel />
          </AnimatePresence>

          <Intro />

          {view !== 'end-summary' && <ItineraryStack />}
        </LiveAPIProvider>
        <MapHandler isBlur={false} />
        <PlacesHandler />
        <ResetButton />
      </APIProvider>
      
      {/* 免责声明 */}
      <div style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        fontSize: '11px',
        color: 'rgba(255, 255, 255, 0.6)',
        textAlign: 'right',
        lineHeight: '1.4',
        pointerEvents: 'none',
        zIndex: 1000,
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
      }}>
        <div>本演示仅作概念验证，非商业化功能</div>
        <div>Tech Demo Only. Not for Commercial Use.</div>
      </div>
    </div>
  );
}

export default App;

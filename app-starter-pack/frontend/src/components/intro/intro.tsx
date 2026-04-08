import {AnimatePresence, motion} from 'motion/react';

import {VOICE_MAPPING} from '../../config/voice-mapping';
import {useLiveAPIContext} from '../../contexts/LiveAPIContext';
import {useGlobalStore} from '../../store/store';
import {AiVoiceVisualizer} from '../ai-voice-visualizer/ai-voice-visualizer';

import styles from './intro.module.css';
import {useEffect} from 'react';
import {useChatEnabledParam, useVoiceParam} from '../../hooks/use-query-state';
import Chat from '../chat/chat';

export default function Intro() {
  const {audioStreamerRef, client, connected, connect, disconnect} =
    useLiveAPIContext();
  const view = useGlobalStore(state => state.ui.view);
  const [voice] = useVoiceParam();
  const [chatEnabled] = useChatEnabledParam();

  const {waveForm, color} = VOICE_MAPPING[voice];

  useEffect(() => {
    if (!connected) return;

    setTimeout(() => {
      client.send([{text: 'Hi'}]);
    }, 1000);
  }, [connected]);

  return (
    <div
      className={`${styles.container} ${view !== 'intro' ? styles.hidden : ''}`}>
      <div className={styles.content}>
        <AiVoiceVisualizer
          source={audioStreamerRef?.current?.source}
          waveform={waveForm}
          className={`${color} ${styles.aiVoiceInIntro}`}
        />
        <div className={styles.introText}>
          <AnimatePresence>
            <motion.h1
              className={`${styles.title}`}
              layout
              initial={{opacity: 0}}
              animate={{opacity: 1}}
              exit={{opacity: 0}}>
              <span>Let AI</span>
              <span>plan your perfect</span>
              <span>evening.</span>
            </motion.h1>
          </AnimatePresence>
          <AnimatePresence mode="wait">
            {chatEnabled && (
              <motion.div
                key="chat"
                initial={{opacity: 0, height: 0, marginTop: 0}}
                animate={{opacity: 1, height: 'auto', marginTop: '48px'}}
                exit={{opacity: 0, height: 0, marginTop: 0}}
                transition={{duration: 0.3}}>
                <Chat className={styles.introChat} />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence mode="wait">
            {!connected && (
              <motion.div
                key="cta"
                className={styles.cta}
                initial={{opacity: 0, marginTop: 0}}
                animate={{
                  opacity: connected ? 0 : 1,
                  height: connected ? 0 : 'auto',
                  marginTop: '48px'
                }}
                exit={{opacity: 0, height: 0, marginTop: 0}}
                transition={{duration: 0.3}}>
                <button onClick={connected ? disconnect : connect}>
                  Start now!
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

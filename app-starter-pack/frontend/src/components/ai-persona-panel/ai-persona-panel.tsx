import {VOICE_MAPPING} from '../../config/voice-mapping';
import {useLiveAPIContext} from '../../contexts/LiveAPIContext';
import {useGlobalStore} from '../../store/store';
import {AiVoiceVisualizer} from '../ai-voice-visualizer/ai-voice-visualizer';
import ConversationHelper from '../conversation-helper/conversation-helper';
import {useVoiceParam} from '../../hooks/use-query-state';
import {motion} from 'motion/react';
import styles from './ai-persona-panel.module.css';

interface Props {
  galleryCaption?: {
    title: string;
    subtitle: string;
  };
}

export default function AiPersonaPanel(props: Props) {
  const {audioStreamerRef} = useLiveAPIContext();
  const geminiStatus = useGlobalStore(state => state.geminiStatus);

  const [voice] = useVoiceParam();

  const {galleryCaption} = props;

  const {waveForm, color} = VOICE_MAPPING[voice];

  return (
    <motion.div
      initial={{y: 0, x: '-50%'}}
      exit={{y: 300, x: '-50%'}}
      transition={{duration: 0.8}}
      className={styles.container}>
      <div className={styles.visualizer}>
        <AiVoiceVisualizer
          source={audioStreamerRef?.current?.source}
          waveform={waveForm}
          width={250}
          height={250}
          className={`${color}`}
        />
        {geminiStatus && (
          <div className={styles.loaderWrapper}>
            <span className={styles.loader}></span>
          </div>
        )}
      </div>
      <div className={styles.info}>
        {geminiStatus ? (
          geminiStatus
        ) : galleryCaption ? (
          <div className={styles.galleryCaption}>
            <div className={styles.galleryCaptionTitle}>
              {galleryCaption.title}
            </div>
            <div className={styles.galleryCaptionSubtitle}>
              {galleryCaption.subtitle}
            </div>
          </div>
        ) : (
          <ConversationHelper />
        )}
      </div>
    </motion.div>
  );
}

import {useEffect, useRef} from 'react';
import Logger from '../logger/logger';
import styles from './dev-panel.module.css';
import {useLoggerStore} from '../../store/logger-store';
import {useGlobalStore} from '../../store/store';
import {useLiveAPIContext} from '../../contexts/LiveAPIContext';

export type LoggerFilterType = 'conversations' | 'tools' | 'none';

interface DevPanelProps {
  visible: boolean;
  onClose: () => void;
}

export default function DevPanel(props: DevPanelProps) {
  const {visible, onClose} = props;
  const {logs} = useLoggerStore();
  const loggerRef = useRef<HTMLDivElement>(null);
  const loggerLastHeightRef = useRef<number>(-1);
  const {audioStreamerRef} = useLiveAPIContext();

  const videoOut = useGlobalStore(state => state.activity.videoOut);
  const audioIn = useGlobalStore(state => state.activity.audioIn);
  const audioOut = useGlobalStore(state => state.activity.audioOut);

  const setAudioIn = useGlobalStore(state => state.setAudioIn);
  //scroll the log to the bottom when new logs come in
  useEffect(() => {
    if (loggerRef.current) {
      const el = loggerRef.current;
      const scrollHeight = el.scrollHeight;
      if (scrollHeight !== loggerLastHeightRef.current) {
        el.scrollTop = scrollHeight;
        loggerLastHeightRef.current = scrollHeight;
      }
    }
  }, [logs]);

  useEffect(() => {
    if (audioStreamerRef.current) {
      audioStreamerRef.current.onStart = () => {
        setAudioIn(true);
      };
      audioStreamerRef.current.onComplete = () => {
        setAudioIn(false);
      };
    }
  });

  return (
    <div className={`${styles.container} ${visible ? styles.open : ''}`}>
      <div className={styles.titleBar}>
        <h2 className={styles.title}>Console</h2>
        <div>
          <button className={styles.closeButton} onClick={onClose}>
            <span className={`material-symbols-outlined ${styles.closeIcon}`}>
              left_panel_open
            </span>
          </button>
        </div>
      </div>

      <div className={styles.activity}>
        <span className={styles.activityLabel}>Activity status</span>
        <div className={styles.activityItem}>
          <span className={`material-symbols-outlined`}>videocam</span>
          <span
            className={`material-symbols-outlined ${styles.arrow} ${styles.videoOut} ${videoOut ? styles.arrowOutActive : ''}`}>
            arrow_upward_alt
          </span>
        </div>
        <div className={styles.activityItem}>
          <span className={`material-symbols-outlined`}>mic</span>
          <span
            className={`material-symbols-outlined ${styles.arrow} ${styles.audioOut} ${audioOut ? styles.arrowOutActive : ''}`}>
            arrow_upward_alt
          </span>
          <span
            className={`material-symbols-outlined ${styles.arrow} ${styles.audioIn} ${audioIn ? styles.arrowInActive : ''}`}>
            arrow_downward_alt
          </span>
        </div>
      </div>

      <div className={styles.logger} ref={loggerRef}>
        <Logger filter="none" />
      </div>
    </div>
  );
}

import Markdown from 'marked-react';

import {useGlobalStore} from '../../store/store';
import styles from './chat-response-panel.module.css';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ChatResponse(props: Props) {
  const {visible, onClose} = props;

  const geminiTextResponse = useGlobalStore(state => state.geminiTextResponse);

  return (
    <div className={`${styles.container} ${visible ? styles.open : ''}`}>
      <div className={styles.titleBar}>
        <h2 className={styles.title}>Text Only Mode</h2>
        <div>
          <button className={styles.closeButton} onClick={onClose}>
            <span className={`material-symbols-outlined ${styles.closeIcon}`}>
              left_panel_open
            </span>
          </button>
        </div>
      </div>
      <div className={styles.content}>
        <Markdown>{geminiTextResponse}</Markdown>
      </div>
    </div>
  );
}

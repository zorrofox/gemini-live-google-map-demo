import ChipCarousel from '../chip-carousel/chip-carousel';

import {useGlobalStore} from '../../store/store';
import {HELPER_CHIPS} from '../../config/conversation-chips';

import styles from './conversation-helper.module.css';

export default function ConversationHelper() {
  const chips = useGlobalStore(state => state.conversationChips);

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Things you can ask me</h2>
      <ChipCarousel
        chips={chips.length ? chips : HELPER_CHIPS.generic}
        intervalMs={5000}
      />
    </div>
  );
}

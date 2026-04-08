import styles from './reset-button.module.css';

import {motion, type AnimationScope} from 'motion/react';

export function ResetButton({scope}: {scope?: AnimationScope}) {
  return (
    <motion.button
      ref={scope}
      initial={{opacity: 0, y: 15}}
      animate={{opacity: 1, y: 0}}
      transition={{duration: 0.3}}
      className={styles.menuButton}
      onClick={() => window.location.reload()}>
      <span className={`material-icons ${styles.resetIcon}`}>restart_alt</span>
      <span>Reset</span>
    </motion.button>
  );
}

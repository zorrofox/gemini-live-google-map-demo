import {QRCodeSVG} from 'qrcode.react';
import {motion, type AnimationScope} from 'motion/react';
import styles from './qr-code.module.css';

export function QrCode({
  outroURL,
  scope
}: {
  outroURL: string;
  scope: AnimationScope;
}) {
  return (
    <motion.div
      ref={scope}
      initial={{scale: 0}}
      animate={{
        scale: 1
      }}
      transition={{duration: 0.5}}
      className={styles.qr}>
      <QRCodeSVG
        value={outroURL}
        marginSize={1}
        bgColor={'#202124'}
        fgColor="#ffffff"
        size={184}
      />
    </motion.div>
  );
}

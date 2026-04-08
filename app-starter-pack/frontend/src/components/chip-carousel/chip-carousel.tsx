import {useState, useEffect, useMemo} from 'react';
import {motion} from 'motion/react';

import styles from './chip-carousel.module.css';

interface Props {
  chips: string[];
  intervalMs?: number;
}

const chipWidth = 420;
const containerWidth = 420;

function shuffleArray<T>(array: T[]): T[] {
  let currentIndex = array.length;

  while (currentIndex !== 0) {
    const randomIndex = Math.floor(Math.random() * currentIndex);

    currentIndex--;

    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex]
    ];
  }

  return array;
}

export default function ChipCarousel({chips, intervalMs = 4000}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedChips = useMemo(() => {
    return shuffleArray([...chips]).slice(0, 10);
  }, [chips]);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % selectedChips.length);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [selectedChips.length, intervalMs]);

  const centerOffset = containerWidth / 2 - chipWidth / 2;
  const xOffset = centerOffset - activeIndex * chipWidth;

  return (
    <div className={styles.carouselContainer}>
      <motion.div
        className={styles.carouselTrack}
        animate={{x: xOffset}}
        transition={{duration: 0.5, ease: 'easeInOut'}}>
        {selectedChips.map((chip, index) => (
          <div key={index} className={`${styles.chip} `}>
            <span
              className={`${styles.chipContent} ${index === activeIndex ? styles.active : styles.dimmed}`}>
              {chip}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

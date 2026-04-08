import {useEffect, useRef, useState} from 'react';
import {motion, AnimatePresence, wrap} from 'motion/react';

import AiPersonaPanel from '../ai-persona-panel/ai-persona-panel';
import Chat from '../chat/chat';

import {useGlobalStore} from '../../store/store';
import {
  useChatEnabledParam,
  useTextOnlyParam
} from '../../hooks/use-query-state';

import styles from './photo-gallery.module.css';

const PHOTO_TIME_MS = 2500;

const variants = {
  enter: () => {
    return {
      opacity: 0,
      zIndex: 1
    };
  },
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1
  },
  exit: () => {
    return {
      zIndex: 1,
      opacity: 0
    };
  }
};

const swipeConfidenceThreshold = 10000;
const swipePower = (offset: number, velocity: number) => {
  return Math.abs(offset) * velocity;
};

export const PhotoGallery = () => {
  const [[page, direction], setPage] = useState([0, 0]);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  const photoGallery = useGlobalStore(state => state.ui.photoGallery);
  const setPhotoGallery = useGlobalStore(state => state.setPhotoGallery);
  const placeDetails = useGlobalStore(state => state.placeDetails);

  const [textOnly] = useTextOnlyParam();
  const [chatEnabled] = useChatEnabledParam();

  const place = placeDetails[photoGallery];

  const images = place?.photos?.map(photo => {
    // @ts-expect-error Property 'name' does not exist on type 'Photo'. Google Maps types are incorrect here
    return `https://places.googleapis.com/v1/${photo.name}/media?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&maxWidthPx=2000`;
  });

  const paginate = (newDirection: number) => {
    setPage([page + newDirection, newDirection]);
  };

  const maxPhotoCount = textOnly ? 3 : (images?.length ?? 0);

  useEffect(() => {
    if (!images?.length) return;

    const interval = setInterval(() => {
      setPage(([oldPage]) => {
        return [oldPage + 1, 1];
      });
    }, PHOTO_TIME_MS);

    setTimeout(() => {
      setPhotoGallery('');
    }, maxPhotoCount * PHOTO_TIME_MS);

    return () => {
      clearInterval(interval);
    };
  }, [images, setPhotoGallery]);

  useEffect(() => {
    if (images?.length) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [images]);

  const imageIndex = wrap(0, images?.length ?? 0, page);
  const nextIndex = wrap(0, images?.length ?? 0, page + 1);

  return (
    <dialog
      className={styles.container}
      ref={dialogRef}
      onCancel={() => setPhotoGallery('')}>
      <AiPersonaPanel
        galleryCaption={{
          title: place?.displayName ?? '',
          subtitle: 'Image gallery'
        }}
      />
      {chatEnabled && <Chat />}
      {/* preload next image for smooth transition */}
      <img src={images?.[nextIndex]} style={{display: 'none'}} />
      <AnimatePresence initial={false} custom={direction}>
        <motion.img
          referrerPolicy="no-referrer"
          key={page}
          src={images?.[imageIndex]}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            opacity: {duration: 2}
          }}
          drag="x"
          dragConstraints={{left: 0, right: 0}}
          dragElastic={1}
          onDragEnd={(_, {offset, velocity}) => {
            const swipe = swipePower(offset.x, velocity.x);

            if (swipe < -swipeConfidenceThreshold) {
              paginate(1);
            } else if (swipe > swipeConfidenceThreshold) {
              paginate(-1);
            }
          }}
        />
      </AnimatePresence>
      <div className={styles.next} onClick={() => paginate(1)}>
        <span className="material-symbols-outlined">arrow_forward</span>
      </div>
      <div className={styles.prev} onClick={() => paginate(-1)}>
        <span className="material-symbols-outlined">arrow_back</span>
      </div>
    </dialog>
  );
};

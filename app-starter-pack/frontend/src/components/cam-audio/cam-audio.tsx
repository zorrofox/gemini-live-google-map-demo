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

import cn from 'classnames';
import {useWebcam} from '../../hooks/use-webcam';
import {AudioIcon, MicIcon} from '../icons/icons';
import styles from './cam-audio.module.css';

import {useRef, useState, useEffect} from 'react';
import {useLiveAPIContext} from '../../contexts/LiveAPIContext';
import {AudioRecorder} from '../../utils/audio-recorder';

import {useGlobalStore} from '../../store/store';
import {useAudioParam, useVideoParam} from '../../hooks/use-query-state';

export function CamAudio({isBlur = false}: {isBlur?: boolean}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);

  const setAudioOut = useGlobalStore(state => state.setAudioOut);
  const setVideoOut = useGlobalStore(state => state.setVideoOut);

  const [isVideoVisible, setIsVideoVisible] = useVideoParam();
  const [audioActive, setAudioActive] = useAudioParam();
  const [inVolume, setInVolume] = useState(0);
  const [audioRecorder] = useState(() => new AudioRecorder());
  const webcam = useWebcam();

  const {client, connected} = useLiveAPIContext();

  // Add smoothed volume for better visualization
  const [smoothedVolume, setSmoothedVolume] = useState(0);

  // Start webcam when component mounts
  useEffect(() => {
    if (isVideoVisible && !webcam.stream) {
      webcam.start();
    }
  }, [isVideoVisible, webcam]);

  // Handle video stream when available
  useEffect(() => {
    if (webcam.stream && videoRef.current && isVideoVisible) {
      videoRef.current.srcObject = webcam.stream;
    }
  }, [webcam.stream, isVideoVisible]);

  // Audio volume effect
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--volume',
      `${Math.max(5, Math.min(inVolume * 200, 8))}px`
    );
  }, [inVolume]);

  // Smooth the volume changes for better visualization
  useEffect(() => {
    const smoothFactor = 0.3; // Lower value = smoother but slower response
    setSmoothedVolume(
      prevVol => prevVol * (1 - smoothFactor) + inVolume * smoothFactor
    );
  }, [inVolume]);

  // Audio recording effect
  useEffect(() => {
    let audioDebounce = -1;

    const onData = (base64: string) => {
      if (client && connected && audioActive) {
        client.sendRealtimeInput([
          {
            mimeType: 'audio/pcm;rate=16000',
            data: base64
          }
        ]);

        // Debounce audio out activity
        setAudioOut(true);
        clearTimeout(audioDebounce);
        audioDebounce = setTimeout(() => {
          setAudioOut(false);
        }, 2000);
      }
    };

    if (audioActive && connected && audioRecorder) {
      audioRecorder.on('data', onData).on('volume', setInVolume).start();
    } else {
      audioRecorder.stop();
    }

    return () => {
      audioRecorder.off('data', onData).off('volume', setInVolume);
    };
  }, [audioActive, connected, client, audioRecorder]);

  // Send video frames when video is active
  useEffect(() => {
    if (!isVideoVisible || !connected) {
      return;
    }

    let timeoutId = -1;
    let videoDebounce = -1;

    function sendVideoFrame() {
      const video = videoRef.current;
      const canvas = renderCanvasRef.current;

      if (!video || !canvas || !client) {
        return;
      }

      const ctx = canvas.getContext('2d')!;
      canvas.width = video.videoWidth * 0.25;
      canvas.height = video.videoHeight * 0.25;

      if (canvas.width + canvas.height > 0) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 1.0);
        const data = base64.slice(base64.indexOf(',') + 1, Infinity);
        client.sendRealtimeInput([{mimeType: 'image/jpeg', data}]);

        // Debounce audio out activity
        setVideoOut(true);
        clearTimeout(videoDebounce);
        videoDebounce = setTimeout(() => {
          setVideoOut(false);
        }, 2000);
      }

      if (connected) {
        timeoutId = window.setTimeout(sendVideoFrame, 20_000);
      }
    }

    if (connected) {
      requestAnimationFrame(sendVideoFrame);
    }

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isVideoVisible, connected, client]);

  // Toggle between image and video
  const handleToggleVideo = () => {
    setIsVideoVisible(prev => {
      if (prev) {
        webcam.stop();
      }
      return !prev;
    });
  };

  // Toggle audio muting
  const handleToggleAudio = () => {
    setAudioActive(prev => !prev);
  };

  return (
    <div
      className={styles.camAudio}
      style={{filter: isBlur ? 'blur(5px)' : 'none'}}>
      <canvas style={{display: 'none'}} ref={renderCanvasRef} />
      <div onClick={handleToggleVideo} className={styles.videoContainer}>
        {!isVideoVisible ? (
          <div className={styles.videoIconWrapper}>
            <div className={styles.videoIconContent}>
              <span className={`material-symbols-outlined ${styles.videoIcon}`}>
                videocam
              </span>
            </div>
          </div>
        ) : (
          <div className={styles.webcamContainer}>
            <video
              ref={videoRef}
              className={cn(styles.webcamVideo, {
                [styles.hidden]: !isVideoVisible
              })}
              autoPlay
              playsInline
              muted
            />
          </div>
        )}
      </div>
      <div className={cn(styles.mic)} onClick={handleToggleAudio}>
        {!audioActive ? <MicIcon /> : <AudioIcon volume={smoothedVolume} />}
      </div>
    </div>
  );
}

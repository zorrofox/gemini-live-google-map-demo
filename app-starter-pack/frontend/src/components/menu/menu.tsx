import styles from './menu.module.css';
import {VOICE_MAPPING} from '../../config/voice-mapping';
import Toggle from './toggle';
import ConveniencePanel from '../convenience-panel/convenience-panel';
import DevPanel from '../dev-panel/dev-panel';
import {useLiveAPIContext} from '../../contexts/LiveAPIContext';
import {
  useAudioParam,
  useChatEnabledParam,
  useDevModeParam,
  useMenuOpenParam,
  useServerOptionsParam,
  useProtocolParam,
  useHostParam,
  useSnippetButtonsParam,
  useUserIdParam,
  useVideoParam,
  useVoiceParam,
  useOrbitsParams,
  useTextOnlyParam
} from '../../hooks/use-query-state';
import {useEffect, useRef, useState} from 'react';
import ChatResponse from '../chat-response/chat-response-panel';

interface Props {
  isBlur: boolean;
}

export default function Menu(props: Props) {
  const {connected, connect, disconnect} = useLiveAPIContext();

  const [easterEggCount, setEasterEggCount] = useState(0);
  const easterEggInterval = useRef(-1);

  const [menuOpen, setMenuOpen] = useMenuOpenParam();
  const [currentVoice, setVoice] = useVoiceParam();
  const [textOnly, setTextOnly] = useTextOnlyParam();
  const [videoActive, setVideoActive] = useVideoParam();
  const [audioActive, setAudioActive] = useAudioParam();
  const [orbitsActive, setOrbitsActive] = useOrbitsParams();
  const [devModeActive, setDevModeActive] = useDevModeParam();
  const [chatEnabled, setChatEnabled] = useChatEnabledParam();
  const [snippetButtons] = useSnippetButtonsParam();
  const [protocol, setProtocol] = useProtocolParam();
  const [host, setHost] = useHostParam();
  const [userId, setUserId] = useUserIdParam();
  const [serverOptions, setServerOptions] = useServerOptionsParam();

  useEffect(() => {
    if (easterEggCount > 5 || currentVoice === 'Marvin') {
      clearInterval(easterEggInterval.current);
      return;
    }

    if (easterEggInterval.current === -1) {
      easterEggInterval.current = setInterval(() => {
        setEasterEggCount(0);
      }, 5000); // Reset every 5 seconds
    }
  }, [easterEggCount, currentVoice]);

  useEffect(() => {
    if (easterEggCount > 4) {
      setVoice('Marvin');
    }
  }, [easterEggCount, setVoice]);

  return (
    <div className={styles.container}>
      <button
        className={styles.menuButton}
        onClick={() => setMenuOpen(!menuOpen)}>
        <span className={`material-icons`}>
          {menuOpen ? `menu_open` : 'menu'}
        </span>
      </button>

      <DevPanel
        onClose={() => setDevModeActive(false)}
        visible={devModeActive && !props.isBlur}
      />
      <ChatResponse
        onClose={() => {
          setTextOnly(false);
          setTimeout(() => {
            window.location.reload();
          }, 0);
        }}
        visible={textOnly && !props.isBlur}
      />

      <div className={`${styles.menuPanel} ${menuOpen ? styles.open : ''}`}>
        <h2 className={styles.title}>Configuration Menu</h2>
        <div className={styles.menuSection}>
          <div className={styles.voiceSelection}>
            <span className={styles.voiceHeading}>Voice of the agent</span>
            <div className={styles.voiceOptions}>
              {Object.keys(VOICE_MAPPING)
                .filter(voice => voice !== 'Marvin')
                .map(voice => {
                  const isSelected =
                    currentVoice === voice ||
                    (currentVoice === 'Marvin' && voice === 'Puck');
                  return (
                    <label key={voice}>
                      <input
                        type="radio"
                        name="voice"
                        value={voice}
                        onChange={() => {
                          if (
                            easterEggCount > 4 ||
                            (voice === 'Puck' && currentVoice === 'Marvin')
                          ) {
                            setVoice('Marvin');
                          } else {
                            setVoice(voice);
                          }

                          setTimeout(() => {
                            window.location.reload();
                          }, 0);
                        }}
                        checked={currentVoice === voice}
                      />
                      <div
                        onClick={() => {
                          if (voice === 'Puck') {
                            setEasterEggCount(easterEggCount + 1);
                          }
                        }}
                        className={`${styles.voiceOption} ${isSelected ? styles.active : ''}`}>
                        {isSelected && (
                          <span
                            className={`material-icons ${styles.checkIcon}`}>
                            check
                          </span>
                        )}
                        {voice}{' '}
                        {voice === 'Puck' && currentVoice === 'Marvin'
                          ? `(Marvin)`
                          : ''}
                      </div>
                    </label>
                  );
                })}
            </div>
          </div>
        </div>
        <div className={`${styles.menuSection} ${styles.toggle}`}>
          <Toggle
            title="Show video feed"
            checked={videoActive}
            onChange={() => setVideoActive(!videoActive)}
          />
        </div>
        <div className={`${styles.menuSection} ${styles.toggle}`}>
          <Toggle
            title="Microphone"
            checked={audioActive}
            onChange={() => setAudioActive(!audioActive)}
          />
        </div>
        <div className={`${styles.menuSection} ${styles.toggle}`}>
          <Toggle
            title="Text only"
            checked={textOnly}
            onChange={() => {
              setTextOnly(!textOnly);

              if (!textOnly) {
                setDevModeActive(false);
                setAudioActive(false);
                setVideoActive(false);
                setChatEnabled(true);
              }

              setTimeout(() => {
                window.location.reload();
              }, 0);
            }}
          />
        </div>
        <div className={`${styles.menuSection} ${styles.toggle}`}>
          <Toggle
            title="Use Orbits"
            checked={orbitsActive}
            onChange={() => setOrbitsActive(!orbitsActive)}
          />
        </div>
        <div className={`${styles.menuSection} ${styles.toggle}`}>
          <Toggle
            title="Backend connection"
            checked={connected}
            onChange={connected ? disconnect : connect}
          />
        </div>
        <div className={`${styles.menuSection} ${styles.toggle}`}>
          <Toggle
            title="Show Chat"
            checked={chatEnabled}
            onChange={() => setChatEnabled(!chatEnabled)}
          />
        </div>
        <div className={`${styles.menuSection} ${styles.toggle}`}>
          <Toggle
            title="Developer mode"
            disabled={textOnly}
            checked={devModeActive}
            onChange={() => setDevModeActive(!devModeActive)}
          />
        </div>
        <div
          className={`${styles.menuSection} ${styles.toggle} ${styles.serverOptions}`}>
          <Toggle
            title="Server Options"
            checked={serverOptions}
            onChange={() => setServerOptions(!serverOptions)}
          />
          {serverOptions && (
            <>
              <div className={styles.protocol}>
                <span>Protocol</span>
                <input
                  type="text"
                  defaultValue={protocol}
                  onChange={event => setProtocol(event.currentTarget.value)}
                />
              </div>
              <div className={styles.host}>
                <span>Host</span>
                <input
                  type="text"
                  defaultValue={host}
                  onChange={event => setHost(event.currentTarget.value)}
                />
              </div>
              <div className={styles.serverUrl}>
                <span>Server Url</span>
                <input disabled type="text" value={`${protocol}://${host}/`} />
              </div>
              <div className={styles.userId}>
                <span>User ID</span>
                <input
                  type="text"
                  defaultValue={userId}
                  onChange={event => setUserId(event.currentTarget.value)}
                />
              </div>
            </>
          )}
        </div>
        <div className={`${styles.menuSection} ${styles.fullWidthButton}`}>
          <button onClick={() => window.location.reload()}>
            <span className={`material-icons ${styles.resetIcon}`}>
              restart_alt
            </span>
            <span>Reset</span>
          </button>
        </div>

        {snippetButtons && <ConveniencePanel />}
      </div>
    </div>
  );
}

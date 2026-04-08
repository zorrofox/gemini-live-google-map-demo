import {useRef} from 'react';
import {useLiveAPIContext} from '../../contexts/LiveAPIContext';
import styles from './chat.module.css';

interface Props {
  className?: string;
}

export default function Chat(props: Props) {
  const {className} = props;
  const {connected, client} = useLiveAPIContext();

  const inputFieldRef = useRef<HTMLInputElement>(null);

  const sendText = (text: string) => {
    if (connected) {
      client.send([{text}]);
    }
  };

  return (
    <div className={`${styles.container} ${className ? className : ''}`}>
      <span className="material-symbols-outlined">keyboard</span>

      <span>Type here</span>
      <input
        onKeyDown={event => {
          if (event.key === 'Enter') {
            if (inputFieldRef.current) {
              sendText(inputFieldRef.current.value);
              inputFieldRef.current.value = '';
            }
          }
        }}
        ref={inputFieldRef}
        type="text"
      />
      <button
        onClick={() => {
          if (inputFieldRef.current) {
            sendText(inputFieldRef.current.value);
            inputFieldRef.current.value = '';
          }
        }}>
        <span className="material-symbols-outlined">send</span>
      </button>
    </div>
  );
}

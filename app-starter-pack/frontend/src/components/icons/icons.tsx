type IconProps = React.SVGProps<SVGSVGElement>;

export function MicIcon(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}>
      <path
        fill="currentColor"
        d="M12 14q-1.25 0-2.125-.875T9 11V5q0-1.25.875-2.125T12 2t2.125.875T15 5v6q0 1.25-.875 2.125T12 14m-1 7v-3.075q-2.6-.35-4.3-2.325T5 11h2q0 2.075 1.463 3.538T12 16t3.538-1.463T17 11h2q0 2.625-1.7 4.6T13 17.925V21zm1-9q.425 0 .713-.288T13 11V5q0-.425-.288-.712T12 4t-.712.288T11 5v6q0 .425.288.713T12 12"></path>
    </svg>
  );
}

export function AudioIcon({
  volume = 0,
  ...props
}: {volume?: number} & IconProps) {
  // Calculate heights based on volume with a threshold for "speaking"
  const minHeight = 6;
  const maxAdditionalHeight = 14;
  const speakingThreshold = 0.01; // Threshold to determine if someone is speaking
  const isSpeaking = volume > speakingThreshold;

  // Create 3 different heights for visualization
  const leftHeight =
    minHeight + (isSpeaking ? Math.min(volume * 100, maxAdditionalHeight) : 0);
  const middleHeight =
    minHeight + (isSpeaking ? Math.min(volume * 200, maxAdditionalHeight) : 0);
  const rightHeight =
    minHeight + (isSpeaking ? Math.min(volume * 100, maxAdditionalHeight) : 0);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="33"
      height="32"
      viewBox="0 0 33 32"
      fill="none"
      className={isSpeaking ? 'speaking' : ''}
      {...props}>
      <g className="audio-visualizer">
        {/* Left bar */}
        <rect
          x="5.55"
          y={16 - leftHeight / 2}
          width="5.3"
          height={leftHeight}
          rx="2.5"
          fill="#8AB4F8"
          className={`audio-bar ${isSpeaking ? 'speaking' : ''}`}
        />

        {/* Middle bar */}
        <rect
          x="13.35"
          y={16 - middleHeight / 2}
          width="5.3"
          height={middleHeight}
          rx="2.5"
          fill="#8AB4F8"
          className={`audio-bar ${isSpeaking ? 'speaking' : ''}`}
        />

        {/* Right bar */}
        <rect
          x="21.15"
          y={16 - rightHeight / 2}
          width="5.3"
          height={rightHeight}
          rx="2.5"
          fill="#8AB4F8"
          className={`audio-bar ${isSpeaking ? 'speaking' : ''}`}
        />
      </g>
    </svg>
  );
}

export function SunnyIcon(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="29"
      height="28"
      viewBox="0 0 29 28"
      fill="none"
      {...props}>
      <g clipPath="url(#clip0_311_31855)">
        <path
          d="M14.5 26.25C21.2655 26.25 26.75 20.7655 26.75 14C26.75 7.23451 21.2655 1.75 14.5 1.75C7.73451 1.75 2.25 7.23451 2.25 14C2.25 20.7655 7.73451 26.25 14.5 26.25Z"
          fill="url(#paint0_linear_311_31855)"
        />
        <path
          opacity="0.75"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M15.4842 1.82443L16.8799 1.11305C17.9649 0.559179 19.2765 1.00368 19.8426 2.1158L20.5706 3.54643C20.7252 3.85651 20.9494 4.12667 21.2256 4.33582C21.5019 4.54498 21.8227 4.68747 22.1631 4.75218L23.6926 5.03218C24.8826 5.24918 25.6937 6.41205 25.524 7.65893L25.3061 9.26193C25.2576 9.61195 25.287 9.96838 25.3923 10.3057C25.4975 10.643 25.6761 10.9529 25.9151 11.2132L26.9949 12.3769C27.4001 12.8204 27.6247 13.3994 27.6247 14.0001C27.6247 14.6007 27.4001 15.1797 26.9949 15.6232L25.9151 16.7869C25.6761 17.0472 25.4975 17.3571 25.3923 17.6944C25.287 18.0317 25.2576 18.3882 25.3061 18.7382L25.5249 20.3412C25.6937 21.5881 24.8826 22.7509 23.6926 22.9679L22.1631 23.2479C21.8227 23.3126 21.5019 23.4551 21.2256 23.6643C20.9494 23.8734 20.7252 24.1436 20.5706 24.4537L19.8426 25.8843C19.2765 26.9964 17.9657 27.4409 16.8799 26.8871L15.4842 26.1766C15.1796 26.0204 14.8422 25.939 14.4999 25.939C14.1576 25.939 13.8201 26.0204 13.5155 26.1766L12.1199 26.8871C11.0349 27.4409 9.72412 26.9964 9.15712 25.8843L8.42913 24.4537C8.27446 24.1436 8.05027 23.8735 7.77404 23.6644C7.4978 23.4552 7.177 23.3127 6.83663 23.2479L5.30713 22.9679C4.11713 22.7509 3.30688 21.5881 3.47575 20.3412L3.69363 18.7382C3.74224 18.3882 3.71294 18.0318 3.60781 17.6945C3.50269 17.3572 3.32433 17.0473 3.0855 16.7869L2.00488 15.6232C1.59968 15.1797 1.375 14.6007 1.375 14.0001C1.375 13.3994 1.59968 12.8204 2.00488 12.3769L3.0855 11.2132C3.32438 10.9528 3.50277 10.6429 3.6079 10.3056C3.71303 9.96828 3.7423 9.61189 3.69363 9.26193L3.47488 7.65893C3.30688 6.41205 4.11713 5.24918 5.30713 5.03218L6.8375 4.75218C7.17789 4.68747 7.49873 4.54498 7.77497 4.33582C8.05121 4.12667 8.27539 3.85651 8.43 3.54643L9.15712 2.1158C9.72412 1.00368 11.0349 0.560054 12.1199 1.11305L13.5164 1.82443C14.1367 2.13943 14.8639 2.13943 15.4842 1.82443Z"
          stroke="#FBBC04"
        />
      </g>
      <defs>
        <linearGradient
          id="paint0_linear_311_31855"
          x1="2.25"
          y1="1.75"
          x2="2452.25"
          y2="2451.75"
          gradientUnits="userSpaceOnUse">
          <stop stopColor="#FCD35C" />
          <stop offset="1" stopColor="#FBBC04" />
        </linearGradient>
        <clipPath id="clip0_311_31855">
          <rect
            width="28"
            height="28"
            fill="white"
            transform="translate(0.5)"
          />
        </clipPath>
      </defs>
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      {...props}>
      <path
        d="M5 30V26.6667H35V30H5ZM5 21.6667V18.3333H35V21.6667H5ZM5 13.3333V10H35V13.3333H5Z"
        fill="#DADCE0"
      />
    </svg>
  );
}

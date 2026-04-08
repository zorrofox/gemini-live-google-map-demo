import {useEffect, useMemo, useReducer, useState} from 'react';

import './ai-voice-visualizer.css';

const NUM_SUBDIV = 360;
const FFT_SIZE = 64;
const FFT_BIN_COUNT = FFT_SIZE / 2;

const TWO_PI = Math.PI * 2;

type Wave = {
  amp: number;
  freq: number;
  phase?: number;
};

type WaveformDescription = {
  offset: number;
  components: Wave[];
  amplitudeMod?: (theta: number) => number;
};

export type WaveformType = 'sine' | 'square' | 'triangle';

type AudioVisualizerProps = {
  source?: AudioNode;
  waveform?: WaveformType;
  className?: string;
  width?: number;
  height?: number;
};

export function AiVoiceVisualizer(props: AudioVisualizerProps) {
  const fftData = useFFTData(props.source);
  const waveforms = createWaveformDescriptions(fftData);

  const paths = waveforms.map((waveformDesc, i) => (
    <path
      d={computePath(props.waveform ?? 'sine', waveformDesc)}
      key={i}
      className={'path-' + i}
    />
  ));

  return (
    <svg
      className={`audio-vis ${props.className ?? ''}`}
      viewBox={'-2 -2 4 4'}
      width={props.width}
      height={props.height}>
      {paths.reverse()}
    </svg>
  );
}

/**
 * A custom hook that processes an audio source using FFT (Fast Fourier Transform) and
 * returns frequency data as a Uint8Array. This will internally run an animation loop and force re-rendering
 * of the component calling this.
 */
function useFFTData(source?: AudioNode) {
  const [analyzer, setAnalyzer] = useState<AnalyserNode>();
  const forceRender = useForceRender();
  const frequencyData = useMemo(() => new Uint8Array(FFT_BIN_COUNT), []);

  useEffect(() => {
    if (!source) return;

    const analyzer = source.context.createAnalyser();
    analyzer.fftSize = FFT_SIZE;
    analyzer.smoothingTimeConstant = 0.85;

    source.connect(analyzer);
    setAnalyzer(analyzer);

    return () => {
      source.disconnect(analyzer);
    };
  }, [source]);

  useEffect(() => {
    if (!analyzer) return;

    let rafId = requestAnimationFrame(function __loop() {
      rafId = requestAnimationFrame(__loop);

      analyzer.getByteFrequencyData(frequencyData); // Access directly
      forceRender();
    });

    return () => cancelAnimationFrame(rafId);
  }, [analyzer]);

  return frequencyData;
}

function useForceRender(): () => void {
  const [, forceRender] = useReducer(x => x + 1, 0);
  return forceRender;
}

/**
 * Creates and returns an array of waveform descriptions based on the provided FFT data.
 */
function createWaveformDescriptions(fftData: Uint8Array) {
  const t = performance.now();

  return [
    // high-frequency sensitive
    {
      offset: 0.99,
      components: [
        {amp: 0.02, freq: 2, phase: t / 1000},
        {amp: 0.1 * (fftData[18] / 255), freq: 7, phase: t / 1700},
        {amp: 0.15 * (fftData[20] / 255), freq: 13, phase: t / 1100},
        {amp: 0.25 * (fftData[28] / 255), freq: 17, phase: t / 1500}
      ]
    },

    // low-frequency sensitive
    {
      offset: 1.01,
      components: [
        {amp: 0.02, freq: 3, phase: -t / 1000},
        {amp: 0.15 * (fftData[4] / 255), freq: 7, phase: t / 2300},
        {amp: 0.1 * (fftData[2] / 255), freq: 5, phase: -t / 300}
      ]
    },

    // background-waves
    {
      offset: 1,
      components: [
        {amp: 0.15, freq: 21},
        {amp: 0.05, freq: 27, phase: t / 1500}
      ],
      amplitudeMod: (theta: number) =>
        Math.sin(2 * (theta + t / 1300)) * 0.5 + 0.5
    },

    {
      offset: 1,
      components: [
        {amp: 0.07, freq: 27, phase: -t / 7000},
        {amp: 0.01, freq: 31, phase: t / 11000}
      ]
    }
  ];
}

/**
 * Creates a wave function based on the specified waveform type and description parameters.
 *
 * @return a function that takes an angle and returns the computed waveform value.
 */
function createWaveFunction(
  waveformType: WaveformType,
  {components, offset, amplitudeMod}: WaveformDescription
) {
  const waveFunctions = components.map(
    ({amp, freq, phase = 0}) =>
      (theta: number) => {
        let number = Math.sin(freq * theta + phase);

        if (waveformType === 'square') {
          number = Math.sign(number);
        } else if (waveformType === 'triangle') {
          number = Math.asin(number);
        }

        return amp * (freq ? number : 1);
      }
  );

  return (theta: number) =>
    offset +
    (amplitudeMod ? amplitudeMod(theta) : 1) *
      waveFunctions.reduce((sum, fn) => sum + fn(theta), 0);
}

/**
 * Computes the SVG path definition for a given waveform type and description.
 */
function computePath(
  type: WaveformType,
  waveform: WaveformDescription
): string {
  const waveFunction = createWaveFunction(type, waveform);

  const thetaStep = TWO_PI / NUM_SUBDIV;
  let s = '';
  for (let i = 0; i < NUM_SUBDIV; i++) {
    const theta = i * thetaStep;
    const r = waveFunction(theta);

    s +=
      (i === 0 ? 'M' : 'L') +
      (r * Math.cos(theta)).toFixed(5) +
      ',' +
      (r * Math.sin(theta)).toFixed(5);
  }

  return s + 'z';
}

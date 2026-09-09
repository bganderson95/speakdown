/**
 * VoiceLine.tsx — the quiet voice visualization.
 *
 * A seismograph at rest, not a spectrum analyser. At rest it is a single
 * hairline; while listening the line displaces with the microphone's loudness
 * and drifts leftward. The line coming alive IS the "I am listening" signal, so
 * there is no separate pulsing indicator to compete with it.
 *
 * The component takes a plain amplitude number (0..1) and nothing else, so any
 * source can drive it. Today that is the RMS of the audio already being
 * streamed to AssemblyAI.
 */

import { useEffect, useRef } from "react";

/**
 * Samples held on screen. At ~50 ms per chunk this is about four seconds.
 *
 * The meter is deliberately small and sits beside the button, so fewer, wider
 * samples read as a wave rather than as noise.
 */
const SAMPLE_COUNT = 80;

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 48;
const MID = VIEW_HEIGHT / 2;

/** How much of the half-height the loudest sample is allowed to reach. */
const MAX_DISPLACEMENT = MID * 0.82;

interface VoiceLineProps {
  /** Latest microphone loudness, 0..1. Ignored while not listening. */
  amplitude: number;
  listening: boolean;
}

/**
 * Builds the polyline.
 *
 * The trace is mirrored around the centre so it reads as a waveform rather than
 * a bar chart, and the newest sample is at the right edge — the direction the
 * text is being written in.
 */
function buildPath(samples: readonly number[]): string {
  const step = VIEW_WIDTH / (SAMPLE_COUNT - 1);

  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i < samples.length; i++) {
    const x = (i * step).toFixed(1);
    const displacement = (samples[i] ?? 0) * MAX_DISPLACEMENT;
    top.push(`${x},${(MID - displacement).toFixed(1)}`);
    bottom.push(`${x},${(MID + displacement).toFixed(1)}`);
  }

  // Down the top edge, back along the bottom: one continuous stroke.
  return `M${top.join(" L")} L${bottom.reverse().join(" L")}`;
}

export function VoiceLine({ amplitude, listening }: VoiceLineProps) {
  const pathRef = useRef<SVGPathElement | null>(null);
  const samplesRef = useRef<number[]>(new Array<number>(SAMPLE_COUNT).fill(0));

  // The trace is written straight to the DOM rather than through state: this
  // updates twenty times a second and re-rendering React that often to move one
  // path would be wasteful.
  useEffect(() => {
    const samples = samplesRef.current;
    samples.shift();

    // A little smoothing, so the line breathes instead of flickering.
    const previous = samples[samples.length - 1] ?? 0;
    const next = listening ? Math.max(amplitude, previous * 0.72) : 0;
    samples.push(next);

    pathRef.current?.setAttribute("d", buildPath(samples));
  }, [amplitude, listening]);

  // Settle back to the resting hairline when listening stops.
  useEffect(() => {
    if (listening) {
      return;
    }
    samplesRef.current = new Array<number>(SAMPLE_COUNT).fill(0);
    pathRef.current?.setAttribute("d", buildPath(samplesRef.current));
  }, [listening]);

  return (
    <svg
      className={listening ? "voice-line voice-line-live" : "voice-line"}
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {/*
        End ticks. Without them the resting baseline reads as just another
        horizontal rule; with them it reads as a meter with a scale.
      */}
      <line className="voice-line-tick" x1="0.5" y1={MID - 6} x2="0.5" y2={MID + 6} />
      <line
        className="voice-line-tick"
        x1={VIEW_WIDTH - 0.5}
        y1={MID - 6}
        x2={VIEW_WIDTH - 0.5}
        y2={MID + 6}
      />

      {/* The dormant baseline. Always present, so the rail is never empty. */}
      <line className="voice-line-rest" x1="0" y1={MID} x2={VIEW_WIDTH} y2={MID} />
      <path ref={pathRef} className="voice-line-trace" d={buildPath(samplesRef.current)} />
    </svg>
  );
}

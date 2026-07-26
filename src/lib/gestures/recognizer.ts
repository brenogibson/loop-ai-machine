import {
  FilesetResolver,
  GestureRecognizer,
  type GestureRecognizerResult,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

// Local assets (committed) so the event demo never depends on a CDN.
const WASM_PATH = "/mediapipe-wasm";
const MODEL_PATH = "/models/gesture_recognizer.task";

// Per-frame reading distilled from MediaPipe output. A single symmetric
// two-hand signal on purpose: per-hand left/right identities flip constantly
// in MediaPipe, which made asymmetric controls (filter on one hand, reverb on
// two) swap mid-gesture. "Both hands up" doesn't care which hand is which.
export type GestureFrame = {
  // Both hands visible AND both wrists in the upper part of the frame
  // (debounced with a frame streak so momentary jitter doesn't flicker it).
  handsUp: boolean;
  // Raw landmarks per hand, for drawing the skeleton overlay.
  hands: NormalizedLandmark[][];
};

export type GestureTracker = {
  stop: () => void;
};

// Wrists above this fraction of the frame height count as "up" (y grows
// downward, so smaller y = higher). 0.45 ≈ raised to shoulder level or above.
const HANDS_UP_Y = 0.45;
const HANDS_UP_ON_FRAMES = 4; // streak needed to flip the state (anti-jitter)

export async function startGestureTracker(
  video: HTMLVideoElement,
  onFrame: (frame: GestureFrame) => void,
): Promise<GestureTracker> {
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
  const recognizer = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
  });

  let raf = 0;
  let stopped = false;
  let lastVideoTime = -1;

  // Debounce state across frames.
  let handsUp = false;
  let streak = 0;

  const process = (result: GestureRecognizerResult): GestureFrame => {
    const hands = result.landmarks ?? [];

    // Both wrists (landmark 0) above the threshold line. Symmetric: it doesn't
    // matter which hand MediaPipe labels as left/right.
    const isUpNow =
      hands.length >= 2 && hands.every((hand) => hand[0].y < HANDS_UP_Y);
    if (isUpNow !== handsUp) {
      streak++;
      if (streak >= HANDS_UP_ON_FRAMES) {
        handsUp = isUpNow;
        streak = 0;
      }
    } else {
      streak = 0;
    }

    return { handsUp, hands };
  };

  const loop = () => {
    if (stopped) return;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const result = recognizer.recognizeForVideo(video, performance.now());
      onFrame(process(result));
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      recognizer.close();
    },
  };
}

// Hand skeleton edges (MediaPipe hand topology) for the preview overlay.
export const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [5, 9], [9, 10], [10, 11], [11, 12], // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [17, 18], [18, 19], [19, 20], // pinky
  [0, 17], // palm base
];

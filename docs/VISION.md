# Vision Module

## Pipeline

```
source frame ─▶ MediaPipe Hands ─▶ 21 landmarks (normalized 0..1)
            ─▶ handedness (Left/Right) ─▶ finger states (5 booleans)
            ─▶ finger count ─▶ palm bounding box ─▶ confidence
frame + overlays ─▶ JPEG base64 ─▶ /ws/video
detection JSON ─▶ gesture engine ─▶ mapping ─▶ hardware
```

## Camera modes

- **Camera** — opens `cv2.VideoCapture(EMPIRE_CAMERA_INDEX)` at `EMPIRE_VISION_WIDTH×HEIGHT`,
  runs inference at up to `EMPIRE_INFERENCE_FPS`.
- **Simulation** — when no camera is available (or `/api/vision/simulation`), Empire renders a
  labelled **SIMULATION** virtual hand and a selectable simulated gesture. This lets the whole
  pipeline (detection → gesture → hardware) be demoed without a webcam. The UI always shows
  `SIMULATION` so it can't be mistaken for a real feed.

## API

| Endpoint | Description |
|---|---|
| `GET /api/vision/state` | mode, running, fps, latency, result |
| `POST /api/vision/start` / `stop` | start/stop the loop |
| `POST /api/vision/camera/{index}` | switch camera index |
| `POST /api/vision/simulation` | force simulation mode |
| `POST /api/vision/sim/gesture` | `{gesture: "THREE_FINGERS"}` drives the virtual hand |
| `POST /api/vision/detection` | `{enabled: bool}` toggle hand tracking |
| `POST /api/vision/overlays` | `{landmarks?, bbox?, ar?, threshold?}` overlay + confidence controls |
| `POST /api/vision/reset` | reset engine stability state |

## WebSocket `/ws/video`

Frames at `EMPIRE_STREAM_FPS` (default 15):

```json
{
  "type": "frame",
  "jpeg": "<base64>",
  "detection": {
    "handedness": "Right", "gesture": "THREE_FINGERS", "finger_count": 3,
    "fingers": [true,false,false,true,true], "confidence": 0.97,
    "stable": true, "engine": {...}, "landmarks": [[x,y], ...21]
  },
  "mode": "simulation",
  "fps": 14.2
}
```

## Frontend overlay

The Vision Lab draws landmarks/bbox directly from the JSON `landmarks` array on an SVG overlay
(rendered against the 640×480 frame coordinate space), so overlays stay crisp regardless of the
displayed image size.
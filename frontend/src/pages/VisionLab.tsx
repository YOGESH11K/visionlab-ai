import React from "react";
import { VideoFeed } from "../components/VideoFeed";

export function VisionLab() {
  return (
    <div className="flex h-full flex-col gap-3">
      <VideoFeed height={420} />
    </div>
  );
}
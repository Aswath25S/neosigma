import type { Metadata } from "next";
import { TryView } from "./TryView";

export const metadata: Metadata = { title: "Try a posting" };

export default function TryPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
      <div className="pt-14 pb-10 max-w-[900px]">
        <div className="label mb-4">Live demo</div>
        <h1 className="h-page !text-[clamp(32px,5vw,44px)]">Paste a posting</h1>
        <p className="mt-4 text-body">
          Runs the same title check, duty extraction, gates and scoring as the pipeline, and returns the full evidence page.
          Nothing you paste is stored or logged.
        </p>
      </div>
      <TryView />
    </div>
  );
}

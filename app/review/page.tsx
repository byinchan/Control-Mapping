import type { Metadata } from "next";
import { Suspense } from "react";
import { ReviewScreen } from "../components/ReviewScreen.tsx";

export const metadata: Metadata = { title: "Review and confirm · Control Mapping" };

export default function ReviewPage() {
  // ReviewScreen reads ?focus= from the URL, which needs a Suspense boundary.
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <ReviewScreen />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { SampleChecklist } from "../components/SampleChecklist.tsx";

export const metadata: Metadata = { title: "Choose sample controls · Control Mapping" };

export default function SamplesPage() {
  return <SampleChecklist />;
}

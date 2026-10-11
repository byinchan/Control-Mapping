import type { Metadata } from "next";
import { ReportScreen } from "../components/ReportScreen.tsx";

export const metadata: Metadata = { title: "Executive report · Control Mapping" };

export default function ReportPage() {
  return <ReportScreen />;
}

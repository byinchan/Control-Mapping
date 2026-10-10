import type { Metadata } from "next";
import { MatrixScreen } from "../components/MatrixScreen.tsx";

export const metadata: Metadata = { title: "Matrix and gaps · Control Mapping" };

export default function MatrixPage() {
  return <MatrixScreen />;
}

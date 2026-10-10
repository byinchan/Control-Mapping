import type { Metadata } from "next";
import { NewControl } from "../components/NewControl.tsx";

export const metadata: Metadata = { title: "Enter your own control · Control Mapping" };

export default function NewControlPage() {
  return <NewControl />;
}

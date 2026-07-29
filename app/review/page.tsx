import type { Metadata } from "next";
import { PrototypeApp } from "../prototype";

export const metadata: Metadata = {
  title: "AI 설계검토 | LH Review Copilot",
};

export default function ReviewPage() {
  return <PrototypeApp mode="review" />;
}

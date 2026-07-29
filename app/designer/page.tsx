import type { Metadata } from "next";
import { PrototypeApp } from "../prototype";

export const metadata: Metadata = {
  title: "설계사 답변 | LH Review Copilot",
};

export default function DesignerPage() {
  return <PrototypeApp mode="designer" />;
}

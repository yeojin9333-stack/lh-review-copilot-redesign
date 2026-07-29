import type { Metadata } from "next";
import { PrototypeApp } from "../prototype";

export const metadata: Metadata = {
  title: "검토·반영 | LH Review Copilot",
};

export default function DecisionPage() {
  return <PrototypeApp mode="decision" />;
}

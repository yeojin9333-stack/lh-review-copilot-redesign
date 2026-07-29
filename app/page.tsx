import type { Metadata } from "next";
import { PrototypeApp } from "./prototype";

export const metadata: Metadata = {
  title: "프로젝트 대시보드 | LH Review Copilot",
  description: "AI 설계검토에서 최종 반영까지 연결하는 LH 의사결정 지원 프로토타입",
};

export default function Home() {
  return <PrototypeApp mode="dashboard" />;
}

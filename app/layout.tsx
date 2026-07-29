import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description =
    "공공주택 설계검토의 근거, 전문가 판단, 설계사 답변, LH 최종 반영을 연결하는 프로토타입";

  return {
    title: "LH Review Copilot",
    description,
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "LH Review Copilot",
      description,
      type: "website",
      url: origin,
      images: [
        {
          url: `${origin}/og-v8.png`,
          width: 1672,
          height: 941,
          alt: "LH Review Copilot — 공동주택 단지 BIM에서 램프 설계검토까지",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "LH Review Copilot",
      description,
      images: [`${origin}/og-v8.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

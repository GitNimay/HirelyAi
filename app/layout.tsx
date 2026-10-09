import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Caveat, Geist, Geist_Mono, Newsreader } from "next/font/google";
import { cookies } from "next/headers";
import { preconnect } from "react-dom";
import { Analytics } from "@/components/analytics";
import { Feedback } from "@/components/kit";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Serif for large headings only (`font-display`); small UI headings stay Geist
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
});

// Handwritten notes in the product tour (`font-hand`). Only the tour uses it, so it isn't preloaded
const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Hire Excellence",
  description: "Connect, hire and grow",
  metadataBase: new URL("https://hire-excellence.n1m35h.in"),
  // 1200x630 JPG under 300 KB: WhatsApp drops larger or webp previews
  openGraph: { title: "Hire Excellence", description: "Connect, hire and grow", type: "website", siteName: "Hire Excellence", images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Hire Excellence feed" }] },
  twitter: { card: "summary_large_image", images: ["/og.jpg"] },
  icons: {
    icon: [
      { url: "/logo-light.png", media: "(prefers-color-scheme: light)" },
      { url: "/logo-dark.png", media: "(prefers-color-scheme: dark)" },
    ],
  },
};

// viewportFit cover lets env(safe-area-inset-*) report the iPhone notch and home indicator
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// The publishable key encodes the Frontend API host ("pk_live_" + base64("clerk.example.com$")). Warming that
// connection early lets clerk-js and the first sign-in call skip DNS + TLS, so the social buttons appear sooner.
const fapi = atob(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.split("_")[2] ?? "").replace(/\$$/, "");

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Saved by the account menu / theme toggle. No cookie = light; "system" = follow the OS, see globals.css
  if (fapi) {
    preconnect(`https://${fapi}`); // credentialed FAPI calls
    preconnect(`https://${fapi}`, { crossOrigin: "anonymous" }); // the clerk-js script
  }
  const theme = (await cookies()).get("theme")?.value ?? "light";
  return (
    <html
      lang="en"
      data-theme={theme === "light" || theme === "dark" ? theme : undefined}
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          {children}
          <Feedback />
          <Analytics />
        </ClerkProvider>
      </body>
    </html>
  );
}
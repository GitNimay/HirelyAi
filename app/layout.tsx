import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { cookies } from "next/headers";
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

export const metadata: Metadata = {
  title: "Hire Excellence",
  description: "Connect, hire and grow",
  icons: {
    icon: [
      { url: "/logo-light.png", media: "(prefers-color-scheme: light)" },
      { url: "/logo-dark.png", media: "(prefers-color-scheme: dark)" },
    ],
  },
};

// viewportFit cover lets env(safe-area-inset-*) report the iPhone notch and home indicator
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Saved by the account menu / theme toggle. No cookie = light; "system" = follow the OS, see globals.css
  const theme = (await cookies()).get("theme")?.value ?? "light";
  return (
    <html
      lang="en"
      data-theme={theme === "light" || theme === "dark" ? theme : undefined}
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
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
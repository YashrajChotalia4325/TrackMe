import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: "variable", display: "swap" });
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "TrackMe", template: "%s · TrackMe" },
  description: "Build yourself, one day at a time.",
};

export const viewport: Viewport = {
  // The app defaults to the light theme regardless of OS setting, so the browser bar matches paper.
  themeColor: "#FFFDF5",
};

const surfaceToast = "bg-card! text-foreground!";
const blockToast = "on-block text-[#111111]!";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${bricolage.variable} ${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster
            theme="light"
            position="bottom-right"
            closeButton
            toastOptions={{
              classNames: {
                toast: "font-sans! gap-2.5! rounded-[10px]! border-2! border-ink! shadow-brutal! px-4! py-3!",
                default: surfaceToast,
                loading: surfaceToast,
                title: "font-semibold! text-sm!",
                description: "text-current! opacity-80",
                icon: "text-current!",
                closeButton: "border-2! border-ink! bg-card! text-foreground! shadow-brutal-sm! hover:bg-muted!",
                actionButton: "rounded-[8px]! border-2! border-ink! bg-primary! text-primary-foreground! font-semibold! shadow-brutal-sm!",
                cancelButton: "rounded-[8px]! border-2! border-ink! bg-card! text-foreground! font-semibold!",
                success: `bg-block-lime! ${blockToast}`,
                error: `bg-block-danger! ${blockToast}`,
                warning: `bg-block-sun! ${blockToast}`,
                info: `bg-block-sky! ${blockToast}`,
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}

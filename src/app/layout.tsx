import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Montserrat } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import site from "../../config/site.json";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-montserrat" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: { default: site.name, template: `%s · ${site.name}` },
  description: "Find the teams doing NeoSigma's work by hand.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${montserrat.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen flex flex-col overflow-x-hidden">
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

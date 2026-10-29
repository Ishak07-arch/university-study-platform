import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Folio — A little progress, every day.",
  description:
    "Your university study companion. Know what’s next, practise with purpose, and make a little progress every day.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.dataset.theme=localStorage.getItem('folio-theme')||'light'}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

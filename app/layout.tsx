import "./globals.css";
import "./decoder.css";

export const metadata = { title: "uCable" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}

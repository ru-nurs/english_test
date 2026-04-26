import "./globals.css";
import NavBar from "@/components/NavBar";

export const metadata = {
  title: "SpeakEasy | OGE/EGE",
  description: "Подготовка к устной части ОГЭ и ЕГЭ по английскому языку",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full">
        <div className="app-shell">
          <NavBar />
          <div className="app-content">{children}</div>
        </div>
      </body>
    </html>
  );
}

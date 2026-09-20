import type { ThemeMode } from "./theme";

export type AppOutletContext = {
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
};

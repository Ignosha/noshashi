import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { useSetting } from "./store";

/**
 * Appearance and accessibility preferences.
 *
 * Everything here is a real user need rather than a decoration toggle:
 * an inverted theme for light environments and low-vision users who find
 * dark-on-light easier, a high-contrast mode, a text scale for anyone who
 * needs larger type without an OS-wide zoom, and an explicit motion
 * control for vestibular sensitivity that does not require changing a
 * system setting.
 */

export type ThemeMode = "dark" | "light" | "system";
export type MotionMode = "system" | "reduced" | "full";

type Appearance = {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  /** What is actually painted right now, after resolving "system". */
  resolvedTheme: "dark" | "light";
  highContrast: boolean;
  setHighContrast: (on: boolean) => void;
  textScale: number;
  setTextScale: (scale: number) => void;
  motion: MotionMode;
  setMotion: (mode: MotionMode) => void;
  /**
   * Wider letter spacing, taller lines and a heavier weight. Not a
   * "dyslexia font" — those are contested and this app cannot ship a
   * licensed one — but the typographic changes that independently help
   * most readers with dyslexia, and hurt nobody.
   */
  readableText: boolean;
  setReadableText: (on: boolean) => void;
  /** Underline every link, for anyone who cannot rely on colour alone. */
  underlineLinks: boolean;
  setUnderlineLinks: (on: boolean) => void;
  /** Enforce a 44px minimum hit area on every control. */
  largeTargets: boolean;
  setLargeTargets: (on: boolean) => void;
};

const AppearanceContext = createContext<Appearance | null>(null);

export const TEXT_SCALES = [
  { value: 1, label: "100%" },
  { value: 1.125, label: "112%" },
  { value: 1.25, label: "125%" },
  { value: 1.4, label: "140%" },
] as const;

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return true;
  return !window.matchMedia("(prefers-color-scheme: light)").matches;
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeSetting] = useSetting<ThemeMode>("appearance.theme", "dark");
  const [highContrast, setHighContrastSetting] = useSetting(
    "appearance.highContrast",
    false
  );
  const [textScale, setTextScaleSetting] = useSetting("appearance.textScale", 1);
  const [motion, setMotionSetting] = useSetting<MotionMode>(
    "appearance.motion",
    "system"
  );
  const [readableText, setReadableTextSetting] = useSetting(
    "appearance.readableText",
    false
  );
  const [underlineLinks, setUnderlineLinksSetting] = useSetting(
    "appearance.underlineLinks",
    false
  );
  const [largeTargets, setLargeTargetsSetting] = useSetting(
    "appearance.largeTargets",
    false
  );

  const resolvedTheme: "dark" | "light" =
    theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.classList.toggle("high-contrast", highContrast);
    root.classList.toggle("readable-text", readableText);
    root.classList.toggle("underline-links", underlineLinks);
    root.classList.toggle("large-targets", largeTargets);
    root.dataset.motion = motion;
    root.style.setProperty("--text-scale", String(textScale));
    // Lets form controls and scrollbars pick the right native styling.
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme, highContrast, textScale, motion, readableText, underlineLinks, largeTargets]);

  // Follow the OS when the operator has chosen to.
  useEffect(() => {
    if (theme !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      document.documentElement.classList.toggle("dark", !query.matches);
      document.documentElement.style.colorScheme = query.matches ? "light" : "dark";
    };
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [theme]);

  const setTheme = useCallback(
    (mode: ThemeMode) => setThemeSetting(mode),
    [setThemeSetting]
  );

  const value = useMemo<Appearance>(
    () => ({
      theme,
      setTheme,
      resolvedTheme,
      highContrast,
      setHighContrast: setHighContrastSetting,
      textScale,
      setTextScale: setTextScaleSetting,
      motion,
      setMotion: setMotionSetting,
      readableText,
      setReadableText: setReadableTextSetting,
      underlineLinks,
      setUnderlineLinks: setUnderlineLinksSetting,
      largeTargets,
      setLargeTargets: setLargeTargetsSetting,
    }),
    [
      theme,
      setTheme,
      resolvedTheme,
      highContrast,
      setHighContrastSetting,
      textScale,
      setTextScaleSetting,
      motion,
      setMotionSetting,
      readableText,
      setReadableTextSetting,
      underlineLinks,
      setUnderlineLinksSetting,
      largeTargets,
      setLargeTargetsSetting,
    ]
  );

  return (
    <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
  );
}

export function useAppearance(): Appearance {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error("useAppearance must be used inside <AppearanceProvider>");
  }
  return context;
}

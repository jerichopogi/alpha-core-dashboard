"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY as STORAGE_KEY } from "@/lib/theme";
import { Icon, type IconName } from "./icons";

type Choice = "system" | "light" | "dark";
const CHOICES: Array<{ key: Choice; label: string; icon: IconName }> = [
  { key: "system", label: "Follow device", icon: "monitor" },
  { key: "light", label: "Light", icon: "sun" },
  { key: "dark", label: "Dark", icon: "moon" },
];

function apply(choice: Choice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Storage can be blocked (private mode); the theme still applies for this visit.
  }
}

/** The choice lives on <html data-theme>; watching it keeps every switch on the page in step. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function currentChoice(): Choice {
  const theme = document.documentElement.dataset.theme;
  return theme === "light" || theme === "dark" ? theme : "system";
}

export function ThemeSwitch() {
  const choice = useSyncExternalStore(subscribe, currentChoice, () => "system" as Choice);

  return (
    <div className="tabs theme-switch" role="group" aria-label="Colour theme">
      {CHOICES.map((c) => (
        <button key={c.key} type="button" className="tab" aria-pressed={choice === c.key} title={c.label} aria-label={c.label}
          onClick={() => apply(c.key)}>
          <Icon name={c.icon} />
        </button>
      ))}
    </div>
  );
}

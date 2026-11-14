import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { AcademyPanel } from "./AcademyPanel";
import { Labs } from "./Labs";
import { useOnline } from "./useOnline";
import { isTauri } from "@/lib/env";
import { InstallHint } from "./InstallHint";
import { PracticeTest, RetentionSeed, SpacedReview } from "./Retention";
import { useLocal } from "./useLocal";
import { EMPTY_PROGRESS, LESSONS, parseProgress } from "@/lib/academy/academy";
import { ANALYST_CASES } from "@/lib/academy/analystCases";
import { ALL_LABS } from "./labCatalog";
import { StorageNotice } from "./StorageNotice";
import { UpdateNotice } from "./UpdateNotice";
import { ReleaseNotes } from "./ReleaseNotes";

type Route = {
  tab: "course" | "labs" | "review" | "practice";
  lesson?: string;
  lab?: string;
  caseId?: string;
};
function validRoute(raw: unknown): Route | null {
  const r = raw as Route;
  if (!r || !["course", "labs", "review", "practice"].includes(r.tab))
    return null;
  return {
    tab: r.tab,
    ...(LESSONS.some((l) => l.id === r.lesson) ? { lesson: r.lesson } : {}),
    ...(ALL_LABS.some((l) => l.id === r.lab) ? { lab: r.lab } : {}),
    ...(ANALYST_CASES.some((c) => c.id === r.caseId)
      ? { caseId: r.caseId }
      : {}),
  };
}
function initialRoute(): Route {
  const q = new URLSearchParams(location.search);
  if (q.has("lesson") && LESSONS.some((l) => l.id === q.get("lesson")))
    return { tab: "course", lesson: q.get("lesson")! };
  if (q.has("case") && ANALYST_CASES.some((c) => c.id === q.get("case")))
    return { tab: "labs", caseId: q.get("case")! };
  if (q.has("lab") && ALL_LABS.some((l) => l.id === q.get("lab")))
    return { tab: "labs", lab: q.get("lab")! };
  if (q.has("review")) return { tab: "review" };
  if (q.has("practice")) return { tab: "practice" };
  if (q.has("map")) return { tab: "course" };
  try {
    return (
      validRoute(
        JSON.parse(localStorage.getItem("academy.location.v1") ?? "null"),
      ) ?? { tab: "course" }
    );
  } catch {
    return { tab: "course" };
  }
}
export default function App() {
  const [route, setRoute] = useState<Route>(initialRoute);
  const online = useOnline();
  const [stored] = useLocal("academy.progress", EMPTY_PROGRESS);
  const progress = useMemo(
    () => parseProgress(JSON.stringify(stored)),
    [stored],
  );
  const a = progress.access;
  useEffect(() => {
    try {
      localStorage.setItem("academy.location.v1", JSON.stringify(route));
      if (route.lesson)
        localStorage.setItem(
          "academy.last-lesson",
          JSON.stringify(route.lesson),
        );
    } catch {
      /* Session only. */
    }
    const q = new URLSearchParams();
    if (route.lesson) q.set("lesson", route.lesson);
    else if (route.caseId) q.set("case", route.caseId);
    else if (route.lab) q.set("lab", route.lab);
    else if (route.tab === "review") q.set("review", "due");
    else if (route.tab === "practice") q.set("practice", "1");
    else if (route.tab === "course") q.set("map", "1");
    history.replaceState(null, "", location.pathname + (q.size ? "?" + q : ""));
  }, [route]);
  const openLab = (lab: string) => setRoute({ tab: "labs", lab });
  const plain = route.tab !== "course";
  return (
    <div className="academy-shell ledger-desktop safe-area flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#main"
        className="skip-link rounded bg-brand px-3 py-1.5 text-primary-foreground"
      >
        Skip to the lesson
      </a>
      <RetentionSeed />
      <header className="academy-header">
        <h1 className="academy-wordmark">
          <img
            src={`${import.meta.env.BASE_URL}brand/academy-wordmark.svg`}
            alt="Noshashi Academy"
            width="234"
            height="48"
          />
        </h1>
        <nav aria-label="Academy sections" className="academy-nav">
          {(
            [
              ["course", "Course map"],
              ["review", "Review due"],
              ["labs", "Labs"],
              ["practice", "Practice test"],
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              aria-current={route.tab === tab ? "page" : undefined}
              onClick={() => setRoute({ tab })}
              className={cn(
                "academy-nav-link",
                route.tab === tab && "academy-nav-link-active",
              )}
            >
              {label}
            </button>
          ))}
        </nav>
        <p className="academy-header-note">
          One idea. One next step.<span>Always free.</span>
        </p>
      </header>
      <InstallHint />
      <UpdateNotice />
      <StorageNotice />
      {!online && (
        <p role="status" className="learning-offline">
          Offline: recorded cases, lessons and locally cached questions remain
          usable. Fresh ledger readings need a connection.{" "}
          {isTauri
            ? "Desktop videos are bundled."
            : "Browser videos need a connection."}
        </p>
      )}
      <main
        id="main"
        className={cn(
          "academy-main",
          plain && "academy",
          plain && a.highContrast && "academy-contrast",
          plain && a.reduceMotion && "academy-still",
        )}
        style={
          plain
            ? {
                zoom: [1, 1.15, 1.3, 1.5][a.textSize],
                lineHeight: a.spacing ? 1.85 : undefined,
                fontFamily: a.legibleFont
                  ? "Atkinson Hyperlegible, sans-serif"
                  : undefined,
              }
            : undefined
        }
      >
        {route.tab === "course" && (
          <AcademyPanel
            key={route.lesson ?? "home"}
            initialLesson={route.lesson}
            onNavigate={(lesson) =>
              setRoute({ tab: "course", ...(lesson ? { lesson } : {}) })
            }
            onOpenLab={openLab}
            onReview={() => setRoute({ tab: "review" })}
            onPractice={() => setRoute({ tab: "practice" })}
            onCases={() => setRoute({ tab: "labs" })}
          />
        )}
        {route.tab === "labs" && (
          <Labs
            key={route.caseId ?? route.lab ?? "list"}
            openId={route.lab ?? null}
            caseId={route.caseId}
            onOpenCase={(caseId) => setRoute({ tab: "labs", caseId })}
            onClose={() => setRoute({ tab: "labs" })}
          />
        )}
        {route.tab === "review" && <SpacedReview />}
        {route.tab === "practice" && <PracticeTest />}
      </main>
      <ReleaseNotes />
      <footer className="academy-footer">
        <span>Noshashi Academy</span>
        <span>
          No account or wallet keys. Progress, reviews and certificates stay on
          this device.
        </span>
      </footer>
    </div>
  );
}

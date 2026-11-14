import catalogData from "../release-catalog.json";
import academyConfig from "../src-tauri/tauri.conf.json";
import productConfig from "../../src-tauri/tauri.conf.json";
import { CONTENT_VERSION, lessonTitle } from "@/lib/academy/retention";
type Entry = {
  id: number;
  tag: string;
  at: string;
  url: string;
  title: string;
  summary: string;
  assets: { name: string; url: string }[];
  lessons: string[];
  labs: string[];
  review: string;
  signing: string;
  compatibility: string;
  kind: string;
};
const catalog = catalogData as unknown as {
  product: Entry | null;
  academy: Entry | null;
  events: Entry[];
  checkedAt?: string;
};
export function ReleaseNotes() {
  return (
    <details className="learning-release">
      <summary>
        What changed in NOSHASHI · course &amp; workstation versions
      </summary>
      <p>
        Course content: <strong>{CONTENT_VERSION}</strong>. Academy source base:{" "}
        {academyConfig.version}. Training workstation source:{" "}
        {productConfig.version}. This branch’s content update is not a published
        desktop release.
      </p>
      <p>
        Release metadata last checked: {catalog.checkedAt ?? "unknown"}. Release
        notes below are display data, not teaching claims, approval, grading or
        a security assessment.
      </p>
      {catalog.academy ? (
        <>
          <h3>Published Academy: {catalog.academy.tag}</h3>
          <p>
            {catalog.academy.signing}. Compatibility:{" "}
            {catalog.academy.compatibility}.
          </p>
          <a
            href={catalog.academy.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Official Academy release ↗
          </a>
          <ul>
            {catalog.academy.assets.map((asset) => (
              <li key={asset.name}>
                <a href={asset.url}>{asset.name}</a>
              </li>
            ))}
          </ul>
          <p>
            Artifact presence verifies download availability only. No silent
            installation or native updater is configured; use the official
            release after reviewing its requirements.
          </p>
        </>
      ) : (
        <p>Published Academy downloads are not established by this catalog.</p>
      )}
      <h3>Release-linked learning updates</h3>
      {catalog.events.slice(0, 6).map((entry) => (
        <article key={entry.id}>
          <h4>
            <a href={entry.url} target="_blank" rel="noopener noreferrer">
              {entry.tag}
            </a>{" "}
            · {entry.at.slice(0, 10)}
          </h4>
          <p>{entry.review}</p>
          <p>{entry.summary}</p>
          {entry.lessons.length > 0 ? (
            <p>
              Candidate affected lessons:{" "}
              {entry.lessons.map((id) => (
                <a key={id} href={"?lesson=" + id}>
                  {lessonTitle(id)} ·{" "}
                </a>
              ))}
              . These mappings do not prove the released screens were tested.
            </p>
          ) : (
            <p>Affected lessons are not yet mapped.</p>
          )}
        </article>
      ))}
    </details>
  );
}

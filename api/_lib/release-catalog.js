// One release classification for every public surface. Publication is not runtime verification.
import { esc } from './html.js';
export const RELEASE_SOURCE = 'https://github.com/Ignosha/noshashi/releases';
export const isDesktopRelease = r => /^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(r?.tag || '');
export function desktopArtifacts(release) {
  const version = release?.tag?.slice(1);
  if (!isDesktopRelease(release)) return [];
  return (release.assets || []).filter(a => {
    if (!a || !new RegExp('(?:^|[_-])'+version.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=[_.-])').test(a.name || '') || !(a.size > 0) || !/\.(dmg|msi|exe|AppImage|deb|rpm)$/.test(a.name)) return false;
    try { const u=new URL(a.url); return u.protocol==='https:' && u.hostname==='github.com' && !u.username && !u.password && u.pathname.startsWith(`/Ignosha/noshashi/releases/download/${release.tag}/`); } catch { return false; }
  });
}
export function releaseCatalog(releases, { checkedAt = null, available = true } = {}) {
  const desktop=(available ? releases : []).filter(r=>isDesktopRelease(r)&&!r.draft&&Number.isFinite(Date.parse(r.at))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  const stable=desktop.filter(r=>!r.prerelease);
  return {schema:'noshashi.release-catalog.v1',source:RELEASE_SOURCE,checkedAt,available,
    publishedCount:desktop.length,
    latestPublished:desktop[0]||null,
    latestDownloadable:stable.find(r=>desktopArtifacts(r).length)||null,
    latestNonPrerelease:stable[0]||null,
    latestDevelopment:desktop.find(r=>r.prerelease)||null,
    latestMacArtifact:stable.find(r=>desktopArtifacts(r).some(a=>/\.dmg$/.test(a.name)))||null,
    macRuntimeVerification:'UNKNOWN',
    evaluationChannel:'BETA',
  };
}
const releaseLink=r=>r?`<a href="${RELEASE_SOURCE}/tag/${esc(r.tag)}">${esc(r.tag)}</a> · ${esc(new Date(r.at).toISOString().slice(0,10))} UTC`:'Not established by this source reading';
export function renderReleaseRecord(catalog) {
  const c=catalog||releaseCatalog([],{available:false});
  return `<details class="release-record"><summary>Release evidence / ${c.latestDownloadable?esc(c.latestDownloadable.tag):'unavailable'} · beta evaluation</summary><p>One build-time snapshot from <a href="${RELEASE_SOURCE}">GitHub release records</a>. Source checked: ${esc(c.checkedAt||'unknown')}${c.available?'':' · Source unavailable; no fallback version substituted'}.</p><div class="table-scroll" role="region" aria-label="Desktop release evidence" tabindex="0"><table><thead><tr><th scope="col">Question</th><th scope="col">Recorded evidence</th></tr></thead><tbody><tr><th scope="row">Latest published desktop release</th><td>${releaseLink(c.latestPublished)}</td></tr><tr><th scope="row">Latest downloadable, non-prerelease build</th><td>${releaseLink(c.latestDownloadable)}</td></tr><tr><th scope="row">GitHub non-prerelease tag</th><td>${releaseLink(c.latestNonPrerelease)}. Product status remains beta; a tag does not establish production readiness.</td></tr><tr><th scope="row">Development prerelease</th><td>${c.latestDevelopment?releaseLink(c.latestDevelopment):'None present in this source reading'}</td></tr><tr><th scope="row">Latest macOS installer artifacts</th><td>${releaseLink(c.latestMacArtifact)}. Artifact availability only.</td></tr><tr><th scope="row">Verified macOS execution / OS signing / notarization</th><td>UNKNOWN — not established by release metadata. Updater signature files are separate. <a href="https://github.com/Ignosha/noshashi/blob/main/docs/RELEASE_SIGNING.md">Signing scope</a>.</td></tr></tbody></table></div><p>Older version numbers in the historical changelog are not current download recommendations. See <a href="/#download">available downloads</a>. No independent security assessment or physical Monterey compatibility is established by this snapshot.</p></details>`;
}

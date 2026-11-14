/* Normal Academy smoke entry. Uses the same local-preview flow for direct lessons,
 * recorded analyst cases, retention, practice/exam, certificates and mobile keys. */
const {execFileSync}=require('node:child_process');
execFileSync(process.execPath,['scripts/academy/retention-smoke.mjs'],{stdio:'inherit',env:{...process.env,APP_URL:process.argv[2]||process.env.APP_URL||'http://localhost:4321',SHOTS_DIR:process.argv[3]||process.env.SHOTS_DIR||'/tmp/noshashi-academy-retention'}});

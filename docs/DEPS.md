# Dependency maintenance

`npm audit` should report **0 vulnerabilities** on the released lockfile.

## Cadence

- Before each release: `npm audit` and `npm outdated`
- Monthly (or when a CVE hits marked / puppeteer-core / yaml / ajv): re-check and patch

## Policy

| Package | Policy |
|---------|--------|
| `marked`, `marked-highlight`, `highlight.js` | Prefer **minor/patch** within the current major. Major bumps need render/HTML-mode regression (`npm run test:html-mode`, `npm run test:ui`, sample PDF). |
| `puppeteer-core` | Prefer **minor/patch**. After upgrade, run PDF smoke (`npm run smoke` / `npm run test:browser`). Sandbox fallback lives in `src/export-pdf.ts`. |
| `yaml`, `ajv` | Patch freely; major only with profile schema + init tests. |
| `typescript`, `@types/node`, `tsx` | Dev-only; keep Node engines (`>=18`) in mind. |

Do **not** widen production dependency ranges casually — pin via `package-lock.json` and ship the lockfile.

## Commands

```bash
npm audit
npm outdated
npm run test
```

Override PDF Chromium sandbox if needed:

- `MD_OUTLET_NO_SANDBOX=1` — always `--no-sandbox`
- `MD_OUTLET_PDF_SANDBOX=1` — never fall back (fail closed)

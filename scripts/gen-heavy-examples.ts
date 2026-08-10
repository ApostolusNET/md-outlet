import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const images = join(pkgRoot, "examples", "local", "images");
mkdirSync(images, { recursive: true });

const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120" viewBox="0 0 480 120">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a5f4a"/>
      <stop offset="100%" stop-color="#2d8f6f"/>
    </linearGradient>
  </defs>
  <rect width="480" height="120" rx="12" fill="url(#g)"/>
  <text x="36" y="72" fill="#f4f7f5" font-family="Georgia, serif" font-size="42" font-weight="700">md-outlet</text>
  <text x="36" y="98" fill="#c5e6d8" font-family="system-ui,sans-serif" font-size="14">same source, your paper</text>
</svg>
`;

const pipeline = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#f0f3f1"/>
  <rect x="40" y="40" width="560" height="280" rx="8" fill="#fff" stroke="#c8d4ce"/>
  <text x="60" y="78" fill="#1a5f4a" font-family="system-ui,sans-serif" font-size="20" font-weight="600">出力パイプライン</text>
  <rect x="80" y="120" width="120" height="56" rx="6" fill="#1a5f4a"/>
  <text x="100" y="154" fill="#fff" font-family="system-ui,sans-serif" font-size="14">Markdown</text>
  <path d="M210 148 H250" stroke="#1a5f4a" stroke-width="3"/>
  <rect x="260" y="120" width="120" height="56" rx="6" fill="#2d8f6f"/>
  <text x="292" y="154" fill="#fff" font-family="system-ui,sans-serif" font-size="14">Profile</text>
  <path d="M390 148 H430" stroke="#1a5f4a" stroke-width="3"/>
  <rect x="440" y="100" width="120" height="40" rx="6" fill="#e8f2ee" stroke="#1a5f4a"/>
  <text x="470" y="126" fill="#1a5f4a" font-family="system-ui,sans-serif" font-size="13">Preview</text>
  <rect x="440" y="156" width="120" height="40" rx="6" fill="#1a5f4a"/>
  <text x="482" y="182" fill="#fff" font-family="system-ui,sans-serif" font-size="13">PDF</text>
  <text x="60" y="300" fill="#5a6b63" font-family="system-ui,sans-serif" font-size="13">相対パスの画像は MD と同じフォルダ基準で解決されます。</text>
</svg>
`;

const chart = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="280" viewBox="0 0 520 280">
  <rect width="520" height="280" fill="#fafbfa"/>
  <text x="24" y="36" fill="#243029" font-family="system-ui,sans-serif" font-size="16" font-weight="600">章ごとのページ数（架空）</text>
  <line x1="60" y1="240" x2="480" y2="240" stroke="#9aaba3" stroke-width="2"/>
  <rect x="90" y="120" width="48" height="120" fill="#1a5f4a"/>
  <rect x="170" y="80" width="48" height="160" fill="#2d8f6f"/>
  <rect x="250" y="150" width="48" height="90" fill="#4aa882"/>
  <rect x="330" y="60" width="48" height="180" fill="#1a5f4a"/>
  <rect x="410" y="100" width="48" height="140" fill="#2d8f6f"/>
  <text x="102" y="260" fill="#5a6b63" font-size="12" font-family="system-ui,sans-serif">1</text>
  <text x="182" y="260" fill="#5a6b63" font-size="12" font-family="system-ui,sans-serif">2</text>
  <text x="262" y="260" fill="#5a6b63" font-size="12" font-family="system-ui,sans-serif">3</text>
  <text x="342" y="260" fill="#5a6b63" font-size="12" font-family="system-ui,sans-serif">4</text>
  <text x="422" y="260" fill="#5a6b63" font-size="12" font-family="system-ui,sans-serif">5</text>
</svg>
`;

writeFileSync(join(images, "logo.svg"), logo);
writeFileSync(join(images, "pipeline.svg"), pipeline);
writeFileSync(join(images, "chart.svg"), chart);

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFRkSuQmCC",
  "base64"
);
writeFileSync(join(images, "badge.png"), png);

const para = (n: string) =>
  `この段落は負荷確認用のダミー文です（${n}）。同じ書式設定でプレビューと PDF を出し、スクロールや描画が安定するか確認してください。表・リスト・コードを混ぜて、長大な文書でも落ちないことを目標にしています。`;

const lines: string[] = [];
lines.push("# 大きなサンプル文書（負荷確認用）");
lines.push("");
lines.push(
  "このファイルは **意図的に長い Markdown** です。プレビューのスクロール、PDF 出力、メモリまわりの確認に使います。"
);
lines.push("");
lines.push("- 場所: `examples/local/large-sample.md`（ローカル用・非公開）");
lines.push("- 開き方: `npx md-outlet ui examples/local/large-sample.md`");
lines.push("- 基本サンプルは `examples/sample.md` を参照");
lines.push("");
lines.push("---");
lines.push("");

const chapters = 48;
for (let c = 1; c <= chapters; c++) {
  lines.push(`# 第${c}章 負荷セクション${c}`);
  lines.push("");
  lines.push(`## ${c}.1 概要`);
  lines.push("");
  for (let p = 1; p <= 6; p++) {
    lines.push(para(`${c}-${p}`));
    lines.push("");
  }
  lines.push(`## ${c}.2 チェックリスト`);
  lines.push("");
  lines.push("- [ ] プレビューが最後まで描画される");
  lines.push("- [ ] PDF がタイムアウトせずに完了する");
  lines.push("- [ ] 見出しジャンプやスクロールが極端に重くない");
  lines.push("");
  lines.push(`## ${c}.3 表とコード`);
  lines.push("");
  lines.push("| 項目 | 値 | メモ |");
  lines.push("|------|----|------|");
  lines.push(`| 章番号 | ${c} | 自動生成 |`);
  lines.push("| 段落数 | 6 | ダミー |");
  lines.push("| 目的 | 安定性 | large-sample |");
  lines.push("");
  lines.push("```ts");
  lines.push(
    `export const chapter${c} = { id: ${c}, label: "負荷セクション${c}" };`
  );
  lines.push("```");
  lines.push("");
  lines.push("> 長大な文書でも、プロファイルが同じなら紙面のルールは揃います。");
  lines.push("");
}

const localDir = join(pkgRoot, "examples", "local");
mkdirSync(localDir, { recursive: true });
const out = join(localDir, "large-sample.md");
const body = lines.join("\n");
writeFileSync(out, body, "utf8");
console.log("wrote", out, statSync(out).size, "bytes,", chapters, "chapters");
console.log("wrote images under", images);

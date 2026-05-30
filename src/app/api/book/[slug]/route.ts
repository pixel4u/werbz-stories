import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextResponse } from "next/server";

function buildEngineHtml(slug: string, debug: boolean): string {
  const sourcePath = join(process.cwd(), "specs", "book-engine-v28.html");
  let html = readFileSync(sourcePath, "utf8");

  html = html.replace(
    /let pages = \[[\s\S]*?\n\s*\];/,
    "let pages = [{ kind: 'text', eyebrow: 'LOADING', title: 'Loading story…', body: 'Fetching Storybook JSON from API.', align: 'left', num: 1, __meta: { id: 'loading', position: 0, side: 'left' } }];"
  );

  html = html.replace(
    "function loadPageTexture(index) { return createPlaceholderTexture(pages[index]); }",
    `const DEBUG_MODE = ${debug ? "true" : "false"};
    function getAssetUrl(assetId) { return '/api/assets/' + encodeURIComponent(assetId); }
    function loadPageTexture(index) {
      return createStoryTexture(pages[index]);
    }`
  );

  const renderers = `
    function drawNeutralPaper(ctx, canvas) {
      const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#f3f3f3');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function createStoryTexture(page) {
      const canvas = document.createElement('canvas');
      canvas.width = 1200; canvas.height = 1600;
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(config.flipTextH ? -1 : 1, config.flipTextV ? -1 : 1);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);

      const kind = page?.kind || 'text';
      if (kind === 'text') {
        drawTextPage(ctx, canvas, page);
      } else if (kind === 'image') {
        drawImagePage(ctx, canvas, page);
      } else if (kind === 'video') {
        drawMediaPlaceholder(ctx, canvas, {
          label: 'VIDEO',
          line1: 'asset: ' + (page.assetId || 'missing-asset-id'),
          line2: 'video poster: ' + (page.poster || 'missing-poster'),
        });
      } else if (kind === 'embed') {
        const src = page.source && page.source.type === 'asset'
          ? 'embed asset: ' + page.source.assetId
          : 'embed url: ' + ((page.source && page.source.url) || 'missing-url');
        drawMediaPlaceholder(ctx, canvas, {
          label: 'EMBED',
          line1: src,
          line2: 'poster: ' + (page.poster || 'missing-poster'),
        });
      } else {
        drawTextPage(ctx, canvas, { kind: 'text', title: 'Unsupported page', body: 'Unknown page type.' });
      }

      if (DEBUG_MODE) {
        drawDebugOverlay(ctx, page);
      }

      ctx.restore();
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;

      if (kind === 'image' && page?.assetId) {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.scale(config.flipTextH ? -1 : 1, config.flipTextV ? -1 : 1);
          ctx.translate(-canvas.width / 2, -canvas.height / 2);
          drawImagePage(ctx, canvas, page, image);
          if (DEBUG_MODE) drawDebugOverlay(ctx, page);
          ctx.restore();
          texture.needsUpdate = true;
        };
        image.onerror = () => {
          texture.needsUpdate = true;
        };
        image.src = getAssetUrl(page.assetId);
      }

      return texture;
    }

    function drawTextPage(ctx, canvas, page) {
      const bg = '#ffffff';
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const textColor = page.background ? '#ffffff' : '#1d1d1d';
      ctx.fillStyle = textColor;
      ctx.globalAlpha = page.background ? 0.86 : 0.55;
      ctx.font = '700 34px Georgia, serif';
      ctx.fillText((page.eyebrow || '').toUpperCase(), 86, 150);

      const align = page.align === 'center' ? 'center' : page.align === 'right' ? 'right' : 'left';
      const titleX = align === 'center' ? canvas.width / 2 : 86;
      const bodyX = align === 'center' ? canvas.width / 2 : 88;
      const maxWidth = 900;

      ctx.textAlign = align;
      ctx.globalAlpha = 1;
      ctx.font = '700 96px Georgia, serif';
      wrapText(ctx, page.title || 'Untitled', titleX, 300, maxWidth, 108);

      ctx.globalAlpha = page.background ? 0.95 : 0.72;
      ctx.font = "400 42px 'Helvetica Neue', sans-serif";
      wrapText(ctx, page.body || '', bodyX, 610, maxWidth, 62);
      ctx.globalAlpha = 0.45;
      ctx.font = '700 28px Georgia, serif';
      ctx.textAlign = 'left';
      ctx.fillText('Page ' + (page.num || 1), 88, 1500);
      ctx.globalAlpha = 1;
    }

    function drawImagePage(ctx, canvas, page, image) {
      if (!image) {
        drawMediaPlaceholder(ctx, canvas, {
          label: 'IMAGE',
          line1: 'loading: ' + (page.assetId || 'missing-asset-id'),
          line2: 'fit: ' + (page.fit || 'cover'),
        });
        return;
      }

      drawNeutralPaper(ctx, canvas);
      const fit = page.fit || 'cover';
      const sw = image.naturalWidth || image.width;
      const sh = image.naturalHeight || image.height;
      if (!sw || !sh) {
        drawMediaPlaceholder(ctx, canvas, {
          label: 'IMAGE',
          line1: 'image unavailable',
          line2: 'asset: ' + (page.assetId || 'n/a'),
        });
        return;
      }

      const canvasRatio = canvas.width / canvas.height;
      const imageRatio = sw / sh;
      let dw = canvas.width;
      let dh = canvas.height;

      if (fit === 'contain') {
        if (imageRatio > canvasRatio) {
          dw = canvas.width;
          dh = canvas.width / imageRatio;
        } else {
          dh = canvas.height;
          dw = canvas.height * imageRatio;
        }
      } else {
        if (imageRatio > canvasRatio) {
          dh = canvas.height;
          dw = canvas.height * imageRatio;
        } else {
          dw = canvas.width;
          dh = canvas.width / imageRatio;
        }
      }

      const dx = (canvas.width - dw) / 2;
      const dy = (canvas.height - dh) / 2;
      ctx.drawImage(image, dx, dy, dw, dh);

      if (page.caption) {
        ctx.fillStyle = 'rgba(15,15,15,0.62)';
        roundRect(ctx, 56, canvas.height - 136, canvas.width - 112, 74, 16);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = "500 30px 'Helvetica Neue', sans-serif";
        ctx.fillText(page.caption, 84, canvas.height - 88);
      }
    }

    function drawMediaPlaceholder(ctx, canvas, opts) {
      const label = opts.label;
      const line1 = opts.line1;
      const line2 = opts.line2;

      drawNeutralPaper(ctx, canvas);

      const glow = ctx.createRadialGradient(240, 190, 20, 240, 190, 780);
      glow.addColorStop(0, 'rgba(255,255,255,0.26)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#222';
      ctx.font = '700 58px Georgia, serif';
      ctx.fillText(label + ' PAGE', 88, 180);

      drawCard(ctx, 88, 260, 1024, 180, '#2b2b2b', false, 'Asset', line1 || 'n/a');
      drawCard(ctx, 88, 470, 1024, 180, '#2b2b2b', false, 'Details', line2 || 'Path A placeholder texture');
    }

    function drawDebugOverlay(ctx, page) {
      const meta = page.__meta || {};
      const lines = [
        'DEBUG MODE',
        'id: ' + (meta.id || 'n/a'),
        'position: ' + (meta.position ?? 'n/a'),
        'side: ' + (meta.side || 'n/a'),
        'kind: ' + (page.kind || 'n/a'),
      ];

      if (page.kind === 'image') lines.push('assetId: ' + (page.assetId || 'n/a'));
      if (page.kind === 'video') {
        lines.push('assetId: ' + (page.assetId || 'n/a'));
        lines.push('poster: ' + (page.poster || 'n/a'));
      }
      if (page.kind === 'embed') {
        const src = page.source && page.source.type === 'asset'
          ? page.source.assetId
          : (page.source && page.source.url) || 'n/a';
        lines.push('source: ' + src);
        lines.push('poster: ' + (page.poster || 'n/a'));
      }

      const x = 72;
      const y = 1240;
      const w = 1050;
      const h = 300;
      ctx.save();
      roundRect(ctx, x, y, w, h, 24);
      ctx.fillStyle = 'rgba(15, 15, 15, 0.82)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#f3f3f3';
      ctx.font = "700 28px 'Helvetica Neue', sans-serif";
      let cy = y + 48;
      for (const line of lines.slice(0, 9)) {
        ctx.fillText(line, x + 24, cy);
        cy += 32;
      }
      ctx.restore();
    }
  `;

  html = html.replace(
    /function createPlaceholderTexture\(page\) \{[\s\S]*?function roundRect\(ctx, x, y, w, h, r\) \{[\s\S]*?\}/,
    renderers + `\n    function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
      const words = (text || '').split(' '); let line = '', cy = y;
      for (let i = 0; i < words.length; i++) { const test = line + words[i] + ' ';
        if (ctx.measureText(test).width > maxWidth && i > 0) { ctx.fillText(line, x, cy); line = words[i] + ' '; cy += lineHeight; } else line = test; }
      ctx.fillText(line, x, cy);
    }
    function drawCard(ctx, x, y, w, h, textColor, light, title, body) {
      ctx.save(); roundRect(ctx, x, y, w, h, 42);
      ctx.fillStyle = light ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.05)'; ctx.fill();
      ctx.globalAlpha = light ? 0.4 : 0.16; ctx.strokeStyle = textColor; ctx.lineWidth = 2; ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = textColor; ctx.font = '700 34px Georgia, serif'; ctx.fillText(title, x + 34, y + 62);
      ctx.globalAlpha = light ? 0.8 : 0.72; ctx.font = "400 27px 'Helvetica Neue', sans-serif"; wrapText(ctx, body, x + 34, y + 116, w - 72, 38); ctx.restore();
    }
    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }`
  );

  const boot = `
    async function loadStorybookFromApi() {
      try {
        const res = await fetch('/api/storybooks/${slug}');
        if (!res.ok) throw new Error('Storybook fetch failed: ' + res.status);
        const payload = await res.json();
        const storybook = payload.storybook;
        if (!storybook || !Array.isArray(storybook.pages)) throw new Error('Invalid storybook payload');

        if (storybook.theme && typeof storybook.theme === 'object') {
          config = { ...config, ...storybook.theme };
          refreshUI();
          applyCamera();
          applyLights();
        }

        pages = [...storybook.pages]
          .sort((a, b) => a.position - b.position)
          .map((page, idx) => ({
            ...page.content,
            num: idx + 1,
            fit: page.content.fit || 'cover',
            __meta: {
              id: page.id,
              position: page.position,
              side: page.side,
            },
          }));

        // Cover model: the FIRST page is the closed front cover and the LAST
        // page is the closed back cover (handled natively by the engine). The
        // storybook's coverAssetId stays purely the Library thumbnail and is
        // intentionally NOT injected as an extra page here.

        // Page turns happen in pairs, so an odd page count needs one trailing
        // blank so the back cover stays a real content page.
        if (pages.length % 2 === 1) {
          pages.push({
            kind: 'text',
            title: '',
            body: '',
            num: pages.length + 1,
            __meta: { id: 'padding-page', position: pages.length, side: 'right' },
          });
        }

        spreadIndex = 0;
        cleanupActiveFlip();
        regenerateTextures();
        buildBook();
        // The engine starts closed on the front cover natively.
        enterCover('front');
      } catch (err) {
        console.error(err);
      }
    }

    buildUI(); syncJson(); applyCamera(); applyLights(); regenerateTextures(); buildBook(); animate();
    loadStorybookFromApi();
  `;

  html = html.replace(
    /buildUI\(\); syncJson\(\); applyCamera\(\); applyLights\(\); regenerateTextures\(\); buildBook\(\); animate\(\);[\s\S]*?if \(initialPdfUrl\) \{[\s\S]*?\}/,
    boot
  );

  html = html.replace("<div class=\"pdf-loader\">", "<div class=\"pdf-loader\" style=\"display:none\">\n");

  return html;
}

interface Params {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { slug } = await params;
  const debug = new URL(request.url).searchParams.get("debug") === "1";
  const html = buildEngineHtml(slug, debug);

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

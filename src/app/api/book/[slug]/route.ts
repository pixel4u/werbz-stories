import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextResponse } from "next/server";

function buildEngineHtml(slug: string): string {
  const sourcePath = join(process.cwd(), "specs", "book-engine-v27.html");
  let html = readFileSync(sourcePath, "utf8");

  html = html.replace(
    /let pages = \[[\s\S]*?\n\s*\];/,
    "let pages = [{ kind: 'text', eyebrow: 'LOADING', title: 'Loading story…', body: 'Fetching Storybook JSON from API.', align: 'left', num: 1 }];"
  );

  html = html.replace(
    "function loadPageTexture(index) { return createPlaceholderTexture(pages[index]); }",
    `function getAssetUrl(assetId) { return '/api/assets/' + encodeURIComponent(assetId); }
    function loadPageTexture(index) {
      return createStoryTexture(pages[index]);
    }`
  );

  const renderers = `
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
        drawMediaPlaceholder(ctx, canvas, 'IMAGE', page.assetId, '#1e293b');
        drawImageAsync(canvas, page.assetId, page.fit || 'cover');
      } else if (kind === 'video') {
        drawMediaPlaceholder(ctx, canvas, 'VIDEO', page.poster || page.assetId, '#3f1d5a');
        if (page.poster) drawImageAsync(canvas, page.poster, 'cover');
      } else if (kind === 'embed') {
        drawMediaPlaceholder(ctx, canvas, 'EMBED', page.poster, '#1f4d3b');
        if (page.poster) drawImageAsync(canvas, page.poster, 'cover');
      } else {
        drawTextPage(ctx, canvas, { kind: 'text', title: 'Unsupported page', body: 'Unknown page type.' });
      }

      ctx.restore();
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;
      return texture;
    }

    function drawTextPage(ctx, canvas, page) {
      const bg = page.background || '#ffffff';
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const textColor = page.background ? '#ffffff' : '#1d1d1d';
      ctx.fillStyle = textColor;
      ctx.globalAlpha = page.background ? 0.86 : 0.55;
      ctx.font = '700 34px Georgia, serif';
      ctx.fillText((page.eyebrow || '').toUpperCase(), 86, 150);

      const align = page.align === 'center' ? 'center' : 'left';
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

    function drawMediaPlaceholder(ctx, canvas, label, assetId, bgColor) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const glow = ctx.createRadialGradient(280, 220, 20, 280, 220, 800);
      glow.addColorStop(0, 'rgba(255,255,255,0.22)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '700 58px Georgia, serif';
      ctx.fillText(label + ' PAGE', 88, 180);

      drawCard(ctx, 88, 260, 1024, 180, '#ffffff', true, 'Asset ID', assetId || 'missing-asset-id');
      drawCard(ctx, 88, 470, 1024, 180, '#ffffff', true, 'Path A Placeholder', 'Poster/asset texture only for Prompt 2.');
    }

    function drawImageAsync(canvas, assetId, fit) {
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const padX = 88;
        const padY = 700;
        const frameW = canvas.width - 176;
        const frameH = canvas.height - 840;
        const srcW = img.width;
        const srcH = img.height;

        let drawW = frameW;
        let drawH = frameH;
        if (fit === 'contain') {
          const ratio = Math.min(frameW / srcW, frameH / srcH);
          drawW = srcW * ratio;
          drawH = srcH * ratio;
        } else {
          const ratio = Math.max(frameW / srcW, frameH / srcH);
          drawW = srcW * ratio;
          drawH = srcH * ratio;
        }

        const dx = padX + (frameW - drawW) / 2;
        const dy = padY + (frameH - drawH) / 2;

        ctx.save();
        ctx.beginPath();
        roundRect(ctx, padX, padY, frameW, frameH, 28);
        ctx.clip();
        ctx.drawImage(img, dx, dy, drawW, drawH);
        ctx.restore();

        const texture = pageTextures.find((t) => t.image === canvas);
        if (texture) texture.needsUpdate = true;
      };
      img.src = getAssetUrl(assetId || 'missing-asset-id');
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
      ctx.fillStyle = light ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.045)'; ctx.fill();
      ctx.globalAlpha = light ? 0.4 : 0.14; ctx.strokeStyle = textColor; ctx.lineWidth = 2; ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = textColor; ctx.font = '700 34px Georgia, serif'; ctx.fillText(title, x + 34, y + 62);
      ctx.globalAlpha = light ? 0.8 : 0.62; ctx.font = "400 27px 'Helvetica Neue', sans-serif"; wrapText(ctx, body, x + 34, y + 116, w - 72, 38); ctx.restore();
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
            fit: page.content.fit || 'cover'
          }));

        if (pages.length % 2 === 1) {
          pages.push({ kind: 'text', title: ' ', body: ' ', num: pages.length + 1, align: 'left' });
        }

        spreadIndex = 0;
        cleanupActiveFlip();
        regenerateTextures();
        buildBook();
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

  // Hide PDF loader for Prompt 2 data-driven mode.
  html = html.replace("<div class=\"pdf-loader\">", "<div class=\"pdf-loader\" style=\"display:none\">\n");

  return html;
}

interface Params {
  params: Promise<{ slug: string }>;
}

export async function GET(_: Request, { params }: Params) {
  const { slug } = await params;
  const html = buildEngineHtml(slug);

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

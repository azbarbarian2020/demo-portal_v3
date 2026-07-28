import { NextRequest, NextResponse } from "next/server";
import { executeQuery } from "@/lib/snowflake";

// Allow up to 120s for proxied requests (AI/LLM calls can be slow)
export const maxDuration = 120;

async function getInternalHost(slug: string): Promise<string | null> {
  const rows = await executeQuery<Record<string, unknown>>(
    `SELECT internal_host FROM DEMO_PORTAL.PUBLIC.DEMOS WHERE proxy_path = ? AND internal_host IS NOT NULL LIMIT 1`,
    [slug]
  );
  return rows.length > 0 ? (rows[0].INTERNAL_HOST as string) : null;
}

function rewriteHtml(html: string, slug: string): string {
  const prefix = `/apps/${slug}`;
  // Rewrite absolute paths in src/href/action attributes
  let rewritten = html
    .replace(/(href|src|action)="\/(?!apps\/)/g, `$1="${prefix}/`)
    .replace(/(href|src|action)='\/(?!apps\/)/g, `$1='${prefix}/`);
  // Rewrite srcset attribute paths (format: "/path 1x, /path 2x")
  rewritten = rewritten.replace(/srcset="([^"]*)"/g, (match, value) => {
    const rewrittenValue = value.replace(/(^|,\s*)\/(?!apps\/)/g, `$1${prefix}/`);
    return `srcset="${rewrittenValue}"`;
  });
  rewritten = rewritten.replace(/srcset='([^']*)'/g, (match, value) => {
    const rewrittenValue = value.replace(/(^|,\s*)\/(?!apps\/)/g, `$1${prefix}/`);
    return `srcset='${rewrittenValue}'`;
  });
  // Inject interceptors: fetch/XHR rewriting + MutationObserver for images
  const interceptScript = `<script>
(function(){
  var prefix = "${prefix}";
  // Set cookie so middleware can rewrite unprefixed iframe navigation
  document.cookie = "active_demo=${slug};path=/;SameSite=Lax";
  // Set webpack public path so dynamically loaded chunks use the prefix
  // (safe in iframe — isolated global scope, doesn't affect portal parent)
  window.__webpack_public_path__ = prefix + "/_next/";
  if (window.__NEXT_DATA__) window.__NEXT_DATA__.assetPrefix = prefix;
  function needsRewrite(v) {
    return typeof v === 'string' && v.startsWith('/') && !v.startsWith(prefix) && !v.startsWith('//') && !v.startsWith('/api/tiles/');
  }
  // Intercept fetch
  var origFetch = window.fetch;
  window.fetch = function(url, opts) {
    if (typeof url === 'string') {
      // Proxy external tile requests through portal tile API (NOT prefixed — goes to portal directly)
      var tileMatch = url.match(/^https?:\\/\\/[a-c]?\\.?tile\\.openstreetmap\\.org\\/(.*)/);
      if (tileMatch) { url = '/api/tiles/' + tileMatch[1]; }
      else if (needsRewrite(url)) { url = prefix + url; }
    } else if (url instanceof Request) {
      var reqUrl = url.url;
      var tileMatch2 = reqUrl.match(/^https?:\\/\\/[a-c]?\\.?tile\\.openstreetmap\\.org\\/(.*)/);
      if (tileMatch2) {
        url = new Request('/api/tiles/' + tileMatch2[1], url);
      } else {
        var u = new URL(reqUrl);
        if (u.pathname.startsWith('/') && !u.pathname.startsWith(prefix)) {
          url = new Request(prefix + u.pathname + u.search, url);
        }
      }
    }
    return origFetch.call(this, url, opts);
  };
  // Intercept XHR
  var origXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (typeof url === 'string') {
      var tm = url.match(/^https?:\\/\\/[a-c]?\\.?tile\\.openstreetmap\\.org\\/(.*)/);
      if (tm) { url = '/api/tiles/' + tm[1]; }
      else if (needsRewrite(url)) { url = prefix + url; }
      else {
        // Handle full absolute URLs on same origin (axios builds these)
        try {
          var u = new URL(url, window.location.origin);
          if (u.origin === window.location.origin && needsRewrite(u.pathname)) {
            url = prefix + u.pathname + u.search;
          }
        } catch(e) {}
      }
    }
    return origXHROpen.apply(this, [method, url].concat(Array.prototype.slice.call(arguments, 2)));
  };
  // Intercept Image src for offscreen tile loading (MapLibre)
  var imgSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (imgSrcDesc && imgSrcDesc.set) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      set: function(v) {
        if (typeof v === 'string') {
          var tm = v.match(/^https?:\\/\\/[a-c]?\\.?tile\\.openstreetmap\\.org\\/(.*)/);
          if (tm) { v = '/api/tiles/' + tm[1]; }
          else if (needsRewrite(v)) { v = prefix + v; }
        }
        imgSrcDesc.set.call(this, v);
      },
      get: function() { return imgSrcDesc.get.call(this); }
    });
  }
  // Fix image src/srcset — direct DOM patching via MutationObserver
  var fixing = false;
  function fixImgSrc(img) {
    if (fixing) return;
    fixing = true;
    var src = img.getAttribute('src');
    if (src && needsRewrite(src)) {
      img.setAttribute('src', prefix + src);
    }
    var srcset = img.getAttribute('srcset');
    if (srcset && srcset.indexOf(prefix) === -1 && /\\/[^/]/.test(srcset)) {
      img.setAttribute('srcset', srcset.split(',').map(function(entry) {
        var trimmed = entry.trim();
        if (trimmed.startsWith('/') && !trimmed.startsWith(prefix)) {
          return ' ' + prefix + trimmed;
        }
        return entry;
      }).join(','));
    }
    fixing = false;
  }
  // Observe DOM for any new/changed img elements
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(function(n) {
          if (n.nodeType === 1) {
            if (n.tagName === 'IMG') fixImgSrc(n);
            var imgs = n.querySelectorAll && n.querySelectorAll('img');
            if (imgs) imgs.forEach(fixImgSrc);
          }
        });
      } else if (m.type === 'attributes' && m.target.tagName === 'IMG') {
        fixImgSrc(m.target);
      }
    });
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ['src', 'srcset']
  });
  // Fix any images already in the DOM
  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('img').forEach(fixImgSrc);
  });
  // Activity detection: notify parent frame on user interaction (throttled to 1/sec)
  var lastSignal = 0;
  function signalActivity() {
    var now = Date.now();
    if (now - lastSignal > 1000) {
      lastSignal = now;
      try { window.parent.postMessage('demo-activity', '*'); } catch(e) {}
    }
  }
  document.addEventListener('click', signalActivity, true);
  document.addEventListener('keydown', signalActivity, true);
  document.addEventListener('scroll', signalActivity, true);
  document.addEventListener('mousemove', signalActivity, {capture: true, passive: true});
})();
</script>`;
  rewritten = rewritten.replace(/<head([^>]*)>/i, `<head$1>${interceptScript}`);
  return rewritten;
}

async function proxyRequest(request: NextRequest, targetUrl: string, slug: string): Promise<NextResponse> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (!["host", "connection", "transfer-encoding"].includes(key.toLowerCase())) {
      headers[key] = value;
    }
  });

  const fetchOptions: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    fetchOptions.body = await request.arrayBuffer();
  }

  const response = await fetch(targetUrl, fetchOptions);

  const responseHeaders = new Headers();
  response.headers.forEach((value, key) => {
    if (!["transfer-encoding", "content-encoding"].includes(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  const contentType = response.headers.get("content-type") || "";

  // Rewrite HTML responses to prefix asset paths
  if (contentType.includes("text/html")) {
    const text = await response.text();
    const rewritten = rewriteHtml(text, slug);
    responseHeaders.delete("content-length");
    return new NextResponse(rewritten, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  }

  // Rewrite CSS url() references
  if (contentType.includes("text/css")) {
    const prefix = `/apps/${slug}`;
    let css = await response.text();
    css = css.replace(/url\(\s*['"]?\/(?!apps\/)/g, `url(${prefix}/`);
    responseHeaders.delete("content-length");
    return new NextResponse(css, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  }

  // Rewrite JS to replace external tile URLs with our proxy path
  // This catches MapLibre tile source definitions that run inside Web Workers
  if (contentType.includes("javascript") || contentType.includes("application/x-javascript")) {
    let js = await response.text();
    // Replace tile URL patterns: https://tile.openstreetmap.org/{z}/{x}/{y}.png → /api/tiles/{z}/{x}/{y}.png
    // Also handle template literal variants and subdomain patterns (a/b/c.tile.openstreetmap.org)
    js = js.replace(/https?:\/\/[a-c]?\.?tile\.openstreetmap\.org\//g, "/api/tiles/");
    // Rewrite relative paths in JS that reference assets
    const prefix = `/apps/${slug}`;
    js = js.replace(/"\/(?!apps\/|api\/tiles\/)([^"]*\.(js|css|json|png|jpg|svg|woff2?|ttf|ico))"/g, `"${prefix}/$1"`);
    responseHeaders.delete("content-length");
    return new NextResponse(js, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  }

  // Stream through SSE/event-stream responses (AI/chat endpoints)
  if (contentType.includes("text/event-stream") || contentType.includes("stream")) {
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  }

  const body = await response.arrayBuffer();
  return new NextResponse(body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, await params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, await params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, await params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, await params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return handleProxy(request, await params);
}

async function handleProxy(request: NextRequest, params: { path: string[] }) {
  const pathSegments = params.path;
  if (!pathSegments || pathSegments.length === 0) {
    return NextResponse.json({ error: "No app specified" }, { status: 400 });
  }

  const slug = pathSegments[0];
  const remainingPath = "/" + pathSegments.slice(1).join("/");

  // Serve tile requests directly (MapLibre workers resolve /api/tiles/ relative to /apps/<slug>/)
  if (remainingPath.startsWith("/api/tiles/")) {
    const tilePath = remainingPath.replace("/api/tiles/", "");
    const tileUrl = `https://tile.openstreetmap.org/${tilePath}`;
    try {
      const tileRes = await fetch(tileUrl, { headers: { "User-Agent": "DemoPortal/1.0" } });
      if (!tileRes.ok) return new NextResponse(null, { status: tileRes.status });
      const body = await tileRes.arrayBuffer();
      return new NextResponse(body, {
        status: 200,
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
      });
    } catch {
      return new NextResponse(null, { status: 502 });
    }
  }

  const internalHost = await getInternalHost(slug);
  if (!internalHost) {
    // Demo was deleted or misconfigured — clear the stale cookie and redirect home
    const redirectResponse = NextResponse.redirect(new URL("/", request.url));
    redirectResponse.cookies.set("active_demo", "", { path: "/", maxAge: 0 });
    return redirectResponse;
  }

  const protocol = internalHost.startsWith("https") ? "" : "http://";
  const prefix = `/apps/${slug}`;

  // Fix _next/image url param: Next.js client adds assetPrefix to the url param,
  // but the upstream service expects the original path without prefix
  let searchParams = request.nextUrl.search || "";
  if (remainingPath.startsWith("/_next/image") && searchParams.includes("url=")) {
    const encodedPrefix = encodeURIComponent(prefix);
    searchParams = searchParams.replace(
      new RegExp(`url=${encodedPrefix}(%2F|/)`, "g"),
      "url=%2F"
    );
    // Also handle url=/apps/slug/ (not encoded)
    searchParams = searchParams.replace(
      new RegExp(`url=${prefix}/`, "g"),
      "url=/"
    );
  }

  // FTFP path remapping: the FTFP frontend calls wrong API paths
  let proxyPath = remainingPath;
  if (slug === "ftfp") {
    const ftfpRewrites: Record<string, string> = {
      "/api/telemetry": "/api/telemetry/latest",
      "/api/write": "/api/writer/write-epoch",
      "/api/reset": "/api/reset-all",
    };
    if (ftfpRewrites[proxyPath]) {
      proxyPath = ftfpRewrites[proxyPath];
    }
  }

  const targetUrl = `${protocol}${internalHost}${proxyPath}${searchParams}`;

  try {
    return await proxyRequest(request, targetUrl, slug);
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : "Proxy error";
    const message = raw.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const html = `<!DOCTYPE html><html><head><title>Demo Unavailable</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column">
<h2>Demo Unavailable</h2>
<p style="color:#666">The service for this demo is not responding.</p>
<p style="color:#999;font-size:12px">${message}</p>
<a href="/" onclick="document.cookie='active_demo=;path=/;max-age=0'" style="margin-top:16px;color:#29b5e8">Back to Demos</a>
</body></html>`;
    return new NextResponse(html, {
      status: 502,
      headers: { "Content-Type": "text/html" },
    });
  }
}

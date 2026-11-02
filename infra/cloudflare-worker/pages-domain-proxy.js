// Cloudflare Worker：把自定义域名请求转发到对应的 Pages 项目
// 作用：SaaS 回源时 Host 头是自定义域名，Pages 不认，这里重写成 pages.dev
// 并开启边缘节点缓存加速

const ORIGINS = {
  'loot.jxpvx.top': 'jx3-loot-forge.pages.dev',
  'mw.jxpvx.top': 'jx3-renown-master.pages.dev',
};

const nullBodyStatuses = new Set([101, 204, 205, 304]);

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = ORIGINS[url.hostname];

    if (!target) {
      return new Response('Not Found', { status: 404 });
    }

    const targetUrl = new URL(request.url);
    targetUrl.hostname = target;
    targetUrl.protocol = 'https:';

    const headers = new Headers(request.headers);
    headers.set('Host', target);

    const pathname = url.pathname;

    // 针对静态资产和数据包开启边缘缓存
    const cfOptions = {
      cacheEverything: true,
    };

    if (pathname.startsWith('/assets/')) {
      // 带哈希静态资源：边缘缓存 30 天
      cfOptions.cacheTtl = 2592000;
    } else if (pathname.startsWith('/data/')) {
      // 数据包：边缘缓存 1 天
      cfOptions.cacheTtl = 86400;
    } else if (pathname === '/' || pathname.endsWith('.html')) {
      // HTML 实时回源校验，防止发版后页面不更新
      cfOptions.cacheTtl = 0;
    }

    const newRequest = new Request(targetUrl, {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
      cf: cfOptions,
    });

    const response = await fetch(newRequest);

    // 复制响应头，补充客户端强缓存策略
    const responseHeaders = new Headers(response.headers);

    if (pathname.startsWith('/assets/')) {
      responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (pathname.startsWith('/data/')) {
      responseHeaders.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    } else if (pathname === '/' || pathname.endsWith('.html')) {
      responseHeaders.set('Cache-Control', 'public, max-age=0, must-revalidate');
    }

    if (!responseHeaders.has('Access-Control-Allow-Origin')) {
      responseHeaders.set('Access-Control-Allow-Origin', '*');
    }

    const body = nullBodyStatuses.has(response.status) ? null : response.body;

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  },
};

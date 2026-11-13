# Public-source thumbnails

`GET /api/briefing/thumbnail?itemId=<saved-brief-id>` serves an image for a saved brief. It never accepts a remote URL from the caller. The existing owner-private Sites authentication boundary protects this route; no sharing or identity configuration changes are required.

Only exact HTTPS GitHub repository root URLs are supported. The server reads that publicly accessible repository page without credentials, follows no redirects, and accepts its `og:image` only on `opengraph.githubassets.com` or `repository-images.githubusercontent.com`. HTTPS hosts, paths, MIME types and raster signatures are checked. HTML and image bodies are each capped at 2 MiB and the HTML request has a 12-second deadline and the image request a 15-second deadline. SVG, query strings, arbitrary hosts and redirects fail closed.

Success returns raster bytes with `nosniff`, same-origin resource policy and private browser caching for one hour. Unsupported/missing images return 404; upstream failures initially return 502. The UI should show a local, clearly labelled fallback on all failures. It must not replace a failed thumbnail with a direct external URL.

Cloudflare Cache API optionally retains public image bytes for one hour and unavailable outcomes for two minutes (cached failures return 404). Cache keys contain only the canonical public repository path. No summary, relevance text, search query, visitor identifier or credential is cached there. A saved item is looked up before consulting this cache. No D1 data or collection settings are changed. Cache TTL means an old public preview may remain visible for up to one hour after upstream changes.

Only the server contacts GitHub and the GitHub image host. The viewer's IP, cookies, authorization headers and Site referrer are not forwarded upstream. The upstream servers still see the service request and public repository path. Images remain attributed to their source and are not represented as newly licensed assets. Other sources (including arbitrary Hacker News destination sites) deliberately use the local fallback rather than introducing tracking hotlinks or an unrestricted URL proxy.

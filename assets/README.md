# Brand assets

Uploaded to the Discord developer portal by hand; nothing in the bot reads them
at runtime.

| File | Where it is used |
|---|---|
| `icon-app-1024.png` | Application icon and bot avatar |
| `banner-1360x480.png` | Bot profile banner, cropped to Discord's 17:6 |
| `banner-1360.png` | The uncropped original the banner came from |
| `emoji-*.svg` | Source for the application emoji |

The emoji PNGs are build output, not source. Regenerate them with:

```bash
node tools/render-emojis.mjs
```

That needs Playwright, which is a devDependency and is deliberately absent from
a production install. Run it locally, never on the server.

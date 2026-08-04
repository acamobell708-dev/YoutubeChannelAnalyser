# Development Synthetic Short Fixture

The fixture is unavailable unless both settings are present in `.env`:

```env
NODE_ENV=development
ENABLE_DEV_FIXTURES=true
```

Restart the Node process after changing `.env`.

## Dashboard use

1. Open `/VideoDashboard.html`.
2. Under **Development data source**, select **Synthetic Short**.
3. Click **Load synthetic Short**.
4. Switch back to **Real YouTube analysis** to restore the normal URL, OAuth,
   comment sample, analysis-depth and format controls.

Fixture mode does not require a URL, fixes the lens to Short, bypasses Google
OAuth, makes no YouTube or OpenAI request, consumes no token allowance, and
remains usable if the real-analysis daily limit is locked.

The fixture includes confirmed Shorts classification, engaged-view metrics,
122.4% average viewed, 101 retention points, all five Short event labels,
three dip/spike explanations, discovery sources, recommendations, and visual
standing bars.

## Disable it

Set `ENABLE_DEV_FIXTURES=false`, remove the setting, or set
`NODE_ENV=production`, then restart. The switch disappears and the fixture
route returns 404.

Do not set `NODE_ENV=development` on the production Azure Container App.

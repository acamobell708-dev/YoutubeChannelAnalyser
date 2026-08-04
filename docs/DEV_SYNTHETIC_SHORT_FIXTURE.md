# Synthetic Short UI Fixture

The fixture is controlled by one explicit server-side setting:

```env
ENABLE_DEV_FIXTURES=true
```

Restart the Node process after changing the setting. The flag works in local
development and in the production Docker runtime. This is required because the
Docker image correctly keeps `NODE_ENV=production`.

The Azure Bicep deployment enables the fixture by default for this personal
test application. Set its `enableDevFixtures` parameter to `false` to hide it.

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
122.4% average viewed, 101 retention points, visible transcript timestamps,
all five Short event labels, three dip/spike explanations, discovery sources,
GPT tag assessment and suggested tag directions, recommendations, and visual
standing bars.

It is compatible with the Video Dashboard clarity changes, including:

- the expanded engaged-view-share explanation;
- prominent selected-tag analysis and suggested tags;
- timestamps beneath transcript-signal bars;
- percentage-point, confidence, and event-label guidance;
- Sound / audio pages discovery guidance; and
- higher-contrast confidence and retention-event badges.

## Disable it

Set `ENABLE_DEV_FIXTURES=false` and restart. The switch disappears and the
fixture route returns 404.

The fixture returns static, clearly labelled data and makes no external
requests. Disable it on any deployment where end users should not see test
controls.

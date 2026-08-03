# Format-aware Video Dashboard

This change adds an Auto / Short / Standard-video analysis lens and keeps the
public/owner data boundary explicit.

## New files

- `src/analysis/videoFormat.js`
  - validates the requested lens;
  - resolves exact owner `creatorContentType` where available;
  - otherwise uses URL/duration only as a labelled proxy;
  - groups owner traffic-source rows by format.
- `src/analysis/formatRetention.js`
  - adds format-specific retention checkpoints;
  - detects persistent format-specific events;
  - calculates strongest section and strongest section after the hook.
- `src/services/youtubeVideoFormatAnalyticsService.js`
  - retrieves owner views, engaged views, interactions, subscribers,
    creator-content type and traffic-source statistics.
- `public/client/videoFormatDashboard.jsx`
  - contains the segmented lens control and format-specific dashboard sections.
- `public/styles/video-format-dashboard.css`
  - isolated styles for the new controls, cards and detailed Shorts chart.
- `test/videoFormatAnalysis.test.js`
  - deterministic tests for classification, Short retention, metrics and discovery.

## Important data limits

- Public YouTube data does not expose `engagedViews`; public Short mode therefore
  keeps public like/comment rates and marks engaged-view cards Owner required.
- `engagedViews` means views that continued beyond YouTube's initial seconds. It
  must not be described as an exact three-second threshold. Three seconds is a
  separate retention checkpoint.
- Short average percentage viewed is not clamped at 100%; values over 100% are
  labelled possible replay/loop activity.
- Exact `SHORTS` versus `VIDEO_ON_DEMAND` classification uses owner Analytics.
  Public Auto mode labels duration and `/shorts/` results as likely/proxy.
- Thumbnail impressions and click-through rate are shown as unavailable because
  they require YouTube Reporting API Reach bulk reports and persisted report
  jobs; they are not fabricated from targeted Analytics.
- Some traffic-source categories can be withheld or unsupported for an
  individual report. The UI presents returned data and an unavailable state.

## Verification

```powershell
npm ci
npm run build
npm test
npm start
```

Test Auto, Short and Standard-video selections with:

1. a public Short while disconnected;
2. an owned Short with Analytics access;
3. an owned standard video with retention;
4. a video whose average percentage viewed exceeds 100%;
5. a video with no owner traffic-source report.

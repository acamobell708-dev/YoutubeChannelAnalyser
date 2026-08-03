function round(value, places = 1) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function nearestByRatio(points, ratio) {
  if (!points.length) return null;
  return points.reduce(
    (closest, point) =>
      Math.abs(point.atRatio - ratio) < Math.abs(closest.atRatio - ratio)
        ? point
        : closest,
    points[0],
  );
}

function checkpoint(point) {
  return point
    ? {
        atRatio: point.atRatio,
        atSeconds: point.atSeconds,
        audienceWatchPercentage: point.audienceWatchPercentage,
      }
    : null;
}

function strongestWindow(points, durationSeconds, startRatio = 0) {
  const eligible = points.filter((point) => point.atRatio >= startRatio);
  if (!eligible.length) return null;
  const windowSize = Math.min(5, eligible.length);
  let strongest = null;
  for (let index = 0; index <= eligible.length - windowSize; index += 1) {
    const window = eligible.slice(index, index + windowSize);
    const average =
      window.reduce(
        (sum, point) => sum + point.audienceWatchPercentage,
        0,
      ) / window.length;
    if (!strongest || average > strongest.averageRetentionPercentage) {
      strongest = {
        startRatio: window[0].atRatio,
        endRatio: window.at(-1).atRatio,
        startSeconds: window[0].atSeconds,
        endSeconds: Math.min(durationSeconds, window.at(-1).atSeconds),
        averageRetentionPercentage: round(average),
      };
    }
  }
  return strongest;
}

function persistentChange(points, index, direction, persistence) {
  const current = points[index].audienceWatchPercentage;
  const following = points.slice(index, index + persistence);
  if (following.length < persistence) return false;
  const tolerance = 1.5;
  return following.every((point) =>
    direction === "dip"
      ? point.audienceWatchPercentage <= current + tolerance
      : point.audienceWatchPercentage >= current - tolerance,
  );
}

function eventDetails(videoType, direction, point) {
  const ratio = point.atRatio;
  if (videoType === "short") {
    if (direction === "dip" && ratio <= 0.15) {
      return ["early_swipe_risk_drop", "Early swipe-risk drop"];
    }
    if (direction === "dip" && ratio >= 0.9) {
      return ["completion_drop", "Completion drop"];
    }
    if (direction === "dip") {
      return ["sustained_mid_short_drop", "Sustained mid-Short drop"];
    }
    if (ratio >= 0.9) {
      return ["end_loop_rise", "End-loop rise"];
    }
    return ["replay_spike", "Replay spike"];
  }

  if (direction === "dip" && ratio <= 0.15) {
    return ["intro_drop", "Intro drop"];
  }
  if (direction === "dip" && ratio <= 0.55) {
    return ["topic_transition_drop", "Topic-transition drop"];
  }
  if (direction === "dip") {
    return ["sustained_low_retention_section", "Sustained low-retention section"];
  }
  return ["rewatch_spike", "Rewatch spike"];
}

function detectEvents(points, videoType) {
  const isShort = videoType === "short";
  const desiredBaselineWindow = isShort ? 2 : 3;
  const baselineWindow = Math.min(
    desiredBaselineWindow,
    Math.max(1, points.length - 1),
  );
  const persistence = isShort ? 3 : 1;
  const threshold = isShort ? 3 : 3.5;
  const candidates = [];

  for (let index = baselineWindow; index < points.length; index += 1) {
    const previous = points.slice(index - baselineWindow, index);
    const baseline =
      previous.reduce(
        (sum, point) => sum + point.audienceWatchPercentage,
        0,
      ) / previous.length;
    const point = points[index];
    const change = point.audienceWatchPercentage - baseline;
    const direction =
      change <= -threshold ? "dip" : change >= threshold ? "spike" : null;
    if (!direction || !persistentChange(points, index, direction, persistence)) {
      continue;
    }
    const [eventType, label] = eventDetails(videoType, direction, point);
    candidates.push({
      kind: direction,
      eventType,
      label,
      atRatio: point.atRatio,
      atSeconds: point.atSeconds,
      audienceWatchPercentage: point.audienceWatchPercentage,
      changePercentagePoints: round(change),
      possibleReplay:
        direction === "spike" && point.audienceWatchPercentage > 100,
      startedWatching: point.startedWatching,
      stoppedWatching: point.stoppedWatching,
    });
  }

  const selected = [];
  for (const event of candidates.sort(
    (left, right) =>
      Math.abs(right.changePercentagePoints) -
      Math.abs(left.changePercentagePoints),
  )) {
    if (
      selected.every(
        (item) => Math.abs(item.atRatio - event.atRatio) >= (isShort ? 0.03 : 0.05),
      )
    ) {
      selected.push(event);
    }
    if (selected.length === 5) break;
  }
  return selected.sort((left, right) => left.atRatio - right.atRatio);
}

export function enhanceRetentionAnalysis(
  analysed,
  durationSeconds,
  videoType = "standard",
) {
  if (!analysed?.points?.length) return analysed;
  const points = analysed.points;
  const short = videoType === "short";
  const events = detectEvents(points, videoType);
  const strongest = strongestWindow(points, durationSeconds, short ? 0 : 0.05);
  const strongestAfterHook = short
    ? strongestWindow(
        points,
        durationSeconds,
        Math.min(1, 3 / Math.max(1, durationSeconds)),
      )
    : strongestWindow(points, durationSeconds, 0.1);

  const checkpoints = short
    ? {
        firstThreeSeconds: checkpoint(
          nearestByRatio(
            points,
            Math.min(1, 3 / Math.max(1, durationSeconds)),
          ),
        ),
        midpoint: checkpoint(nearestByRatio(points, 0.5)),
        end: checkpoint(nearestByRatio(points, 1)),
      }
    : {
        firstThirtySeconds: checkpoint(
          nearestByRatio(
            points,
            Math.min(1, 30 / Math.max(1, durationSeconds)),
          ),
        ),
      };

  return {
    ...analysed,
    checkpoints,
    firstThreeSeconds: checkpoints.firstThreeSeconds ?? null,
    midpoint: checkpoints.midpoint ?? null,
    end: checkpoints.end ?? null,
    strongestSection: strongest ?? analysed.strongestSection,
    strongestAfterHook,
    events,
    dips: events.filter((event) => event.kind === "dip"),
    spikes: events.filter((event) => event.kind === "spike"),
    chart: {
      detailed: short,
      scrollDecisionEndSeconds: short ? Math.min(3, durationSeconds) : null,
      completionStartRatio: short ? 0.9 : null,
      replayDetected: points.some(
        (point) => point.audienceWatchPercentage > 100,
      ),
      maximumAudienceWatchPercentage: Math.max(
        100,
        ...points.map((point) => point.audienceWatchPercentage),
      ),
    },
  };
}

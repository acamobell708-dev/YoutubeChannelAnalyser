"""Post-run checks that catch incomplete or mismatched analyses."""

from __future__ import annotations

from dataclasses import dataclass

from .models import VideoAnalysis
from .youtube_client import extract_video_id


@dataclass(frozen=True)
class SanityResult:
    """Result of the final local validation."""

    passed: bool
    checks: tuple[str, ...]
    errors: tuple[str, ...]


def run_sanity_checks(analysis: VideoAnalysis) -> SanityResult:
    """Validate the key claims before reporting successful completion."""

    checks: list[str] = []
    errors: list[str] = []
    video = analysis.video

    expected_id = extract_video_id(video.source_url)
    if expected_id == video.video_id:
        checks.append("video ID matches the supplied URL")
    else:
        errors.append("extracted video ID does not match the supplied URL")

    if isinstance(video.view_count, int) and video.view_count >= 0:
        checks.append("view count is a non-negative integer")
    else:
        errors.append("view count is missing or invalid")

    if video.title.strip():
        checks.append("video title is present")
    else:
        errors.append("video title is missing")

    if analysis.comment_summary.strip():
        checks.append("comment summary is non-empty")
    else:
        errors.append("comment summary is empty")

    return SanityResult(
        passed=not errors,
        checks=tuple(checks),
        errors=tuple(errors),
    )


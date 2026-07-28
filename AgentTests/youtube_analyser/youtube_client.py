"""Retrieve public YouTube metadata and a bounded comment sample with yt-dlp."""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any
from urllib.parse import parse_qs, urlparse

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError
import truststore

from .models import Comment, VideoData


VIDEO_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{11}$")
ALLOWED_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
}


class YouTubeExtractionError(RuntimeError):
    """Raised when public video data cannot be retrieved or validated."""


def extract_video_id(url: str) -> str | None:
    """Extract an expected video ID from common YouTube URL formats."""

    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    candidate: str | None = None

    if host == "youtu.be":
        candidate = parsed.path.strip("/").split("/", 1)[0]
    elif host in ALLOWED_HOSTS:
        if parsed.path == "/watch":
            candidate = parse_qs(parsed.query).get("v", [None])[0]
        else:
            path_parts = [part for part in parsed.path.split("/") if part]
            if len(path_parts) >= 2 and path_parts[0] in {"embed", "live", "shorts"}:
                candidate = path_parts[1]

    return candidate if candidate and VIDEO_ID_PATTERN.fullmatch(candidate) else None


def validate_youtube_url(url: str) -> str:
    """Validate that a URL is an HTTP(S) YouTube video URL."""

    stripped = url.strip()
    parsed = urlparse(stripped)
    host = (parsed.hostname or "").lower()

    if parsed.scheme not in {"http", "https"} or host not in ALLOWED_HOSTS:
        raise YouTubeExtractionError(
            "Please provide a full YouTube URL, for example "
            "https://www.youtube.com/watch?v=VIDEO_ID."
        )
    if extract_video_id(stripped) is None:
        raise YouTubeExtractionError(
            "The URL does not contain a recognisable 11-character YouTube video ID."
        )

    return stripped


def _as_non_negative_int(value: Any, *, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed >= 0 else default


def normalise_video_data(
    raw: Mapping[str, Any],
    *,
    source_url: str,
    max_comments: int,
) -> VideoData:
    """Convert yt-dlp's flexible result mapping into strict application data."""

    video_id = str(raw.get("id") or "").strip()
    title = str(raw.get("title") or "").strip()
    channel = str(raw.get("channel") or raw.get("uploader") or "Unknown").strip()
    view_count_raw = raw.get("view_count")

    if not VIDEO_ID_PATTERN.fullmatch(video_id):
        raise YouTubeExtractionError("YouTube returned an invalid or missing video ID.")
    if not title:
        raise YouTubeExtractionError("YouTube returned no video title.")
    if isinstance(view_count_raw, bool) or not isinstance(view_count_raw, (int, float)):
        raise YouTubeExtractionError(
            "YouTube did not expose a numeric view count for this video."
        )

    comments: list[Comment] = []
    raw_comments = raw.get("comments")
    if isinstance(raw_comments, list):
        for item in raw_comments[:max_comments]:
            if not isinstance(item, Mapping):
                continue
            text = str(item.get("text") or "").strip()
            if not text:
                continue
            comments.append(
                Comment(
                    text=text,
                    author=str(item.get("author") or "Unknown").strip(),
                    like_count=_as_non_negative_int(item.get("like_count")),
                )
            )

    reported_count_raw = raw.get("comment_count")
    reported_count = (
        _as_non_negative_int(reported_count_raw)
        if reported_count_raw is not None
        else None
    )

    return VideoData(
        source_url=source_url,
        video_id=video_id,
        title=title,
        channel=channel or "Unknown",
        view_count=_as_non_negative_int(view_count_raw),
        comments=tuple(comments),
        reported_comment_count=reported_count,
    )


class YouTubeClient:
    """Fetch public video data without requiring a Google API key."""

    def fetch(self, url: str, *, max_comments: int) -> VideoData:
        """Retrieve metadata and up to ``max_comments`` top comments."""

        truststore.inject_into_ssl()
        validated_url = validate_youtube_url(url)
        extractor_args = {
            "youtube": {
                "comment_sort": ["top"],
                # total, parents, replies, replies-per-thread, depth
                "max_comments": [
                    str(max_comments),
                    str(max_comments),
                    "0",
                    "0",
                    "1",
                ],
            }
        }
        options = {
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
            "getcomments": True,
            "extractor_args": extractor_args,
        }

        try:
            with YoutubeDL(options) as downloader:
                raw = downloader.extract_info(validated_url, download=False)
        except DownloadError as exc:
            raise YouTubeExtractionError(
                "Could not retrieve the video. Confirm it is public, available in "
                "your region, and has comments enabled. YouTube may occasionally "
                "require authentication or block automated requests."
            ) from exc

        if not isinstance(raw, Mapping):
            raise YouTubeExtractionError("YouTube returned an unexpected response.")

        return normalise_video_data(
            raw,
            source_url=validated_url,
            max_comments=max_comments,
        )

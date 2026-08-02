export class OwnerYouTubeAccess {
  constructor({ oauthService }) {
    this.oauthService = oauthService;
  }

  async authorise({ ownerSessionId, channelId, requireAnalyticsAccess = false }) {
    if (!this.oauthService?.configured || !ownerSessionId) {
      return {
        available: false,
        reason: "Owner Google login is required for creator-only YouTube data.",
      };
    }
    const status = this.oauthService.getStatus(ownerSessionId);
    if (!status.connected) {
      return {
        available: false,
        reason: "Owner Google login is required for creator-only YouTube data.",
      };
    }
    if (requireAnalyticsAccess && status.analyticsAccess === false) {
      return {
        available: false,
        reason:
          "Reconnect Google and accept the YouTube Analytics permission before requesting measured retention.",
      };
    }
    if (!status.channels.some((channel) => channel.id === channelId)) {
      return {
        available: false,
        reason: "The signed-in Google account does not own this video's channel.",
      };
    }
    const accessToken = await this.oauthService.getAccessToken(ownerSessionId);
    return accessToken
      ? { available: true, accessToken }
      : { available: false, reason: "The owner Google login has expired." };
  }
}

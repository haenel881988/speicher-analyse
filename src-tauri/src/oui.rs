//! Network hostname → company name mapping and tracker detection.
//!
//! Used by the Network Monitor for display labels AFTER dynamic DNS resolution.
//! OUI/MAC vendor lookup and device classification were removed (scanner feature retired).

/// Map a reverse DNS hostname to a company name.
/// Used for IP→company resolution in the connections view.
/// This is a display-only mapping AFTER dynamic DNS resolution.
pub fn hostname_to_company(hostname: &str) -> Option<&'static str> {
    let h = hostname.to_lowercase();

    // Cloud providers
    if h.contains(".amazonaws.com") || h.contains(".aws.") || h.contains(".amazon.com") {
        return Some("Amazon AWS");
    }
    if h.contains(".google.com") || h.contains(".1e100.net") || h.contains(".googleapis.com")
        || h.contains(".gstatic.com") || h.contains(".googlevideo.com")
        || h.contains(".gvt1.com") || h.contains(".gvt2.com")
    {
        return Some("Google");
    }
    if h.contains(".microsoft.com") || h.contains(".msedge.net") || h.contains(".azure.")
        || h.contains(".office365.") || h.contains(".office.com") || h.contains(".live.com")
        || h.contains(".outlook.com") || h.contains(".bing.com") || h.contains(".windows.com")
        || h.contains(".windowsupdate.com") || h.contains(".msn.com") || h.contains(".skype.com")
        || h.contains(".onedrive.com") || h.contains(".sharepoint.com") || h.contains(".trafficmanager.net")
    {
        return Some("Microsoft");
    }
    if h.contains(".apple.com") || h.contains(".icloud.com") || h.contains(".cdn-apple.com")
        || h.contains(".mzstatic.com")
    {
        return Some("Apple");
    }
    if h.contains(".facebook.com") || h.contains(".fbcdn.net") || h.contains(".meta.com")
        || h.contains(".instagram.com") || h.contains(".whatsapp.")
    {
        return Some("Meta");
    }
    if h.contains(".cloudflare.com") || h.contains(".cloudflare-dns.com")
        || h.contains(".cloudflareclient.com") || h.contains(".cf-")
    {
        return Some("Cloudflare");
    }
    if h.contains(".akamai.") || h.contains(".akamaiedge.") || h.contains(".akamaized.")
        || h.contains(".akadns.net") || h.contains(".akam.net")
    {
        return Some("Akamai");
    }
    if h.contains(".fastly.net") || h.contains(".fastly.com") {
        return Some("Fastly");
    }

    // CDN / Infrastructure
    if h.contains(".edgecastcdn.") || h.contains(".verizondigitalmedia.") {
        return Some("Verizon Digital Media");
    }
    if h.contains(".limelight.") || h.contains(".llnwd.") {
        return Some("Limelight");
    }
    if h.contains(".edgekey.net") || h.contains(".edgesuite.net") {
        return Some("Akamai");
    }

    // ISPs / Telecoms (DE)
    if h.contains(".telekom.de") || h.contains(".t-online.de") || h.contains(".dtag.de")
        || h.contains(".telekom.") || h.contains("t-ipconnect.de")
    {
        return Some("Deutsche Telekom");
    }
    if h.contains(".vodafone.") || h.contains(".unity-media.") || h.contains(".unitymedia.")
        || h.contains(".kabeldeutschland.")
    {
        return Some("Vodafone");
    }
    if h.contains(".o2online.de") || h.contains(".telefonica.") {
        return Some("O2/Telefonica");
    }
    if h.contains("1und1.de") || h.contains("1and1.") {
        return Some("1&1");
    }

    // Hosting
    if h.contains(".hetzner.") {
        return Some("Hetzner");
    }
    if h.contains(".ovh.") || h.contains(".ovhcloud.") {
        return Some("OVH");
    }
    if h.contains(".digitalocean.com") {
        return Some("DigitalOcean");
    }
    if h.contains(".linode.com") {
        return Some("Linode/Akamai");
    }

    // Services
    if h.contains(".steam") || h.contains(".valve.net") || h.contains("steampowered.com") {
        return Some("Valve/Steam");
    }
    if h.contains(".discord.") || h.contains(".discordapp.") || h.contains(".discord.media") {
        return Some("Discord");
    }
    if h.contains(".spotify.") || h.contains(".scdn.") || h.contains(".spotifycdn.") {
        return Some("Spotify");
    }
    if h.contains(".netflix.") || h.contains(".nflx") {
        return Some("Netflix");
    }
    if h.contains(".twitch.tv") || h.contains(".twitchcdn.") || h.contains(".jtvnw.net") {
        return Some("Twitch");
    }
    if h.contains(".youtube.com") || h.contains(".ytimg.com") || h.contains(".yt.be") {
        return Some("YouTube");
    }
    if h.contains(".github.") || h.contains(".githubusercontent.") || h.contains(".githubassets.") {
        return Some("GitHub");
    }
    if h.contains(".slack.") || h.contains(".slack-edge.com") {
        return Some("Slack");
    }
    if h.contains(".zoom.us") || h.contains(".zoom.") {
        return Some("Zoom");
    }
    if h.contains(".adobe.") || h.contains(".adobecc.") || h.contains(".typekit.") {
        return Some("Adobe");
    }
    if h.contains(".dropbox.") || h.contains(".dropboxapi.") {
        return Some("Dropbox");
    }
    if h.contains(".openai.com") || h.contains(".oaiusercontent.") {
        return Some("OpenAI");
    }
    if h.contains(".anthropic.com") {
        return Some("Anthropic");
    }
    if h.contains(".twitter.com") || h.contains(".x.com") || h.contains(".twimg.com") {
        return Some("X/Twitter");
    }
    if h.contains(".linkedin.com") || h.contains(".licdn.com") {
        return Some("LinkedIn");
    }
    if h.contains(".reddit.com") || h.contains(".redditmedia.") || h.contains(".redd.it") {
        return Some("Reddit");
    }
    if h.contains(".tiktok.com") || h.contains(".tiktokcdn.") || h.contains(".musical.ly") {
        return Some("TikTok");
    }
    if h.contains(".snapchat.com") || h.contains(".snap.") || h.contains(".sc-cdn.net") {
        return Some("Snapchat");
    }
    if h.contains(".pinterest.com") {
        return Some("Pinterest");
    }

    // Security / DNS
    if h.contains(".sentry.io") || h.contains(".sentry-cdn.") {
        return Some("Sentry");
    }
    if h.contains(".cloudfront.net") {
        return Some("Amazon CloudFront");
    }
    if h.contains(".azureedge.net") || h.contains(".azurewebsites.net") {
        return Some("Microsoft Azure");
    }

    // Tracking / Ads (marked as tracker info)
    if h.contains(".doubleclick.net") || h.contains(".googlesyndication.")
        || h.contains(".googleadservices.") || h.contains(".googletagmanager.")
        || h.contains(".google-analytics.")
    {
        return Some("Google Ads/Analytics");
    }
    if h.contains(".scorecardresearch.") || h.contains(".quantserve.") {
        return Some("ComScore");
    }
    if h.contains(".demdex.net") || h.contains(".omtrdc.net") {
        return Some("Adobe Analytics");
    }
    if h.contains(".criteo.") || h.contains(".criteo.net") {
        return Some("Criteo");
    }
    if h.contains(".outbrain.") || h.contains(".taboola.") {
        return Some("Ad-Netzwerk");
    }

    None
}

/// Check if a reverse DNS hostname indicates a tracker/ad service
pub fn is_tracker(hostname: &str) -> bool {
    let h = hostname.to_lowercase();
    h.contains(".doubleclick.") || h.contains("googlesyndication.")
        || h.contains("googleadservices.") || h.contains("google-analytics.")
        || h.contains(".scorecardresearch.") || h.contains(".quantserve.")
        || h.contains(".demdex.net") || h.contains(".omtrdc.net")
        || h.contains(".criteo.") || h.contains(".outbrain.")
        || h.contains(".taboola.") || h.contains(".moatads.")
        || h.contains(".adsrvr.") || h.contains(".adnxs.")
        || h.contains(".rubiconproject.") || h.contains(".pubmatic.")
        || h.contains(".openx.") || h.contains(".bidswitch.")
        || h.contains(".casalemedia.") || h.contains(".bluekai.")
        || h.contains("pixel.facebook.") || h.contains("graph.facebook.")
        || h.contains(".google-analytics.") || h.contains(".googleanalytics.")
}

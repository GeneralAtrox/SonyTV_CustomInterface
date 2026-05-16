package com.svjkr.sonytvlauncher;

import android.app.Activity;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RenderEffect;
import android.graphics.Shader;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.ImageView;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;

public class MainActivity extends Activity {
    private static final String TAG = "BRAVIALauncher";
    private static final int APP_GRID_COLUMNS = 5;
    private static final int OUTER_PADDING_HORIZONTAL_DP = 32;
    private static final int OUTER_PADDING_TOP_DP = 22;
    private static final int OUTER_PADDING_BOTTOM_DP = 18;
    private static final int TILE_GAP_DP = 14;
    private static final int FOCUS_SAFE_PADDING_DP = 8;
    private static final int PLEX_ITEM_LIMIT = 6;
    private static final int PLEX_COLUMNS = 2;
    private static final int PLEX_CYCLE_INTERVAL_MS = 8000;
    private static final int PLEX_CYCLE_ANIMATION_MS = 220;
    private static final int APP_ICON_SIZE_DP = 58;
    private static final String SPOTIFY_REDIRECT_SCHEME = "bravialauncher";
    private static final String SPOTIFY_REDIRECT_HOST = "spotify-callback";
    private static final String SPOTIFY_REDIRECT_URI = SPOTIFY_REDIRECT_SCHEME + "://" + SPOTIFY_REDIRECT_HOST;
    private static final String SPOTIFY_SCOPE = "user-read-currently-playing user-read-playback-state user-modify-playback-state";
    private static final String SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
    private static final String SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
    private static final String SPOTIFY_NOW_PLAYING_URL = "https://api.spotify.com/v1/me/player/currently-playing";
    private static final String SPOTIFY_TV_PACKAGE = "com.spotify.tv.android";
    private static final String SPOTIFY_MOBILE_PACKAGE = "com.spotify.music";
    private static final int SPOTIFY_REFRESH_INTERVAL_MS = 5000;
    private static final int SPOTIFY_ACTION_PREVIOUS = 1;
    private static final int SPOTIFY_ACTION_PLAY_PAUSE = 2;
    private static final int SPOTIFY_ACTION_NEXT = 3;
    private static final String PREFS_NAME = "launcher_preferences";
    private static final String PREF_HIDDEN_APP_PACKAGES = "hidden_app_packages";
    private static final String PREF_SPOTIFY_ACCESS_TOKEN = "spotify_access_token";
    private static final String PREF_SPOTIFY_REFRESH_TOKEN = "spotify_refresh_token";
    private static final String PREF_SPOTIFY_EXPIRES_AT = "spotify_expires_at";
    private static final String PREF_SPOTIFY_CODE_VERIFIER = "spotify_code_verifier";
    private static final String PREF_SPOTIFY_AUTH_STATE = "spotify_auth_state";
    private static final Pattern EPISODE_PATTERN = Pattern.compile("(?i)(.*?)[ ._-]*S(\\d{1,2})E(\\d{1,3})(.*)");

    private LinearLayout mediaPanel;
    private GridLayout appGrid;
    private LinearLayout plexRow;
    private FrameLayout plexResumeSlot;
    private FrameLayout plexCandidateSlot;
    private ImageView spotifyArtwork;
    private TextView spotifyStatus;
    private TextView spotifyTitle;
    private TextView spotifySubtitle;
    private FrameLayout spotifyProgressTrack;
    private View spotifyProgressFill;
    private ImageButton spotifyPlayPauseButton;
    private FrameLayout spotifyVisualizerTile;
    private WinampVisualizerView spotifyVisualizerView;
    private PackageManager packageManager;
    private Handler mainHandler;
    private List<PlexItem> watchCandidateItems = new ArrayList<>();
    private int watchCandidateIndex;
    private int watchCandidateTileIndex = -1;
    private Runnable watchCandidateCycleRunnable;
    private Runnable spotifyRefreshRunnable;
    private boolean watchCandidateAnimating;
    private boolean spotifyVisualizerVisible;
    private int appTileCount;
    private int tileWidth;
    private int tileHeight;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        super.onCreate(savedInstanceState);

        packageManager = getPackageManager();
        mainHandler = new Handler(Looper.getMainLooper());
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );

        buildLayout();
        handleSpotifyCallback(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleSpotifyCallback(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateTileSize();
        refreshPlex();
        refreshSpotify();
        refreshApps();
        if (spotifyVisualizerVisible && spotifyVisualizerView != null) {
            spotifyVisualizerView.setRunning(true);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        stopWatchCandidateCycling();
        stopSpotifyRefresh();
        stopSpotifyVisualizer();
    }

    private void buildLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setClipChildren(false);
        root.setClipToPadding(false);
        root.setPadding(
                dp(OUTER_PADDING_HORIZONTAL_DP),
                dp(OUTER_PADDING_TOP_DP),
                dp(OUTER_PADDING_HORIZONTAL_DP),
                dp(OUTER_PADDING_BOTTOM_DP)
        );
        root.setBackgroundResource(R.drawable.wallpaper_background);

        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        scrollView.setClipChildren(false);
        scrollView.setClipToPadding(false);

        LinearLayout scrollContent = new LinearLayout(this);
        scrollContent.setOrientation(LinearLayout.HORIZONTAL);
        scrollContent.setClipChildren(false);
        scrollContent.setClipToPadding(false);
        scrollView.addView(scrollContent, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT
        ));

        mediaPanel = new LinearLayout(this);
        mediaPanel.setOrientation(LinearLayout.VERTICAL);
        mediaPanel.setClipChildren(false);
        mediaPanel.setClipToPadding(false);
        LinearLayout.LayoutParams mediaPanelParams = new LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                2f
        );
        mediaPanelParams.rightMargin = dp(TILE_GAP_DP);
        scrollContent.addView(mediaPanel, mediaPanelParams);

        plexRow = new LinearLayout(this);
        plexRow.setOrientation(LinearLayout.HORIZONTAL);
        plexRow.setClipChildren(false);
        plexRow.setClipToPadding(false);
        LinearLayout.LayoutParams plexRowParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        mediaPanel.addView(plexRow, plexRowParams);

        LinearLayout.LayoutParams spotifyParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(154)
        );
        spotifyParams.topMargin = dp(TILE_GAP_DP);
        mediaPanel.addView(createSpotifyTile(), spotifyParams);

        LinearLayout.LayoutParams visualizerParams = new LinearLayout.LayoutParams(
                dp(160),
                dp(160)
        );
        visualizerParams.topMargin = dp(TILE_GAP_DP);
        mediaPanel.addView(createSpotifyVisualizerTile(), visualizerParams);

        appGrid = new GridLayout(this);
        appGrid.setColumnCount(APP_GRID_COLUMNS);
        appGrid.setUseDefaultMargins(false);
        appGrid.setClipChildren(false);
        appGrid.setClipToPadding(false);
        appGrid.setPadding(
                dp(FOCUS_SAFE_PADDING_DP),
                0,
                dp(FOCUS_SAFE_PADDING_DP),
                dp(FOCUS_SAFE_PADDING_DP)
        );
        LinearLayout.LayoutParams appGridParams = new LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f
        );
        scrollContent.addView(appGrid, appGridParams);

        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
        );
        root.addView(scrollView, scrollParams);

        setContentView(root);
    }

    private void refreshApps() {
        appGrid.removeAllViews();

        Set<String> hiddenAppPackages = loadHiddenAppPackages();
        List<AppEntry> apps = new ArrayList<>();
        for (AppEntry app : loadLaunchableApps()) {
            if (!hiddenAppPackages.contains(app.packageName)) {
                apps.add(app);
            }
        }

        apps.add(0, AppEntry.settings(getDrawable(android.R.drawable.ic_menu_manage)));
        apps.add(1, AppEntry.edit(getDrawable(android.R.drawable.ic_menu_edit)));
        appTileCount = apps.size();

        for (int index = 0; index < apps.size(); index++) {
            appGrid.addView(createTile(apps.get(index), index));
        }

        if (appGrid.getChildCount() > 0) {
            appGrid.getChildAt(0).requestFocus();
        }
    }

    private void refreshPlex() {
        stopWatchCandidateCycling();

        Thread plexThread = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    List<PlexItem> continueItems = fetchContinueWatchingPlexItems();
                    List<PlexItem> candidateItems = fetchWatchCandidatePlexItems();
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            renderPlexItems(continueItems, candidateItems);
                        }
                    });
                } catch (Exception exception) {
                    Log.e(TAG, "Unable to load Plex items", exception);
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            showPlexUnavailable();
                        }
                    });
                }
            }
        });
        plexThread.start();
    }

    private List<PlexItem> fetchContinueWatchingPlexItems() throws Exception {
        List<VideoEntry> plexNativeItems = new ArrayList<>();
        plexNativeItems.addAll(fetchVideoEntries("/hubs/home/continueWatching", false));
        plexNativeItems.addAll(fetchVideoEntries("/hubs/home/onDeck", false));
        plexNativeItems.addAll(fetchVideoEntries("/library/onDeck", false));
        List<VideoEntry> resumeItems = filterResumeCandidates(plexNativeItems);
        if (!resumeItems.isEmpty()) {
            return buildPlexItems(resumeItems);
        }

        List<VideoEntry> allVideos = fetchAllLibraryVideos();
        List<VideoEntry> inProgressItems = findInProgressItems(allVideos);
        if (!inProgressItems.isEmpty()) {
            return buildPlexItems(inProgressItems);
        }

        List<VideoEntry> inferredEpisodes = inferNextEpisodes(allVideos);
        if (!inferredEpisodes.isEmpty()) {
            return buildPlexItems(inferredEpisodes);
        }

        return Collections.emptyList();
    }

    private List<PlexItem> fetchWatchCandidatePlexItems() throws Exception {
        Document sectionsDocument = fetchXml(plexUrl("/library/sections"));
        NodeList directories = sectionsDocument.getElementsByTagName("Directory");
        List<PlexItem> candidates = new ArrayList<>();

        for (int index = 0; index < directories.getLength(); index++) {
            Element directory = (Element) directories.item(index);
            String key = directory.getAttribute("key");
            String type = directory.getAttribute("type");
            if (key.length() == 0) {
                continue;
            }

            if ("movie".equals(type)) {
                candidates.addAll(buildMovieCandidates(key));
            } else if ("show".equals(type)) {
                candidates.addAll(buildShowCandidates(key));
            }
        }

        return candidates;
    }

    private List<PlexItem> buildMovieCandidates(String sectionKey) throws Exception {
        List<VideoEntry> movies = fetchVideoEntries("/library/sections/" + sectionKey + "/all", false);
        List<VideoEntry> candidates = new ArrayList<>();

        for (VideoEntry movie : movies) {
            if (movie.isInProgress() || !movie.isWatched()) {
                candidates.add(movie);
            }
        }

        Collections.sort(candidates, new Comparator<VideoEntry>() {
            @Override
            public int compare(VideoEntry left, VideoEntry right) {
                if (left.isInProgress() != right.isInProgress()) {
                    return left.isInProgress() ? -1 : 1;
                }
                return left.title.compareToIgnoreCase(right.title);
            }
        });

        return buildPlexItems(candidates);
    }

    private List<PlexItem> buildShowCandidates(String sectionKey) throws Exception {
        Document showsDocument = fetchXml(plexUrl("/library/sections/" + sectionKey + "/all"));
        NodeList shows = showsDocument.getElementsByTagName("Directory");
        List<PlexItem> candidates = new ArrayList<>();

        for (int index = 0; index < shows.getLength(); index++) {
            Element show = (Element) shows.item(index);
            String ratingKey = show.getAttribute("ratingKey");
            if (ratingKey.length() == 0) {
                continue;
            }

            List<VideoEntry> episodes = fetchVideoEntries("/library/metadata/" + ratingKey + "/allLeaves", false);
            VideoEntry latestInProgress = latestInProgressEpisode(episodes);
            if (latestInProgress != null) {
                candidates.add(buildPlexItem(latestInProgress));
            }

            int leafCount = parseInt(show.getAttribute("leafCount"));
            int viewedLeafCount = parseInt(show.getAttribute("viewedLeafCount"));
            if (leafCount > 0 && viewedLeafCount == 0) {
                PlexItem showItem = buildShowPlexItem(show, leafCount);
                if (showItem != null) {
                    candidates.add(showItem);
                }
            }
        }

        return candidates;
    }

    private VideoEntry latestInProgressEpisode(List<VideoEntry> episodes) {
        VideoEntry latest = null;
        for (VideoEntry episode : episodes) {
            if (!episode.isInProgress()) {
                continue;
            }
            if (latest == null
                    || episode.seasonNumber() > latest.seasonNumber()
                    || (episode.seasonNumber() == latest.seasonNumber()
                    && episode.episodeNumber() > latest.episodeNumber())) {
                latest = episode;
            }
        }
        return latest;
    }

    private List<VideoEntry> filterResumeCandidates(List<VideoEntry> videos) {
        List<VideoEntry> resumeItems = new ArrayList<>();
        Set<String> seenKeys = new HashSet<>();
        for (VideoEntry video : videos) {
            if (!isResumeCandidate(video) || seenKeys.contains(video.key)) {
                continue;
            }
            resumeItems.add(video);
            seenKeys.add(video.key);
        }
        return resumeItems;
    }

    private boolean isResumeCandidate(VideoEntry video) {
        return video.isInProgress() || video.episodeId() != null;
    }

    private PlexItem buildShowPlexItem(Element show, int leafCount) throws Exception {
        String title = show.getAttribute("title");
        String thumbPath = show.getAttribute("art");
        if (thumbPath.length() == 0) {
            thumbPath = show.getAttribute("thumb");
        }
        if (title.length() == 0 || thumbPath.length() == 0) {
            return null;
        }

        Bitmap bitmap = fetchBitmap(plexUrl(thumbPath));
        String durationLabel = leafCount + " eps";
        String episodeDuration = formatDuration(parseLong(show.getAttribute("duration")));
        if (episodeDuration.length() > 0) {
            durationLabel += " • " + episodeDuration;
        }
        return new PlexItem(title, "TV Show", title, show.getAttribute("key"), bitmap, durationLabel, 0);
    }

    private List<VideoEntry> fetchAllLibraryVideos() throws Exception {
        Document sectionsDocument = fetchXml(plexUrl("/library/sections"));
        NodeList directories = sectionsDocument.getElementsByTagName("Directory");
        List<VideoEntry> videos = new ArrayList<>();

        for (int index = 0; index < directories.getLength(); index++) {
            Element directory = (Element) directories.item(index);
            String key = directory.getAttribute("key");
            String type = directory.getAttribute("type");
            if (key.length() == 0) {
                continue;
            }
            if ("show".equals(type)) {
                videos.addAll(fetchShowLibraryEpisodes(key));
            } else {
                videos.addAll(fetchVideoEntries("/library/sections/" + key + "/all", false));
            }
        }

        return videos;
    }

    private List<VideoEntry> fetchShowLibraryEpisodes(String sectionKey) throws Exception {
        Document showsDocument = fetchXml(plexUrl("/library/sections/" + sectionKey + "/all"));
        NodeList shows = showsDocument.getElementsByTagName("Directory");
        List<VideoEntry> episodes = new ArrayList<>();

        for (int index = 0; index < shows.getLength(); index++) {
            Element show = (Element) shows.item(index);
            String ratingKey = show.getAttribute("ratingKey");
            if (ratingKey.length() == 0) {
                continue;
            }
            episodes.addAll(fetchVideoEntries("/library/metadata/" + ratingKey + "/allLeaves", false));
        }

        return episodes;
    }

    private List<VideoEntry> fetchVideoEntries(String endpoint, boolean requireProgress) throws Exception {
        Document document = fetchXml(plexUrl(endpoint));
        NodeList videos = document.getElementsByTagName("Video");
        List<VideoEntry> entries = new ArrayList<>();

        for (int index = 0; index < videos.getLength(); index++) {
            Element video = (Element) videos.item(index);
            VideoEntry entry = VideoEntry.from(video);
            if (entry == null) {
                continue;
            }
            if (requireProgress && !entry.isInProgress()) {
                continue;
            }
            entries.add(entry);
        }

        return entries;
    }

    private List<VideoEntry> findInProgressItems(List<VideoEntry> videos) {
        List<VideoEntry> items = new ArrayList<>();
        for (VideoEntry video : videos) {
            if (video.isInProgress()) {
                items.add(video);
            }
        }

        Collections.sort(items, new Comparator<VideoEntry>() {
            @Override
            public int compare(VideoEntry left, VideoEntry right) {
                return Long.compare(right.lastViewedAt, left.lastViewedAt);
            }
        });
        return items;
    }

    private List<VideoEntry> inferNextEpisodes(List<VideoEntry> videos) {
        Map<String, VideoEntry> episodeMap = new HashMap<>();
        List<VideoEntry> watchedEpisodes = new ArrayList<>();
        List<VideoEntry> nextEpisodes = new ArrayList<>();
        Set<String> nextKeys = new HashSet<>();

        for (VideoEntry video : videos) {
            EpisodeId episodeId = video.episodeId();
            if (episodeId == null) {
                continue;
            }
            video.episodeId = episodeId;
            episodeMap.put(episodeId.lookupKey(), video);
            if (video.isWatched()) {
                watchedEpisodes.add(video);
            }
        }

        Collections.sort(watchedEpisodes, new Comparator<VideoEntry>() {
            @Override
            public int compare(VideoEntry left, VideoEntry right) {
                return Long.compare(right.lastViewedAt, left.lastViewedAt);
            }
        });

        for (VideoEntry watched : watchedEpisodes) {
            EpisodeId nextEpisodeId = watched.episodeId.nextEpisode();
            VideoEntry next = episodeMap.get(nextEpisodeId.lookupKey());
            if (next == null || next.isWatched() || nextKeys.contains(next.key)) {
                continue;
            }
            nextEpisodes.add(next);
            nextKeys.add(next.key);
            if (nextEpisodes.size() >= PLEX_ITEM_LIMIT) {
                break;
            }
        }

        return nextEpisodes;
    }

    private List<VideoEntry> findFirstUnwatchedEpisodes(List<VideoEntry> videos) {
        Map<String, List<VideoEntry>> episodesByShow = new HashMap<>();
        List<VideoEntry> firstUnwatched = new ArrayList<>();

        for (VideoEntry video : videos) {
            if (video.isWatched()) {
                continue;
            }

            String showKey = video.showLookupKey();
            List<VideoEntry> showEpisodes = episodesByShow.get(showKey);
            if (showEpisodes == null) {
                showEpisodes = new ArrayList<>();
                episodesByShow.put(showKey, showEpisodes);
            }
            showEpisodes.add(video);
        }

        for (List<VideoEntry> showEpisodes : episodesByShow.values()) {
            Collections.sort(showEpisodes, new Comparator<VideoEntry>() {
                @Override
                public int compare(VideoEntry left, VideoEntry right) {
                    int seasonCompare = Integer.compare(left.seasonNumber(), right.seasonNumber());
                    if (seasonCompare != 0) {
                        return seasonCompare;
                    }
                    return Integer.compare(left.episodeNumber(), right.episodeNumber());
                }
            });
            if (!showEpisodes.isEmpty()) {
                firstUnwatched.add(showEpisodes.get(0));
            }
        }

        return firstUnwatched;
    }

    private List<PlexItem> buildPlexItems(List<VideoEntry> videos) throws Exception {
        List<PlexItem> items = new ArrayList<>();
        for (VideoEntry video : videos) {
            if (items.size() >= PLEX_ITEM_LIMIT) {
                break;
            }
            if (video.thumbPath.length() == 0) {
                continue;
            }

            items.add(buildPlexItem(video));
        }
        return items;
    }

    private PlexItem buildPlexItem(VideoEntry video) throws Exception {
        Bitmap bitmap = fetchBitmap(plexUrl(video.thumbPath));
        return new PlexItem(
                video.title,
                video.shortLabel(),
                video.seriesName(),
                video.key,
                bitmap,
                formatDuration(video.duration),
                video.progressPercent()
        );
    }

    private Document fetchXml(String urlValue) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlValue).openConnection();
        connection.setConnectTimeout(4000);
        connection.setReadTimeout(6000);
        connection.setRequestProperty("Accept", "application/xml");

        try (InputStream inputStream = connection.getInputStream()) {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            try {
                factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            } catch (Exception ignored) {
                Log.w(TAG, "XML parser does not support disabling doctype declarations");
            }
            DocumentBuilder builder = factory.newDocumentBuilder();
            return builder.parse(inputStream);
        } finally {
            connection.disconnect();
        }
    }

    private Bitmap fetchBitmap(String urlValue) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(urlValue).openConnection();
        connection.setConnectTimeout(4000);
        connection.setReadTimeout(6000);

        try (InputStream inputStream = connection.getInputStream()) {
            return BitmapFactory.decodeStream(inputStream);
        } finally {
            connection.disconnect();
        }
    }

    private String appendPlexToken(String urlValue) {
        String plexToken = configuredPlexToken();
        if (plexToken.length() == 0) {
            return urlValue;
        }
        return urlValue + (urlValue.contains("?") ? "&" : "?") + "X-Plex-Token=" + plexToken;
    }

    private String plexUrl(String path) {
        String normalizedPath = path.startsWith("/") ? path : "/" + path;
        String serverUrl = configuredPlexServerUrl();
        if (serverUrl.length() == 0) {
            throw new IllegalStateException("Plex server URL is not configured");
        }
        return appendPlexToken(serverUrl + normalizedPath);
    }

    private String configuredPlexServerUrl() {
        String value = (isEmulator()
                ? BuildConfig.PLEX_SERVER_URL_EMULATOR
                : BuildConfig.PLEX_SERVER_URL_TV).trim();
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    private String configuredPlexToken() {
        return BuildConfig.PLEX_TOKEN.trim();
    }

    private String configuredSpotifyClientId() {
        return BuildConfig.SPOTIFY_CLIENT_ID.trim();
    }

    private static boolean isEmulator() {
        return Build.FINGERPRINT.contains("generic")
                || Build.FINGERPRINT.contains("sdk")
                || Build.MODEL.contains("Emulator")
                || Build.MODEL.contains("Android SDK")
                || Build.PRODUCT.contains("sdk");
    }

    private void renderPlexItems(List<PlexItem> continueItems, List<PlexItem> candidateItems) {
        stopWatchCandidateCycling();
        plexRow.removeAllViews();
        if (continueItems.isEmpty() && candidateItems.isEmpty()) {
            showPlexUnavailable();
            return;
        }

        createPlexSlots();
        PlexItem resumeItem = null;
        if (!continueItems.isEmpty()) {
            resumeItem = continueItems.get(0);
            setPlexSlotItem(plexResumeSlot, resumeItem, 0);
        } else {
            clearPlexSlot(plexResumeSlot);
        }

        watchCandidateItems = excludeResumeItem(candidateItems, resumeItem);
        watchCandidateIndex = 0;
        watchCandidateTileIndex = -1;
        if (!watchCandidateItems.isEmpty()) {
            watchCandidateTileIndex = 1;
            setPlexSlotItem(plexCandidateSlot, watchCandidateItems.get(0), 1);
            startWatchCandidateCycling();
        } else {
            clearPlexSlot(plexCandidateSlot);
        }
    }

    private void createPlexSlots() {
        plexResumeSlot = createPlexSlot(0);
        plexCandidateSlot = createPlexSlot(1);
        plexRow.addView(plexResumeSlot);
        plexRow.addView(plexCandidateSlot);
    }

    private FrameLayout createPlexSlot(int index) {
        FrameLayout slot = new FrameLayout(this);
        slot.setClipChildren(false);
        slot.setClipToPadding(false);
        slot.setFocusable(false);
        slot.setClickable(false);
        slot.setVisibility(View.INVISIBLE);

        int width = plexTileWidth();
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(width, Math.round(width * 0.56f));
        params.setMargins(0, 0, index >= PLEX_COLUMNS - 1 ? 0 : dp(TILE_GAP_DP), 0);
        slot.setLayoutParams(params);
        return slot;
    }

    private void setPlexSlotItem(FrameLayout slot, PlexItem item, int index) {
        slot.removeAllViews();
        slot.setVisibility(View.VISIBLE);
        slot.addView(createPlexTile(item, index), new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
    }

    private void clearPlexSlot(FrameLayout slot) {
        if (slot == null) {
            return;
        }
        slot.removeAllViews();
        slot.setVisibility(View.INVISIBLE);
    }

    private List<PlexItem> excludeResumeItem(List<PlexItem> candidateItems, PlexItem resumeItem) {
        List<PlexItem> filteredItems = new ArrayList<>();
        for (PlexItem candidate : candidateItems) {
            if (samePlexItem(candidate, resumeItem)) {
                continue;
            }
            filteredItems.add(candidate);
        }
        return filteredItems;
    }

    private boolean samePlexItem(PlexItem left, PlexItem right) {
        if (left == null || right == null) {
            return false;
        }
        if (left.key.length() > 0 && left.key.equals(right.key)) {
            return true;
        }
        String leftSeries = left.seriesName.toLowerCase();
        String rightSeries = right.seriesName.toLowerCase();
        if (leftSeries.length() > 0 && leftSeries.equals(rightSeries)) {
            return true;
        }
        return left.title.equalsIgnoreCase(right.title)
                && left.shortLabel.equalsIgnoreCase(right.shortLabel);
    }

    private void startWatchCandidateCycling() {
        if (watchCandidateItems.size() <= 1) {
            return;
        }

        watchCandidateCycleRunnable = new Runnable() {
            @Override
            public void run() {
                if (watchCandidateItems.isEmpty()
                        || plexCandidateSlot == null
                        || plexCandidateSlot.getChildCount() == 0) {
                    mainHandler.postDelayed(this, PLEX_CYCLE_INTERVAL_MS);
                    return;
                }

                if (watchCandidateAnimating || plexCandidateSlot.getChildAt(0).hasFocus()) {
                    mainHandler.postDelayed(this, PLEX_CYCLE_INTERVAL_MS);
                    return;
                }

                watchCandidateIndex = (watchCandidateIndex + 1) % watchCandidateItems.size();
                animateWatchCandidateSwap(watchCandidateItems.get(watchCandidateIndex));

                mainHandler.postDelayed(this, PLEX_CYCLE_INTERVAL_MS);
            }
        };
        mainHandler.postDelayed(watchCandidateCycleRunnable, PLEX_CYCLE_INTERVAL_MS);
    }

    private void stopWatchCandidateCycling() {
        if (watchCandidateCycleRunnable != null && mainHandler != null) {
            mainHandler.removeCallbacks(watchCandidateCycleRunnable);
        }
        watchCandidateCycleRunnable = null;
        watchCandidateTileIndex = -1;
        watchCandidateAnimating = false;
        resetPlexSlotAnimation(plexResumeSlot);
        resetPlexSlotAnimation(plexCandidateSlot);
    }

    private void resetPlexSlotAnimation(FrameLayout slot) {
        if (slot == null || slot.getChildCount() == 0) {
            return;
        }
        for (int index = 0; index < slot.getChildCount(); index++) {
            View child = slot.getChildAt(index);
            child.animate().cancel();
            child.setAlpha(1f);
            child.setTranslationX(0f);
            child.setFocusable(true);
            child.setClickable(true);
        }
    }

    private void animateWatchCandidateSwap(PlexItem nextItem) {
        if (watchCandidateAnimating
                || plexCandidateSlot == null
                || plexCandidateSlot.getChildCount() == 0) {
            return;
        }

        View oldTile = plexCandidateSlot.getChildAt(0);
        if (oldTile.hasFocus()) {
            return;
        }
        watchCandidateAnimating = true;

        final View newTile = createPlexTile(nextItem, 1);
        newTile.setAlpha(0f);
        newTile.setTranslationX(dp(18));
        newTile.setFocusable(false);
        newTile.setClickable(false);
        plexCandidateSlot.setVisibility(View.VISIBLE);
        plexCandidateSlot.addView(newTile, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        oldTile.animate().cancel();
        oldTile.setFocusable(false);
        oldTile.setClickable(false);
        oldTile.animate()
                .alpha(0f)
                .translationX(-dp(18))
                .setDuration(PLEX_CYCLE_ANIMATION_MS)
                .start();

        newTile.animate()
                .alpha(1f)
                .translationX(0f)
                .setDuration(PLEX_CYCLE_ANIMATION_MS)
                .withEndAction(new Runnable() {
                    @Override
                    public void run() {
                        if (plexCandidateSlot != null && newTile.getParent() == plexCandidateSlot) {
                            plexCandidateSlot.removeView(oldTile);
                            plexCandidateSlot.setVisibility(View.VISIBLE);
                        }
                        newTile.setAlpha(1f);
                        newTile.setTranslationX(0f);
                        newTile.setFocusable(true);
                        newTile.setClickable(true);
                        watchCandidateAnimating = false;
                    }
                })
                .start();
    }

    private View createPlexSpacer(int index) {
        View spacer = new View(this);
        spacer.setFocusable(false);
        spacer.setClickable(false);
        int width = plexTileWidth();
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(width, Math.round(width * 0.56f));
        params.setMargins(0, 0, index >= PLEX_COLUMNS - 1 ? 0 : dp(TILE_GAP_DP), 0);
        spacer.setLayoutParams(params);
        spacer.setVisibility(View.INVISIBLE);
        return spacer;
    }

    private View createPlexTile(PlexItem item, int index) {
        LinearLayout tile = new LinearLayout(this);
        tile.setOrientation(LinearLayout.VERTICAL);
        tile.setGravity(Gravity.CENTER_HORIZONTAL);
        tile.setFocusable(true);
        tile.setClickable(true);
        tile.setSoundEffectsEnabled(true);
        tile.setBackgroundResource(R.drawable.tile_background);
        tile.setPadding(dp(5), dp(5), dp(5), dp(5));
        tile.setContentDescription(item.title);

        FrameLayout imageFrame = new FrameLayout(this);

        ImageView backdrop = new ImageView(this);
        backdrop.setImageBitmap(item.bitmap);
        backdrop.setScaleType(ImageView.ScaleType.CENTER_CROP);
        backdrop.setRenderEffect(RenderEffect.createBlurEffect(dp(18), dp(18), Shader.TileMode.CLAMP));
        imageFrame.addView(backdrop, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        View dimOverlay = new View(this);
        dimOverlay.setBackgroundColor(0x99000000);
        imageFrame.addView(dimOverlay, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        ImageView image = new ImageView(this);
        image.setImageBitmap(item.bitmap);
        image.setAdjustViewBounds(true);
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        FrameLayout.LayoutParams imageParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        );
        imageParams.setMargins(dp(8), dp(8), dp(8), dp(8));
        imageFrame.addView(image, imageParams);

        TextView label = new TextView(this);
        label.setText(item.badgeText());
        label.setTextColor(0xFFFFFFFF);
        label.setTextSize(12);
        label.setGravity(Gravity.CENTER);
        label.setIncludeFontPadding(true);
        label.setBackgroundColor(0x99000000);
        label.setSingleLine(true);
        label.setPadding(dp(6), 0, dp(6), 0);
        FrameLayout.LayoutParams labelParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                dp(24),
                Gravity.BOTTOM | Gravity.END
        );
        labelParams.setMargins(0, 0, dp(8), dp(8));
        label.setMinWidth(dp(58));
        imageFrame.addView(label, labelParams);

        TextView seriesLabel = new TextView(this);
        seriesLabel.setText(item.seriesName);
        seriesLabel.setTextColor(0xDDFFFFFF);
        seriesLabel.setTextSize(13);
        seriesLabel.setGravity(Gravity.CENTER_VERTICAL);
        seriesLabel.setIncludeFontPadding(true);
        seriesLabel.setVisibility(View.INVISIBLE);
        seriesLabel.setSingleLine(true);
        seriesLabel.setBackgroundColor(0x99000000);
        FrameLayout.LayoutParams seriesParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                dp(30),
                Gravity.TOP
        );
        seriesParams.setMargins(dp(8), dp(8), dp(8), 0);
        imageFrame.addView(seriesLabel, seriesParams);

        if (item.progressPercent > 0) {
            FrameLayout progressTrack = new FrameLayout(this);
            progressTrack.setBackgroundColor(0x66000000);
            FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    dp(4),
                    Gravity.BOTTOM
            );
            progressParams.setMargins(dp(8), 0, dp(8), dp(3));
            imageFrame.addView(progressTrack, progressParams);

            View progressFill = new View(this);
            progressFill.setBackgroundColor(0xFFFFFFFF);
            progressTrack.addView(progressFill, new FrameLayout.LayoutParams(0, FrameLayout.LayoutParams.MATCH_PARENT));
            progressTrack.post(new Runnable() {
                @Override
                public void run() {
                    FrameLayout.LayoutParams fillParams = (FrameLayout.LayoutParams) progressFill.getLayoutParams();
                    fillParams.width = Math.max(dp(2), Math.round(progressTrack.getWidth() * (item.progressPercent / 100f)));
                    progressFill.setLayoutParams(fillParams);
                }
            });
        }

        tile.addView(imageFrame, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT
        ));

        tile.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View view, boolean hasFocus) {
                seriesLabel.setVisibility(hasFocus ? View.VISIBLE : View.INVISIBLE);
                view.animate()
                        .scaleX(hasFocus ? 1.05f : 1f)
                        .scaleY(hasFocus ? 1.05f : 1f)
                        .setDuration(120)
                        .start();
            }
        });
        tile.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                openPlexApp();
            }
        });

        int width = plexTileWidth();
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(width, Math.round(width * 0.56f));
        params.setMargins(0, 0, index >= PLEX_COLUMNS - 1 ? 0 : dp(TILE_GAP_DP), 0);
        tile.setLayoutParams(params);

        return tile;
    }

    private int plexTileWidth() {
        int availableWidth = plexRow.getWidth();
        if (availableWidth <= 0) {
            availableWidth = plexPanelWidth();
        }
        int totalGapWidth = dp(TILE_GAP_DP * (PLEX_COLUMNS - 1));
        return (availableWidth - totalGapWidth) / PLEX_COLUMNS;
    }

    private void showPlexUnavailable() {
        plexRow.removeAllViews();
        plexResumeSlot = null;
        plexCandidateSlot = null;
        TextView message = new TextView(this);
        message.setText(R.string.plex_continue_unavailable);
        message.setTextColor(0x99FFFFFF);
        message.setTextSize(14);
        plexRow.addView(message, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));
    }

    private void openPlexApp() {
        Intent launchIntent = packageManager.getLeanbackLaunchIntentForPackage("com.plexapp.android");
        if (launchIntent == null) {
            launchIntent = packageManager.getLaunchIntentForPackage("com.plexapp.android");
        }
        if (launchIntent == null) {
            Toast.makeText(this, R.string.plex_app_not_found, Toast.LENGTH_SHORT).show();
            return;
        }
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(launchIntent);
    }

    private View createSpotifyTile() {
        LinearLayout tile = new LinearLayout(this);
        tile.setOrientation(LinearLayout.HORIZONTAL);
        tile.setGravity(Gravity.CENTER_VERTICAL);
        tile.setFocusable(true);
        tile.setClickable(true);
        tile.setSoundEffectsEnabled(true);
        tile.setBackgroundResource(R.drawable.tile_background);
        tile.setDescendantFocusability(ViewGroup.FOCUS_AFTER_DESCENDANTS);
        tile.setPadding(dp(12), dp(10), dp(12), dp(10));
        tile.setContentDescription("Spotify");

        spotifyArtwork = new ImageView(this);
        spotifyArtwork.setImageResource(android.R.drawable.ic_media_play);
        spotifyArtwork.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        spotifyArtwork.setBackgroundColor(0x33000000);
        LinearLayout.LayoutParams artworkParams = new LinearLayout.LayoutParams(dp(112), dp(112));
        artworkParams.rightMargin = dp(16);
        tile.addView(spotifyArtwork, artworkParams);

        LinearLayout textPanel = new LinearLayout(this);
        textPanel.setOrientation(LinearLayout.VERTICAL);
        textPanel.setGravity(Gravity.CENTER_VERTICAL);

        spotifyStatus = new TextView(this);
        spotifyStatus.setTextColor(0xAAFFFFFF);
        spotifyStatus.setTextSize(13);
        spotifyStatus.setSingleLine(true);
        textPanel.addView(spotifyStatus, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        spotifyTitle = new TextView(this);
        spotifyTitle.setTextColor(0xFFFFFFFF);
        spotifyTitle.setTextSize(26);
        spotifyTitle.setSingleLine(true);
        spotifyTitle.setIncludeFontPadding(false);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        titleParams.topMargin = dp(4);
        textPanel.addView(spotifyTitle, titleParams);

        spotifySubtitle = new TextView(this);
        spotifySubtitle.setTextColor(0xCCFFFFFF);
        spotifySubtitle.setTextSize(16);
        spotifySubtitle.setSingleLine(true);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        subtitleParams.topMargin = dp(4);
        textPanel.addView(spotifySubtitle, subtitleParams);

        spotifyProgressTrack = new FrameLayout(this);
        spotifyProgressTrack.setBackgroundColor(0x66000000);
        spotifyProgressFill = new View(this);
        spotifyProgressFill.setBackgroundColor(0xFFFFFFFF);
        spotifyProgressTrack.addView(spotifyProgressFill, new FrameLayout.LayoutParams(
                0,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(4)
        );
        progressParams.topMargin = dp(12);
        textPanel.addView(spotifyProgressTrack, progressParams);

        LinearLayout.LayoutParams textPanelParams = new LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.MATCH_PARENT,
                1f
        );
        textPanelParams.rightMargin = dp(10);
        tile.addView(textPanel, textPanelParams);

        tile.addView(createSpotifyControlPad(), new LinearLayout.LayoutParams(
                dp(174),
                LinearLayout.LayoutParams.MATCH_PARENT
        ));

        tile.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View view, boolean hasFocus) {
                view.animate()
                        .scaleX(hasFocus ? 1.03f : 1f)
                        .scaleY(hasFocus ? 1.03f : 1f)
                        .setDuration(120)
                        .start();
            }
        });
        tile.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                openSpotifyApp();
            }
        });
        tile.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View view) {
                openNotificationListenerSettings();
                return true;
            }
        });

        updateSpotifyDisconnectedState();
        return tile;
    }

    private View createSpotifyControlPad() {
        FrameLayout controls = new FrameLayout(this);
        controls.setClipChildren(false);
        controls.setClipToPadding(false);

        final int buttonSize = dp(44);
        controls.addView(createSpotifyControlButton(
                android.R.drawable.ic_media_previous,
                "Previous",
                new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        sendSpotifyTransportAction(SPOTIFY_ACTION_PREVIOUS);
                    }
                }),
                controlParams(buttonSize, Gravity.LEFT | Gravity.CENTER_VERTICAL)
        );
        controls.addView(createSpotifyControlButton(
                android.R.drawable.ic_menu_view,
                "Open Spotify",
                new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        openSpotifyApp();
                    }
                }),
                controlParams(buttonSize, Gravity.CENTER)
        );
        controls.addView(createSpotifyControlButton(
                android.R.drawable.ic_media_next,
                "Next",
                new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        sendSpotifyTransportAction(SPOTIFY_ACTION_NEXT);
                    }
                }),
                controlParams(buttonSize, Gravity.RIGHT | Gravity.CENTER_VERTICAL)
        );

        spotifyPlayPauseButton = createSpotifyControlButton(
                android.R.drawable.ic_media_play,
                "Play or pause",
                new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        sendSpotifyTransportAction(SPOTIFY_ACTION_PLAY_PAUSE);
                    }
                });
        controls.addView(
                spotifyPlayPauseButton,
                controlParams(buttonSize, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL)
        );
        controls.addView(
                createSpotifyVisualizerButton(),
                controlParams(buttonSize, Gravity.BOTTOM | Gravity.RIGHT)
        );

        return controls;
    }

    private FrameLayout.LayoutParams controlParams(int buttonSize, int gravity) {
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(buttonSize, buttonSize);
        params.gravity = gravity;
        return params;
    }

    private ImageButton createSpotifyControlButton(
            int iconResource,
            String contentDescription,
            View.OnClickListener listener
    ) {
        ImageButton button = new ImageButton(this);
        button.setImageResource(iconResource);
        button.setColorFilter(0xFFFFFFFF);
        button.setBackgroundResource(R.drawable.tile_background);
        button.setPadding(dp(9), dp(9), dp(9), dp(9));
        button.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        button.setFocusable(true);
        button.setClickable(true);
        button.setSoundEffectsEnabled(true);
        button.setContentDescription(contentDescription);
        button.setOnClickListener(listener);
        applyFocusScale(button, 1.08f);
        return button;
    }

    private View createSpotifyVisualizerButton() {
        FrameLayout button = new FrameLayout(this);
        button.setBackgroundResource(R.drawable.tile_background);
        button.setFocusable(true);
        button.setClickable(true);
        button.setSoundEffectsEnabled(true);
        button.setPadding(dp(8), dp(8), dp(8), dp(8));
        button.setContentDescription("Show visualisation");

        button.addView(new EqualizerIconView(this), new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        button.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                showSpotifyVisualizer();
            }
        });
        applyFocusScale(button, 1.08f);
        return button;
    }

    private View createSpotifyVisualizerTile() {
        spotifyVisualizerTile = new FrameLayout(this);
        spotifyVisualizerTile.setFocusable(true);
        spotifyVisualizerTile.setClickable(true);
        spotifyVisualizerTile.setSoundEffectsEnabled(true);
        spotifyVisualizerTile.setBackgroundResource(R.drawable.tile_background);
        spotifyVisualizerTile.setPadding(dp(12), dp(12), dp(12), dp(12));
        spotifyVisualizerTile.setVisibility(View.GONE);
        spotifyVisualizerTile.setContentDescription("Spotify visualisation");

        spotifyVisualizerView = new WinampVisualizerView(this);
        spotifyVisualizerTile.addView(spotifyVisualizerView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        spotifyVisualizerTile.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                view.requestFocus();
                openVisualizerPreview();
            }
        });
        applyFocusScale(spotifyVisualizerTile, 1.03f);
        return spotifyVisualizerTile;
    }

    private void showSpotifyVisualizer() {
        spotifyVisualizerVisible = true;
        if (spotifyVisualizerTile != null) {
            spotifyVisualizerTile.setVisibility(View.VISIBLE);
        }
        if (spotifyVisualizerView != null) {
            spotifyVisualizerView.setRunning(true);
        }
        openVisualizerPreview();
    }

    private void openVisualizerPreview() {
        Intent intent = new Intent(this, VisualizerActivity.class);
        startActivity(intent);
    }

    private void stopSpotifyVisualizer() {
        if (spotifyVisualizerView != null) {
            spotifyVisualizerView.setRunning(false);
        }
    }

    private void applyFocusScale(final View view, final float focusedScale) {
        view.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View focusedView, boolean hasFocus) {
                focusedView.animate()
                        .scaleX(hasFocus ? focusedScale : 1f)
                        .scaleY(hasFocus ? focusedScale : 1f)
                        .setDuration(120)
                        .start();
            }
        });
    }

    private void refreshSpotify() {
        stopSpotifyRefresh();
        loadSpotifyNowPlaying();
        spotifyRefreshRunnable = new Runnable() {
            @Override
            public void run() {
                loadSpotifyNowPlaying();
                mainHandler.postDelayed(this, SPOTIFY_REFRESH_INTERVAL_MS);
            }
        };
        mainHandler.postDelayed(spotifyRefreshRunnable, SPOTIFY_REFRESH_INTERVAL_MS);
    }

    private void stopSpotifyRefresh() {
        if (spotifyRefreshRunnable != null && mainHandler != null) {
            mainHandler.removeCallbacks(spotifyRefreshRunnable);
        }
        spotifyRefreshRunnable = null;
    }

    private void updateSpotifyDisconnectedState() {
        if (spotifyTitle == null) {
            return;
        }
        spotifyArtwork.setImageResource(android.R.drawable.ic_media_play);
        spotifyArtwork.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        spotifyStatus.setText(R.string.spotify_status);
        spotifyTitle.setText(R.string.spotify_connect_title);
        spotifySubtitle.setText(R.string.spotify_connect_subtitle);
        updateSpotifyPlayPauseIcon(false);
        updateSpotifyVisualizerSignal(null);
        updateSpotifyProgress(0);
    }

    private void updateSpotifySessionAccessState() {
        if (spotifyTitle == null) {
            return;
        }
        spotifyArtwork.setImageResource(android.R.drawable.ic_media_play);
        spotifyArtwork.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        spotifyStatus.setText(R.string.spotify_status);
        spotifyTitle.setText(R.string.spotify_session_access_title);
        spotifySubtitle.setText(R.string.spotify_session_access_subtitle);
        updateSpotifyPlayPauseIcon(false);
        updateSpotifyVisualizerSignal(null);
        updateSpotifyProgress(0);
    }

    private void updateSpotifyEmptyState() {
        if (spotifyTitle == null) {
            return;
        }
        spotifyArtwork.setImageResource(android.R.drawable.ic_media_play);
        spotifyArtwork.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        spotifyStatus.setText(R.string.spotify_status);
        spotifyTitle.setText(R.string.spotify_not_playing);
        spotifySubtitle.setText(R.string.spotify_open_to_start);
        updateSpotifyPlayPauseIcon(false);
        updateSpotifyVisualizerSignal(null);
        updateSpotifyProgress(0);
    }

    private void updateSpotifyNowPlaying(SpotifyNowPlaying nowPlaying) {
        if (spotifyTitle == null) {
            return;
        }
        if (nowPlaying == null) {
            updateSpotifyEmptyState();
            return;
        }

        if (nowPlaying.artwork != null) {
            spotifyArtwork.setImageBitmap(nowPlaying.artwork);
            spotifyArtwork.setScaleType(ImageView.ScaleType.CENTER_CROP);
        } else {
            spotifyArtwork.setImageResource(android.R.drawable.ic_media_play);
            spotifyArtwork.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        }
        spotifyStatus.setText(nowPlaying.isPlaying ? R.string.spotify_playing : R.string.spotify_paused);
        spotifyTitle.setText(nowPlaying.title);
        spotifySubtitle.setText(nowPlaying.subtitle);
        updateSpotifyPlayPauseIcon(nowPlaying.isPlaying);
        updateSpotifyVisualizerSignal(nowPlaying);
        updateSpotifyProgress(nowPlaying.progressPercent);
    }

    private void updateSpotifyPlayPauseIcon(boolean isPlaying) {
        if (spotifyPlayPauseButton == null) {
            return;
        }
        spotifyPlayPauseButton.setImageResource(
                isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play
        );
    }

    private void updateSpotifyVisualizerSignal(SpotifyNowPlaying nowPlaying) {
        if (spotifyVisualizerView == null) {
            return;
        }
        if (nowPlaying == null) {
            spotifyVisualizerView.setSignal("spotify", false, 0);
            return;
        }
        spotifyVisualizerView.setSignal(
                nowPlaying.title + nowPlaying.subtitle,
                nowPlaying.isPlaying,
                nowPlaying.progressPercent
        );
    }

    private void updateSpotifyProgress(final int progressPercent) {
        if (spotifyProgressTrack == null || spotifyProgressFill == null) {
            return;
        }
        spotifyProgressTrack.post(new Runnable() {
            @Override
            public void run() {
                FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) spotifyProgressFill.getLayoutParams();
                params.width = progressPercent <= 0
                        ? 0
                        : Math.max(dp(2), Math.round(spotifyProgressTrack.getWidth() * (progressPercent / 100f)));
                spotifyProgressFill.setLayoutParams(params);
            }
        });
    }

    private boolean hasSpotifyToken() {
        SharedPreferences preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        return preferences.getString(PREF_SPOTIFY_ACCESS_TOKEN, "").length() > 0
                || preferences.getString(PREF_SPOTIFY_REFRESH_TOKEN, "").length() > 0;
    }

    private void startSpotifyAuthorization() {
        try {
            String clientId = configuredSpotifyClientId();
            if (clientId.length() == 0) {
                Toast.makeText(this, R.string.spotify_config_missing, Toast.LENGTH_SHORT).show();
                return;
            }

            String codeVerifier = randomUrlSafeString(64);
            String state = randomUrlSafeString(24);
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .edit()
                    .putString(PREF_SPOTIFY_CODE_VERIFIER, codeVerifier)
                    .putString(PREF_SPOTIFY_AUTH_STATE, state)
                    .apply();

            Uri authUri = Uri.parse(SPOTIFY_AUTHORIZE_URL).buildUpon()
                    .appendQueryParameter("response_type", "code")
                    .appendQueryParameter("client_id", clientId)
                    .appendQueryParameter("scope", SPOTIFY_SCOPE)
                    .appendQueryParameter("redirect_uri", SPOTIFY_REDIRECT_URI)
                    .appendQueryParameter("state", state)
                    .appendQueryParameter("code_challenge_method", "S256")
                    .appendQueryParameter("code_challenge", codeChallenge(codeVerifier))
                    .build();

            Intent intent = new Intent(Intent.ACTION_VIEW, authUri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (ActivityNotFoundException exception) {
            Toast.makeText(this, R.string.spotify_no_browser, Toast.LENGTH_SHORT).show();
        } catch (Exception exception) {
            Log.e(TAG, "Unable to start Spotify authorization", exception);
            Toast.makeText(this, R.string.spotify_auth_failed, Toast.LENGTH_SHORT).show();
        }
    }

    private void handleSpotifyCallback(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null
                || !SPOTIFY_REDIRECT_SCHEME.equals(data.getScheme())
                || !SPOTIFY_REDIRECT_HOST.equals(data.getHost())) {
            return;
        }

        String error = data.getQueryParameter("error");
        if (error != null && error.length() > 0) {
            Toast.makeText(this, R.string.spotify_auth_failed, Toast.LENGTH_SHORT).show();
            return;
        }

        String code = data.getQueryParameter("code");
        String state = data.getQueryParameter("state");
        SharedPreferences preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String expectedState = preferences.getString(PREF_SPOTIFY_AUTH_STATE, "");
        if (code == null || code.length() == 0 || expectedState.length() == 0 || !expectedState.equals(state)) {
            Toast.makeText(this, R.string.spotify_auth_failed, Toast.LENGTH_SHORT).show();
            return;
        }

        exchangeSpotifyCode(code);
    }

    private void exchangeSpotifyCode(String code) {
        Thread spotifyThread = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    SharedPreferences preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                    String codeVerifier = preferences.getString(PREF_SPOTIFY_CODE_VERIFIER, "");
                    if (codeVerifier.length() == 0) {
                        throw new IllegalStateException("Missing Spotify code verifier");
                    }

                    String response = postSpotifyToken(new Uri.Builder()
                            .appendQueryParameter("grant_type", "authorization_code")
                            .appendQueryParameter("code", code)
                            .appendQueryParameter("redirect_uri", SPOTIFY_REDIRECT_URI)
                            .appendQueryParameter("client_id", configuredSpotifyClientId())
                            .appendQueryParameter("code_verifier", codeVerifier)
                    );
                    saveSpotifyTokens(new JSONObject(response));
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(MainActivity.this, R.string.spotify_connected, Toast.LENGTH_SHORT).show();
                            refreshSpotify();
                        }
                    });
                } catch (Exception exception) {
                    Log.e(TAG, "Unable to exchange Spotify authorization code", exception);
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(MainActivity.this, R.string.spotify_auth_failed, Toast.LENGTH_SHORT).show();
                            updateSpotifyDisconnectedState();
                        }
                    });
                }
            }
        });
        spotifyThread.start();
    }

    private void loadSpotifyNowPlaying() {
        Thread spotifyThread = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    SpotifyNowPlaying nowPlaying = fetchLocalSpotifyNowPlaying();
                    if (nowPlaying == null && hasSpotifyToken()) {
                        nowPlaying = fetchSpotifyNowPlaying();
                    }
                    SpotifyNowPlaying finalNowPlaying = nowPlaying;
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            if (!isSpotifySessionAccessEnabled() && finalNowPlaying == null) {
                                updateSpotifySessionAccessState();
                            } else {
                                updateSpotifyNowPlaying(finalNowPlaying);
                            }
                        }
                    });
                } catch (Exception exception) {
                    Log.e(TAG, "Unable to load Spotify now playing", exception);
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            updateSpotifyEmptyState();
                        }
                    });
                }
            }
        });
        spotifyThread.start();
    }

    private void sendSpotifyTransportAction(int action) {
        MediaController controller = findSpotifyMediaController();
        if (controller == null) {
            openSpotifyApp();
            return;
        }

        MediaController.TransportControls controls = controller.getTransportControls();
        if (controls == null) {
            openSpotifyApp();
            return;
        }

        if (action == SPOTIFY_ACTION_PREVIOUS) {
            controls.skipToPrevious();
        } else if (action == SPOTIFY_ACTION_NEXT) {
            controls.skipToNext();
        } else if (action == SPOTIFY_ACTION_PLAY_PAUSE) {
            PlaybackState state = controller.getPlaybackState();
            boolean isPlaying = state != null && state.getState() == PlaybackState.STATE_PLAYING;
            if (isPlaying) {
                controls.pause();
            } else {
                controls.play();
            }
            updateSpotifyPlayPauseIcon(!isPlaying);
        }

        mainHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                loadSpotifyNowPlaying();
            }
        }, 350);
    }

    private MediaController findSpotifyMediaController() {
        if (!isSpotifySessionAccessEnabled()) {
            return null;
        }

        MediaSessionManager manager = (MediaSessionManager) getSystemService(MEDIA_SESSION_SERVICE);
        if (manager == null) {
            return null;
        }

        List<MediaController> controllers;
        try {
            controllers = manager.getActiveSessions(
                    new ComponentName(this, SpotifyNotificationListenerService.class)
            );
        } catch (SecurityException exception) {
            Log.w(TAG, "Spotify media session access is not enabled", exception);
            return null;
        }

        for (MediaController controller : controllers) {
            if (isSpotifyPackage(controller.getPackageName())) {
                return controller;
            }
        }

        return null;
    }

    private SpotifyNowPlaying fetchLocalSpotifyNowPlaying() {
        MediaController controller = findSpotifyMediaController();
        if (controller == null) {
            return null;
        }

        MediaMetadata metadata = controller.getMetadata();
        if (metadata == null) {
            return null;
        }

        String title = metadata.getString(MediaMetadata.METADATA_KEY_TITLE);
        if (title == null || title.length() == 0) {
            title = metadata.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE);
        }
        if (title == null || title.length() == 0) {
            title = "Spotify";
        }

        String subtitle = metadata.getString(MediaMetadata.METADATA_KEY_ARTIST);
        if (subtitle == null || subtitle.length() == 0) {
            subtitle = metadata.getString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE);
        }
        if (subtitle == null || subtitle.length() == 0) {
            subtitle = metadata.getString(MediaMetadata.METADATA_KEY_ALBUM);
        }
        if (subtitle == null || subtitle.length() == 0) {
            subtitle = "Spotify";
        }

        Bitmap artwork = metadata.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
        if (artwork == null) {
            artwork = metadata.getBitmap(MediaMetadata.METADATA_KEY_ART);
        }
        if (artwork == null) {
            artwork = metadata.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
        }

        PlaybackState state = controller.getPlaybackState();
        boolean isPlaying = state != null && state.getState() == PlaybackState.STATE_PLAYING;
        int progressPercent = spotifySessionProgressPercent(metadata, state);
        return new SpotifyNowPlaying(title, subtitle, artwork, isPlaying, progressPercent);
    }

    private int spotifySessionProgressPercent(MediaMetadata metadata, PlaybackState state) {
        if (metadata == null || state == null) {
            return 0;
        }

        long duration = metadata.getLong(MediaMetadata.METADATA_KEY_DURATION);
        long position = state.getPosition();
        if (duration <= 0 || position < 0) {
            return 0;
        }

        if (state.getState() == PlaybackState.STATE_PLAYING && state.getLastPositionUpdateTime() > 0) {
            long elapsed = SystemClock.elapsedRealtime() - state.getLastPositionUpdateTime();
            position += Math.max(0, elapsed);
        }

        return Math.max(1, Math.min(100, Math.round((position * 100f) / duration)));
    }

    private boolean isSpotifyPackage(String packageName) {
        return SPOTIFY_TV_PACKAGE.equals(packageName) || SPOTIFY_MOBILE_PACKAGE.equals(packageName);
    }

    private boolean isSpotifySessionAccessEnabled() {
        String enabledListeners = Settings.Secure.getString(
                getContentResolver(),
                "enabled_notification_listeners"
        );
        return enabledListeners != null
                && enabledListeners.toLowerCase().contains(getPackageName().toLowerCase());
    }

    private void openNotificationListenerSettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (ActivityNotFoundException exception) {
            Intent intent = new Intent(Settings.ACTION_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        }
    }

    private SpotifyNowPlaying fetchSpotifyNowPlaying() throws Exception {
        String accessToken = validSpotifyAccessToken();
        if (accessToken == null || accessToken.length() == 0) {
            return null;
        }

        Uri uri = Uri.parse(SPOTIFY_NOW_PLAYING_URL).buildUpon()
                .appendQueryParameter("additional_types", "track,episode")
                .build();
        HttpURLConnection connection = (HttpURLConnection) new URL(uri.toString()).openConnection();
        connection.setConnectTimeout(4000);
        connection.setReadTimeout(6000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Authorization", "Bearer " + accessToken);

        try {
            int responseCode = connection.getResponseCode();
            if (responseCode == 204) {
                return null;
            }
            if (responseCode == 401) {
                getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                        .edit()
                        .remove(PREF_SPOTIFY_ACCESS_TOKEN)
                        .remove(PREF_SPOTIFY_EXPIRES_AT)
                        .apply();
                return null;
            }
            if (responseCode < 200 || responseCode >= 300) {
                throw new IllegalStateException("Spotify now-playing failed: " + responseCode);
            }
            String response = readStream(connection.getInputStream());
            return parseSpotifyNowPlaying(new JSONObject(response));
        } finally {
            connection.disconnect();
        }
    }

    private SpotifyNowPlaying parseSpotifyNowPlaying(JSONObject json) throws Exception {
        JSONObject item = json.optJSONObject("item");
        if (item == null) {
            return null;
        }

        String type = json.optString("currently_playing_type", item.optString("type", "track"));
        String title = item.optString("name", "Spotify");
        String subtitle = "";
        String imageUrl = "";
        long durationMs = item.optLong("duration_ms", 0);

        if ("episode".equals(type)) {
            JSONObject show = item.optJSONObject("show");
            subtitle = show == null ? "Podcast" : show.optString("name", "Podcast");
            imageUrl = firstImageUrl(item.optJSONArray("images"));
            if (imageUrl.length() == 0 && show != null) {
                imageUrl = firstImageUrl(show.optJSONArray("images"));
            }
        } else {
            subtitle = joinSpotifyArtists(item.optJSONArray("artists"));
            JSONObject album = item.optJSONObject("album");
            if (album != null) {
                imageUrl = firstImageUrl(album.optJSONArray("images"));
            }
        }

        int progressPercent = 0;
        long progressMs = json.optLong("progress_ms", 0);
        if (durationMs > 0 && progressMs > 0) {
            progressPercent = Math.max(1, Math.min(100, Math.round((progressMs * 100f) / durationMs)));
        }

        Bitmap artwork = imageUrl.length() == 0 ? null : fetchBitmap(imageUrl);
        return new SpotifyNowPlaying(
                title,
                subtitle,
                artwork,
                json.optBoolean("is_playing", false),
                progressPercent
        );
    }

    private String validSpotifyAccessToken() throws Exception {
        SharedPreferences preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String accessToken = preferences.getString(PREF_SPOTIFY_ACCESS_TOKEN, "");
        long expiresAt = preferences.getLong(PREF_SPOTIFY_EXPIRES_AT, 0);
        if (accessToken.length() > 0 && expiresAt > System.currentTimeMillis() + 60000) {
            return accessToken;
        }

        String refreshToken = preferences.getString(PREF_SPOTIFY_REFRESH_TOKEN, "");
        String clientId = configuredSpotifyClientId();
        if (refreshToken.length() == 0 || clientId.length() == 0) {
            return null;
        }

        String response = postSpotifyToken(new Uri.Builder()
                .appendQueryParameter("grant_type", "refresh_token")
                .appendQueryParameter("refresh_token", refreshToken)
                .appendQueryParameter("client_id", clientId)
        );
        saveSpotifyTokens(new JSONObject(response));
        return getSharedPreferences(PREFS_NAME, MODE_PRIVATE).getString(PREF_SPOTIFY_ACCESS_TOKEN, "");
    }

    private String postSpotifyToken(Uri.Builder formBuilder) throws Exception {
        String body = formBuilder.build().getEncodedQuery();
        byte[] bodyBytes = body.getBytes(StandardCharsets.UTF_8);
        HttpURLConnection connection = (HttpURLConnection) new URL(SPOTIFY_TOKEN_URL).openConnection();
        connection.setConnectTimeout(4000);
        connection.setReadTimeout(6000);
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setFixedLengthStreamingMode(bodyBytes.length);
        connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");

        try (OutputStream outputStream = connection.getOutputStream()) {
            outputStream.write(bodyBytes);
        }

        try {
            int responseCode = connection.getResponseCode();
            InputStream stream = responseCode >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String response = readStream(stream);
            if (responseCode < 200 || responseCode >= 300) {
                throw new IllegalStateException("Spotify token request failed: " + responseCode + " " + response);
            }
            return response;
        } finally {
            connection.disconnect();
        }
    }

    private void saveSpotifyTokens(JSONObject tokenJson) throws Exception {
        String accessToken = tokenJson.getString("access_token");
        String refreshToken = tokenJson.optString("refresh_token", "");
        long expiresIn = tokenJson.optLong("expires_in", 3600);

        SharedPreferences.Editor editor = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit()
                .putString(PREF_SPOTIFY_ACCESS_TOKEN, accessToken)
                .putLong(PREF_SPOTIFY_EXPIRES_AT, System.currentTimeMillis() + (expiresIn * 1000L))
                .remove(PREF_SPOTIFY_CODE_VERIFIER)
                .remove(PREF_SPOTIFY_AUTH_STATE);
        if (refreshToken.length() > 0) {
            editor.putString(PREF_SPOTIFY_REFRESH_TOKEN, refreshToken);
        }
        editor.apply();
    }

    private String readStream(InputStream stream) throws Exception {
        if (stream == null) {
            return "";
        }
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }
        return builder.toString();
    }

    private String joinSpotifyArtists(JSONArray artists) {
        if (artists == null || artists.length() == 0) {
            return "Spotify";
        }
        StringBuilder builder = new StringBuilder();
        for (int index = 0; index < artists.length(); index++) {
            JSONObject artist = artists.optJSONObject(index);
            if (artist == null) {
                continue;
            }
            if (builder.length() > 0) {
                builder.append(", ");
            }
            builder.append(artist.optString("name"));
        }
        return builder.length() == 0 ? "Spotify" : builder.toString();
    }

    private String firstImageUrl(JSONArray images) {
        if (images == null || images.length() == 0) {
            return "";
        }
        JSONObject image = images.optJSONObject(0);
        return image == null ? "" : image.optString("url", "");
    }

    private String randomUrlSafeString(int byteCount) {
        byte[] bytes = new byte[byteCount];
        new SecureRandom().nextBytes(bytes);
        return Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    private String codeChallenge(String codeVerifier) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(codeVerifier.getBytes(StandardCharsets.US_ASCII));
        return Base64.encodeToString(hash, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    private void openSpotifyApp() {
        Intent launchIntent = packageManager.getLeanbackLaunchIntentForPackage("com.spotify.tv.android");
        if (launchIntent == null) {
            launchIntent = packageManager.getLaunchIntentForPackage("com.spotify.tv.android");
        }
        if (launchIntent == null) {
            launchIntent = packageManager.getLaunchIntentForPackage("com.spotify.music");
        }
        if (launchIntent == null) {
            Toast.makeText(this, R.string.spotify_app_not_found, Toast.LENGTH_SHORT).show();
            return;
        }
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(launchIntent);
    }

    private List<AppEntry> loadLaunchableApps() {
        Set<String> seenPackages = new HashSet<>();
        List<AppEntry> apps = new ArrayList<>();

        addAppsForCategory(Intent.CATEGORY_LEANBACK_LAUNCHER, seenPackages, apps);
        addAppsForCategory(Intent.CATEGORY_LAUNCHER, seenPackages, apps);

        Collections.sort(apps, new Comparator<AppEntry>() {
            @Override
            public int compare(AppEntry left, AppEntry right) {
                return left.label.compareToIgnoreCase(right.label);
            }
        });

        return apps;
    }

    private void addAppsForCategory(String category, Set<String> seenPackages, List<AppEntry> apps) {
        Intent queryIntent = new Intent(Intent.ACTION_MAIN);
        queryIntent.addCategory(category);

        List<ResolveInfo> resolvedApps = packageManager.queryIntentActivities(queryIntent, 0);
        for (ResolveInfo info : resolvedApps) {
            if (info.activityInfo == null || info.activityInfo.packageName == null) {
                continue;
            }

            String packageName = info.activityInfo.packageName;
            if (getPackageName().equals(packageName) || seenPackages.contains(packageName)) {
                continue;
            }
            if (isSettingsActivity(packageName, info.activityInfo.name)) {
                continue;
            }

            Intent launchIntent = packageManager.getLeanbackLaunchIntentForPackage(packageName);
            if (launchIntent == null) {
                launchIntent = packageManager.getLaunchIntentForPackage(packageName);
            }
            if (launchIntent == null) {
                launchIntent = new Intent(Intent.ACTION_MAIN);
                launchIntent.setComponent(new ComponentName(packageName, info.activityInfo.name));
            }
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            CharSequence label = info.loadLabel(packageManager);
            Drawable icon = info.loadIcon(packageManager);
            apps.add(new AppEntry(label == null ? packageName : label.toString(), icon, launchIntent, packageName, false));
            seenPackages.add(packageName);
        }
    }

    private View createTile(AppEntry app, int index) {
        LinearLayout tile = new LinearLayout(this);
        tile.setOrientation(LinearLayout.VERTICAL);
        tile.setGravity(Gravity.CENTER);
        tile.setPadding(dp(8), dp(8), dp(8), dp(8));
        tile.setFocusable(true);
        tile.setClickable(true);
        tile.setSoundEffectsEnabled(true);
        tile.setBackgroundResource(R.drawable.tile_background);
        tile.setContentDescription(app.label);

        ImageView icon = new ImageView(this);
        icon.setImageDrawable(app.icon);
        icon.setAdjustViewBounds(true);
        icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
        int iconSize = Math.max(dp(32), Math.min(dp(APP_ICON_SIZE_DP), tileWidth - dp(18)));
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(
                iconSize,
                iconSize
        );
        iconParams.gravity = Gravity.CENTER_HORIZONTAL;
        tile.addView(icon, iconParams);

        tile.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View view, boolean hasFocus) {
                view.animate()
                        .scaleX(hasFocus ? 1.06f : 1f)
                        .scaleY(hasFocus ? 1.06f : 1f)
                        .setDuration(120)
                        .start();
            }
        });
        tile.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                launch(app);
            }
        });
        tile.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View view) {
                if (!app.canHide()) {
                    return false;
                }
                hideApp(app);
                return true;
            }
        });

        GridLayout.LayoutParams params = new GridLayout.LayoutParams();
        params.width = tileWidth;
        params.height = tileHeight;
        params.setMargins(
                0,
                0,
                isLastColumn(index) ? 0 : dp(TILE_GAP_DP),
                isLastRow(index) ? 0 : dp(TILE_GAP_DP)
        );
        tile.setLayoutParams(params);

        return tile;
    }

    private void updateTileSize() {
        int availableWidth = appGrid.getWidth();
        if (availableWidth <= 0) {
            availableWidth = appPanelWidth();
        }
        availableWidth -= dp(FOCUS_SAFE_PADDING_DP * 2);
        int totalGapWidth = dp(TILE_GAP_DP * (APP_GRID_COLUMNS - 1));
        tileWidth = (availableWidth - totalGapWidth) / APP_GRID_COLUMNS;
        tileHeight = tileWidth;
    }

    private boolean isLastColumn(int index) {
        return (index + 1) % APP_GRID_COLUMNS == 0;
    }

    private boolean isLastRow(int index) {
        if (appTileCount <= 0) {
            return false;
        }
        return index / APP_GRID_COLUMNS == (appTileCount - 1) / APP_GRID_COLUMNS;
    }

    private int appPanelWidth() {
        int contentWidth = getResources().getDisplayMetrics().widthPixels
                - dp(OUTER_PADDING_HORIZONTAL_DP * 2)
                - dp(TILE_GAP_DP);
        return Math.max(dp(1), Math.round(contentWidth / 3f));
    }

    private int plexPanelWidth() {
        int contentWidth = getResources().getDisplayMetrics().widthPixels
                - dp(OUTER_PADDING_HORIZONTAL_DP * 2)
                - dp(TILE_GAP_DP);
        return Math.max(dp(1), contentWidth - appPanelWidth());
    }

    private void launch(AppEntry app) {
        if (app.opensEditor) {
            showAppEditor();
            return;
        }

        try {
            startActivity(app.intent);
        } catch (ActivityNotFoundException exception) {
            Toast.makeText(this, R.string.error_launch_failed, Toast.LENGTH_SHORT).show();
        }
    }

    private Set<String> loadHiddenAppPackages() {
        SharedPreferences preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        return new HashSet<>(preferences.getStringSet(
                PREF_HIDDEN_APP_PACKAGES,
                Collections.<String>emptySet()
        ));
    }

    private void saveHiddenAppPackages(Set<String> hiddenAppPackages) {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit()
                .putStringSet(PREF_HIDDEN_APP_PACKAGES, new HashSet<>(hiddenAppPackages))
                .apply();
    }

    private void hideApp(AppEntry app) {
        Set<String> hiddenAppPackages = loadHiddenAppPackages();
        hiddenAppPackages.add(app.packageName);
        saveHiddenAppPackages(hiddenAppPackages);
        Toast.makeText(this, getString(R.string.app_hidden, app.label), Toast.LENGTH_SHORT).show();
        refreshApps();
    }

    private void showAppEditor() {
        Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        LinearLayout dialogRoot = new LinearLayout(this);
        dialogRoot.setOrientation(LinearLayout.VERTICAL);
        dialogRoot.setPadding(dp(48), dp(36), dp(48), dp(32));
        dialogRoot.setBackgroundColor(0xF0121820);

        TextView title = new TextView(this);
        title.setText(R.string.edit_apps_title);
        title.setTextColor(0xFFFFFFFF);
        title.setTextSize(30);
        title.setGravity(Gravity.CENTER_VERTICAL);
        dialogRoot.addView(title, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(52)
        ));

        ScrollView listScroll = new ScrollView(this);
        listScroll.setClipChildren(false);
        listScroll.setClipToPadding(false);

        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        list.setClipChildren(false);
        list.setClipToPadding(false);
        listScroll.addView(list, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT
        ));

        Set<String> hiddenAppPackages = loadHiddenAppPackages();
        List<AppEntry> apps = loadLaunchableApps();
        for (AppEntry app : apps) {
            list.addView(createAppEditorRow(app, hiddenAppPackages));
        }

        LinearLayout.LayoutParams listParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
        );
        listParams.topMargin = dp(18);
        dialogRoot.addView(listScroll, listParams);

        TextView done = new TextView(this);
        done.setText(R.string.done);
        done.setTextColor(0xFFFFFFFF);
        done.setTextSize(18);
        done.setGravity(Gravity.CENTER);
        done.setFocusable(true);
        done.setClickable(true);
        done.setBackgroundResource(R.drawable.tile_background);
        done.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                dialog.dismiss();
            }
        });
        LinearLayout.LayoutParams doneParams = new LinearLayout.LayoutParams(dp(180), dp(54));
        doneParams.gravity = Gravity.END;
        doneParams.topMargin = dp(18);
        dialogRoot.addView(done, doneParams);

        dialog.setContentView(dialogRoot);
        dialog.setOnDismissListener(new android.content.DialogInterface.OnDismissListener() {
            @Override
            public void onDismiss(android.content.DialogInterface dialogInterface) {
                refreshApps();
            }
        });
        dialog.show();

        Window window = dialog.getWindow();
        if (window != null) {
            window.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT);
            window.setBackgroundDrawable(new ColorDrawable(0x00000000));
        }
        list.post(new Runnable() {
            @Override
            public void run() {
                if (list.getChildCount() > 0) {
                    list.getChildAt(0).requestFocus();
                }
            }
        });
    }

    private View createAppEditorRow(AppEntry app, Set<String> hiddenAppPackages) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(18), dp(10), dp(18), dp(10));
        row.setFocusable(true);
        row.setClickable(true);
        row.setBackgroundResource(R.drawable.tile_background);

        ImageView icon = new ImageView(this);
        icon.setImageDrawable(app.icon);
        icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(dp(54), dp(54));
        row.addView(icon, iconParams);

        TextView label = new TextView(this);
        label.setText(app.label);
        label.setTextColor(0xFFFFFFFF);
        label.setTextSize(20);
        label.setSingleLine(true);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        labelParams.leftMargin = dp(18);
        row.addView(label, labelParams);

        TextView state = new TextView(this);
        state.setTextSize(16);
        state.setGravity(Gravity.CENTER);
        state.setMinWidth(dp(110));
        row.addView(state, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                dp(40)
        ));

        updateAppEditorRowState(row, state, hiddenAppPackages.contains(app.packageName));
        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                if (hiddenAppPackages.contains(app.packageName)) {
                    hiddenAppPackages.remove(app.packageName);
                } else {
                    hiddenAppPackages.add(app.packageName);
                }
                saveHiddenAppPackages(hiddenAppPackages);
                updateAppEditorRowState(row, state, hiddenAppPackages.contains(app.packageName));
            }
        });
        row.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View view, boolean hasFocus) {
                view.animate()
                        .scaleX(hasFocus ? 1.02f : 1f)
                        .scaleY(hasFocus ? 1.02f : 1f)
                        .setDuration(120)
                        .start();
            }
        });

        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(78)
        );
        rowParams.bottomMargin = dp(10);
        row.setLayoutParams(rowParams);
        return row;
    }

    private void updateAppEditorRowState(View row, TextView state, boolean hidden) {
        row.setAlpha(hidden ? 0.55f : 1f);
        state.setText(hidden ? R.string.app_state_hidden : R.string.app_state_shown);
        state.setTextColor(hidden ? 0x99FFFFFF : 0xFFFFFFFF);
    }

    private boolean isSettingsActivity(String packageName, String activityName) {
        String lowerPackage = packageName == null ? "" : packageName.toLowerCase();
        String lowerActivity = activityName == null ? "" : activityName.toLowerCase();
        return lowerPackage.equals("com.android.tv.settings")
                || lowerPackage.equals("com.android.settings")
                || lowerActivity.contains(".settings.");
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static class EqualizerIconView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        EqualizerIconView(Context context) {
            super(context);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            int width = getWidth();
            int height = getHeight();
            if (width <= 0 || height <= 0) {
                return;
            }

            paint.setColor(0xFFFFFFFF);
            float barWidth = Math.max(3f, width / 8f);
            float gap = (width - barWidth * 4f) / 5f;
            float bottom = height - gap;
            float[] heights = new float[]{0.42f, 0.78f, 0.58f, 0.92f};
            for (int index = 0; index < heights.length; index++) {
                float left = gap + index * (barWidth + gap);
                float top = bottom - (height - gap * 2f) * heights[index];
                canvas.drawRoundRect(left, top, left + barWidth, bottom, barWidth / 2f, barWidth / 2f, paint);
            }
        }
    }

    private static class SpotifyVisualizerView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path wavePath = new Path();
        private int signalSeed = 9;
        private boolean running;
        private boolean playing;
        private int progressPercent;

        SpotifyVisualizerView(Context context) {
            super(context);
            setWillNotDraw(false);
        }

        void setRunning(boolean running) {
            this.running = running;
            if (running) {
                invalidate();
            }
        }

        void setSignal(String signal, boolean playing, int progressPercent) {
            this.signalSeed = Math.abs((signal == null ? "spotify" : signal).hashCode());
            this.playing = playing;
            this.progressPercent = Math.max(0, Math.min(100, progressPercent));
            invalidate();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            int width = getWidth();
            int height = getHeight();
            if (width <= 0 || height <= 0) {
                return;
            }

            paint.setShader(new LinearGradient(
                    0f,
                    0f,
                    width,
                    height,
                    0xFF080A12,
                    0xFF102B2E,
                    Shader.TileMode.CLAMP
            ));
            canvas.drawRoundRect(0f, 0f, width, height, 8f, 8f, paint);
            paint.setShader(null);

            drawGrid(canvas, width, height);
            drawSpectrum(canvas, width, height);
            drawWave(canvas, width, height);
            drawProgress(canvas, width, height);

            if (running) {
                postInvalidateDelayed(33);
            }
        }

        private void drawGrid(Canvas canvas, int width, int height) {
            paint.setStrokeWidth(1f);
            paint.setColor(0x16FFFFFF);
            int gridSize = Math.max(18, width / 12);
            for (int x = gridSize; x < width; x += gridSize) {
                canvas.drawLine(x, 0f, x, height, paint);
            }
            for (int y = gridSize; y < height; y += gridSize) {
                canvas.drawLine(0f, y, width, y, paint);
            }
        }

        private void drawSpectrum(Canvas canvas, int width, int height) {
            int barCount = 28;
            float gap = Math.max(2f, width * 0.012f);
            float barWidth = (width - gap * (barCount + 1)) / barCount;
            float baseline = height * 0.80f;
            float maxBarHeight = height * 0.62f;
            float time = SystemClock.uptimeMillis() / 180f;
            float energy = playing ? 1f : 0.32f;

            for (int index = 0; index < barCount; index++) {
                float phase = time + index * 0.53f + (signalSeed % 41) * 0.11f;
                float wave = Math.abs((float) Math.sin(phase) * (float) Math.cos(phase * 0.37f));
                float pulse = Math.abs((float) Math.sin(time * 0.42f + index * 0.21f));
                float amount = (0.18f + wave * 0.64f + pulse * 0.18f) * energy;
                float barHeight = Math.max(height * 0.08f, maxBarHeight * amount);
                float left = gap + index * (barWidth + gap);
                float top = baseline - barHeight;

                paint.setShader(new LinearGradient(
                        0f,
                        top,
                        0f,
                        baseline,
                        0xFFFF42C9,
                        0xFF35FFB0,
                        Shader.TileMode.CLAMP
                ));
                canvas.drawRoundRect(left, top, left + barWidth, baseline, barWidth / 2f, barWidth / 2f, paint);
            }
            paint.setShader(null);
        }

        private void drawWave(Canvas canvas, int width, int height) {
            wavePath.reset();
            float middle = height * 0.38f;
            float amplitude = height * (playing ? 0.12f : 0.05f);
            float time = SystemClock.uptimeMillis() / 240f;
            int step = Math.max(4, width / 72);

            for (int x = 0; x <= width; x += step) {
                float phase = x * 0.035f + time + (signalSeed % 17);
                float y = middle
                        + (float) Math.sin(phase) * amplitude
                        + (float) Math.sin(phase * 0.43f) * amplitude * 0.55f;
                if (x == 0) {
                    wavePath.moveTo(x, y);
                } else {
                    wavePath.lineTo(x, y);
                }
            }

            paint.setShader(null);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(Math.max(2f, width / 110f));
            paint.setColor(0xCCFFFFFF);
            canvas.drawPath(wavePath, paint);
            paint.setStyle(Paint.Style.FILL);
        }

        private void drawProgress(Canvas canvas, int width, int height) {
            float trackHeight = Math.max(3f, height * 0.018f);
            float top = height - trackHeight;
            paint.setShader(null);
            paint.setColor(0x33FFFFFF);
            canvas.drawRoundRect(0f, top, width, height, trackHeight, trackHeight, paint);

            if (progressPercent > 0) {
                paint.setColor(0xFFFFFFFF);
                canvas.drawRoundRect(
                        0f,
                        top,
                        width * (progressPercent / 100f),
                        height,
                        trackHeight,
                        trackHeight,
                        paint
                );
            }
        }
    }

    private static class AppEntry {
        final String label;
        final Drawable icon;
        final Intent intent;
        final String packageName;
        final boolean opensEditor;

        AppEntry(String label, Drawable icon, Intent intent, String packageName, boolean opensEditor) {
            this.label = label;
            this.icon = icon;
            this.intent = intent;
            this.packageName = packageName;
            this.opensEditor = opensEditor;
        }

        static AppEntry settings(Drawable icon) {
            Intent intent = new Intent(Settings.ACTION_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            return new AppEntry("Settings", icon, intent, null, false);
        }

        static AppEntry edit(Drawable icon) {
            return new AppEntry("Edit Apps", icon, null, null, true);
        }

        boolean canHide() {
            return packageName != null && !opensEditor;
        }
    }

    private static class PlexItem {
        final String title;
        final String shortLabel;
        final String seriesName;
        final String key;
        final Bitmap bitmap;
        final String durationLabel;
        final int progressPercent;

        PlexItem(String title, String shortLabel, String seriesName, String key, Bitmap bitmap,
                 String durationLabel, int progressPercent) {
            this.title = title;
            this.shortLabel = shortLabel;
            this.seriesName = seriesName;
            this.key = key;
            this.bitmap = bitmap;
            this.durationLabel = durationLabel;
            this.progressPercent = progressPercent;
        }

        String badgeText() {
            if (shortLabel.length() == 0) {
                return durationLabel;
            }
            if (durationLabel.length() == 0) {
                return shortLabel;
            }
            return shortLabel + " • " + durationLabel;
        }
    }

    private static class SpotifyNowPlaying {
        final String title;
        final String subtitle;
        final Bitmap artwork;
        final boolean isPlaying;
        final int progressPercent;

        SpotifyNowPlaying(String title, String subtitle, Bitmap artwork, boolean isPlaying, int progressPercent) {
            this.title = title;
            this.subtitle = subtitle;
            this.artwork = artwork;
            this.isPlaying = isPlaying;
            this.progressPercent = progressPercent;
        }
    }

    private static class VideoEntry {
        final String title;
        final String key;
        final String thumbPath;
        final long duration;
        final long viewOffset;
        final long lastViewedAt;
        final int viewCount;
        final String grandparentTitle;
        final int parentIndex;
        final int index;
        final String type;
        EpisodeId episodeId;

        VideoEntry(String title, String key, String thumbPath, long duration, long viewOffset,
                   long lastViewedAt, int viewCount, String grandparentTitle, int parentIndex, int index,
                   String type) {
            this.title = title;
            this.key = key;
            this.thumbPath = thumbPath;
            this.duration = duration;
            this.viewOffset = viewOffset;
            this.lastViewedAt = lastViewedAt;
            this.viewCount = viewCount;
            this.grandparentTitle = grandparentTitle;
            this.parentIndex = parentIndex;
            this.index = index;
            this.type = type;
        }

        static VideoEntry from(Element video) {
            String title = video.getAttribute("title");
            String key = video.getAttribute("key");
            String thumbPath = video.getAttribute("thumb");
            if (thumbPath.length() == 0) {
                thumbPath = video.getAttribute("art");
            }
            if (title.length() == 0 || key.length() == 0) {
                return null;
            }

            return new VideoEntry(
                    title,
                    key,
                    thumbPath,
                    parseLong(video.getAttribute("duration")),
                    parseLong(video.getAttribute("viewOffset")),
                    parseLong(video.getAttribute("lastViewedAt")),
                    parseInt(video.getAttribute("viewCount")),
                    video.getAttribute("grandparentTitle"),
                    parseInt(video.getAttribute("parentIndex")),
                    parseInt(video.getAttribute("index")),
                    video.getAttribute("type")
            );
        }

        boolean isInProgress() {
            return viewOffset > 0 && duration > 0 && viewOffset < duration;
        }

        boolean isWatched() {
            return viewCount > 0;
        }

        String shortLabel() {
            EpisodeId id = episodeId();
            if (id == null) {
                return "movie".equals(type) ? "Movie" : "";
            }
            return String.format("S%02dE%02d", id.season, id.episode);
        }

        String seriesName() {
            EpisodeId id = episodeId();
            return id == null ? title : id.seriesName;
        }

        int progressPercent() {
            if (!isInProgress()) {
                return 0;
            }
            return Math.max(1, Math.min(100, Math.round((viewOffset * 100f) / duration)));
        }

        EpisodeId episodeId() {
            if (episodeId != null) {
                return episodeId;
            }
            if (grandparentTitle.length() > 0 && parentIndex > 0 && index > 0) {
                episodeId = new EpisodeId(grandparentTitle.toLowerCase(), grandparentTitle, parentIndex, index);
            } else {
                episodeId = EpisodeId.from(title);
            }
            return episodeId;
        }

        String showLookupKey() {
            EpisodeId id = episodeId();
            return id == null ? title.toLowerCase() : id.showKey;
        }

        int seasonNumber() {
            EpisodeId id = episodeId();
            return id == null ? 0 : id.season;
        }

        int episodeNumber() {
            EpisodeId id = episodeId();
            return id == null ? 0 : id.episode;
        }
    }

    private static class EpisodeId {
        final String showKey;
        final String seriesName;
        final int season;
        final int episode;

        EpisodeId(String showKey, String seriesName, int season, int episode) {
            this.showKey = showKey;
            this.seriesName = seriesName;
            this.season = season;
            this.episode = episode;
        }

        static EpisodeId from(String title) {
            Matcher matcher = EPISODE_PATTERN.matcher(title);
            if (!matcher.matches()) {
                return null;
            }

            String seriesName = fallbackSeriesName(matcher.group(1));
            String showKey = seriesName.toLowerCase();
            int season = parseInt(matcher.group(2));
            int episode = parseInt(matcher.group(3));
            if (showKey.length() == 0 || season <= 0 || episode <= 0) {
                return null;
            }
            return new EpisodeId(showKey, seriesName, season, episode);
        }

        EpisodeId nextEpisode() {
            return new EpisodeId(showKey, seriesName, season, episode + 1);
        }

        String lookupKey() {
            return showKey + ":s" + season + ":e" + episode;
        }
    }

    private static String fallbackSeriesName(String rawName) {
        return rawName
                .replace('.', ' ')
                .replace('_', ' ')
                .replace('-', ' ')
                .trim()
                .replaceAll("\\s+", " ");
    }

    private static String formatDuration(long durationMs) {
        if (durationMs <= 0) {
            return "";
        }

        long totalMinutes = Math.max(1, Math.round(durationMs / 60000f));
        long hours = totalMinutes / 60;
        long minutes = totalMinutes % 60;
        if (hours <= 0) {
            return totalMinutes + "m";
        }
        if (minutes == 0) {
            return hours + "h";
        }
        return hours + "h " + minutes + "m";
    }

    private static long parseLong(String value) {
        if (value == null || value.length() == 0) {
            return 0L;
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            return 0L;
        }
    }

    private static int parseInt(String value) {
        if (value == null || value.length() == 0) {
            return 0;
        }
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException exception) {
            return 0;
        }
    }
}

package com.statuser.tvbox;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    public static final String PREFS = "status_er_tv_prefs";
    public static final String KEY_URL = "server_url";

    private WebView webView;
    private FrameLayout errorOverlay;
    private TextView errorText;
    private final Handler retryHandler = new Handler(Looper.getMainLooper());
    private Runnable retryRunnable;
    private String currentUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUI();

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        currentUrl = prefs.getString(KEY_URL, "");

        if (currentUrl == null || currentUrl.trim().isEmpty()) {
            startActivity(new Intent(this, ConfigActivity.class));
            finish();
            return;
        }

        buildUI();
        loadUrl(currentUrl);
    }

    private void buildUI() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#080c14"));

        webView = new WebView(this);
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setLoadWithOverviewMode(true);
        ws.setUseWideViewPort(true);
        ws.setCacheMode(WebSettings.LOAD_NO_CACHE);
        ws.setMediaPlaybackRequiresUserGesture(false);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                hideError();
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                super.onReceivedError(view, errorCode, description, failingUrl);
                showError("เชื่อมต่อ Server ไม่ได้\n" + description);
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.proceed();
            }
        });
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        errorOverlay = new FrameLayout(this);
        errorOverlay.setBackgroundColor(Color.parseColor("#e60d1b2e"));
        errorOverlay.setVisibility(View.GONE);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams colLp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        colLp.gravity = Gravity.CENTER;
        errorText = new TextView(this);
        errorText.setTextColor(Color.WHITE);
        errorText.setTextSize(20);
        errorText.setGravity(Gravity.CENTER);
        errorText.setPadding(60, 20, 60, 20);
        col.addView(errorText);
        TextView retryLabel = new TextView(this);
        retryLabel.setTextColor(Color.parseColor("#93c5fd"));
        retryLabel.setTextSize(14);
        retryLabel.setGravity(Gravity.CENTER);
        retryLabel.setText("กำลังลองเชื่อมต่อใหม่อัตโนมัติทุก 5 วินาที...");
        col.addView(retryLabel);
        errorOverlay.addView(col, colLp);
        root.addView(errorOverlay, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        ImageButton gear = new ImageButton(this);
        gear.setImageResource(android.R.drawable.ic_menu_manage);
        gear.setBackgroundColor(Color.TRANSPARENT);
        gear.setAlpha(0.35f);
        gear.setOnClickListener(v -> startActivity(new Intent(MainActivity.this, ConfigActivity.class)));
        int gearSize = dp(48);
        FrameLayout.LayoutParams gearLp = new FrameLayout.LayoutParams(gearSize, gearSize);
        gearLp.gravity = Gravity.BOTTOM | Gravity.END;
        gearLp.setMargins(0, 0, dp(12), dp(12));
        root.addView(gear, gearLp);

        setContentView(root);
    }

    private void loadUrl(String url) {
        webView.loadUrl(url);
    }

    private void showError(String msg) {
        errorText.setText(msg);
        errorOverlay.setVisibility(View.VISIBLE);
        scheduleRetry();
    }

    private void hideError() {
        errorOverlay.setVisibility(View.GONE);
        if (retryRunnable != null) retryHandler.removeCallbacks(retryRunnable);
    }

    private void scheduleRetry() {
        if (retryRunnable != null) retryHandler.removeCallbacks(retryRunnable);
        retryRunnable = () -> loadUrl(currentUrl);
        retryHandler.postDelayed(retryRunnable, 5000);
    }

    private void hideSystemUI() {
        View decorView = getWindow().getDecorView();
        decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUI();
    }

    @Override
    protected void onResume() {
        super.onResume();
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String url = prefs.getString(KEY_URL, "");
        if (url != null && !url.trim().isEmpty() && !url.equals(currentUrl)) {
            currentUrl = url;
            if (webView != null) loadUrl(currentUrl);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (retryRunnable != null) retryHandler.removeCallbacks(retryRunnable);
    }

    private int dp(int value) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }
}

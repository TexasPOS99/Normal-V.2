package com.texaspos99.normalv2;

import android.annotation.SuppressLint;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private static final String APP_URL = "https://texaspos99.github.io/Normal-V.2/";
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        ProgressBar progressBar = findViewById(R.id.progressBar);
        webView.setBackgroundColor(Color.rgb(248, 250, 252));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.addJavascriptInterface(new ClipboardBridge(this), "AndroidClipboard");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int progress) {
                progressBar.setProgress(progress);
                progressBar.setVisibility(progress < 100 ? View.VISIBLE : View.GONE);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("texaspos99.github.io".equalsIgnoreCase(uri.getHost())) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.evaluateJavascript(
                    "try{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{" +
                    "readText:()=>Promise.resolve(AndroidClipboard.readText())," +
                    "writeText:(t)=>{AndroidClipboard.writeText(String(t));return Promise.resolve();}" +
                    "}});}catch(e){}", null);
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack();
                else finish();
            }
        });

        if (savedInstanceState == null) webView.loadUrl(APP_URL);
        else webView.restoreState(savedInstanceState);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    private static class ClipboardBridge {
        private final ClipboardManager clipboard;
        private final Context context;

        ClipboardBridge(Context context) {
            this.context = context.getApplicationContext();
            clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
        }

        @JavascriptInterface
        public String readText() {
            if (!clipboard.hasPrimaryClip() || clipboard.getPrimaryClip() == null) return "";
            CharSequence value = clipboard.getPrimaryClip().getItemAt(0).coerceToText(context);
            return value == null ? "" : value.toString();
        }

        @JavascriptInterface
        public void writeText(String text) {
            clipboard.setPrimaryClip(ClipData.newPlainText("Normal V2", text));
        }
    }
}

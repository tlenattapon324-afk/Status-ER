package com.statuser.tvbox;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public class ConfigActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        final SharedPreferences prefs = getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE);
        final String saved = prefs.getString(MainActivity.KEY_URL, "");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#0d1b2e"));
        root.setGravity(Gravity.CENTER);
        int pad = dp(32);
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText("ตั้งค่า Status ER TV");
        title.setTextColor(Color.WHITE);
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("กรอกที่อยู่หน้าจอ TV ของ Server เช่น\nhttp://192.168.1.100:4000/tv.html");
        subtitle.setTextColor(Color.parseColor("#93c5fd"));
        subtitle.setTextSize(14);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(0, dp(8), 0, dp(24));
        root.addView(subtitle);

        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setText(saved != null && !saved.isEmpty() ? saved : "http://192.168.1.100:4000/tv.html");
        input.setTextColor(Color.parseColor("#0c2540"));
        input.setBackgroundColor(Color.WHITE);
        input.setPadding(dp(16), dp(12), dp(16), dp(12));
        input.setTextSize(16);
        LinearLayout.LayoutParams inputLp =
                new LinearLayout.LayoutParams(dp(560), LinearLayout.LayoutParams.WRAP_CONTENT);
        root.addView(input, inputLp);

        Button save = new Button(this);
        save.setText("บันทึกและเปิด");
        save.setTextColor(Color.WHITE);
        save.setBackgroundColor(Color.parseColor("#2563eb"));
        LinearLayout.LayoutParams btnLp =
                new LinearLayout.LayoutParams(dp(560), LinearLayout.LayoutParams.WRAP_CONTENT);
        btnLp.topMargin = dp(20);
        save.setOnClickListener(v -> {
            String url = input.getText().toString().trim();
            if (url.isEmpty() || !(url.startsWith("http://") || url.startsWith("https://"))) {
                Toast.makeText(ConfigActivity.this,
                        "กรุณากรอก URL ให้ถูกต้อง เช่น http://192.168.1.100:4000/tv.html",
                        Toast.LENGTH_LONG).show();
                return;
            }
            prefs.edit().putString(MainActivity.KEY_URL, url).apply();
            Intent restart = new Intent(ConfigActivity.this, MainActivity.class);
            restart.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(restart);
            finish();
        });
        root.addView(save, btnLp);

        if (saved != null && !saved.isEmpty()) {
            Button cancel = new Button(this);
            cancel.setText("ยกเลิก (กลับหน้าจอเดิม)");
            cancel.setTextColor(Color.parseColor("#93c5fd"));
            cancel.setBackgroundColor(Color.parseColor("#1e293b"));
            LinearLayout.LayoutParams cancelLp =
                    new LinearLayout.LayoutParams(dp(560), LinearLayout.LayoutParams.WRAP_CONTENT);
            cancelLp.topMargin = dp(12);
            cancel.setOnClickListener(v -> finish());
            root.addView(cancel, cancelLp);
        }

        ScrollView scroll = new ScrollView(this);
        scroll.addView(root);
        setContentView(scroll);
    }

    private int dp(int value) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }
}

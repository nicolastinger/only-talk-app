package com.only.talk.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.view.WindowManager
import androidx.core.app.ActivityCompat
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * 保活前台服务只在“退到后台”期间运行：
 * - onPause 时(仍处于允许启动前台服务的窗口)启动；
 * - 回到前台 onResume 后**延迟再停**(确保服务已完成 startForeground，
 *   避免“start 后立刻 stop”触发 ForegroundServiceDidNotStartInTimeException)；
 * - 用延迟 + isRunning 去重，快速 前台↔后台 切换不会反复启停。
 * 因此保活通知只在后台出现，前台使用 App 时通知栏干净。
 */
class MainActivity : TauriActivity() {

    private val keepAliveHandler = Handler(Looper.getMainLooper())
    private val stopKeepAliveRunnable = Runnable { doStopKeepAlive() }
    // 电池优化豁免弹窗是否有待返回判定
    private var batteryRequestPending = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 该设备在 edge-to-edge（decorFitsSystemWindows=false）下会忽略
        // adjustResize 的窗口缩放，因此必须手动消费 IME insets 把页面内容
        // 顶到软键盘上方，输入框才不会被键盘遮挡。
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)

        // Draw the WebView edge-to-edge behind the status & navigation bars so the
        // page fills the whole screen. The frontend handles bars via
        // env(safe-area-inset-*).
        WindowCompat.setDecorFitsSystemWindows(window, false)

        ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
            val imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
            // 用 padding 模拟窗口被键盘顶起的效果
            view.setPadding(0, 0, 0, imeBottom)
            // 只吞掉 IME insets；statusBars / navigationBars 等其余 insets 继续
            // 下发给 WebView，保证页面 env(safe-area-inset-*) 仍能拿到系统栏高度，
            // 避免状态栏/底部导航遮挡内容。
            WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                .build()
        }

        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.isAppearanceLightStatusBars = true
        controller.isAppearanceLightNavigationBars = true

        requestNotificationPermissionIfNeeded()
        // 仅当未豁免电池优化时引导用户授权，避免每次启动都弹
        requestIgnoreBatteryOptimization()
    }

    /**
     * 申请电池优化豁免（IM 类 App 后台保活必需）：
     * 前台服务只能让进程不进 cached 态，但 Doze/App Standby/国产 ROM 电池优化
     * 仍会限制后台执行并掐断网络，导致 QUIC 连接后台断开。豁免后系统不再冻结/限流。
     * 只在「未豁免且未主动拒绝过」时弹一次，避免每次启动都打扰。
     */
    private fun requestIgnoreBatteryOptimization() {
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        if (pm.isIgnoringBatteryOptimizations(packageName)) return
        val prefs = getPreferences(MODE_PRIVATE)
        if (prefs.getBoolean(PREF_BATTERY_DENIED, false)) return
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
            }
            batteryRequestPending = true
            startActivity(intent)
        } catch (_: Exception) {
            // 个别 ROM/设备不支持直接弹窗，跳转到电池优化设置页
            try {
                startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            } catch (_: Exception) {
                // 忽略
            }
        }
    }

    /**
     * 退到后台(点 Home/切走/熄屏)：立即启动保活服务——必须在 onPause 此刻执行，
     * 此时 Activity 仍处于已启动状态，系统允许启动前台服务；拖到 onStop 之后再启
     * 会被判为后台启动而拒绝。若已在运行则只取消待执行的停止。
     */
    override fun onPause() {
        super.onPause()
        if (isFinishing) return
        keepAliveHandler.removeCallbacks(stopKeepAliveRunnable)
        if (!KeepAliveService.isRunning) {
            doStartKeepAlive()
        }
    }

    /** 回到前台：等待保活服务确实进入前台后，再延迟停止(合并快速切换) */
    override fun onResume() {
        super.onResume()
        if (batteryRequestPending) {
            batteryRequestPending = false
            // 从电池优化弹窗返回：仍未豁免说明用户拒绝了，记录避免下次再弹
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                getPreferences(MODE_PRIVATE)
                    .edit()
                    .putBoolean(PREF_BATTERY_DENIED, true)
                    .apply()
            }
        }
        if (KeepAliveService.isRunning) {
            keepAliveHandler.removeCallbacks(stopKeepAliveRunnable)
            keepAliveHandler.postDelayed(stopKeepAliveRunnable, STOP_DELAY_MS)
        }
    }

    private fun doStartKeepAlive() {
        if (isFinishing || isDestroyed) return
        if (KeepAliveService.isRunning) return
        try {
            KeepAliveService.start(this)
        } catch (e: Exception) {
            // 个别 ROM 会拒绝启动前台服务，忽略即可；保活为增强项，不影响主功能
            android.util.Log.w("MainActivity", "启动保活服务失败: ${e.message}")
        }
    }

    private fun doStopKeepAlive() {
        if (KeepAliveService.isRunning) {
            KeepAliveService.stop(this)
        }
    }

    /** Android 13+ 需动态申请通知权限，否则前台服务通知不会展示。 */
    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ActivityCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                REQUEST_POST_NOTIFICATIONS
            )
        }
    }

    companion object {
        private const val REQUEST_POST_NOTIFICATIONS = 1001
        /** 回到前台后延时再停，确保服务已完成 startForeground，避免 ANR 竞态 */
        private const val STOP_DELAY_MS = 1500L
        private const val PREF_BATTERY_DENIED = "battery_optimization_denied"
    }
}

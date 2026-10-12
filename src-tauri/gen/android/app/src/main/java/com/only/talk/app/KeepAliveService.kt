package com.only.talk.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

/**
 * 前台保活服务：保证 Rust 端 QUIC 心跳与重连循环所在进程不被系统冻结/回收。
 *
 * App 只在退到后台时运行(onPause 启动、onResume 延迟停止)。
 * 服务运行期间**持续持有** WakeLock + WiFi 高功耗锁：前台服务只能阻止进程进入
 * cached 态，没法阻止 Doze/电池优化对后台执行与网络的限制，需配合持锁让 CPU 不休眠、
 * WiFi 不降功耗(丢包/高延迟)，QUIC 心跳与 PONG 才能续上。
 * 回到前台(服务停止)后两锁释放，节省电量。
 */
class KeepAliveService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startAsForeground()
        isRunning = true
        acquireLocks()
        // 进程被系统回收后不自动重建：重建的服务没有 Rust/QUIC 运行时支撑，
        // 只会空转耗电；用户下次打开 App 时会重新拉起。
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        isRunning = false
        releaseLocks()
        super.onDestroy()
    }

    // Android 14+：dataSync 类型前台服务有每日时长上限，超时需自行停止，否则 ANR
    override fun onTimeout(startId: Int) {
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.keep_alive_channel_name),
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = getString(R.string.keep_alive_channel_desc)
                setShowBadge(false)
                enableVibration(false)
            }
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_IMMUTABLE
        )
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setContentTitle(getString(R.string.keep_alive_notify_title))
            .setContentText(getString(R.string.keep_alive_notify_text))
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(contentIntent)
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .build()
    }

    @Suppress("DEPRECATION")
    private fun startAsForeground() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                buildNotification(),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIFICATION_ID, buildNotification())
        }
    }

    @Suppress("DEPRECATION")
    private fun acquireLocks() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        val lock = (wakeLock ?: powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "$packageName:keepalive"
        ).apply { setReferenceCounted(false) })
        lock.acquire()
        wakeLock = lock

        try {
            val wifiManager =
                applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            val wl = (wifiLock ?: wifiManager.createWifiLock(
                WifiManager.WIFI_MODE_FULL_HIGH_PERF,
                "$packageName:keepalive-wifi"
            ).apply { setReferenceCounted(false) })
            wl.acquire()
            wifiLock = wl
        } catch (_: Exception) {
            // 部分设备/ROM 不支持 HIGH_PERF 锁，忽略即可（至少 WakeLock 已保证 CPU 不休眠）
        }
    }

    private fun releaseLocks() {
        try {
            wakeLock?.takeIf { it.isHeld }?.release()
        } catch (_: Exception) {
        }
        wakeLock = null
        try {
            wifiLock?.takeIf { it.isHeld }?.release()
        } catch (_: Exception) {
        }
        wifiLock = null
    }

    companion object {
        const val CHANNEL_ID = "only_talk_keep_alive"
        private const val NOTIFICATION_ID = 1001

        /** 服务是否已进入前台(供 MainActivity 判断避免重复启停) */
        @Volatile
        var isRunning: Boolean = false

        @Volatile
        private var wakeLock: PowerManager.WakeLock? = null

        @Volatile
        private var wifiLock: WifiManager.WifiLock? = null

        fun start(context: Context) {
            val intent = Intent(context, KeepAliveService::class.java)
            val appContext = context.applicationContext
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                appContext.startForegroundService(intent)
            } else {
                @Suppress("DEPRECATION")
                appContext.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.applicationContext.stopService(Intent(context, KeepAliveService::class.java))
        }
    }
}

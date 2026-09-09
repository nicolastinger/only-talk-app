//! 会话状态机 actor。
//!
//! 把「登录/登出」收口为单一 actor：所有切换指令经 mpsc 队列串行执行，
//! 状态沿 LoggedOut -> LoggingIn -> LoggedIn -> LoggingOut -> LoggedOut 迁移，
//! 资源(数据库/QUIC/后台定时任务/媒体)的 acquire 与 release 都在状态迁移中完成，
//! 避免命令间并发竞态与资源清理遗漏。

use std::sync::LazyLock;

use anyhow::anyhow;
use log::{info, warn};
use tokio::sync::{mpsc, oneshot, Mutex, RwLock};

use crate::service::user_service::{perform_session_login_tasks, perform_session_logout_tasks};

/// 会话阶段
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionPhase {
    /// 未登录 / 已登出
    LoggedOut,
    /// 正在登录(acquire 各资源中)
    LoggingIn,
    /// 已登录(资源齐全, 会话运行中)
    LoggedIn,
    /// 正在登出(release 各资源中)
    LoggingOut,
}

impl SessionPhase {
    pub fn as_str(&self) -> &'static str {
        match self {
            SessionPhase::LoggedOut => "logged_out",
            SessionPhase::LoggingIn => "logging_in",
            SessionPhase::LoggedIn => "logged_in",
            SessionPhase::LoggingOut => "logging_out",
        }
    }
}

type CmdResult = Result<(), anyhow::Error>;

/// 会话 actor 指令
enum SessionCommand {
    Login(oneshot::Sender<CmdResult>),
    Logout(oneshot::Sender<CmdResult>),
}

/// 会话状态机 manager：单例，内部串行处理登录/登出迁移
pub struct SessionManager {
    tx: Mutex<Option<mpsc::UnboundedSender<SessionCommand>>>,
    phase: RwLock<SessionPhase>,
}

pub(crate) static SESSION_MANAGER: LazyLock<SessionManager> = LazyLock::new(SessionManager::new);

impl SessionManager {
    fn new() -> Self {
        Self { tx: Mutex::new(None), phase: RwLock::new(SessionPhase::LoggedOut) }
    }

    /// 当前会话阶段(同步读取)
    pub async fn phase(&self) -> SessionPhase {
        *self.phase.read().await
    }

    /// 请求登录(串行进入 LoggingIn -> LoggedIn / LoggedOut)
    pub async fn login(&self) -> Result<(), anyhow::Error> {
        let tx = self.ensure_worker().await;
        let (stx, srx) = oneshot::channel();
        tx.send(SessionCommand::Login(stx)).map_err(|_| anyhow!("会话 actor 已关闭"))?;
        srx.await.map_err(|_| anyhow!("会话 actor 处理登录失败"))?
    }

    /// 请求登出(幂等：LoggedOut 直接成功)
    pub async fn logout(&self) -> Result<(), anyhow::Error> {
        let tx = self.ensure_worker().await;
        let (stx, srx) = oneshot::channel();
        tx.send(SessionCommand::Logout(stx)).map_err(|_| anyhow!("会话 actor 已关闭"))?;
        srx.await.map_err(|_| anyhow!("会话 actor 处理登出失败"))?
    }

    /// 懒启动单个 worker(进程内仅一个), 串行消费指令
    async fn ensure_worker(&self) -> mpsc::UnboundedSender<SessionCommand> {
        let mut guard = self.tx.lock().await;
        if let Some(tx) = guard.as_ref() {
            return tx.clone();
        }
        let (tx, rx) = mpsc::unbounded_channel();
        tokio::spawn(async move {
            Self::worker(&SESSION_MANAGER, rx).await;
        });
        *guard = Some(tx.clone());
        tx
    }

    async fn worker(mgr: &'static SessionManager, mut rx: mpsc::UnboundedReceiver<SessionCommand>) {
        while let Some(cmd) = rx.recv().await {
            match cmd {
                SessionCommand::Login(stx) => {
                    info!("[session] actor 收到指令: login");
                    let result = mgr.run_login_transition().await;
                    let _ = stx.send(result);
                }
                SessionCommand::Logout(stx) => {
                    info!("[session] actor 收到指令: logout");
                    let result = mgr.run_logout_transition().await;
                    let _ = stx.send(result);
                }
            }
        }
    }

    /// LoggedOut -> LoggingIn -> (LoggedIn | LoggedOut)
    async fn run_login_transition(&self) -> Result<(), anyhow::Error> {
        {
            let mut phase = self.phase.write().await;
            match *phase {
                SessionPhase::LoggedOut => *phase = SessionPhase::LoggingIn,
                SessionPhase::LoggedIn => {
                    info!("[session] 登录被拒绝: 当前已是 LoggedIn(请先登出)");
                    return Err(anyhow!("当前已登录, 请先退出"));
                }
                other => {
                    info!("[session] 登录被拒绝: 会话忙({})", other.as_str());
                    return Err(anyhow!("会话忙({}), 请稍后再登录", other.as_str()));
                }
            }
        }
        info!("[session] 状态迁移: logged_out -> logging_in(开始装载会话资源)");
        let result = perform_session_login_tasks().await;
        {
            let mut phase = self.phase.write().await;
            *phase = if result.is_ok() { SessionPhase::LoggedIn } else { SessionPhase::LoggedOut };
        }
        match &result {
            Ok(_) => info!("[session] 状态迁移: logging_in -> logged_in(会话就绪)"),
            Err(e) => warn!("[session] 登录失败, 状态回退: logging_in -> logged_out, err={:?}", e),
        }
        result
    }

    /// LoggedIn -> LoggingOut -> LoggedOut(LoggedOut 时幂等成功)
    async fn run_logout_transition(&self) -> Result<(), anyhow::Error> {
        let from = {
            let mut phase = self.phase.write().await;
            match *phase {
                SessionPhase::LoggedOut => {
                    info!("[session] 登出跳过: 当前已处于 LoggedOut(幂等成功)");
                    return Ok(());
                }
                SessionPhase::LoggingOut => {
                    info!("[session] 登出被拒绝: 正在 LoggingOut");
                    return Err(anyhow!("正在登出中, 请稍候"));
                }
                other => {
                    *phase = SessionPhase::LoggingOut;
                    other
                }
            }
        };
        info!("[session] 状态迁移: {} -> logging_out(开始释放会话资源)", from.as_str());
        let result = perform_session_logout_tasks().await;
        *self.phase.write().await = SessionPhase::LoggedOut;
        match &result {
            Ok(_) => info!("[session] 状态迁移: logging_out -> logged_out(资源已释放)"),
            Err(e) => warn!("[session] 登出清理异常, 状态已强制回 logged_out, err={:?}", e),
        }
        result
    }
}
